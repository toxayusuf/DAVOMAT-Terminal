# DAVOMAT — SECURITY REVIEW

## Confirmed

- GitHub repository search did not expose real Telegram/admin/device secrets in frontend source.
- Production spreadsheet is not broadly shared.
- Production photo folder is not broadly shared.
- Production backup spreadsheet is not broadly shared.
- Device verification uses TOKEN_HASH in `DEVICES`.
- Active employee lookup blocks deactivated employees.
- Face DB bootstrap filters inactive employees/profiles.
- JSONP callback name is validated.
- Admin critical actions write audit events.
- Face Terminal does not treat a hidden URL as authentication.
- Active blink + Human passive liveness/antispoof is implemented in v1.5 frontend.
- Backend source enforces liveness for attendance/enrollment.
- One logical attendance event uses a stable EVENT_ID.

## Security hardening in repository backend v1.5

The v1.5 source migrates:
- admin PIN -> SHA-256 hash in Script Properties
- Telegram bot token -> Script Properties
- active device token plaintext -> Script Properties

SETTINGS keeps only non-secret markers.

**Important:** this secret migration only executes after v1.5 Apps Script is deployed and `migrateSecrets_()` runs. Until then, live Script Properties migration is not verified.

## Biometric data

- Embeddings are stored in Google Sheets FACE_PROFILES.
- Terminal bootstrap receives embeddings only for active READY employees.
- Cache is browser-local IndexedDB.
- Face DB refresh occurs after enrollment.
- Online bootstrap cache maximum age is 24 hours.
- Deactivation blocks new backend attendance and removes the employee from the next bootstrap.

## Photos

- Folder: `DAVOMAT_Photos_Clean_2026-09-15`
- folder is not broadly shared.
- retention setting: 60 days.
- backend source deletes older files and writes `PHOTO_DELETED_AT`.

Retention trigger execution must be confirmed after v1.5 backend deployment.

## Open risks

1. Live Apps Script secret migration not verified.
2. Telegram not configured.
3. Public GitHub Pages necessarily exposes terminal JavaScript; no secrets may ever be embedded there.
4. JSONP sends Face DB over an authenticated device request but remains a legacy transport; device-token protection and data minimization remain critical.
5. Physical spoof resistance must be measured with real printed/photo-on-screen attempts.
6. Browser storage on a stolen terminal contains cached embeddings/device config; revoke the terminal in DEVICES and rotate its token.
