-- Business-date selection for shifts that cross midnight.
create or replace function public.davomat_business_date(p_employee text,p_at timestamptz)
returns date language plpgsql stable set search_path=public
as $$
declare
 v_day date := (p_at at time zone 'Asia/Tashkent')::date;
 v_prev date := v_day-1;
 v_shift jsonb; v_start timestamptz; v_finish timestamptz; v_schedule text;
begin
 select schedule_id into v_schedule from public.davomat_employees where id=p_employee;
 select s.weekdays -> upper(to_char(v_prev,'DY')) into v_shift
 from public.davomat_schedules s where s.id=v_schedule;
 if v_shift is null then return v_day; end if;
 v_start := ((v_prev::text||' '||(v_shift->>'start'))::timestamp at time zone 'Asia/Tashkent');
 v_finish := ((v_prev::text||' '||(v_shift->>'end'))::timestamp at time zone 'Asia/Tashkent');
 if v_finish <= v_start then
  v_finish:=v_finish+interval '1 day';
  if p_at >= v_start and p_at <= v_finish then return v_prev; end if;
 end if;
 return v_day;
end $$;

-- No client-supplied work minutes, tardiness or paid time.
create or replace function public.davomat_derive_day()
returns trigger language plpgsql set search_path=public as $$
declare
 v_schedule public.davomat_schedules%rowtype;
 v_shift jsonb;
 v_start timestamptz; v_end timestamptz;
 v_lunch_start timestamptz; v_lunch_end timestamptz;
 v_open timestamptz; v_first timestamptz; v_last timestamptz;
 v_end_pair timestamptz; v_gross integer; v_lunch integer; v_worked integer:=0;
 v_late integer:=0; v_early integer:=0; v_overtime integer:=0;
 v_mode text; v_row record;
begin
 select * into v_schedule from public.davomat_schedules where id=NEW.schedule_id;
 if not found then raise exception 'SCHEDULE_MISSING'; end if;
 v_shift:=v_schedule.weekdays -> upper(to_char(NEW.business_date,'DY'));
 NEW.first_in:=null; NEW.last_out:=null;
 NEW.worked_min:=0;NEW.late_min:=0;NEW.early_min:=0;NEW.overtime_min:=0;
 NEW.absent:=false;NEW.requires_review:=false;
 if v_shift is null then
  NEW.status:='NON_WORKDAY';
  return NEW;
 end if;
 v_start:=((NEW.business_date::text||' '||(v_shift->>'start'))::timestamp at time zone 'Asia/Tashkent');
 v_end:=((NEW.business_date::text||' '||(v_shift->>'end'))::timestamp at time zone 'Asia/Tashkent');
 if v_end<=v_start then v_end:=v_end+interval '1 day'; end if;
 if v_schedule.lunch_start is not null and v_schedule.lunch_end is not null then
  v_lunch_start:=((NEW.business_date::text||' '||v_schedule.lunch_start::text)::timestamp at time zone 'Asia/Tashkent');
  v_lunch_end:=((NEW.business_date::text||' '||v_schedule.lunch_end::text)::timestamp at time zone 'Asia/Tashkent');
  if v_lunch_start<v_start then v_lunch_start:=v_lunch_start+interval '1 day'; end if;
  if v_lunch_end<=v_lunch_start then v_lunch_end:=v_lunch_end+interval '1 day'; end if;
 end if;
 for v_row in
  select event_type,event_at from public.davomat_attendance_events
   where employee_id=NEW.employee_id and business_date=NEW.business_date
    and status='ACCEPTED' and voided_at is null
   order by event_at,id
 loop
  if v_row.event_type='IN' then
   if v_first is null then v_first:=v_row.event_at; end if;
   if v_open is null then v_open:=v_row.event_at; end if;
  elsif v_row.event_type='OUT' then
   v_last:=v_row.event_at;
   if v_open is not null and v_row.event_at>=v_open then
    v_gross:=greatest(0,floor(extract(epoch from(v_row.event_at-v_open))/60)::integer);
    v_lunch:=0;
    if v_lunch_start is not null then
     v_lunch:=greatest(0,floor(extract(epoch from(
      least(v_row.event_at,v_lunch_end)-greatest(v_open,v_lunch_start)))/60)::integer);
    end if;
    v_worked:=v_worked+greatest(0,v_gross-v_lunch);
    v_open:=null;
   end if;
  end if;
 end loop;
 NEW.first_in:=v_first;NEW.last_out:=v_last;
 if v_first is null then
  NEW.status:='PENDING';return NEW;
 end if;
 v_late:=greatest(0,floor(extract(epoch from(v_first-v_start))/60)::integer);
 if v_late<=v_schedule.grace_minutes then v_late:=0; end if;
 if v_open is not null then
  -- Open session: include only minutes actually elapsed so far.
  v_end_pair:=greatest(v_open,now());
  v_gross:=greatest(0,floor(extract(epoch from(v_end_pair-v_open))/60)::integer);
  v_lunch:=0;
  if v_lunch_start is not null then
   v_lunch:=greatest(0,floor(extract(epoch from(
    least(v_end_pair,v_lunch_end)-greatest(v_open,v_lunch_start)))/60)::integer);
  end if;
  v_worked:=v_worked+greatest(0,v_gross-v_lunch);
  NEW.requires_review:=now()>v_end;
  NEW.status:=case when NEW.requires_review then 'REVIEW' else 'OPEN' end;
 else
  NEW.status:='COMPLETE';
  v_early:=greatest(0,floor(extract(epoch from(v_end-v_last))/60)::integer);
  v_overtime:=greatest(0,floor(extract(epoch from(v_last-v_end))/60)::integer);
 end if;
 NEW.worked_min:=v_worked;
 NEW.late_min:=v_late;
 NEW.early_min:=v_early;
 NEW.overtime_min:=v_overtime;
 return NEW;
end $$;
drop trigger if exists davomat_derive_day_before_write on public.davomat_attendance_days;
create trigger davomat_derive_day_before_write before insert or update
on public.davomat_attendance_days for each row execute function public.davomat_derive_day();

create or replace function public.davomat_commit_mark (
  p_event_id uuid, p_device_id text, p_employee_id text,
  p_nonce_hash text, p_requested_type text,
  p_event_at timestamptz, p_match numeric, p_live numeric,
  p_real numeric, p_blink boolean, p_photo_path text,
  p_source text default 'LIVE'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
 v_scan public.davomat_scan_sessions%rowtype;
 v_last public.davomat_attendance_events%rowtype;
 v_in timestamptz;
 v_out timestamptz;
 v_minutes integer;
 v_day date;
 v_schedule text;
 v_expected text;
 v_gap integer;
 v_result jsonb;
 v_emp public.davomat_employees%rowtype;
 v_settings jsonb;
begin
 if auth.role() <> 'service_role' then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 if p_requested_type not in ('IN','OUT') or p_source not in ('LIVE','OFFLINE_SYNC') then
  raise exception 'INVALID_EVENT';
 end if;
 select * into v_emp from public.davomat_employees where id=p_employee_id and active=true;
 if not found then raise exception 'EMPLOYEE_INACTIVE'; end if;
 -- Protect both nonce and attendance from concurrent requests.
 perform pg_advisory_xact_lock(hashtextextended(p_device_id,0));
 select * into v_scan from public.davomat_scan_sessions where nonce_hash=p_nonce_hash for update;
 if not found or v_scan.device_id<>p_device_id
   or v_scan.requested_mode<>p_requested_type or v_scan.consumed_at is not null
   or v_scan.expires_at < now() then
  raise exception 'CHALLENGE_INVALID';
 end if;
 v_day := public.davomat_business_date(p_employee_id,p_event_at);
 perform pg_advisory_xact_lock(hashtextextended(p_employee_id||':'||v_day::text,0));
 select * into v_last from public.davomat_attendance_events
  where employee_id=p_employee_id and business_date=v_day and status='ACCEPTED'
    and voided_at is null
  order by event_at desc,id desc limit 1;
 v_expected := case when v_last.id is null or v_last.event_type='OUT' then 'IN' else 'OUT' end;
 select value into v_settings from public.davomat_settings where key='MIN_EVENT_GAP_MINUTES';
 v_gap := case when coalesce(v_settings#>>'{}','') ~ '^[0-9]+$'
  then (v_settings#>>'{}')::int else 2 end;
 if v_last.id is not null and p_requested_type=v_last.event_type
   and (p_event_at-v_last.event_at) < make_interval(mins => v_gap) then
   raise exception 'ALREADY_MARKED';
 end if;
 if v_expected<>p_requested_type then
  raise exception 'EVENT_TYPE_MISMATCH_EXPECTED_%',v_expected;
 end if;
 -- Idempotent event IDs: no second mark.
 if exists(select 1 from public.davomat_attendance_events where id=p_event_id) then
  raise exception 'EVENT_ID_ALREADY_USED';
 end if;
 update public.davomat_scan_sessions set consumed_at=now() where nonce_hash=p_nonce_hash;
 insert into public.davomat_attendance_events (
 id,employee_id,device_id,event_type,business_date,event_at,client_time,server_time,
 match_score,liveness_score,realness_score,blink_ok,photo_path,source,status)
 values(p_event_id,p_employee_id,p_device_id,p_requested_type,v_day,p_event_at,p_event_at,
  now(),p_match,p_live,p_real,p_blink,p_photo_path,p_source,'ACCEPTED');

 -- Deterministic calculation for alternating IN/OUT pairs.
 with numbered as (
  select event_type,event_at,lead(event_type) over(order by event_at,id) next_type,
    lead(event_at) over(order by event_at,id) next_at
  from public.davomat_attendance_events where employee_id=p_employee_id
  and business_date=v_day and status='ACCEPTED' and voided_at is null
 ), paired as (
   select coalesce(sum(greatest(0,floor(extract(epoch from (next_at-event_at))/60)))::integer,0) mins
   from numbered where event_type='IN' and next_type='OUT'
 )
 select mins into v_minutes from paired;
 select min(event_at) filter(where event_type='IN'),
        max(event_at) filter(where event_type='OUT')
 into v_in,v_out
 from public.davomat_attendance_events where employee_id=p_employee_id and
 business_date=v_day and status='ACCEPTED' and voided_at is null;
 -- An open IN after an OUT is an OPEN day. Do not rely on last_out alone.
 select schedule_id into v_schedule from public.davomat_employees where id=p_employee_id;
 insert into public.davomat_attendance_days(
 id,business_date,employee_id,schedule_id,first_in,last_out,
 worked_min,status,updated_at,requires_review)
 values(v_day::text||':'||p_employee_id,v_day,p_employee_id,v_schedule,
 v_in,v_out,v_minutes,case when p_requested_type='OUT' then 'COMPLETE' else 'OPEN' end,now(),false)
 on conflict(employee_id,business_date) do update set
  first_in=excluded.first_in,last_out=excluded.last_out,worked_min=excluded.worked_min,
  status=excluded.status,updated_at=excluded.updated_at,requires_review=false;
 v_result:=jsonb_build_object('ok',true,'status','accepted','eventId',p_event_id,
  'employeeId',p_employee_id,'eventType',p_requested_type,'eventAt',p_event_at,
  'workedMin',v_minutes,'dayStatus',case when p_requested_type='OUT' then 'COMPLETE' else 'OPEN' end);
 return v_result;
end $$;

