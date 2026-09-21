# DAVOMAT — RECOVERY

## Restore points

### GitHub

Pre-hardening production:
- branch: `restore/pre-production-audit-2026-09-17`
- commit: `81d34ab765fb0f08ca3206e37b21b1c52dea7597`

Current frontend production:
- `main` -> `2bd2cce603edfd704167cf745d1062bf88b75de2`

### Google Sheets

Backup:
- `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`

Production:
- `DAVOMAT`
- ID `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`

## Failure recovery

### Pages build broken

1. Fast-forward/reset main to known-good restore commit.
2. Wait for Pages workflow.
3. Inspect the actual Pages artifact.
4. On affected terminal reload twice if an old Service Worker is still controlling the first navigation.
5. Never reuse the same Service Worker build ID for modified assets.

### IndexedDB migration problem

v1.5 opens `davomat-fast-cache` at DB version 2 and creates stores without requiring DevTools deletion.

If a store is corrupted:
- UI should fail recoverably.
- do not delete biometric data in Sheets.
- after a fixed build, bump IndexedDB schema version and migrate/replace only the affected local store.

### Offline queue problem

- pending events remain in `offlineQueue`.
- transient failures retry with backoff.
- permanent/exhausted failures move to `deadLetter`.
- EVENT_ID remains unchanged, so retry is idempotent.

Do not manually copy failed events into ATTENDANCE_EVENTS unless performing an audited correction.

### Apps Script rollback

Use Apps Script deployment history to repoint the existing web-app deployment to the last known-good version.

### Data corruption

Use the backup only after comparing:
- employees
- face profiles
- attendance events
- corrections
- salary

Do not overwrite the whole production spreadsheet for an isolated row issue.

### Device compromise

1. Set `DEVICES.ACTIVE=FALSE`.
2. Rotate device token.
3. Re-provision the intended terminal.
4. Verify bootstrap fails on the revoked token.
