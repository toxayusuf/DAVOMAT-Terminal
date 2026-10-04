create index if not exists davomat_attendance_days_schedule_idx on public.davomat_attendance_days(schedule_id);
create index if not exists davomat_corrections_admin_idx on public.davomat_corrections(admin_id);
create index if not exists davomat_corrections_employee_idx on public.davomat_corrections(employee_id);
create index if not exists davomat_employees_schedule_idx on public.davomat_employees(schedule_id);
create index if not exists davomat_sessions_device_idx on public.davomat_enrollment_sessions(device_id);
create index if not exists davomat_requests_device_idx on public.davomat_request_log(device_id);
create index if not exists davomat_salary_employee_idx on public.davomat_salary(employee_id);