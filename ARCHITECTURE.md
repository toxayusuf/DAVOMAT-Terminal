# DAVOMAT — ARCHITECTURE

## Production architecture

```mermaid
flowchart LR
  U[Employee] --> T[GitHub Pages Face Terminal]
  T --> C[Camera / Human Face AI]
  C --> L[Liveness + Blink + Embedding]
  L -->|JSONP reads| GAS[Google Apps Script Web App]
  L -->|no-cors POST + requestStatus| GAS

  GAS --> SH[Google Sheets]
  GAS --> DR[Google Drive Photos]
  GAS --> TG[Telegram Bot API]

  A[Administrator] --> AH[Apps Script Admin UI]
  AH --> GAS

  T --> IDB[(IndexedDB)]
  IDB --> Q[offlineQueue]
  IDB --> DL[deadLetter]
  IDB --> FC[bootstrap / Face DB cache]

  SW[Service Worker] --> T
  SW --> MC[Human model cache]
```

## Runtime boundaries

### GitHub Pages terminal

Files:
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

Responsibilities:
- camera lifecycle
- face detection
- anti-spoof/liveness
- active blink
- embedding/matching
- local Face DB cache
- offline attendance queue
- user-facing states and errors
- fast local acknowledgement

### Apps Script backend

Files:
- `apps-script/Code.gs`
- `apps-script/Admin.html`
- `apps-script/appsscript.json`

Responsibilities:
- device authentication
- enrollment sessions
- employee/schedule/admin logic
- attendance idempotency
- day summary / payroll v1
- Drive photo storage/retention
- Telegram integration
- audit
- admin sessions

### Google Sheets

Source of record for business data. Exact schema is documented in `DATA_SCHEMA.md`.

### Google Drive

Production photo folder:
- ID `1pLiHLTKCVZN2X0N3AIZ6RORMS2kZE6p0`
- not broadly shared.

### Transport

Reads:
`Terminal -> JSONP GET -> Apps Script`

Writes:
`Terminal -> text/plain no-cors POST -> Apps Script -> requestStatus polling`

This transport is retained because it is compatible with the existing GitHub Pages + Apps Script architecture.

## Attendance transaction

```mermaid
sequenceDiagram
  participant E as Employee
  participant T as Terminal
  participant AI as Human AI
  participant B as Apps Script
  participant S as Sheets
  participant D as Drive
  participant G as Telegram

  E->>T: KELDI / KETDI
  T->>T: start camera
  T->>AI: detect face
  AI-->>T: live + real + embedding + blink
  T->>T: 3 stable matches
  T->>T: stop camera
  T->>B: attendance(eventId)
  B->>S: idempotent durable event
  B-->>T: requestStatus DONE
  T-->>E: accepted
  B->>D: photo post-commit
  B->>S: rebuild day summary
  B->>G: notification/report post-commit
```

## Cache and update rules

- Service Worker build ID must be unique for every rollout.
- HTML navigation is network-first.
- App shell is versioned.
- Human models have separate cache.
- Face DB cache is invalidated after enrollment.
- Online bootstrap cache max age is 24 hours.
- Offline attendance uses IndexedDB, not localStorage.
