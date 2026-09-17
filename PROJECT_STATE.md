# DAVOMAT — PROJECT STATE

Версия: v1.4.0 + hotfix1
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

## v1.4.0 — внедрено
1. Frontend приведён к build `1.4.0`.
2. Service Worker переведён на stale-while-revalidate для app shell.
3. IndexedDB connection переиспользуется.
4. Bootstrap cache TTL — 7 суток.
5. Human JS подгружается в idle.
6. Face detector rotation выключен для фиксированного терминала.
7. Камера измеряется до первого реального video frame.
8. Фото: crop до 320 px, JPEG ~0.44, async `toBlob()`.
9. После Face match камера выключается сразу и показывается `ҚАБУЛ ҚИЛИНДИ` до завершения серверной обработки.
10. Диагностика: `Local ACK`, `Фото ms / KB`, `Polls`.

## HOTFIX1 — по видео пользователя от 2026-09-17
На видео обнаружен реальный UI race/launcher loop:
- top-level терминал открывался с `?handoff=IN`;
- после автозапуска `handoff` удалялся через 600 ms;
- старый `top-level-fix.js` динамически пересчитывал `launcherMode()`;
- после удаления `handoff` top-level страница ошибочно снова становилась launcher;
- 500-ms `forceLauncher()` скрывал `cameraView/resultView` и возвращал `idleView`;
- пользователь видел цикл: меню → камера/чёрный экран → меню → камера.

Исправление:
1. Launcher теперь определяется один раз при загрузке и только для реального iframe.
2. Top-level GitHub page больше никогда не превращается обратно в launcher после удаления `handoff`.
3. `forceLauncher()` работает только в статическом embedded launcher mode.
4. Top-level `КЕЛДИ/КЕТДИ` остаётся живой страницей и не подвергается 500-ms принудительному возврату в idle.
5. Добавлена защита от повторного запуска `autoStartTopLevel()`.
6. Для гарантированного получения нового JS изменён asset URL на `top-level-fix.js?v=1.4.0-hotfix1`.
7. Service Worker shell cache обновлён до `davomat-shell-v1.4.0-hotfix1`.

## Коммиты HOTFIX1
- `78b5d12e63370ceef7b35f21b978420ba9529015` — исправлен top-level launcher loop.
- `3b40205faf93459ccefe8e218955544c3c912896` — cache-bust нового launcher JS.
- `71a3cb182077ad7c7654b9c2c3efa9c8defd8631` — новый shell cache.

## Проверки
- GitHub Pages workflow run `35187813196` — `completed / success`.
- HOTFIX1 опубликован в `main` и задеплоен GitHub Pages.

## Что ещё не считается внедрённым
Backend Apps Script performance patch из глубокого исследования пока не подтверждён как опубликованный в production Apps Script. Текущий доступ позволяет изменять GitHub, но не container-bound Apps Script source/deployment.

## Следующий контрольный тест
1. Полностью закрыть вкладку DAVOMAT и открыть терминал заново.
2. Нажать `КЕЛДИ` один раз.
3. Экран камеры должен остаться открытым стабильно — без возврата в меню каждые 0.5–1 секунду.
4. После распознавания должен появиться `ҚАБУЛ ҚИЛИНДИ`, затем `МУВАФФАҚИЯТЛИ`.
5. Повторить для `КЕТДИ`.
6. Если камера открывается стабильно, следующий этап — замер именно server save time через ⚙.

## Rollback
При регрессии откатывать `top-level-fix.js`, `index.html` и `sw.js` одним комплектом. Нельзя оставлять старый launcher JS с новым cache key или наоборот.
