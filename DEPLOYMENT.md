# DAVOMAT — DEPLOYMENT

## 1. Frontend / GitHub Pages

Current production:
- branch: `main`
- commit: `2bd2cce603edfd704167cf745d1062bf88b75de2`
- CI run: `35557403243` PASS
- Pages run: `35557403242` PASS
- build ID: `1.5.0-prod-20260918-1`

The actual GitHub Pages artifact was downloaded and inspected. It contains the v1.5 terminal files and does not contain the obsolete hotfix runtime files.

## 2. Apps Script

Target source is in:
- `apps-script/Code.gs`
- `apps-script/Admin.html`
- `apps-script/appsscript.json`

Existing production deployment URL must be preserved:
`https://script.google.com/macros/s/AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGI5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw/exec`

### Production rule

Do **not** create a new spreadsheet.
Do **not** run `setupDavomat()` on the existing production database.
Do **not** create a new permanent web-app URL.

Create a new Apps Script version for the existing deployment.

### Required deployment sequence

1. Confirm the current production Apps Script project is the one bound to spreadsheet `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`.
2. Replace complete files with the repository versions.
3. Save.
4. Run `migrateDavomatSchema()` once.
5. Run `runDavomatSmokeTests()`.
6. Use Test deployment/`dev` for non-destructive backend smoke tests.
7. Update the existing web-app deployment with a new version.
8. Verify the public `/exec?api=health` reports v1.5.0.
9. Verify admin clean-session login.
10. Run the E2E matrix from `TEST_REPORT.md`.

## 3. Current connector limitation

The Google Drive connector available during this hardening cycle can read/write Sheets and Drive, but it does not expose the bound Apps Script project source/deployment API. No Apps Script project ID or clasp configuration was found in project history.

Therefore the repository source is production-ready, but the **live Apps Script v1.5 deployment is not claimed as completed**.

## 4. Rollback

Frontend:
- move `main` back to restore SHA `81d34ab765fb0f08ca3206e37b21b1c52dea7597`
- allow Pages workflow to deploy.
- use a new cache/build identifier if rollback assets are modified.

Backend:
- deploy the previous Apps Script version from deployment history.
- do not restore the production Sheet unless data corruption is proven.

Data:
- independent backup: `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`.
