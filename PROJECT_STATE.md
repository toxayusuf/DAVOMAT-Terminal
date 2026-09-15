# DAVOMAT — PROJECT STATE

Версия: v0.6.1
Дата: 2026-09-15

## Готово
- Google Apps Script backend + Google Sheets + Google Drive.
- Face enrollment и распознавание лица.
- Кнопки КЕЛДИ / КЕТДИ до включения камеры.
- Камера включается только на время проверки и затем выключается.
- Passive liveness / anti-spoof.
- Регистрация 7 образцов с кольцевым прогрессом вокруг лица.
- Инструкции регистрации находятся над лицом.
- Offline queue и последующая синхронизация.
- Web Terminal загружен в toxayusuf/DAVOMAT-Terminal.
- GitHub Pages workflow добавлен.

## Подтверждено реальным тестом
- Лицо TEST2 зарегистрировано.
- КЕЛДИ записан с контрольным фото.
- Исправлена миграционная проблема ATTENDANCE_EVENTS.
- Исправлена проблема повторных IN из-за Date/string.

## Следующий шаг
1. Развернуть Apps Script v0.6.1 (Code.gs + Admin.html).
2. Переключить DAVOMAT-Terminal из Private в Public для бесплатного GitHub Pages.
3. Дождаться публикации Pages.
4. Один раз привязать телефон/планшет через provisioning QR или экран первичной настройки.
5. Проверить HTTPS сценарий КЕЛДИ -> лицо -> отметка -> камера выключена -> КЕТДИ.
