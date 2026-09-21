# DAVOMAT — PROJECT STATE

Updated: 2026-09-21 (Asia/Tashkent)

## Production status

- Frontend / Face Terminal: **v1.5.0**
- Production branch: `main`
- Production commit: `2bd2cce603edfd704167cf745d1062bf88b75de2`
- GitHub Pages CI: **PASS**, run `35557403242`
- DAVOMAT CI: **PASS**, run `35557403243`
- Production terminal: `https://toxayusuf.github.io/DAVOMAT-Terminal/`
- Apps Script production URL: `https://script.google.com/macros/s/AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGI5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw/exec`
- Apps Script source in repository: **v1.5.0 candidate**
- Live Apps Script deployment version: **NOT VERIFIED / NOT DEPLOYED BY CURRENT CONNECTOR**
- Google Sheets production ID: `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`
- Production photo folder ID: `1pLiHLTKCVZN2X0N3AIZ6RORMS2kZE6p0`
- Restore branch: `restore/pre-production-audit-2026-09-17` at `81d34ab765fb0f08ca3206e37b21b1c52dea7597`
- Sheets backup: `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`

## Confirmed working / verified

- main is fast-forwarded from the tested hardening branch.
- GitHub Pages deployment artifact contains v1.5.0 `index.html`, `app.js`, `sw.js`.
- Production artifact does not include legacy runtime `top-level-fix.js`, `face-db-fix.js`, `permission-helper.js`.
- Service Worker uses unique build `1.5.0-prod-20260918-1`.
- Navigation is network-first; shell assets are versioned.
- Offline attendance queue is IndexedDB v2 with retry counter, exponential backoff and dead-letter store.
- Face DB bootstrap cache age is limited to 24 hours online.
- Face recognition requires 3 consecutive matches.
- Multi-face frame is blocked.
- Active blink liveness is implemented in frontend and `REQUIRE_ACTIVE_LIVENESS=true` is set in production SETTINGS.
- One active employee is READY and six active face profiles exist.
- `terminal-01` is active.
- Google Sheets timezone is `Asia/Tashkent`.
- All 13 production sheet headers match `DAVOMAT.HEADERS` exactly.
- Production spreadsheet, photo folder and pre-production backup are not broadly shared.
- Photo retention setting is 60 days.

## Not yet verified in live production

1. **Apps Script v1.5.0 deployment**: repository source is ready, but the current tools cannot replace/deploy the bound Apps Script project.
2. **Physical Face ID E2E after v1.5 rollout**: requires a real camera and a user in front of the terminal.
3. **Spoof test against printed/photo-on-phone image**: requires physical test.
4. **Telegram**: production bot token/chat ID are not configured.
5. **Real offline → online physical terminal sync**: logic/CI contract is verified; physical browser flow has not been executed after v1.5.
6. **Real performance P50/P95**: cannot be measured without the production camera/browser/network path.
7. **Admin v1.5 live UI**: source is complete in `apps-script/Admin.html`, but requires Apps Script deployment.

## Last live-data observation

- Last inspected attendance events are from 2026-09-17, before v1.5 active blink rollout.
- No post-v1.5 physical attendance event was available to prove camera → blink → attendance → photo → summary E2E.

## Next action

Deploy repository `apps-script/Code.gs`, `apps-script/Admin.html`, and `apps-script/appsscript.json` to the existing Apps Script project as a **new version of the existing web-app deployment URL**, then run the production acceptance matrix in `TEST_REPORT.md`.

Do not create a new spreadsheet and do not run `setupDavomat()` against production.
