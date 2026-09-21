# DAVOMAT — AI CHANGELOG

## 2026-09-21 — Apps Script v1.5 production rollout

- Owner approved `APR-002`.
- Recovered exact Script ID:
  `1r529SSFauYTyu0E5ztLuff7_bS8aotq8F00kIIlj8NGFuA3I7l7vnKkF`.
- Verified target project before write.
- Found existing deployment at version @30.
- Corrected a previously stored deployment-ID typo: the real ID contains `...M2VGl5...`, not `...M2VGI5...`.
- Created pre-deploy Apps Script source backup.
- Pushed exact DAVOMAT repository backend source.
- First deployment advanced to @31.
- Detected 404 immediately after @31 and did not treat deploy as complete.
- Compared version 30 and 31 manifests:
  - v30 contained `webapp.executeAs=USER_DEPLOYING`
  - v30 contained `webapp.access=ANYONE_ANONYMOUS`
  - v31 lost the `webapp` block because repository manifest did not contain it.
- Fixed `apps-script/appsscript.json` in main commit `40645c21b1bc56a4a3a57c7f13208af28cd917ae`.
- DAVOMAT CI run `35580082583`: PASS.
- GitHub Pages run `35580082537`: PASS.
- Re-ran guarded Apps Script deployment.
- Existing production deployment advanced to **@32**.
- Public health returned:
  `{"ok":true,"service":"DAVOMAT","version":"1.5.0"}`.
- No new spreadsheet, Script project, or permanent web-app URL was created.
- `clasp run` migration/smoke calls still return Apps Script storage NOT_FOUND and are not counted as passed smoke tests.
- Physical Face ID E2E remains outstanding.

## 2026-09-18 — v1.5 hardening

- IndexedDB retry/dead-letter offline queue.
- Duplicate-safe event/request IDs.
- Service Worker versioning/network-first navigation.
- 3 consecutive face matches.
- Multi-face rejection.
- Active blink + passive liveness.
- Short ScriptLock.
- Durable attendance commit before Drive/Telegram post-processing.
- Overnight shift support.
- Completed admin employee/schedule/attendance/device source.
- Added CI architecture and attendance business-rule tests.

## 2026-09-17 — restore point and audit

- Restore branch created.
- Production spreadsheet backup created.
- Production schema and active face data audited.
- Photo folder privacy verified.
