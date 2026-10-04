# DAVOMAT → Supabase migration

State: PREPARATION ONLY / NO LIVE CUTOVER (2026-10-04).

## Destination / hard blocker
- Display name: DAVOMAT. New Supabase project: davomat.
- The intended account is **tohirjon.uzb@gmail.com ONLY**.
- Candidate domain: davomat.dev, pending domain ownership and DNS confirmation.
- BLOCKED: connected Supabase only exposes "t.mamutxanov@gmail.com's Org".
- DO NOT create the project in that organization or modify its FieldFlow and supervisor-learning-v3 projects.

## Non-disruptive migration
1. Keep current main, Google Apps Script, Sheets and Drive unchanged.
2. Reconnect Supabase with the explicitly requested Google identity.
3. Ask which organization to use, check price and get cost approval.
4. Create separate davomat Supabase project, then apply SQL migrations.
5. Import settings, schedules, employees, devices metadata, face profiles, sessions, attendance events, corrections, salaries, audits and sync logs with stable IDs.
6. Keep service keys, admin PINs and device credentials out of frontend, GitHub, and data export; issue NEW credentials during cutover.
7. Copy control photos into the private davomat-photos bucket through secure authenticated transfer; preserve source references, verify SHA/counts.
8. Recompute and compare per-day summaries and monthly salaries against Google. Document all exceptions and rejected attempts.
9. Implement server-side recognition verification; do not rely only on client-reported matching or blink scores.
10. Test preview terminal: enrollment, IN/OUT including rapid transitions, night shift, non-matching face, spoofing, offline queue, repeated IDs, revocations, races.
11. Deploy admin and frontend preview. Run Supabase performance and security advisors.
12. Cut over domain only after user approval and full E2E pass. Keep original backend and backups for rollback.

## Legacy → Supabase mapping
| Google / Apps Script | Supabase |
| --- | --- |
| SETTINGS | davomat_settings |
| SCHEDULES | davomat_schedules |
| EMPLOYEES | davomat_employees |
| FACE_PROFILES | davomat_face_profiles |
| DEVICES | davomat_devices |
| ENROLLMENT_SESSIONS | davomat_enrollment_sessions |
| ATTENDANCE_EVENTS | davomat_attendance_events |
| ATTENDANCE | davomat_attendance_days |
| CORRECTIONS | davomat_corrections |
| SALARY | davomat_salary |
| ADMIN_AUDIT | davomat_audit_log |
| SYNC_LOG | davomat_request_log |
| TELEGRAM_LOG | davomat_notification_log |
| Drive control photos | private davomat-photos bucket |
| doGet/doPost | Supabase Edge Functions |
| periodic triggers | scheduled Edge Functions |
| terminal UI | separate frontend preview |

## Security and data integrity
- RLS is enabled for ALL DAVOMAT tables with no direct anon/authenticated grants.
- Admin users must authenticate using Supabase Auth and an explicit role lookup.
- Each device gets a strong new credential; hash only in database.
- Edge Function server-only credentials must never appear in browser code.
- Private images, short-lived admin signed URLs, limited biometric retention, audit logs.
- Prevent false matches through genuine impostor trials and appropriately calibrated thresholds.
- Do not modify unrelated Supabase Storage bucket permissions.
- Do not treat frontend success messages as confirmed database writes.

## State
DONE: isolated GitHub branch and first SQL migration.
BLOCKED: owner account connection, project creation and billing approval.
PENDING: data import, new APIs, new frontend/admin, security/performance tests and controlled cutover.
