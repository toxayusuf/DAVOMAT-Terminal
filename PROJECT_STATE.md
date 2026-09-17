# DAVOMAT — PROJECT STATE

Версия: v1.4.0
Дата: 2026-09-17

## Зафиксированная архитектура
- Google Apps Script: backend + admin UI + device/enrollment launch links.
- Google Sheets: сотрудники, графики, посещаемость, зарплата, audit.
- Google Drive: контрольные фото.
- GitHub Pages: Face Terminal/PWA.

## Текущий рабочий путь
- Конфигурация устройства передаётся один раз в URL fragment `#cfg=...` и сохраняется в браузере.
- Камера запускается только на top-level `toxayusuf.github.io`, не внутри Apps Script iframe.
- GET/reads: JSONP к Apps Script (`bootstrap`, `enrollment`, `pendingEnrollment`, `requestStatus`).
- Writes: `fetch(..., mode=no-cors, Content-Type=text/plain)` → Apps Script `doPost` → polling `requestStatus` через JSONP.
- Ни iframe bridge, ни `window.opener`, ни ручной ввод URL/device/token не используются.

## v1.4.0 — реально внедрено в GitHub main
1. Все frontend build IDs синхронизированы на `1.4.0`: `index.html`, `app.js`, `top-level-fix.js`, `sw.js`.
2. Service Worker больше не ждёт сеть перед выдачей app shell. Для same-origin shell используется stale-while-revalidate, а navigation получает cached `index.html` немедленно и обновляется в фоне.
3. Precache содержит точные versioned URL: `styles.css?v=1.4.0`, `app.js?v=1.4.0`, `top-level-fix.js?v=1.4.0`.
4. Постоянный cache Human/model сохранён отдельно и не удаляется при обновлении shell.
5. Включён Navigation Preload там, где браузер его поддерживает.
6. IndexedDB connection переиспользуется в рамках страницы вместо повторного `indexedDB.open()`/close на каждый cache read/write.
7. Bootstrap cache TTL увеличен до 7 суток; после быстрого локального старта серверная база обновляется в фоне.
8. Human JS подгружается в idle; тяжёлые модели и камера не запускаются постоянно.
9. Face detector rotation выключен для фиксированного терминала (`rotation:false`).
10. Метрика камеры заканчивается после первого реально доступного video frame, а не только после `video.play()`.
11. Контрольное фото: crop до 320 px, JPEG quality ~0.44, асинхронный `canvas.toBlob()`.
12. После уверенного Face match камера выключается и сразу показывается `ҚАБУЛ ҚИЛИНДИ`; кодирование фото и серверное сохранение продолжаются после local ACK.
13. В сервисной диагностике добавлены `Local ACK`, `Фото ms / KB` и количество status polls.
14. Backoff `requestStatus` изменён на 120/180/280/450/700/1000/1500 ms + небольшой jitter.

## Коммиты релиза
- `db30197181a65a59a8d32535baa72e31e2de0a92` — новый Service Worker.
- `4210c42edaf8b521489c28210ec712325f81e1e7` — index/build sync.
- `0e1830dc230575136d6b9485c6ae56216548f6bf` — launcher/build sync.
- `96423a5488dcce2787efb2d525710348de134ae6` — app.js v1.4.0 optimizations.

## Проверки
- Локальный `node --check` для опубликованного `app.js` — PASS.
- Git blob SHA локально проверенного `app.js`: `f4e0c63c94244d2e16cff81da3702db7480fc76c`.
- GitHub `content_sha` опубликованного `app.js`: `f4e0c63c94244d2e16cff81da3702db7480fc76c` — точное совпадение.
- GitHub Pages workflow run `35184932016` — `completed / success`.

## Что ещё не считается внедрённым
Backend Apps Script performance patch из глубокого исследования пока не подтверждён как опубликованный в production Apps Script. В текущей сессии доступен live GitHub, но нет операции редактирования/деплоя container-bound Apps Script source через Apps Script API. Поэтому нельзя честно помечать `CacheService requestStatus`/удаление `PROCESSING` из `SYNC_LOG` как production-ready deployment без отдельного source/deploy доступа.

## Следующий контрольный тест
1. Открыть DAVOMAT заново; в шапке должно быть `v1.4.0`.
2. Первый запуск после релиза может обновить shell/model cache. Второй запуск — основной warm-kiosk тест.
3. Проверить `КЕЛДИ`: Face match → камера OFF → `ҚАБУЛ ҚИЛИНДИ` без ожидания Drive/Sheets → затем `МУВАФФАҚИЯТЛИ`.
4. Открыть ⚙ и записать: `База`, `Face AI`, `Камера`, `Local ACK`, `Фото`, `Сақлаш`, `Polls`.
5. Проверить `КЕТДИ` и регистрацию нового лица.

## Rollback
Если v1.4.0 даст функциональную регрессию, откатывать нужно всем набором frontend-файлов на один согласованный build ID. Нельзя оставлять смесь `index/app/sw` разных версий.
