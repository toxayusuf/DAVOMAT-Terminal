# DAVOMAT — PROJECT STATE

Версия: v1.1.0
Дата: 2026-09-16

## Зафиксированная архитектура
- Google Apps Script: backend + admin UI + device/enrollment launch links.
- Google Sheets: сотрудники, графики, посещаемость, зарплата, audit.
- Google Drive: контрольные фото.
- GitHub Pages: Face Terminal/PWA.

## Почему v1.0.x не подходит
На desktop opener-RPC частично работал, но на iPhone/Safari новая вкладка GitHub могла потерять `window.opener`. Тогда терминал показывал `DAVOMAT терминали админка ёки планшет саҳифаси орқали очилиши керак`. Поэтому зависимость от opener полностью удалена.

## Архитектура v1.1.0
- Терминал работает напрямую с опубликованным Apps Script Web App.
- Конфигурация устройства передаётся один раз в URL fragment `#cfg=...` и сохраняется в localStorage браузера. Fragment не отправляется на GitHub сервер.
- GET/reads: JSONP к Apps Script (`bootstrap`, `enrollment`, `pendingEnrollment`, `requestStatus`).
- Writes: `fetch(..., mode=no-cors, Content-Type=text/plain)` → Apps Script `doPost` → polling `requestStatus` через JSONP.
- Ни iframe bridge, ни `window.opener`, ни ручной ввод URL/device/token не используются.
- На телефоне/планшете после первого правильного запуска GitHub Terminal может открываться как обычный PWA с сохранённой конфигурацией.

## Регистрация
Админ нажимает `Юзни рўйхатга олиш` → Apps Script создаёт enrollment session → редиректит на GitHub Terminal с `purpose=enroll&enroll=CODE#cfg=...` → Terminal сразу запускает камеру → 6 образцов → `ЮЗ ТАЙЁР`. Экран КЕЛДИ/КЕТДИ в этом режиме не показывается.

## Посещение
Планшет получает один device link из `Созламалар → Телефон/планшетни улаш`. После первого открытия терминал сохраняет конфигурацию. Сотрудник использует только `КЕЛДИ` / `КЕТДИ` → камера → лицо/liveness → запись → камера выключается.

## Backend fixes v1.1.0
- Исправлен парсинг времени Google Sheets: schedule time cells могут приходить как Date, а не строка. Раньше это приводило к `Cannot read properties of null (reading 'getTime')` после уже записанного события.
- В `processAttendanceEvent_` добавлен ScriptLock, чтобы два параллельных распознавания не могли одновременно создать два ACCEPTED IN.
- Для онлайн-событий серверное время является authoritative; clientTime используется только для offline queue.
- Schema version поднята, чтобы миграция снова прошла и исправила legacy duplicate same-type events.

## Реальные данные, выявленные 16.09
Видео показало `Нотўғри тугма танланди`. Проверка базы показала, что ранее два IN одновременно были записаны ACCEPTED, а оба запроса затем упали при расчёте дня с `Cannot read properties of null (reading 'getTime')`. Следующие попытки закономерно получали ALREADY_MARKED / EVENT_TYPE_MISMATCH. Это backend race + schedule-time parsing, а не ошибка распознавания лица.

## UX правила
- Никакого ручного ввода Apps Script URL, device ID, token или 6-значного кода сотрудником.
- Камера не работает постоянно.
- Регистрация: нажал в админке → камера → 0/6 → 6/6 → готово.
- Сотрудник: `КЕЛДИ` / `КЕТДИ` → лицо → результат.

## Следующий тест
1. Синхронно заменить Apps Script `Code.gs` и `Admin.html` v1.1.0.
2. Обновить существующий Web App deployment новой версией. `setupDavomat()` не запускать.
3. Админка должна показывать `v1.1.0 UI`.
4. `Созламалар → Телефон/планшетни улаш` → открыть device link на iPhone/планшете.
5. Должен открыться GitHub Terminal v1.1.0 без opener error и без технических полей.
6. После миграции проверить чистую цепочку КЕЛДИ → КЕТДИ → ATTENDANCE_EVENTS / ATTENDANCE / WORKED_MIN.
