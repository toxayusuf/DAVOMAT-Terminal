# DAVOMAT — DEPLOYMENT

## Current production

Frontend:
- branch: `main`
- source commit: `40645c21b1bc56a4a3a57c7f13208af28cd917ae`
- DAVOMAT CI: `35580082583` PASS
- Pages: `35580082537` PASS
- terminal: `https://toxayusuf.github.io/DAVOMAT-Terminal/`

Apps Script:
- Script ID: `1r529SSFauYTyu0E5ztLuff7_bS8aotq8F00kIIlj8NGFuA3I7l7vnKkF`
- deployment ID: `AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGl5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw`
- current deployed version: **@32**
- source version: DAVOMAT v1.5.0
- public health: PASS

Production Sheet:
- `10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`

## Mandatory source rule

`apps-script/appsscript.json` must keep:

```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

Removing this block and pushing the manifest removes the web-app entry point and causes the production URL to return 404.

## Guarded deployment procedure

1. Verify exact Script ID.
2. Verify the existing deployment ID is present before write.
3. Clone and archive current remote Apps Script source.
4. Checkout an exact DAVOMAT source SHA.
5. Validate `Code.gs` syntax and manifest JSON.
6. Preserve remote script file set.
7. `clasp push --force` only after target verification.
8. Update the **existing** deployment ID only.
9. Verify Apps Script deployment metadata/version.
10. Verify public `?api=health` returns `version: 1.5.0`.
11. If health fails, inspect manifest/entry point before any second write.
12. Run physical acceptance matrix.

## Rollback

- Pre-production restore branch:
  `restore/pre-production-audit-2026-09-17` @ `81d34ab765fb0f08ca3206e37b21b1c52dea7597`
- Sheet backup:
  `DAVOMAT_BACKUP_PRE_PRODUCTION_2026-09-17_1140`
- Pre-deploy Apps Script backup artifact:
  FINCONTROL workflow run `35580111990`, artifact `10629184659`, retained through 2026-10-21.
- Previous Apps Script versions remain in deployment history.

Do not restore the production Sheet unless data corruption is proven.
