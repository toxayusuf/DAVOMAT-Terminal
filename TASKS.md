# DAVOMAT — TASKS

## P0

- [x] Create restore branch before hardening.
- [x] Create independent Google Sheets backup.
- [x] Harden frontend/backend source and CI.
- [x] Publish current terminal source; latest `main` `39436226a7b401484ef3b52a567c372ba245ee27` has CI PASS.
- [x] Owner approved production backend deploy under `APR-002`.
- [x] Verify historical `null.getTime` path is already guarded in current source.
- [ ] Recover exact production Apps Script `scriptId`. **BLOCKER: identifier is not exposed by current connectors.**
- [ ] Verify the recovered script owns deployment `AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGI5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw`.
- [ ] Deploy Apps Script v1.5 source to the existing production deployment.
- [ ] Run `migrateDavomatSchema()` once.
- [ ] Run `runDavomatSmokeTests()`.
- [ ] Verify public health endpoint reports v1.5.0.

## P1

- [ ] Physical E2E: registration/enrollment.
- [ ] Physical E2E: Face ID IN/OUT.
- [ ] Physical E2E: reload/session continuity.
- [ ] Physical E2E: offline -> online queue sync.
- [ ] Physical E2E: unknown face.
- [ ] Physical E2E: disabled employee.
- [ ] Physical E2E: photo/screen spoof.
- [ ] Physical E2E: clean-session admin login.
- [ ] Measure real terminal P50/P95.

## Safety

- Never create a new production spreadsheet.
- Never create a replacement permanent web-app URL.
- Never deploy against a guessed Script ID.
- Preserve restore branch and pre-production Sheet backup.
