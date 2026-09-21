# DAVOMAT — TEST REPORT

Date: 2026-09-21
Production frontend: v1.5.0
Commit: `2bd2cce603edfd704167cf745d1062bf88b75de2`

| Function | Test | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|
| GitHub CI | architecture + business contracts | all pass | passed | PASS | run 35557403243 |
| Pages deployment | deploy main head | deployed same SHA | deployed | PASS | run 35557403242 |
| Pages artifact | inspect published artifact | v1.5, no legacy hotfix runtime | confirmed | PASS | artifact 10620132720 |
| Sheets schema | compare 13 headers | exact match | 13/13 exact | PASS | live Sheets read |
| Timezone | spreadsheet/settings | Asia/Tashkent | Asia/Tashkent | PASS | live metadata/settings |
| Drive privacy | spreadsheet/photo/backup | no broad sharing | owner-only | PASS | live Drive metadata |
| Face DB active filtering | source + live data | only active READY | 1 active READY, 6 active profiles | PASS | source contract + live Sheets |
| Duplicate EVENT_ID | deterministic backend test | one logical append | one append | PASS | CI business contract |
| Disabled employee | deterministic backend test | reject | EMPLOYEE_NOT_FOUND | PASS | CI business contract |
| Low liveness | deterministic backend test | reject | FACE_PROOF_LOW | PASS | CI business contract |
| Work time | 09:15–18:30, 1h lunch | 495 min | 495 min | PASS | CI business contract |
| Late | 09:15 vs 09:00, grace 10 | 15 min | 15 min | PASS | CI business contract |
| Overtime | 18:30 vs 18:00 | 30 min | 30 min | PASS | CI business contract |
| Overnight schedule | 20:00–05:00 | 9h, next-day OUT assigned to previous date | confirmed | PASS | CI business contract |
| Salary v1 | 3,000,000 / 30 days / 1 absent | payable 2,900,000 | 2,900,000 | PASS | CI business contract |
| Offline queue | code/contract | IndexedDB retry + dead-letter | implemented | PASS (logic) | static contract |
| Service Worker | stale build prevention | unique cache + network-first HTML | implemented | PASS | published artifact |
| Multi-face | code path | reject >1 face | implemented | PASS (logic) | static contract |
| Active blink | code path | temporal blink required | implemented | PASS (logic) | static contract |
| Enrollment refresh | cache invalidation | immediate fresh Face DB | implemented | PASS (logic) | static contract |
| New employee physical E2E | camera -> enroll -> IN -> OUT | all stages succeed | not run after v1.5 | BLOCKED | real camera required |
| Reload physical E2E | refresh without clearing browser | still works | not run after v1.5 | BLOCKED | real terminal required |
| Offline physical E2E | network off/on | exactly one event | not run after v1.5 | BLOCKED | real browser/network required |
| Unknown face physical | no attendance | not run | BLOCKED | real camera required |
| Disabled employee physical | blocked after terminal refresh | not run | BLOCKED | real camera required |
| Photo/screen spoof | must not mark | not run | BLOCKED | real spoof test required |
| Admin clean session | login + all pages | stable | v1.5 source complete, live deploy unverified | BLOCKED | Apps Script v1.5 deployment required |
| Drive photo upload | attendance not lost if Drive fails | v1.5 source isolates post-commit | live v1.5 unverified | BLOCKED | Apps Script v1.5 deployment required |
| Telegram failure isolation | attendance still saved | v1.5 source isolates post-commit | Telegram unconfigured | BLOCKED | credentials + backend deploy required |
| Telegram send | real message | delivered once | not configured | FAIL / CONFIG | missing bot token/chat ID |
| Photo retention | >60d safely trashed | source exists | trigger live execution unverified | BLOCKED | backend deploy/trigger check required |

## P0/P1 conclusion

Frontend has no open P0/P1 issue found by current automated checks.

The whole system cannot yet be declared production-complete because:
1. live Apps Script v1.5 deployment is not verified;
2. Telegram is not configured;
3. physical camera/offline/spoof E2E has not been executed after v1.5 rollout.

These are acceptance blockers, not documentation issues.
