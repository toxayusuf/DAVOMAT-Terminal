-- DAVOMAT device pairing and one-use challenges (staging).
create table if not exists public.davomat_device_pairings (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'),
 device_id text not null references public.davomat_devices(id),
 expires_at timestamptz not null,
 created_by uuid references auth.users(id),
 attempts integer not null default 0,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists davomat_pairing_expiry_idx on public.davomat_device_pairings(expires_at);
create table if not exists public.davomat_scan_sessions (
 nonce_hash text primary key check(nonce_hash ~ '^[0-9a-f]{64}$'),
 device_id text not null references public.davomat_devices(id),
 requested_mode text not null check(requested_mode in ('IN','OUT')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create index if not exists davomat_scan_expiry_idx on public.davomat_scan_sessions(expires_at);
alter table public.davomat_device_pairings enable row level security;
alter table public.davomat_scan_sessions enable row level security;
revoke all on public.davomat_device_pairings from anon, authenticated;
revoke all on public.davomat_scan_sessions from anon, authenticated;

-- One atomic commit per employee/day, with nonce consumption, idempotency,
-- event alternation, guard against accidental repeats and daily summary.
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
 v_day := (p_event_at at time zone 'Asia/Tashkent')::date;
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
revoke all on function public.davomat_commit_mark(uuid,text,text,text,text,timestamptz,numeric,numeric,numeric,boolean,text,text) from public,anon,authenticated;
grant execute on function public.davomat_commit_mark(uuid,text,text,text,text,timestamptz,numeric,numeric,numeric,boolean,text,text) to service_role;
