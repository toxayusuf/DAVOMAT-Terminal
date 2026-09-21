# DAVOMAT — PROJECT STATE

Updated: 2026-09-21 (Asia/Tashkent)

## Production status

- Frontend / Face Terminal: **v1.5.0**
- Production branch: `main`
- Current production source commit: `39436226a7b401484ef3b52a567c372ba245ee27`
- DAVOMAT CI: **PASS**, run `35561501208`
- GitHub Pages: **PASS**, run `35561501203`
- Production terminal: `https://toxayusuf.github.io/DAVOMAT-Terminal/`
- Existing Apps Script production URL: `https://script.google.com/macros/s/AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGI5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw/exec`
- Apps Script repository source: **v1.5.0 ready**
- Live Apps Script version: **NOT VERIFIED / DEPLOY BLOCKED**
- Production Sheet ID: `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`
- Photo folder ID: `1pLiHLTKCVZN2X0N3AIZ6RORMS2kZE6p0`
- Restore branch: `restore/pre-production-audit-2026-09-17` @ `81d34ab765fb0f08ca3206e37b21b1c52dea7597`
- Sheets backup: `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`

## 2026-09-21 deployment approval

- Approval `APR-002`: **APPROVED by owner**.
- Required action: deploy repository Apps Script v1.5 source into the **existing** production deployment, then run migration/smoke/live acceptance.
- Do not create a new spreadsheet.
- Do not create a new permanent deployment URL.
- Do not run `setupDavomat()` on production.

## Current blocker

The exact Apps Script project `scriptId` for the existing deployment is still unavailable to the active connectors.

Verified:
- Google Drive search exposes the production Sheet/folders, not the bound Apps Script project ID.
- Gmail contains no recoverable DAVOMAT `script.google.com/d/<scriptId>/edit` link.
- Repository history/context confirms the owner previously supplied an Apps Script project link, but the exact `scriptId` is not recoverable from current connector state.
- A separate FINCONTROL Google OAuth credential can list Apps Script projects, but it does **not** see DAVOMAT and therefore must not be used for deployment.
- No Apps Script deployment API is exposed by the installed connectors.

## Next action

Recover the exact DAVOMAT Apps Script editor link / `scriptId`. Then:
1. Verify that `clasp list-deployments` for that script contains the existing deployment ID `AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGI5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw`.
2. Replace source with repository `apps-script/Code.gs`, `apps-script/Admin.html`, `apps-script/appsscript.json`.
3. Run `migrateDavomatSchema()` once.
4. Run `runDavomatSmokeTests()`.
5. Update the existing deployment only.
6. Verify `?api=health` returns v1.5.0.
7. Run physical acceptance from `TEST_REPORT.md`.

Working checkpoint branch: `backend-deploy-20260921`.
