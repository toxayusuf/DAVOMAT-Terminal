# DAVOMAT — DATA SCHEMA

Production spreadsheet:
`10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4`

Spreadsheet timezone:
`Asia/Tashkent`

All headers below were compared against the live production spreadsheet on 2026-09-18 and matched exactly.

| Sheet | Columns |
|---|---|
| SETTINGS | KEY, VALUE, NOTE, UPDATED_AT |
| EMPLOYEES | EMPLOYEE_ID, FULL_NAME, POSITION, MONTHLY_SALARY, SCHEDULE_ID, START_DATE, ACTIVE, FACE_STATUS, CREATED_AT, UPDATED_AT |
| FACE_PROFILES | PROFILE_ID, EMPLOYEE_ID, EMBEDDING_JSON, QUALITY_SCORE, POSE_LABEL, CREATED_AT, ACTIVE |
| SCHEDULES | SCHEDULE_ID, NAME, MON_START, MON_END, TUE_START, TUE_END, WED_START, WED_END, THU_START, THU_END, FRI_START, FRI_END, SAT_START, SAT_END, SUN_START, SUN_END, LUNCH_START, LUNCH_END, GRACE_MINUTES, ACTIVE, UPDATED_AT |
| ATTENDANCE | DAILY_ID, DATE, EMPLOYEE_ID, SCHEDULE_ID, FIRST_IN, LAST_OUT, WORKED_MIN, LATE_MIN, EARLY_MIN, OVERTIME_MIN, ABSENT, REQUIRES_REVIEW, STATUS, UPDATED_AT |
| ATTENDANCE_EVENTS | EVENT_ID, EMPLOYEE_ID, DEVICE_ID, EVENT_TYPE, EVENT_DATE, EVENT_AT, CLIENT_TIME, SERVER_TIME, MATCH_SCORE, LIVENESS_SCORE, REAL_SCORE, BLINK_OK, PHOTO_FILE_ID, PHOTO_URL, SOURCE, STATUS, REVIEW_REASON, PHOTO_DELETED_AT |
| CORRECTIONS | CORRECTION_ID, DATE, EMPLOYEE_ID, FIELD, OLD_VALUE, NEW_VALUE, REASON, ADMIN_ID, CREATED_AT |
| SALARY | MONTH, EMPLOYEE_ID, MONTHLY_SALARY, PLANNED_DAYS, PRESENT_DAYS, ABSENT_DAYS, WORKED_MIN, LATE_MIN, EARLY_MIN, OVERTIME_MIN, ABSENCE_DEDUCTION, PAYABLE, STATUS, UPDATED_AT |
| ADMIN_AUDIT | AUDIT_ID, ADMIN_ID, ACTION, ENTITY, ENTITY_ID, BEFORE_JSON, AFTER_JSON, REASON, CREATED_AT |
| DEVICES | DEVICE_ID, NAME, TOKEN_HASH, ACTIVE, LAST_SEEN_AT, CREATED_AT |
| SYNC_LOG | REQUEST_ID, DEVICE_ID, ACTION, STATUS, RESULT_JSON, MESSAGE, CREATED_AT, UPDATED_AT |
| TELEGRAM_LOG | LOG_ID, TYPE, STATUS, MESSAGE, CREATED_AT |
| ENROLLMENT_SESSIONS | CODE, EMPLOYEE_ID, DEVICE_ID, STATUS, EXPIRES_AT, CREATED_AT, USED_AT |

## Key rules

- `EMPLOYEE_ID`: stable business identifier; active employee lookup requires `ACTIVE=TRUE`.
- `FACE_PROFILES`: terminal bootstrap includes only active profiles whose employee is active and READY.
- `EVENT_ID`: idempotency key for one logical attendance operation.
- `REQUEST_ID`: transport/request idempotency and status lookup.
- `EVENT_DATE`: business date; night shifts may assign an after-midnight OUT to the previous work date.
- `CLIENT_TIME`: authoritative for accepted offline events within allowed age.
- `SERVER_TIME`: server receipt/commit time.
- `PHOTO_FILE_ID`: link to Drive control photo.
- `PHOTO_DELETED_AT`: retention audit field.
- All date/time business logic uses `Asia/Tashkent`.

## Current production snapshot

At last inspection:
- employees in sheet: 2
- active employees: 1
- active + FACE_STATUS READY: 1
- active face profiles: 6
- active terminal: `terminal-01`
- active schedule: `SCH-DEFAULT`.
