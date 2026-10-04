-- Temporary private import staging for authorized Google Drive photo migration.
create table if not exists public.davomat_photo_staging(
 source_file_id text primary key,
 event_id uuid not null references public.davomat_attendance_events(id),
 file_data bytea not null,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 file_size integer not null check(file_size>0 and file_size<=5242880),
 created_at timestamptz not null default now()
);
create index if not exists davomat_photo_staging_event_idx
 on public.davomat_photo_staging(event_id);
alter table public.davomat_photo_staging enable row level security;
revoke all on public.davomat_photo_staging from anon,authenticated;