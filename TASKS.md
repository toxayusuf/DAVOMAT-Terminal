# DAVOMAT — TASKS

## P0

- [x] Create restore branch before hardening.
- [x] Create independent Google Sheets backup.
- [x] Remove duplicate frontend hotfix runtimes from production.
- [x] Replace localStorage offline queue with IndexedDB retry/dead-letter queue.
- [x] Add frontend duplicate-safe event/request IDs.
- [x] Keep backend EVENT_ID idempotency contract in v1.5 source.
- [x] Make Drive/Telegram post-commit in v1.5 backend source.
- [x] Bound ScriptLock to 3 seconds in v1.5 backend source.
- [x] Verify production data schema against backend headers.
- [ ] Deploy Apps Script v1.5 source to existing production deployment. **BLOCKED: no Apps Script deploy action/project ID available to current connector.**
- [ ] Remove plaintext secrets from live SETTINGS by running v1.5 migration after deployment. **BLOCKED by previous item.**

## P1

- [x] Publish Face Terminal v1.5 to GitHub Pages.
- [x] Make Service Worker update deterministic.
- [x] Add multi-face rejection.
- [x] Add active blink challenge + passive liveness/antispoof.
- [x] Enable `REQUIRE_ACTIVE_LIVENESS=true` in production SETTINGS.
- [x] Invalidate Face DB cache after enrollment.
- [x] Add 24h maximum online bootstrap cache.
- [x] Add overnight-shift support in backend source.
- [x] Complete admin source: employee edit/activation, face reset, schedule editor, attendance correction, terminal active state, diagnostics.
- [ ] Physical E2E #1 new employee after v1.5 backend deploy.
- [ ] Physical E2E #2 reload.
- [ ] Physical E2E #3 offline.
- [ ] Physical E2E #5 unknown face.
- [ ] Physical E2E #6 disabled employee.
- [ ] Physical E2E #7 photo/screen spoof.
- [ ] Physical E2E #8 clean-session admin.
- [ ] Configure Telegram token/chat ID and test a real message.

## P2

- [x] Add CI architecture contract.
- [x] Add executable backend business contract.
- [x] Verify Salary v1 formula with deterministic test.
- [x] Verify night-shift date assignment with deterministic test.
- [x] Verify one logical EVENT_ID appends once in deterministic test.
- [ ] Measure production cold/warm performance on actual terminal.
- [ ] Confirm daily photo-retention trigger exists after backend deployment.
- [ ] Confirm Telegram retry/dedup behavior after credentials are configured.

## P3

- [x] Remove obsolete runtime files.
- [x] Add system diagnostics page in admin source.
- [x] Add project documentation and recovery runbook.
