# DAVOMAT — PROJECT STATE

Версия: v0.9.1
Дата: 2026-09-16

## Архитектура
- Google Apps Script: backend + admin UI + Bridge.
- Google Sheets: сотрудники, графики, посещаемость, зарплата.
- Google Drive: контрольные фото.
- GitHub Pages: Face Terminal/PWA.

## Ошибка, подтверждённая видео 16.09
Админка создавала OPEN enrollment-сессию, но терминал открывал обычный экран КЕЛДИ/КЕТДИ. Затем появлялось `DAVOMAT сервер мости жавоб бермади`.

Корневая причина: Apps Script HtmlService реально вложен как Google wrapper → googleusercontent iframe. Старый bridge отправлял READY непосредственному `parent`, а терминал ожидал сообщение от внешнего iframe. Handshake поэтому завершался timeout.

## Исправление v0.9.1
- Bridge page отправляет READY в `top`.
- GitHub Terminal сохраняет `event.source` реального inner frame как `bridgeTarget` и шлёт запросы напрямую ему.
- Enrollment launch получает `purpose=enroll`.
- В enrollment mode терминал не показывает КЕЛДИ/КЕТДИ: ждёт задачу регистрации до 15 секунд и затем сам запускает ENROLL.
- До готовности backend показывается отдельный loading screen.
- Admin загружает bootstrap + employees + schedules + settings одним `getAdminAppData()` вместо четырёх последовательных `google.script.run` вызовов.
- PWA cache поднят до v0.9.1.

## Проверки перед выдачей
- Syntax: Code.gs / Admin JS / Terminal app.js — OK.
- Playwright admin-flow: enrollment href содержит `purpose=enroll`; click запускает `createEnrollmentSession` — OK.
- Playwright enrollment-route: attendance UI не показывается, mode становится ENROLL — OK.
- Playwright nested bridge: top → wrapper → inner handshake и round-trip через сохранённый `event.source` — OK (`OK:pong`).
- GitHub Pages deployment v0.9.1 — SUCCESS.

## Обязательное обновление Apps Script
Нужно синхронно заменить `Code.gs` и `Admin.html` на v0.9.1 и обновить существующий Web App deployment. `setupDavomat()` не запускать.

## Следующий контрольный тест
Регистрация лица → `ЮЗ ТАЙЁР` → КЕЛДИ → КЕТДИ → проверка ATTENDANCE_EVENTS / ATTENDANCE / WORKED_MIN.
