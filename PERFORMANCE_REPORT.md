# DAVOMAT — PERFORMANCE REPORT

## Instrumented stages in v1.5 terminal

The service panel records:
- bootstrap ms
- Human AI/model ready ms
- camera initialization ms
- local ACK ms
- photo encode ms / KB
- backend save ms
- requestStatus poll count

## Verified optimizations

- camera stops before waiting for backend result
- Human library preloads during idle
- fixed-terminal detector rotation disabled
- photo cropped/compressed before upload
- IndexedDB connection is reused
- HTML navigation is network-first
- Human models have dedicated cache
- attendance backend v1.5 source uses short lock
- `requestStatus` uses CacheService first
- Drive/Telegram moved out of the durable attendance critical section in v1.5 source

## Real production measurements

No valid post-v1.5 physical terminal sample is available yet.

Therefore the requested values below are **not fabricated**:

| Metric | Actual |
|---|---|
| Cold load | NOT MEASURED |
| Warm load | NOT MEASURED |
| Camera initialization | NOT MEASURED |
| Model ready | NOT MEASURED |
| Face recognition | NOT MEASURED |
| Backend attendance ACK | NOT MEASURED |
| Complete visible cycle | NOT MEASURED |

Target remains:
- warm user-visible cycle approximately 1.2–1.8 s where hardware/network allow it
- avoid >3 s under normal conditions.

The first physical acceptance run should capture at least 5 cold and 20 warm cycles.
