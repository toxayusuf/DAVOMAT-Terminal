-- DAVOMAT: independent Supabase schema, staged only.
-- DO NOT apply to another organization. Run ONLY in the confirmed
-- tohirjon.uzb@gmail.com-owned Supabase project after cost approval.
-- No production data is copied by this migration.
create extension if not exists pgcrypto;

create table if not exists public.davomat_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.davomat_schedules (
  id text primary key,
  name text not null,
  weekdays jsonb not null default '{}'::jsonb,
  lunch_start time,
  lunch_end time,
  grace_minutes integer not null default 10 check(grace_minutes between 0 and 180),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.davomat_employees (
  id text primary key,
  full_name text not null,
  position text not null default '',
  monthly_salary numeric(16,2) not null default 0 check(monthly_salary >= 0),
  schedule_id text references public.davomat_schedules(id) on delete restrict,
  start_date date,
  active boolean not null default true,
  face_status text not null default 'NOT_ENROLLED'
    check(face_status in ('NOT_ENROLLED','READY','REVIEW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.davomat_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','auditor')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.davomat_devices (
  id text primary key,
  name text not null,
  -- 256-bit random device credentials: only SHA-256 digest is stored.
  token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.davomat_face_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.davomat_employees(id) on delete restrict,
  embedding jsonb not null check(jsonb_typeof(embedding)='array'),
  quality_score numeric(6,4) check(quality_score between 0 and 1),
  pose_label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists davomat_face_profiles_active_idx
  on public.davomat_face_profiles(employee_id) where active;

create table if not exists public.davomat_enrollment_sessions (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'),
  employee_id text not null references public.davomat_employees(id),
  device_id text references public.davomat_devices(id),
  status text not null default 'OPEN'
    check(status in ('OPEN','USED','CANCELLED','EXPIRED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists davomat_sessions_employee_idx
  on public.davomat_enrollment_sessions(employee_id,status);

create table if not exists public.davomat_attendance_events (
  id uuid primary key,
  employee_id text not null references public.davomat_employees(id),
  device_id text not null references public.davomat_devices(id),
  event_type text check(event_type in ('IN','OUT') or event_type is null),
  business_date date not null,
  event_at timestamptz not null,
  client_time timestamptz,
  server_time timestamptz not null default now(),
  match_score numeric(7,5) check(match_score between -1 and 1),
  liveness_score numeric(6,4),
  realness_score numeric(6,4),
  blink_ok boolean not null default false,
  blink_ms integer,
  photo_path text,
  photo_deleted_at timestamptz,
  source text not null check(source in ('LIVE','OFFLINE_SYNC','IMPORT')),
  status text not null check(status in ('ACCEPTED','REJECTED')),
  review_reason text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now()
);
create index if not exists davomat_events_recalc_idx
  on public.davomat_attendance_events(employee_id,business_date,event_at)
  where status='ACCEPTED' and voided_at is null;
create index if not exists davomat_events_device_idx
  on public.davomat_attendance_events(device_id,server_time desc);

create table if not exists public.davomat_attendance_days (
  id text primary key,
  business_date date not null,
  employee_id text not null references public.davomat_employees(id),
  schedule_id text references public.davomat_schedules(id),
  first_in timestamptz,
  last_out timestamptz,
  worked_min integer not null default 0 check(worked_min >= 0),
  late_min integer not null default 0 check(late_min >= 0),
  early_min integer not null default 0 check(early_min >= 0),
  overtime_min integer not null default 0 check(overtime_min >= 0),
  absent boolean not null default false,
  requires_review boolean not null default false,
  status text not null default 'PENDING',
  updated_at timestamptz not null default now(),
  unique(employee_id,business_date)
);
create table if not exists public.davomat_corrections (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  employee_id text not null references public.davomat_employees(id),
  field text not null check(field in ('FIRST_IN','LAST_OUT')),
  old_value timestamptz,
  new_value timestamptz,
  reason text not null,
  admin_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.davomat_salary (
  month date not null,
  employee_id text not null references public.davomat_employees(id),
  monthly_salary numeric(16,2) not null,
  planned_days integer not null default 0,
  present_days integer not null default 0,
  absent_days integer not null default 0,
  worked_min integer not null default 0,
  late_min integer not null default 0,
  early_min integer not null default 0,
  overtime_min integer not null default 0,
  absence_deduction numeric(16,2) not null default 0,
  payable numeric(16,2) not null default 0,
  status text not null default 'DRAFT',
  updated_at timestamptz not null default now(),
  primary key(month,employee_id)
);
create table if not exists public.davomat_request_log (
  request_id uuid primary key,
  device_id text references public.davomat_devices(id),
  action text not null,
  status text not null check(status in ('DONE','ERROR')),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists davomat_request_log_created_idx on public.davomat_request_log(created_at);
create table if not exists public.davomat_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create table if not exists public.davomat_notification_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

-- Private storage only; access is issued through short-lived signed URLs
-- after server-side authorization. Never allow anonymous bucket listing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('davomat-photos','davomat-photos',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false, file_size_limit=5242880,
 allowed_mime_types=array['image/jpeg'];

-- Face embeddings and device secrets must never be read from a browser using
-- publishable/anon credentials. Edge Functions authenticate and operate using
-- a server-side secret key. No direct RLS allow policies are created here.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename like 'davomat_%'
  loop
    execute format('alter table public.%I enable row level security',r.tablename);
    execute format('revoke all on public.%I from anon,authenticated',r.tablename);
  end loop;
end $$;
-- Storage's existing policies are not modified: only this bucket is private.
-- service_role secret MUST stay in Supabase Edge Function env, never in JS.
