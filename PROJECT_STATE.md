# DAVOMAT — PROJECT STATE

Версия: v1.0.0
Дата: 2026-09-16

## Архитектура
- Google Apps Script: backend + admin UI + Terminal Host.
- Google Sheets: сотрудники, графики, посещаемость, зарплата.
- Google Drive: контрольные фото.
- GitHub Pages: Face Terminal/PWA.

## Ошибка, подтверждённая реальными видео v0.9.x
Регистрация открывалась, но зависала на `Рўйхатга олиш тайёрланмоқда…`, после чего появлялось `DAVOMAT сервер мости жавоб бермади`. Причиной был скрытый Apps Script iframe bridge: реальная цепочка Google wrapper / googleusercontent iframe в Chrome не давала стабильного round-trip между GitHub Terminal и `google.script.run`.

## Решение v1.0.0
Скрытый iframe Bridge удалён из рабочего пути целиком.

### Регистрация
Admin.html (Apps Script) остаётся открытым как `window.opener` → пользователь нажимает `Юзни рўйхатга олиш` → GitHub Terminal открывается обычной ссылкой `target=_blank rel=opener` → Terminal отправляет RPC через `window.opener.postMessage` → Admin выполняет серверный метод через штатный `google.script.run` → ответ возвращается Terminal через `postMessage`.

Регистрационная сессия создаётся только после открытия Terminal. Поэтому Terminal не показывает `КЕЛДИ/КЕТДИ`: он сразу получает сотрудника → открывает камеру → 6 образцов → `ЮЗ ТАЙЁР`.

### Рабочий планшет
Apps Script предоставляет простую Terminal Host страницу (`?terminal=1&k=...`). На ней нет технических полей. Она открывает GitHub Terminal и остаётся его opener. Далее `КЕЛДИ/КЕТДИ` идут тем же RPC-механизмом через `google.script.run`.

## UX-правила
- Никакого ручного ввода URL, device ID, токена или 6-значного кода сотрудником.
- Камера включается только после регистрации / КЕЛДИ / КЕТДИ и затем выключается.
- Регистрация: `Юзни рўйхатга олиш` → камера → кольцо 0–100% → 6 образцов → `ЮЗ ТАЙЁР`.
- Посещение: `КЕЛДИ` или `КЕТДИ` → камера → распознавание → запись → камера выключается.

## Проверки перед выдачей
- `Code.gs` syntax — OK.
- `Admin.html` extracted JavaScript syntax — OK.
- Terminal `app.js` syntax — OK.
- GitHub Terminal `index.html`, `app.js`, `sw.js` синхронизированы на v1.0.0.
- Локальный браузерный E2E в текущей среде не был доступен из-за managed Chromium policy, поэтому не заявлять, что реальный webcam/browser test пройден до проверки на пользовательском Chrome.

## Обязательное обновление Apps Script
Нужно синхронно заменить `Code.gs` и `Admin.html` из пакета v1.0.0 и обновить существующий Web App deployment. `setupDavomat()` не запускать. GitHub вручную не менять.

## Следующий контрольный тест
1. В админке должно быть `v1.0.0 UI`.
2. Ходимлар → `Юзни рўйхатга олиш`.
3. Терминал должен показать `v1.0.0` и сразу перейти к камере, без экрана КЕЛДИ/КЕТДИ и без bridge timeout.
4. После `ЮЗ ТАЙЁР`: проверить КЕЛДИ → КЕТДИ → ATTENDANCE_EVENTS / ATTENDANCE / WORKED_MIN.
