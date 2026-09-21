# DAVOMAT — AI CHANGELOG

## 2026-09-21 — production frontend rollout

- Fast-forwarded `main` to tested hardening head `2bd2cce603edfd704167cf745d1062bf88b75de2`.
- DAVOMAT CI run `35557403243`: PASS.
- GitHub Pages run `35557403242`: PASS.
- Downloaded and inspected the actual Pages artifact; verified v1.5 build ID and absence of legacy hotfix runtime files.
- Set production `SETTINGS.REQUIRE_ACTIVE_LIVENESS=true`.

## 2026-09-18 — v1.5 hardening

- Replaced offline localStorage queue with IndexedDB v2:
  - `offlineQueue`
  - retry counter
  - exponential backoff
  - `deadLetter`
  - legacy queue migration.
- Service Worker:
  - unique build ID `1.5.0-prod-20260918-1`
  - network-first navigation
  - versioned app shell
  - separate model cache.
- Removed runtime dependency on:
  - `top-level-fix.js`
  - `face-db-fix.js`
  - `permission-helper.js`.
- Face pipeline:
  - 3 consecutive identity matches
  - multi-face rejection
  - face distance checks
  - active blink challenge
  - passive liveness and realness thresholds
  - finite scan timeout
  - Face DB cache refresh immediately after enrollment.
- Backend source:
  - Script Properties secret migration
  - short ScriptLock
  - CacheService request status
  - final SYNC_LOG writes only
  - attendance durable commit before Drive/Telegram post-processing
  - overnight shift support
  - active liveness required for attendance/enrollment.
- Admin source:
  - session restore/logout
  - employee edit and activation
  - face reset
  - schedule create/edit
  - attendance correction
  - device activation/deactivation
  - system diagnostics.
- Added CI tests for architecture and attendance business rules.

## 2026-09-17 — restore point and audit

- Restore branch created from production commit `81d34ab765fb0f08ca3206e37b21b1c52dea7597`.
- Production spreadsheet backup created.
- Confirmed production schema and active face data.
- Confirmed photo folder is private.
- Identified major root causes:
  - multiple frontend hotfix layers
  - stale Service Worker behavior
  - offline localStorage queue without dead-letter
  - Drive/Telegram inside global attendance lock
  - admin schedule buttons not implemented
  - plaintext secret architecture in SETTINGS.
