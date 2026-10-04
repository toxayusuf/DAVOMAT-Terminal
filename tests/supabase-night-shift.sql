-- Isolated, rollback-only DAVOMAT SQL regression test.
-- Requires service_role auth context; never use real attendance rows.
begin;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.davomat_schedules(id,name,weekdays,grace_minutes)
values('SCH-QA-NIGHT','QA Night','{"FRI":{"start":"22:00:00","end":"06:00:00"}}',10);
insert into public.davomat_employees(id,full_name,schedule_id,active,face_status)
values('EMP-QA-NIGHT','QA Test', 'SCH-QA-NIGHT',true,'READY');
insert into public.davomat_scan_sessions(nonce_hash,device_id,requested_mode,expires_at)
values(encode(digest('qa-night-in-20261004','sha256'),'hex'),'terminal-01','IN',now()+interval '10 minutes'),
      (encode(digest('qa-night-out-20261004','sha256'),'hex'),'terminal-01','OUT',now()+interval '10 minutes');
select public.davomat_commit_mark(gen_random_uuid(),'terminal-01','EMP-QA-NIGHT',
  encode(digest('qa-night-in-20261004','sha256'),'hex'),'IN',
  '2026-10-02T22:05:00+05:00',0.94,0.80,0.80,true,'photos/qa/night-in.jpg','LIVE');
select public.davomat_commit_mark(gen_random_uuid(),'terminal-01','EMP-QA-NIGHT',
  encode(digest('qa-night-out-20261004','sha256'),'hex'),'OUT',
  '2026-10-03T04:05:00+05:00',0.94,0.80,0.80,true,'photos/qa/night-out.jpg','LIVE');
do $$
declare r record;
begin
 select * into r from public.davomat_attendance_days
  where employee_id='EMP-QA-NIGHT' and business_date='2026-10-02';
 if r.status <> 'COMPLETE' or r.worked_min<>360 or r.late_min<>0 or r.early_min<>115
 then raise exception 'NIGHT REGRESSION: status %, worked %, late %, early %',
 r.status,r.worked_min,r.late_min,r.early_min; end if;
 if exists(select 1 from public.davomat_attendance_events
  where employee_id='EMP-QA-NIGHT' and business_date<>'2026-10-02') then
  raise exception 'NIGHT EVENT WRONGLY ASSIGNED';
 end if;
end $$;
rollback;
