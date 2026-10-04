# DAVOMAT — TASKS

## P0

- [x] Create restore branch before hardening.
- [x] Create independent Google Sheets backup.
- [x] Harden frontend/backend v1.5 source.
- [x] Publish current terminal source to GitHub Pages.
- [x] Recover exact Apps Script Script ID.
- [x] Verify existing deployment ownership before write.
- [x] Backup current remote Apps Script source before rollout.
- [x] Fix repository manifest so web-app configuration is preserved.
- [x] Deploy Apps Script v1.5 source to the existing production deployment.
- [x] Preserve existing permanent deployment ID/URL.
- [x] Verify public health endpoint returns v1.5.0.
- [ ] Complete physical Face ID acceptance matrix.

## P1 — physical E2E still required

- [ ] New employee enrollment with real camera.
- [ ] Face ID IN.
- [ ] Face ID OUT.
- [ ] Reload/session continuity.
- [ ] Offline → online queue sync.
- [ ] Unknown face rejection.
- [ ] Disabled employee rejection.
- [ ] Printed/photo-on-phone spoof rejection.
- [ ] Clean-session admin login.
- [ ] Measure terminal cold/warm P50/P95.

## P2

- [x] Architecture/attendance CI contracts.
- [x] Current GitHub main CI PASS.
- [x] Existing production deployment updated to @32.
- [x] Public web health PASS.
- [ ] Investigate why Apps Script Execution API `clasp run` returns storage NOT_FOUND while web-app runtime works.
- [ ] Confirm photo-retention trigger after physical acceptance.
- [ ] Configure/test Telegram only when credentials are intentionally enabled.

## Safety

- Never create a new production spreadsheet.
- Never create a replacement permanent web-app URL.
- Never deploy against a guessed Script ID.
- Keep webapp `executeAs/access` configuration in version-controlled `appsscript.json`.


## SUPABASE DAVOMAT 2.0 — 2026-10-04
- [x] Confirm target Supabase identity, organization, project creation cost.
- [x] Create isolated project davomat and migration branch.
- [x] Apply private database schema, RLS, indexes.
- [x] Copy employees, shifts, safe settings, face profiles, events, days, salary, historical logs.
- [x] Deploy auth-protected Supabase API and separate UI previews.
- [x] Test anonymous admin/device rejection and day/night shift calculations.
- [x] Fetch and hash 8 private source photos into RLS-protected staging.
- [ ] Authenticate Supabase Auth owner tohirjon.uzb@gmail.com.
- [ ] Pair a test device with a new one-use code. Leave existing production terminal alone.
- [ ] Verify webcam enrollment and live IN/OUT with private Supabase Storage photo.
- [ ] Move 8 staged JPEGs into private Storage via an owner-authorized normal import workflow; temporary migration endpoint disabled.
- [ ] Reconcile all data, including new changes in Google made since first snapshot.
- [ ] Validate duplicate requests, offline/replay security, spoof & non-matching face trials, photo retention, schedule/night shift under real camera.
- [ ] Implement remaining admin operations, Telegram notifications, salary jobs, photo retention, audited corrections.
- [ ] Verify davomat.dev domain control and supported hosting; choose domain with owner.
- [ ] Obtain explicit owner acceptance before disabling Google backend.
