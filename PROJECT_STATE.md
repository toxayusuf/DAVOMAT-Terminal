# DAVOMAT — PROJECT STATE

Updated: 2026-09-21 (Asia/Tashkent)

## Production status

- Frontend / Face Terminal: **v1.5.0**
- Production branch: `main`
- Current production source commit: `40645c21b1bc56a4a3a57c7f13208af28cd917ae`
- DAVOMAT CI: **PASS**, run `35580082583`
- GitHub Pages: **PASS**, run `35580082537`
- Production terminal: `https://toxayusuf.github.io/DAVOMAT-Terminal/`
- Apps Script Script ID: `1r529SSFauYTyu0E5ztLuff7_bS8aotq8F00kIIlj8NGFuA3I7l7vnKkF`
- Apps Script deployment ID: `AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGl5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw`
- Apps Script production version: **@32**
- Apps Script health: **PASS** — `{"ok":true,"service":"DAVOMAT","version":"1.5.0"}`
- Production Sheet ID: `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`
- Photo folder ID: `1pLiHLTKCVZN2X0N3AIZ6RORMS2kZE6p0`
- Restore branch: `restore/pre-production-audit-2026-09-17` @ `81d34ab765fb0f08ca3206e37b21b1c52dea7597`
- Independent Sheet backup: `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`
- Pre-deploy Apps Script backup artifact: run `35580111990`, artifact `10629184659` (retained 30 days)

## 2026-09-21 backend rollout

APR-002 was approved and executed.

Guarded rollout sequence:
1. Exact Script ID supplied by owner.
2. Existing deployment was verified before write.
3. Current Apps Script source was backed up.
4. Repository source was syntax-checked.
5. Source was pushed to the existing Apps Script project.
6. Existing deployment was updated; no replacement URL/project/Sheet was created.
7. A temporary @31 rollout exposed a missing `webapp` block in repository `appsscript.json`, causing public 404.
8. Version 30 manifest was inspected and proved the required web-app configuration:
   - `executeAs: USER_DEPLOYING`
   - `access: ANYONE_ANONYMOUS`
9. Repository source was fixed in commit `40645c21...`.
10. Existing production deployment was updated again to **@32**.
11. Public health returned DAVOMAT v1.5.0 successfully.

## Verified

- Current `main` CI and Pages are green.
- Apps Script source is v1.5.0.
- Web-app manifest is preserved in source control.
- Existing permanent deployment URL is preserved.
- Production health endpoint returns v1.5.0.
- Current source already guards invalid schedule time values before `.getTime()`.
- Offline queue / idempotency / post-commit architecture remains in v1.5 source.
- Active blink + passive liveness remain enabled in source/settings.

## Still not physically verified

1. Registration/enrollment with a real camera.
2. Face ID IN/OUT with a real employee.
3. Offline → online queue on the actual terminal browser.
4. Unknown/disabled user behavior.
5. Printed-photo / phone-screen spoof test.
6. Clean-session admin login in a normal user browser.
7. Real P50/P95 camera/network performance.

## Note about clasp execution smoke

Authenticated `clasp run migrateDavomatSchema` and `runDavomatSmokeTests` return an Apps Script storage `NOT_FOUND` exception when invoked through the Execution API, even though the deployed web app itself answers health successfully. Do not treat the clasp wrapper exit code as a passed smoke test. Production runtime verification must use the web-app path plus physical E2E.

## Next action

Run the physical acceptance matrix from `TEST_REPORT.md` on the actual webcam/terminal path. Do not create a new deployment URL or production Sheet.
