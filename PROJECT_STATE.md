# DAVOMAT — PROJECT STATE

Версия: v1.4.0 + hotfix2
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

## HOTFIX1 — launcher loop по видео пользователя
Исправлен цикл top-level терминала: после удаления `handoff` страница больше не превращается обратно в launcher и не скрывает cameraView/resultView каждые 500 ms.

Коммиты HOTFIX1:
- `78b5d12e63370ceef7b35f21b978420ba9529015`
- `3b40205faf93459ccefe8e218955544c3c912896`
- `71a3cb182077ad7c7654b9c2c3efa9c8defd8631`

Workflow `35187813196` — success.

## HOTFIX2 — Face DB = 0 и бесконечный no-match scan
По второму видео и сервисной диагностике обнаружено:
- `Юзли ходимлар = 0`;
- камера и Human работают, лицо детектируется, но распознавать не с чем;
- активный сотрудник `EMP-20260916132254-213` имеет `FACE_STATUS=NOT_ENROLLED`;
- старые 6 Face-профилей принадлежат другому, уже неактивному тестовому сотруднику и имеют `ACTIVE=FALSE`;
- bootstrap поэтому корректно возвращает 0 активных employees/profiles.

Дополнительный frontend defect:
- после успешного enrollment `6/6` старый app.js показывал `ЮЗ ТАЙЁР`, но не очищал локальный `bootstrap-v3` и не загружал свежую Face DB;
- открытый терминал мог продолжать работать с `S.profiles=[]` даже после успешной регистрации до ручной перезагрузки.

Исправление HOTFIX2:
1. Добавлен `face-db-fix.js`.
2. Перед `КЕЛДИ/КЕТДИ` top-level терминал отдельно проверяет live bootstrap.
3. Если активных face profiles = 0, attendance-камера не запускается бессмысленно; пользователь получает сообщение сначала зарегистрировать лицо.
4. Если bootstrap ещё загружается, нажатие удерживается и автоматически продолжается после подтверждения непустой Face DB.
5. После `ЮЗ ТАЙЁР` очищается IndexedDB `bootstrap-v3`, ставится marker обновления Face DB и терминал автоматически перезапускается с чистым attendance bootstrap.
6. Service Worker cache обновлён до `davomat-shell-v1.4.0-hotfix2` и precache включает `face-db-fix.js?v=1.4.0-hotfix2`.
7. Старые биометрические профили не переassign'ятся другому сотруднику.

Коммиты HOTFIX2:
- `5564f94dfab1bc4b7747c736f3d5e321b9f61418` — Face DB guard + post-enrollment refresh.
- `3e615ba8dbfdbb0a136eb89a54d9125a5cb5ca51` — загрузка guard в index.html.
- `cf58350faa1587677d557f0c67608d9312ac2c79` — shell cache hotfix2.

GitHub Pages workflow `35188898154` — completed / success.

## Восстановление регистрации активного сотрудника
Создана свежая OPEN enrollment-сессия для `EMP-20260916132254-213`, device `terminal-01`, code `353300`, срок до `2026-09-17T11:39:56+05:00`. Терминал должен получить её через `pendingEnrollment` и показать баннер регистрации.

## Что ещё не считается внедрённым
Backend Apps Script performance patch из глубокого исследования пока не подтверждён как опубликованный в production Apps Script. Текущий доступ позволяет изменять GitHub и Sheets, но не container-bound Apps Script source/deployment.

## Следующий контрольный тест
1. Полностью закрыть старые вкладки DAVOMAT и открыть терминал заново.
2. На главном экране должна появиться задача регистрации активного сотрудника.
3. Нажать `РЎЙХАТГА ОЛИШ` и довести до `6/6` → `ЮЗ ТАЙЁР`.
4. Терминал должен автоматически обновить Face DB и вернуться к attendance.
5. В ⚙ должно стать `Юзли ходимлар: 1` (или больше при дальнейших регистрациях).
6. После этого проверить `КЕЛДИ`: только теперь Face ID должен сопоставлять лицо с профилем.
7. После успешного события проверить `Local ACK`, `Фото`, `Сақлаш`, `Polls`.

## Rollback
При регрессии HOTFIX2 откатывать `face-db-fix.js`, `index.html` и `sw.js` одним комплектом. HOTFIX1 launcher fix не откатывать без отдельной причины.
