-- Rollback-only calculation regression: lateness, lunch and early departure.
begin;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.davomat_schedules(id,name,weekdays,lunch_start,lunch_end,grace_minutes)
values('SCH-QA-DAY','QA Day','{"SUN":{"start":"09:00:00","end":"18:00:00"}}',
'13:00','14:00',10);
insert into public.davomat_employees(id,full_name,schedule_id,active,face_status)
values('EMP-QA-DAY','QA Day', 'SCH-QA-DAY',true,'READY');
insert into public.davomat_scan_sessions(nonce_hash,device_id,requested_mode,expires_at)
values(encode(digest('qa-day-in-20261004','sha256'),'hex'),'terminal-01','IN',now()+interval '10 minutes'),
      (encode(digest('qa-day-out-20261004','sha256'),'hex'),'terminal-01','OUT',now()+interval '10 minutes');
select public.davomat_commit_mark(gen_random_uuid(),'terminal-01','EMP-QA-DAY',
  encode(digest('qa-day-in-20261004','sha256'),'hex'),'IN',
  '2026-10-04T09:15:00+05:00',0.94,0.80,0.80,true,'photos/qa/day-in.jpg','LIVE');
do $$
declare result jsonb; d record;
begin
 result := public.davomat_commit_mark(gen_random_uuid(),'terminal-01','EMP-QA-DAY',
  encode(digest('qa-day-out-20261004','sha256'),'hex'),'OUT',
  '2026-10-04T13:05:00+05:00',0.94,0.80,0.80,true,'photos/qa/day-out.jpg','LIVE');
 select * into d from public.davomat_attendance_days
  where employee_id='EMP-QA-DAY' and business_date='2026-10-04';
 if d.status<>'COMPLETE' or d.worked_min<>225 or d.late_min<>15 or d.early_min<>295
 or (result->>'workedMin')::integer<>225 then
  raise exception 'DAY WRONG: %,%,%,%, response %',
  d.status,d.worked_min,d.late_min,d.early_min,result;
 end if;
end $$;
rollback;
