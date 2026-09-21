# DAVOMAT — AI CHANGELOG

## 2026-09-21 — backend deployment approval and recovery checkpoint

- Owner approved `APR-002` for production Apps Script v1.5 deployment.
- Re-verified current `main` head: `39436226a7b401484ef3b52a567c372ba245ee27`.
- Re-verified DAVOMAT CI run `35561501208`: PASS.
- Re-verified GitHub Pages run `35561501203`: PASS.
- Created working branch `backend-deploy-20260921` from current main.
- Confirmed current source already guards schedule time values before `.getTime()`; no extra null-time patch is required.
- Drive/Gmail search did not recover the bound Apps Script `scriptId`.
- Tested a separate existing Google OAuth path from FINCONTROL: it listed only three unrelated Apps Script projects and did not contain DAVOMAT.
- Did **not** deploy using unrelated credentials and did **not** create a new Apps Script project/deployment.
- Production backend deployment remains blocked only by recovery of the exact existing DAVOMAT `scriptId`.

## Earlier v1.5 hardening

- IndexedDB retry/dead-letter offline queue.
- Duplicate-safe event/request IDs.
- Short backend ScriptLock.
- Durable attendance commit before Drive/Telegram post-processing.
- Active blink/liveness checks.
- Multi-face rejection.
- Overnight shift support.
- Admin employee/schedule/attendance/device diagnostics.
- Architecture and attendance business-contract CI tests.
