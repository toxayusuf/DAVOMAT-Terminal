/** DAVOMAT v1.0.0 — consolidated Google Apps Script backend. */

/* ==================== Config.gs ==================== */
/** DAVOMAT v0.3 — shared constants. Google Apps Script V8. */
var DAVOMAT = Object.freeze({
  VERSION: '1.5.0',
  SPREADSHEET_ID: '10cfEysZsk1SktidqPYpFylIJwfGynaVwj-hQ5pEDWh4',
  PUBLIC_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwSHS3Vk1DPHj_3NIWr5xuBN81mM2VGl5aodzaOFjK1tjeTc-9i7PyeUoB8-gClQUjxAw/exec',
  TZ: 'Asia/Tashkent',
  PHOTO_FOLDER_NAME: 'DAVOMAT_CONTROL_PHOTOS',
  SESSION_TTL_SECONDS: 21600,
  ENROLLMENT_TTL_SECONDS: 900,
  REQUEST_TTL_DAYS: 7,
  SHEETS: Object.freeze({
    SETTINGS: 'SETTINGS',
    EMPLOYEES: 'EMPLOYEES',
    FACE_PROFILES: 'FACE_PROFILES',
    SCHEDULES: 'SCHEDULES',
    ATTENDANCE: 'ATTENDANCE',
    ATTENDANCE_EVENTS: 'ATTENDANCE_EVENTS',
    CORRECTIONS: 'CORRECTIONS',
    SALARY: 'SALARY',
    ADMIN_AUDIT: 'ADMIN_AUDIT',
    DEVICES: 'DEVICES',
    SYNC_LOG: 'SYNC_LOG',
    TELEGRAM_LOG: 'TELEGRAM_LOG',
    ENROLLMENT_SESSIONS: 'ENROLLMENT_SESSIONS'
  }),
  HEADERS: Object.freeze({
    SETTINGS: ['KEY','VALUE','NOTE','UPDATED_AT'],
    EMPLOYEES: ['EMPLOYEE_ID','FULL_NAME','POSITION','MONTHLY_SALARY','SCHEDULE_ID','START_DATE','ACTIVE','FACE_STATUS','CREATED_AT','UPDATED_AT'],
    FACE_PROFILES: ['PROFILE_ID','EMPLOYEE_ID','EMBEDDING_JSON','QUALITY_SCORE','POSE_LABEL','CREATED_AT','ACTIVE'],
    SCHEDULES: ['SCHEDULE_ID','NAME','MON_START','MON_END','TUE_START','TUE_END','WED_START','WED_END','THU_START','THU_END','FRI_START','FRI_END','SAT_START','SAT_END','SUN_START','SUN_END','LUNCH_START','LUNCH_END','GRACE_MINUTES','ACTIVE','UPDATED_AT'],
    ATTENDANCE: ['DAILY_ID','DATE','EMPLOYEE_ID','SCHEDULE_ID','FIRST_IN','LAST_OUT','WORKED_MIN','LATE_MIN','EARLY_MIN','OVERTIME_MIN','ABSENT','REQUIRES_REVIEW','STATUS','UPDATED_AT'],
    ATTENDANCE_EVENTS: ['EVENT_ID','EMPLOYEE_ID','DEVICE_ID','EVENT_TYPE','EVENT_DATE','EVENT_AT','CLIENT_TIME','SERVER_TIME','MATCH_SCORE','LIVENESS_SCORE','REAL_SCORE','BLINK_OK','PHOTO_FILE_ID','PHOTO_URL','SOURCE','STATUS','REVIEW_REASON','PHOTO_DELETED_AT'],
    CORRECTIONS: ['CORRECTION_ID','DATE','EMPLOYEE_ID','FIELD','OLD_VALUE','NEW_VALUE','REASON','ADMIN_ID','CREATED_AT'],
    SALARY: ['MONTH','EMPLOYEE_ID','MONTHLY_SALARY','PLANNED_DAYS','PRESENT_DAYS','ABSENT_DAYS','WORKED_MIN','LATE_MIN','EARLY_MIN','OVERTIME_MIN','ABSENCE_DEDUCTION','PAYABLE','STATUS','UPDATED_AT'],
    ADMIN_AUDIT: ['AUDIT_ID','ADMIN_ID','ACTION','ENTITY','ENTITY_ID','BEFORE_JSON','AFTER_JSON','REASON','CREATED_AT'],
    DEVICES: ['DEVICE_ID','NAME','TOKEN_HASH','ACTIVE','LAST_SEEN_AT','CREATED_AT'],
    SYNC_LOG: ['REQUEST_ID','DEVICE_ID','ACTION','STATUS','RESULT_JSON','MESSAGE','CREATED_AT','UPDATED_AT'],
    TELEGRAM_LOG: ['LOG_ID','TYPE','STATUS','MESSAGE','CREATED_AT'],
    ENROLLMENT_SESSIONS: ['CODE','EMPLOYEE_ID','DEVICE_ID','STATUS','EXPIRES_AT','CREATED_AT','USED_AT']
  })
});

function nowIso_() {
  return Utilities.formatDate(new Date(), DAVOMAT.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function today_() {
  return Utilities.formatDate(new Date(), DAVOMAT.TZ, 'yyyy-MM-dd');
}

function monthNow_() {
  return Utilities.formatDate(new Date(), DAVOMAT.TZ, 'yyyy-MM');
}

function uuid_() {
  return Utilities.getUuid();
}

function safeJson_(value) {
  try { return JSON.stringify(value == null ? null : value); } catch (err) { return JSON.stringify({error: String(err)}); }
}

/* ==================== Data.gs ==================== */
/** Spreadsheet helpers. */
function getSpreadsheet_() {
  // v0.6.4: bind the web app to the known DAVOMAT database explicitly.
  // This avoids stale Script Properties pointing the deployment to another sheet.
  var id = DAVOMAT.SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_NOT_CONFIGURED');
  var ss = SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('SHEET_NOT_FOUND_' + name);
  return sh;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  var current = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var same = headers.every(function(h, i){ return String(current[i] || '') === h; });
  if (!same) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eef8');
    sh.setFrozenRows(1);
  }
  return sh;
}



/**
 * Lightweight schema migration. This runs automatically once per schema version.
 * It upgrades old sheets in place and repairs accepted legacy attendance events
 * that were created before STATUS/REVIEW_REASON/PHOTO_DELETED_AT existed.
 */
function ensureSchemaCurrent_(force) {
  var schemaVersion = '2026-09-18.1';
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('DAVOMAT_SCHEMA_VERSION') === schemaVersion) return {ok:true, migrated:false, schemaVersion:schemaVersion};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!force && props.getProperty('DAVOMAT_SCHEMA_VERSION') === schemaVersion) return {ok:true, migrated:false, schemaVersion:schemaVersion};
    var ss = getSpreadsheet_();
    Object.keys(DAVOMAT.HEADERS).forEach(function(key){
      ensureSheet_(ss, DAVOMAT.SHEETS[key], DAVOMAT.HEADERS[key]);
    });
    migrateSecrets_();
    var touched = {};
    rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS).forEach(function(r){
      var type = String(r.EVENT_TYPE || '');
      var status = String(r.STATUS || '');
      if (!status && (type === 'IN' || type === 'OUT')) {
        updateRowObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, r._row, {STATUS:'ACCEPTED', REVIEW_REASON:'', PHOTO_DELETED_AT:''});
        if (r.EMPLOYEE_ID && r.EVENT_DATE) touched[String(r.EMPLOYEE_ID) + '|' + dateKeyValue_(r.EVENT_DATE)] = true;
      }
    });

    // Repair malformed legacy runs such as IN, IN, IN caused by pre-v0.6.0 date coercion.
    // Events must alternate. Later events in a same-type run stay in the audit log but are rejected.
    var grouped = {};
    rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS).forEach(function(r){
      if (String(r.STATUS || '') !== 'ACCEPTED') return;
      var dk = dateKeyValue_(r.EVENT_DATE);
      if (!r.EMPLOYEE_ID || !dk) return;
      var key = String(r.EMPLOYEE_ID) + '|' + dk;
      (grouped[key] || (grouped[key] = [])).push(r);
    });
    Object.keys(grouped).forEach(function(key){
      var list = grouped[key].sort(function(a,b){
        var ta = new Date(a.EVENT_AT).getTime(), tb = new Date(b.EVENT_AT).getTime();
        if (isNaN(ta)) ta = a._row; if (isNaN(tb)) tb = b._row;
        return ta - tb || a._row - b._row;
      });
      var lastType = '';
      list.forEach(function(r){
        var type = String(r.EVENT_TYPE || '');
        if ((type === 'IN' || type === 'OUT') && type === lastType) {
          updateRowObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, r._row, {STATUS:'REJECTED', REVIEW_REASON:'LEGACY_DUPLICATE_SAME_TYPE'});
          touched[key] = true;
          return;
        }
        if (type === 'IN' || type === 'OUT') lastType = type;
      });
    });

    Object.keys(touched).forEach(function(k){
      var parts = k.split('|');
      if (!parts[1]) return;
      try { rebuildEmployeeDay_(parts[0], parts[1], parts[1] < today_()); } catch (err) { Logger.log('Schema rebuild '+k+': '+err); }
    });

    props.setProperty('DAVOMAT_SCHEMA_VERSION', schemaVersion);
    return {ok:true, migrated:true, schemaVersion:schemaVersion, rebuiltDays:Object.keys(touched).length};
  } finally {
    lock.releaseLock();
  }
}

function migrateDavomatSchema() {
  var result = ensureSchemaCurrent_(true);
  photoFolderId_();
  return result;
}

function rowsAsObjects_(sheetName) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(String);
  return values.slice(1).filter(function(r){ return r.some(function(v){ return v !== '' && v != null; }); }).map(function(row, idx){
    var obj = {_row: idx + 2};
    headers.forEach(function(h, i){ obj[h] = row[i]; });
    return obj;
  });
}

function appendObject_(sheetName, obj) {
  var sh = getSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(function(h){ return obj[h] == null ? '' : obj[h]; }));
  return sh.getLastRow();
}

function updateRowObject_(sheetName, rowNumber, patch) {
  var sh = getSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var row = sh.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(h, i){ if (Object.prototype.hasOwnProperty.call(patch, h)) row[i] = patch[h]; });
  sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function deleteRowsWhere_(sheetName, predicate) {
  var sh = getSheet_(sheetName);
  var rows = rowsAsObjects_(sheetName).filter(predicate).map(function(r){ return r._row; }).sort(function(a,b){ return b-a; });
  rows.forEach(function(rowNumber){ sh.deleteRow(rowNumber); });
  return rows.length;
}

function findOne_(sheetName, predicate) {
  var rows = rowsAsObjects_(sheetName);
  for (var i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
  return null;
}

function findAll_(sheetName, predicate) {
  return rowsAsObjects_(sheetName).filter(predicate);
}

function getSetting_(key, fallback) {
  var row = findOne_(DAVOMAT.SHEETS.SETTINGS, function(r){ return String(r.KEY) === String(key); });
  return row && row.VALUE !== '' ? row.VALUE : fallback;
}

function setSetting_(key, value, note) {
  var found = findOne_(DAVOMAT.SHEETS.SETTINGS, function(r){ return String(r.KEY) === String(key); });
  var now = nowIso_();
  if (found) updateRowObject_(DAVOMAT.SHEETS.SETTINGS, found._row, {VALUE: value, NOTE: note || found.NOTE, UPDATED_AT: now});
  else appendObject_(DAVOMAT.SHEETS.SETTINGS, {KEY: key, VALUE: value, NOTE: note || '', UPDATED_AT: now});
}

/**
 * SETTINGS is the production source of truth for the photo folder.
 * Keep Script Properties synchronized so legacy code paths cannot write photos
 * back into an obsolete folder after a migration.
 */
function photoFolderId_() {
  var configured = String(getSetting_('PHOTO_FOLDER_ID','') || '').trim();
  var props = PropertiesService.getScriptProperties();
  if (configured) {
    if (String(props.getProperty('PHOTO_FOLDER_ID') || '') !== configured) props.setProperty('PHOTO_FOLDER_ID', configured);
    return configured;
  }
  return String(props.getProperty('PHOTO_FOLDER_ID') || '').trim();
}

function toNumber_(v, fallback) {
  var n = Number(v);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

function normalizeBool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
}

function formatDateTime_(dateLike) {
  var d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, DAVOMAT.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function dateKeyFromDate_(dateLike) {
  var d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d.getTime())) throw new Error('DATE_INVALID');
  return Utilities.formatDate(d, DAVOMAT.TZ, 'yyyy-MM-dd');
}

/**
 * Google Sheets may auto-coerce yyyy-MM-dd strings into Date cells.
 * Always normalize date-like values before business comparisons.
 */
function dateKeyValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, DAVOMAT.TZ, 'yyyy-MM-dd');
  var s = String(value == null ? '' : value).trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  var d = new Date(value);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, DAVOMAT.TZ, 'yyyy-MM-dd');
  return '';
}

function monthKeyValue_(value) {
  var s = String(value == null ? '' : value).trim();
  var m = s.match(/^(\d{4}-\d{2})/);
  if (m) return m[1];
  var dk = dateKeyValue_(value);
  return dk ? dk.slice(0,7) : '';
}

function parseTimeOnDate_(dateKey, hhmm) {
  if (hhmm === '' || hhmm == null) return null;
  var text = '';
  // Google Sheets returns time-formatted cells as Date objects via getValues().
  if (hhmm instanceof Date && !isNaN(hhmm.getTime())) {
    text = Utilities.formatDate(hhmm, DAVOMAT.TZ, 'HH:mm');
  } else {
    text = String(hhmm).trim();
    // Accept H:mm, HH:mm and values that include seconds.
    var full = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (full) text = full[1] + ':' + full[2];
  }
  var m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var hour = Number(m[1]), minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  var h = String(hour).padStart(2, '0');
  var min = String(minute).padStart(2, '0');
  return new Date(String(dateKey) + 'T' + h + ':' + min + ':00+05:00');
}

function dateToIso_(dateLike) {
  var d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, DAVOMAT.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function sanitizeForClient_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ==================== Security.gs ==================== */
/** Admin sessions and device authentication. */
function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function(b){ var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function randomToken_(bytes) {
  bytes = bytes || 32;
  var seed = Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + new Date().getTime() + '|' + Math.random();
  var hex = sha256Hex_(seed);
  while (hex.length < bytes * 2) hex += sha256Hex_(hex + Utilities.getUuid());
  return hex.slice(0, bytes * 2);
}

function randomPin_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function secretKey_(key) { return 'DAVOMAT_SECRET_' + String(key); }
function getSecret_(key) { return String(PropertiesService.getScriptProperties().getProperty(secretKey_(key)) || ''); }
function setSecret_(key, value) {
  var props = PropertiesService.getScriptProperties();
  if (value == null || String(value) === '') props.deleteProperty(secretKey_(key));
  else props.setProperty(secretKey_(key), String(value));
}
function deviceSecretKey_(deviceId) { return 'DEVICE_TOKEN_' + String(deviceId || 'terminal-01'); }

function migrateSecrets_() {
  var props = PropertiesService.getScriptProperties();
  var pin = String(getSetting_('INITIAL_ADMIN_PIN','')).trim();
  if (/^\d{4,10}$/.test(pin)) {
    if (!props.getProperty('ADMIN_PIN_HASH')) props.setProperty('ADMIN_PIN_HASH', sha256Hex_(pin));
    setSetting_('INITIAL_ADMIN_PIN','MOVED_TO_SCRIPT_PROPERTIES','Admin PIN hash Script Properties да.');
  }
  var tg = String(getSetting_('TELEGRAM_BOT_TOKEN','')).trim();
  if (tg && tg !== 'MOVED_TO_SCRIPT_PROPERTIES') {
    if (!getSecret_('TELEGRAM_BOT_TOKEN')) setSecret_('TELEGRAM_BOT_TOKEN',tg);
    setSetting_('TELEGRAM_BOT_TOKEN','MOVED_TO_SCRIPT_PROPERTIES','Telegram token Script Properties да.');
  }
  var deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  var deviceToken = String(getSetting_('DEVICE_TOKEN','')).trim();
  if (deviceToken && deviceToken !== 'MOVED_TO_SCRIPT_PROPERTIES') {
    var device = findOne_(DAVOMAT.SHEETS.DEVICES,function(r){return String(r.DEVICE_ID)===deviceId;});
    if (device && sha256Hex_(deviceToken) === String(device.TOKEN_HASH || '')) {
      if (!getSecret_(deviceSecretKey_(deviceId))) setSecret_(deviceSecretKey_(deviceId),deviceToken);
      setSetting_('DEVICE_TOKEN','MOVED_TO_SCRIPT_PROPERTIES','Device token Script Properties да.');
    }
  }
  if (String(getSetting_('REQUIRE_ACTIVE_LIVENESS','false')).toLowerCase() !== 'true') {
    setSetting_('REQUIRE_ACTIVE_LIVENESS','true','Active blink + passive liveness/antispoof required');
  }
}

function createAdminSession_() {
  var props = PropertiesService.getScriptProperties();
  var token = randomToken_(24);
  var exp = Date.now() + DAVOMAT.SESSION_TTL_SECONDS * 1000;
  props.setProperty('ADMIN_SESSION_' + token, JSON.stringify({id:'admin', expiresAt:exp, createdAt:nowIso_()}));
  return token;
}

function adminLogin(pin) {
  migrateSecrets_();
  var pinText = String(pin || '').trim();
  if (!/^\d{4,10}$/.test(pinText)) return {ok:false, error:'PIN_FORMAT'};
  var expectedHash = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN_HASH') || '';
  if (!expectedHash) return {ok:false, error:'ADMIN_PIN_NOT_CONFIGURED', version:DAVOMAT.VERSION};
  if (sha256Hex_(pinText) !== expectedHash) return {ok:false, error:'PIN_NOT_VALID', version:DAVOMAT.VERSION};
  var token = createAdminSession_();
  return {ok:true, token:token, expiresIn:DAVOMAT.SESSION_TTL_SECONDS, version:DAVOMAT.VERSION};
}

function publicAdminPing() { return {ok:true, version:DAVOMAT.VERSION, time:nowIso_()}; }

function publicAdminHealth() {
  var sheetId = '';
  try { sheetId = getSpreadsheet_().getId(); } catch (e) { return {ok:false, version:DAVOMAT.VERSION, error:String(e && e.message ? e.message : e)}; }
  migrateSecrets_();
  return {ok:true,version:DAVOMAT.VERSION,spreadsheetId:sheetId,pinConfigured:!!PropertiesService.getScriptProperties().getProperty('ADMIN_PIN_HASH'),pinSource:'SCRIPT_PROPERTIES_HASH',serviceUrl:ScriptApp.getService().getUrl() || ''};
}

function diagnoseAdminAccess() {
  var h = publicAdminHealth();
  h.hashConfigured = !!PropertiesService.getScriptProperties().getProperty('ADMIN_PIN_HASH');
  return h;
}

function resetAdminAccessForFreshTest() {
  var pin = randomPin_();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_PIN_HASH', sha256Hex_(pin));
  props.getKeys().filter(function(k){ return k.indexOf('ADMIN_SESSION_') === 0; }).forEach(function(k){ props.deleteProperty(k); });
  setSetting_('INITIAL_ADMIN_PIN','MOVED_TO_SCRIPT_PROPERTIES','Recovery PIN hash Script Properties да.');
  audit_('system','ROTATE_ADMIN_PIN','SETTINGS','ADMIN_PIN','','','Recovery rotation');
  return {ok:true, pin:pin, spreadsheetId:getSpreadsheet_().getId(), version:DAVOMAT.VERSION};
}

function requireAdmin_(token) {
  if (!token) throw new Error('ADMIN_AUTH_REQUIRED');
  var props = PropertiesService.getScriptProperties();
  var key = 'ADMIN_SESSION_' + String(token);
  var raw = props.getProperty(key);
  if (!raw) throw new Error('ADMIN_SESSION_EXPIRED');
  var data;
  try { data = JSON.parse(raw); } catch (e) { props.deleteProperty(key); throw new Error('ADMIN_SESSION_EXPIRED'); }
  if (!data.expiresAt || Number(data.expiresAt) < Date.now()) { props.deleteProperty(key); throw new Error('ADMIN_SESSION_EXPIRED'); }
  return data;
}

function changeAdminPin(sessionToken, oldPin, newPin) {
  requireAdmin_(sessionToken);
  if (!/^\d{4,10}$/.test(String(newPin || ''))) throw new Error('NEW_PIN_INVALID');
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN_HASH');
  if (sha256Hex_(String(oldPin || '')) !== expected) throw new Error('OLD_PIN_INVALID');
  PropertiesService.getScriptProperties().setProperty('ADMIN_PIN_HASH', sha256Hex_(newPin));
  setSetting_('INITIAL_ADMIN_PIN', 'CHANGED', 'Админ PIN изменён; значение здесь больше не хранится.');
  audit_('admin', 'CHANGE_PIN', 'SETTINGS', 'ADMIN_PIN', '', '', 'PIN changed');
  return {ok:true};
}

function adminLogout(sessionToken) {
  var props = PropertiesService.getScriptProperties();
  if (sessionToken) props.deleteProperty('ADMIN_SESSION_' + String(sessionToken));
  return {ok:true};
}

function verifyDeviceToken_(deviceId, token) {
  var row = findOne_(DAVOMAT.SHEETS.DEVICES, function(r){ return String(r.DEVICE_ID) === String(deviceId) && normalizeBool_(r.ACTIVE); });
  if (!row) return false;
  var hash = sha256Hex_(String(token || ''));
  if (hash !== String(row.TOKEN_HASH)) return false;
  var seen = row.LAST_SEEN_AT ? new Date(row.LAST_SEEN_AT) : null;
  if (!seen || isNaN(seen.getTime()) || Date.now() - seen.getTime() > 30000) updateRowObject_(DAVOMAT.SHEETS.DEVICES, row._row, {LAST_SEEN_AT: nowIso_()});
  return true;
}

function audit_(adminId, action, entity, entityId, beforeObj, afterObj, reason) {
  appendObject_(DAVOMAT.SHEETS.ADMIN_AUDIT, {
    AUDIT_ID: uuid_(), ADMIN_ID: adminId || 'system', ACTION: action, ENTITY: entity, ENTITY_ID: entityId || '',
    BEFORE_JSON: typeof beforeObj === 'string' ? beforeObj : safeJson_(beforeObj),
    AFTER_JSON: typeof afterObj === 'string' ? afterObj : safeJson_(afterObj),
    REASON: reason || '', CREATED_AT: nowIso_()
  });
}

/* ==================== Setup.gs ==================== */
/** One-time, idempotent project setup. Run setupDavomat() from the Apps Script editor. */
function setupDavomat() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Open Apps Script from the target Google Sheet before running setupDavomat().');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Object.keys(DAVOMAT.HEADERS).forEach(function(key){
      ensureSheet_(ss, DAVOMAT.SHEETS[key], DAVOMAT.HEADERS[key]);
    });
    var defaultSheet = ss.getSheetByName('Лист1');
    if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

    var folderId = props.getProperty('PHOTO_FOLDER_ID');
    if (!folderId) {
      var folder = DriveApp.createFolder(DAVOMAT.PHOTO_FOLDER_NAME);
      folderId = folder.getId();
      props.setProperty('PHOTO_FOLDER_ID', folderId);
    }

    var adminPin = randomPin_();
    if (!props.getProperty('ADMIN_PIN_HASH')) props.setProperty('ADMIN_PIN_HASH', sha256Hex_(adminPin));
    else adminPin = 'ALREADY_CONFIGURED';

    var device = findOne_(DAVOMAT.SHEETS.DEVICES, function(r){ return String(r.DEVICE_ID) === 'terminal-01'; });
    var deviceToken = '';
    if (!device) {
      deviceToken = randomToken_(32);
      appendObject_(DAVOMAT.SHEETS.DEVICES, {
        DEVICE_ID:'terminal-01', NAME:'Омбор терминали 1', TOKEN_HASH:sha256Hex_(deviceToken), ACTIVE:true,
        LAST_SEEN_AT:'', CREATED_AT:nowIso_()
      });
    } else {
      // Never expose an existing terminal secret when setup is run again.
      deviceToken = '';
    }

    if (deviceToken) setSecret_(deviceSecretKey_('terminal-01'), deviceToken);
    var settings = [
      ['APP_NAME','DAVOMAT','Илова номи'],
      ['TIMEZONE',DAVOMAT.TZ,'Ҳисоб-китоб вақти'],
      ['PHOTO_RETENTION_DAYS','60','Назорат фотолари сақланиши'],
      ['FACE_MATCH_THRESHOLD','0.62','Юз ўхшашлиги минимал пороги'],
      ['LIVENESS_THRESHOLD','0.55','Liveness минимал пороги'],
      ['REALNESS_THRESHOLD','0.55','Anti-spoof минимал пороги'],
      ['REQUIRE_ACTIVE_LIVENESS','false','Мажбурий моргаш/ҳаракат талаб қилинмасин; passive liveness ишлайди'],
      ['ENROLL_SAMPLE_COUNT','7','Юзни рўйхатга олиш учун автоматик намуна сони'],
      ['DEVICE_ID','terminal-01','Биринчи терминал'],
      ['DEVICE_TOKEN','MOVED_TO_SCRIPT_PROPERTIES','Device token Script Properties да'],
      ['INITIAL_ADMIN_PIN','MOVED_TO_SCRIPT_PROPERTIES','Admin PIN hash Script Properties да'],
      ['TELEGRAM_BOT_TOKEN','MOVED_TO_SCRIPT_PROPERTIES','Telegram token Script Properties да'],
      ['TELEGRAM_CHAT_ID','','Telegram chat/group ID'],
      ['MORNING_REPORT_HOUR','9','Эрталабки ҳисобот соати'],
      ['MORNING_REPORT_MINUTE','15','Эрталабки ҳисобот дақиқаси'],
      ['EVENING_REPORT_HOUR','19','Кечки ҳисобот соати'],
      ['EVENING_REPORT_MINUTE','0','Кечки ҳисобот дақиқаси'],
      ['LATE_ALERT_MINUTES','30','Критик кечикиш учун Telegram'],
      ['MIN_EVENT_GAP_MINUTES','2','Бир одам камера олдида қолганда такрорий белги тушмаслиги учун оралиқ'],
      ['TERMINAL_PUBLIC_URL','','Телефон/планшет учун HTTPS Face Terminal манзили'],
      ['PHOTO_FOLDER_ID',folderId,'Google Drive папкаси'],
      ['SPREADSHEET_ID',ss.getId(),'Асосий база']
    ];
    settings.forEach(function(s){ if (getSetting_(s[0], '') === '') setSetting_(s[0], s[1], s[2]); });

    if (!findOne_(DAVOMAT.SHEETS.SCHEDULES, function(r){ return String(r.SCHEDULE_ID) === 'SCH-DEFAULT'; })) {
      appendObject_(DAVOMAT.SHEETS.SCHEDULES, {
        SCHEDULE_ID:'SCH-DEFAULT', NAME:'Омбор — асосий',
        MON_START:'09:00', MON_END:'18:00', TUE_START:'09:00', TUE_END:'18:00', WED_START:'09:00', WED_END:'18:00',
        THU_START:'09:00', THU_END:'18:00', FRI_START:'', FRI_END:'', SAT_START:'09:00', SAT_END:'18:00', SUN_START:'09:00', SUN_END:'18:00',
        LUNCH_START:'13:00', LUNCH_END:'14:00', GRACE_MINUTES:10, ACTIVE:true, UPDATED_AT:nowIso_()
      });
    }

    installDavomatTriggers_();
    audit_('system','SETUP','PROJECT',ss.getId(),{}, {folderId:folderId}, 'setupDavomat');

    return {
      ok:true,
      spreadsheetId:ss.getId(),
      photoFolderId:folderId,
      adminPin:adminPin,
      deviceId:'terminal-01',
      deviceToken:deviceToken || 'ALREADY_CONFIGURED',
      next:'Deploy as Web app (execute as you, access: anyone with link), then copy /exec URL into Face Terminal settings.'
    };
  } finally {
    lock.releaseLock();
  }
}

function installDavomatTriggers_() {
  var keep = ['davomatNightlyFinalize','deleteExpiredPhotos','sendMorningReport','sendEveningReport'];
  ScriptApp.getProjectTriggers().forEach(function(t){ if (keep.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('davomatNightlyFinalize').timeBased().everyDays(1).atHour(23).nearMinute(40).create();
  ScriptApp.newTrigger('deleteExpiredPhotos').timeBased().everyDays(1).atHour(3).nearMinute(10).create();
  ScriptApp.newTrigger('sendMorningReport').timeBased().everyDays(1).atHour(Number(getSetting_('MORNING_REPORT_HOUR',9))).nearMinute(Number(getSetting_('MORNING_REPORT_MINUTE',15))).create();
  ScriptApp.newTrigger('sendEveningReport').timeBased().everyDays(1).atHour(Number(getSetting_('EVENING_REPORT_HOUR',19))).nearMinute(Number(getSetting_('EVENING_REPORT_MINUTE',0))).create();
}

function regenerateDeviceToken(sessionToken, deviceId) {
  requireAdmin_(sessionToken);
  var row = findOne_(DAVOMAT.SHEETS.DEVICES, function(r){ return String(r.DEVICE_ID) === String(deviceId); });
  if (!row) throw new Error('DEVICE_NOT_FOUND');
  var token = randomToken_(32);
  updateRowObject_(DAVOMAT.SHEETS.DEVICES, row._row, {TOKEN_HASH:sha256Hex_(token), LAST_SEEN_AT:nowIso_()});
  if (String(deviceId) === String(getSetting_('DEVICE_ID','terminal-01'))) { setSecret_(deviceSecretKey_(deviceId), token); setSetting_('DEVICE_TOKEN','MOVED_TO_SCRIPT_PROPERTIES','Device token Script Properties да'); }
  audit_('admin','REGENERATE_DEVICE_TOKEN','DEVICE',deviceId,{}, {}, 'token regenerated');
  return {ok:true, deviceId:deviceId, deviceToken:token};
}

/* ==================== Attendance.gs ==================== */
/** Attendance business logic: IN/OUT, schedule, day summary, corrections. */
function getEmployeeById_(employeeId) {
  return findOne_(DAVOMAT.SHEETS.EMPLOYEES, function(r){ return String(r.EMPLOYEE_ID) === String(employeeId) && normalizeBool_(r.ACTIVE); });
}

function getScheduleById_(scheduleId) {
  return findOne_(DAVOMAT.SHEETS.SCHEDULES, function(r){ return String(r.SCHEDULE_ID) === String(scheduleId) && normalizeBool_(r.ACTIVE); });
}

function weekdayKey_(dateKey) {
  var d = new Date(dateKey + 'T12:00:00+05:00');
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()];
}

function hasScheduleTime_(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  return String(value == null ? '' : value).trim() !== '';
}

function addDays_(date, days) { return date ? new Date(date.getTime() + Number(days || 0) * 86400000) : null; }
function previousDateKey_(dateKey) {
  var base = new Date(String(dateKey) + 'T12:00:00+05:00');
  if (isNaN(base.getTime())) throw new Error('DATE_INVALID');
  return dateKeyFromDate_(new Date(base.getTime() - 86400000));
}

function scheduleForDate_(scheduleRow, dateKey) {
  if (!scheduleRow) throw new Error('SCHEDULE_NOT_FOUND');
  var key = weekdayKey_(dateKey);
  var startValue = scheduleRow[key + '_START'];
  var endValue = scheduleRow[key + '_END'];
  var isWorkday = hasScheduleTime_(startValue) && hasScheduleTime_(endValue);
  var start = isWorkday ? parseTimeOnDate_(dateKey, startValue) : null;
  var end = isWorkday ? parseTimeOnDate_(dateKey, endValue) : null;
  if (isWorkday && (!start || !end)) throw new Error('SCHEDULE_TIME_INVALID');
  var overnight = !!(isWorkday && end.getTime() <= start.getTime());
  if (overnight) end = addDays_(end,1);
  var lunchStart = isWorkday ? parseTimeOnDate_(dateKey, scheduleRow.LUNCH_START) : null;
  var lunchEnd = isWorkday ? parseTimeOnDate_(dateKey, scheduleRow.LUNCH_END) : null;
  if (lunchStart && lunchEnd) {
    if (overnight && lunchStart.getTime() < start.getTime()) { lunchStart = addDays_(lunchStart,1); lunchEnd = addDays_(lunchEnd,1); }
    if (lunchEnd.getTime() <= lunchStart.getTime()) lunchEnd = addDays_(lunchEnd,1);
  }
  return {scheduleId:String(scheduleRow.SCHEDULE_ID),isWorkday:isWorkday,start:start,end:end,overnight:overnight,lunchStart:lunchStart,lunchEnd:lunchEnd,graceMinutes:toNumber_(scheduleRow.GRACE_MINUTES,10)};
}

function attendanceBusinessDate_(employee, eventAt) {
  var current = dateKeyFromDate_(eventAt);
  var prev = previousDateKey_(current);
  try {
    var prevSchedule = scheduleForDate_(getScheduleById_(employee.SCHEDULE_ID), prev);
    if (prevSchedule.isWorkday && prevSchedule.overnight && eventAt.getTime() >= prevSchedule.start.getTime() && eventAt.getTime() <= prevSchedule.end.getTime()) return prev;
  } catch (err) {}
  return current;
}
function acceptedEventsForEmployeeDate_(employeeId, dateKey) {
  return findAll_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, function(r){
    return String(r.EMPLOYEE_ID) === String(employeeId) && String(r.STATUS) === 'ACCEPTED' && dateKeyValue_(r.EVENT_DATE) === String(dateKey);
  }).sort(function(a,b){ return new Date(a.EVENT_AT).getTime() - new Date(b.EVENT_AT).getTime(); });
}

function latestCorrectionMap_(employeeId, dateKey) {
  var rows = findAll_(DAVOMAT.SHEETS.CORRECTIONS, function(r){ return String(r.EMPLOYEE_ID) === String(employeeId) && dateKeyValue_(r.DATE) === String(dateKey); });
  var map = {};
  rows.sort(function(a,b){ return new Date(a.CREATED_AT).getTime() - new Date(b.CREATED_AT).getTime(); }).forEach(function(r){ map[String(r.FIELD)] = r; });
  return map;
}

function effectiveInOut_(employeeId, dateKey) {
  var events = acceptedEventsForEmployeeDate_(employeeId, dateKey);
  var firstIn = null, lastOut = null, openIn = null, intervals = [];
  events.forEach(function(e){
    var dt = e.EVENT_AT instanceof Date ? e.EVENT_AT : new Date(e.EVENT_AT);
    if (isNaN(dt.getTime())) return;
    var t = String(e.EVENT_TYPE || '');
    if (t === 'IN') {
      if (!firstIn) firstIn = dt;
      // Ignore malformed consecutive IN records when calculating intervals.
      if (!openIn) openIn = dt;
    } else if (t === 'OUT') {
      lastOut = dt;
      if (openIn && dt.getTime() >= openIn.getTime()) {
        intervals.push({inAt:openIn,outAt:dt});
        openIn = null;
      }
    }
  });
  var corrections = latestCorrectionMap_(employeeId, dateKey);
  if (corrections.FIRST_IN) firstIn = corrections.FIRST_IN.NEW_VALUE ? new Date(corrections.FIRST_IN.NEW_VALUE) : null;
  if (corrections.LAST_OUT) lastOut = corrections.LAST_OUT.NEW_VALUE ? new Date(corrections.LAST_OUT.NEW_VALUE) : null;
  return {firstIn:firstIn,lastOut:lastOut,events:events,corrections:corrections,intervals:intervals,openIn:openIn};
}
function overlapMinutes_(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  var ms = Math.max(0, Math.min(aEnd.getTime(), bEnd.getTime()) - Math.max(aStart.getTime(), bStart.getTime()));
  return Math.floor(ms / 60000);
}

function buildDaySummary_(employeeId, dateKey, finalize) {
  var employee = getEmployeeById_(employeeId);
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  var scheduleRow = getScheduleById_(employee.SCHEDULE_ID);
  if (!scheduleRow) throw new Error('SCHEDULE_NOT_FOUND');
  var sch = scheduleForDate_(scheduleRow, dateKey);
  var io = effectiveInOut_(employeeId, dateKey);
  var firstIn = io.firstIn, lastOut = io.lastOut;
  var now = new Date();
  var requiresReview = false;
  var worked = 0, late = 0, early = 0, overtime = 0, absent = false, status = 'NON_WORKDAY';

  if (sch.isWorkday) {
    status = 'PENDING';
    if (firstIn) {
      var lateRaw = Math.max(0, Math.floor((firstIn.getTime() - sch.start.getTime()) / 60000));
      late = lateRaw > sch.graceMinutes ? lateRaw : 0;
      worked = io.intervals.reduce(function(total, pair){
        var gross = Math.max(0, Math.floor((pair.outAt.getTime() - pair.inAt.getTime()) / 60000));
        var lunch = overlapMinutes_(pair.inAt, pair.outAt, sch.lunchStart, sch.lunchEnd);
        return total + Math.max(0, gross - lunch);
      }, 0);
      if (io.openIn) {
        var liveEnd = now.getTime() < io.openIn.getTime() ? io.openIn : now;
        var liveGross = Math.max(0, Math.floor((liveEnd.getTime() - io.openIn.getTime()) / 60000));
        var liveLunch = overlapMinutes_(io.openIn, liveEnd, sch.lunchStart, sch.lunchEnd);
        worked += Math.max(0, liveGross - liveLunch);
        var shouldReview = finalize || now.getTime() > sch.end.getTime();
        requiresReview = shouldReview;
        status = shouldReview ? 'REVIEW' : 'OPEN';
      } else if (lastOut) {
        early = Math.max(0, Math.floor((sch.end.getTime() - lastOut.getTime()) / 60000));
        overtime = Math.max(0, Math.floor((lastOut.getTime() - sch.end.getTime()) / 60000));
        status = 'COMPLETE';
      } else {
        status = 'OPEN';
      }
    } else if (finalize) {
      absent = true;
      status = 'ABSENT';
    }
  }
  return {
    DAILY_ID:dateKey + ':' + employeeId,
    DATE:dateKey,
    EMPLOYEE_ID:employeeId,
    SCHEDULE_ID:String(employee.SCHEDULE_ID),
    FIRST_IN:firstIn ? dateToIso_(firstIn) : '',
    LAST_OUT:lastOut ? dateToIso_(lastOut) : '',
    WORKED_MIN:worked,
    LATE_MIN:late,
    EARLY_MIN:early,
    OVERTIME_MIN:overtime,
    ABSENT:absent,
    REQUIRES_REVIEW:requiresReview,
    STATUS:status,
    UPDATED_AT:nowIso_()
  };
}

function upsertDaily_(summary) {
  var found = findOne_(DAVOMAT.SHEETS.ATTENDANCE, function(r){ return String(r.DAILY_ID) === String(summary.DAILY_ID); });
  if (found) updateRowObject_(DAVOMAT.SHEETS.ATTENDANCE, found._row, summary);
  else appendObject_(DAVOMAT.SHEETS.ATTENDANCE, summary);
  return summary;
}

function rebuildEmployeeDay_(employeeId, dateKey, finalize) {
  return upsertDaily_(buildDaySummary_(employeeId, dateKey, !!finalize));
}

function getNextEventType_(employeeId, dateKey, eventAt, requestedType) {
  var events = acceptedEventsForEmployeeDate_(employeeId, dateKey);
  if (!events.length) return {type:'IN', reason:''};
  var last = events[events.length - 1];
  var lastType = String(last.EVENT_TYPE || '').toUpperCase();
  var expected = lastType === 'IN' ? 'OUT' : 'IN';
  var requested = String(requestedType || '').toUpperCase();
  var lastAt = last.EVENT_AT instanceof Date ? last.EVENT_AT : new Date(last.EVENT_AT);
  var gapMin = toNumber_(getSetting_('MIN_EVENT_GAP_MINUTES',2),2);
  // The short anti-double-tap gap must block only repeating the SAME mark.
  // The legitimate opposite mark (IN -> OUT or OUT -> IN) is allowed immediately.
  if (requested && requested === lastType && eventAt && !isNaN(lastAt.getTime()) && eventAt.getTime() - lastAt.getTime() < gapMin * 60000) {
    return {type:null, reason:'ALREADY_MARKED', expectedType:expected};
  }
  return {type:expected, reason:''};
}
function validateEventTime_(clientTime) {
  var d = new Date(clientTime || '');
  if (isNaN(d.getTime())) d = new Date();
  var age = Math.abs(Date.now() - d.getTime());
  if (age > 7 * 86400000) throw new Error('EVENT_TIME_OUT_OF_RANGE');
  return d;
}

function appendRejectedEvent_(payload, reason, eventAt, dateKey, matchScore, liveScore, realScore, blinkOk) {
  appendObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, {
    EVENT_ID:String(payload.eventId || payload.EVENT_ID || ''), EMPLOYEE_ID:String(payload.employeeId || ''), DEVICE_ID:String(payload.deviceId || ''), EVENT_TYPE:'',
    EVENT_DATE:dateKey || '', EVENT_AT:eventAt ? dateToIso_(eventAt) : '', CLIENT_TIME:payload.clientTime || '', SERVER_TIME:nowIso_(),
    MATCH_SCORE:matchScore || 0, LIVENESS_SCORE:liveScore || 0, REAL_SCORE:realScore || 0, BLINK_OK:!!blinkOk,
    PHOTO_FILE_ID:'', PHOTO_URL:'', SOURCE:payload.offline ? 'OFFLINE_SYNC' : 'LIVE', STATUS:'REJECTED', REVIEW_REASON:reason, PHOTO_DELETED_AT:''
  });
}

function processAttendanceEvent_(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new Error('SERVER_BUSY_RETRY');
  try { return processAttendanceEventUnlocked_(payload); }
  finally { lock.releaseLock(); }
}

function processAttendanceEventUnlocked_(payload) {
  var eventId = String(payload.eventId || payload.EVENT_ID || '');
  var employeeId = String(payload.employeeId || '');
  var deviceId = String(payload.deviceId || '');
  if (!eventId || !employeeId || !deviceId) throw new Error('EVENT_FIELDS_REQUIRED');
  var duplicate = findOne_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, function(r){ return String(r.EVENT_ID) === eventId; });
  if (duplicate) {
    var empDup = findOne_(DAVOMAT.SHEETS.EMPLOYEES,function(r){return String(r.EMPLOYEE_ID)===employeeId;});
    return {ok:true,status:'duplicate',eventId:eventId,employeeId:employeeId,fullName:empDup?String(empDup.FULL_NAME||''):'',position:empDup?String(empDup.POSITION||''):'',eventType:String(duplicate.EVENT_TYPE||''),eventAt:String(duplicate.EVENT_AT||''),serverTime:String(duplicate.SERVER_TIME||nowIso_()),_duplicate:true};
  }
  var employee = getEmployeeById_(employeeId);
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  var eventAt = payload.offline ? validateEventTime_(payload.clientTime) : new Date();
  var dateKey = attendanceBusinessDate_(employee,eventAt);
  var matchScore = toNumber_(payload.matchScore,0), liveScore = toNumber_(payload.livenessScore,0), realScore = toNumber_(payload.realScore,0);
  var blinkOk = payload.blinkOk === true || String(payload.blinkOk) === 'true';
  var minMatch=toNumber_(getSetting_('FACE_MATCH_THRESHOLD',0.62),0.62), minLive=toNumber_(getSetting_('LIVENESS_THRESHOLD',0.55),0.55), minReal=toNumber_(getSetting_('REALNESS_THRESHOLD',0.55),0.55);
  var requireActive=String(getSetting_('REQUIRE_ACTIVE_LIVENESS','true')).toLowerCase()==='true';
  if (matchScore<minMatch || liveScore<minLive || realScore<minReal || (requireActive&&!blinkOk)) { appendRejectedEvent_(payload,'FACE_PROOF_LOW',eventAt,dateKey,matchScore,liveScore,realScore,blinkOk); return {ok:false,status:'rejected',eventId:eventId,reason:'FACE_PROOF_LOW'}; }
  var requested=String(payload.requestedEventType || payload.clientSuggestedType || '').toUpperCase();
  var next=getNextEventType_(employeeId,dateKey,eventAt,requested);
  if (requested && ['IN','OUT'].indexOf(requested)<0) { appendRejectedEvent_(payload,'EVENT_TYPE_INVALID',eventAt,dateKey,matchScore,liveScore,realScore,blinkOk); return {ok:false,status:'rejected',eventId:eventId,reason:'EVENT_TYPE_INVALID'}; }
  if (!next.type) { appendRejectedEvent_(payload,next.reason,eventAt,dateKey,matchScore,liveScore,realScore,blinkOk); return {ok:false,status:'rejected',eventId:eventId,reason:next.reason}; }
  if (requested && requested!==next.type) { appendRejectedEvent_(payload,'EVENT_TYPE_MISMATCH',eventAt,dateKey,matchScore,liveScore,realScore,blinkOk); return {ok:false,status:'rejected',eventId:eventId,reason:'EVENT_TYPE_MISMATCH',expectedType:next.type}; }
  var serverTime=new Date();
  var eventRow=appendObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS,{EVENT_ID:eventId,EMPLOYEE_ID:employeeId,DEVICE_ID:deviceId,EVENT_TYPE:next.type,EVENT_DATE:dateKey,EVENT_AT:dateToIso_(eventAt),CLIENT_TIME:payload.clientTime||'',SERVER_TIME:dateToIso_(serverTime),MATCH_SCORE:matchScore,LIVENESS_SCORE:liveScore,REAL_SCORE:realScore,BLINK_OK:blinkOk,PHOTO_FILE_ID:'',PHOTO_URL:'',SOURCE:payload.offline?'OFFLINE_SYNC':'LIVE',STATUS:'ACCEPTED',REVIEW_REASON:'',PHOTO_DELETED_AT:''});
  return {ok:true,status:'accepted',eventId:eventId,employeeId:employeeId,fullName:String(employee.FULL_NAME),position:String(employee.POSITION||''),eventType:next.type,eventAt:dateToIso_(eventAt),serverTime:dateToIso_(serverTime),_eventRow:eventRow,_dateKey:dateKey,_duplicate:false};
}

function publicAttendanceResult_(r) { var out={}; Object.keys(r||{}).forEach(function(k){if(k.charAt(0)!=='_')out[k]=r[k];}); return out; }
function postCommitError_(eventId, stage, err) { try { audit_('system','POST_COMMIT_ERROR','ATTENDANCE_EVENT',String(eventId||''),{}, {stage:stage,error:String(err&&err.message?err.message:err)}, stage); } catch(e){ Logger.log('postCommitError '+stage+': '+e); } }
function finalizeAttendancePostCommit_(accepted,payload) {
  if (!accepted || !accepted.ok || accepted.status!=='accepted' || accepted._duplicate) return;
  if (payload.photoDataUrl) { try { var photo=saveControlPhoto_(payload.photoDataUrl,accepted.employeeId,accepted.eventType,accepted.eventId); updateRowObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS,accepted._eventRow,{PHOTO_FILE_ID:photo.fileId||'',PHOTO_URL:photo.url||''}); } catch(photoErr){ postCommitError_(accepted.eventId,'PHOTO_UPLOAD',photoErr); } }
  try { var summary=rebuildEmployeeDay_(accepted.employeeId,accepted._dateKey,accepted._dateKey<today_()); var employee=getEmployeeById_(accepted.employeeId); if(employee && accepted._dateKey===today_()) maybeSendLateAlert_(employee,summary); } catch(summaryErr){ postCommitError_(accepted.eventId,'SUMMARY_OR_TELEGRAM',summaryErr); }
}

function davomatNightlyFinalize() {
  var dateKey = today_();
  var employees = findAll_(DAVOMAT.SHEETS.EMPLOYEES, function(r){ return normalizeBool_(r.ACTIVE); });
  employees.forEach(function(e){ try { rebuildEmployeeDay_(String(e.EMPLOYEE_ID), dateKey, true); } catch(err) { Logger.log(err); } });
  calculateSalaryMonth_(monthNow_());
}

function adminCorrectAttendance(sessionToken, payload) {
  requireAdmin_(sessionToken);
  payload = payload || {};
  var employeeId = String(payload.employeeId || '');
  var dateKey = String(payload.date || '');
  var field = String(payload.field || '');
  var newValue = String(payload.newValue || '');
  var reason = String(payload.reason || '').trim();
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || ['FIRST_IN','LAST_OUT'].indexOf(field) < 0 || !reason) throw new Error('CORRECTION_FIELDS_REQUIRED');
  var current = buildDaySummary_(employeeId, dateKey, false);
  var oldValue = field === 'FIRST_IN' ? current.FIRST_IN : current.LAST_OUT;
  var normalized = '';
  if (newValue) {
    var d = new Date(newValue);
    if (isNaN(d.getTime())) throw new Error('CORRECTION_TIME_INVALID');
    normalized = dateToIso_(d);
  }
  appendObject_(DAVOMAT.SHEETS.CORRECTIONS, {
    CORRECTION_ID:uuid_(), DATE:dateKey, EMPLOYEE_ID:employeeId, FIELD:field, OLD_VALUE:oldValue,
    NEW_VALUE:normalized, REASON:reason, ADMIN_ID:'admin', CREATED_AT:nowIso_()
  });
  audit_('admin','CORRECT_ATTENDANCE','ATTENDANCE',dateKey + ':' + employeeId, {field:field,value:oldValue}, {field:field,value:normalized}, reason);
  return sanitizeForClient_(rebuildEmployeeDay_(employeeId, dateKey, false));
}

/* ==================== Payroll.gs ==================== */
/** Payroll v1: monthly salary minus full absent workdays only. */
function monthDates_(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('MONTH_INVALID');
  var p = month.split('-').map(Number);
  var count = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  var out = [];
  for (var i=1;i<=count;i++) out.push(month + '-' + String(i).padStart(2,'0'));
  return out;
}

function calculateSalaryMonth_(month) {
  var employees = findAll_(DAVOMAT.SHEETS.EMPLOYEES, function(r){ return normalizeBool_(r.ACTIVE); });
  var dates = monthDates_(month);
  var today = today_();
  var result = [];
  employees.forEach(function(emp){
    var schRow = getScheduleById_(emp.SCHEDULE_ID);
    if (!schRow) return;
    var trackingStart = dateKeyValue_(emp.START_DATE) || dateKeyValue_(emp.CREATED_AT) || month + '-01';
    var monthPlanned = dates.filter(function(d){ return scheduleForDate_(schRow,d).isWorkday; });
    var planned = monthPlanned.filter(function(d){ return d >= trackingStart; });
    var summaries = rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE).filter(function(r){ return String(r.EMPLOYEE_ID) === String(emp.EMPLOYEE_ID) && monthKeyValue_(r.DATE) === month; });
    var byDate = {};
    summaries.forEach(function(s){ byDate[dateKeyValue_(s.DATE)] = s; });
    var present = 0, absent = 0, worked = 0, late = 0, early = 0, overtime = 0, pending = 0;
    planned.forEach(function(d){
      var s = byDate[d];
      if (!s) {
        if (d < today) {
          try { s = rebuildEmployeeDay_(String(emp.EMPLOYEE_ID), d, true); byDate[d] = s; } catch(err) { pending++; return; }
        } else { pending++; return; }
      }
      if (normalizeBool_(s.ABSENT)) absent++;
      else if (s.FIRST_IN) present++;
      worked += toNumber_(s.WORKED_MIN,0);
      late += toNumber_(s.LATE_MIN,0);
      early += toNumber_(s.EARLY_MIN,0);
      overtime += toNumber_(s.OVERTIME_MIN,0);
      if (normalizeBool_(s.REQUIRES_REVIEW)) pending++;
    });
    var salary = Math.round(toNumber_(emp.MONTHLY_SALARY,0));
    // Daily rate always uses the full month's planned workdays. START_DATE only prevents
    // pre-DAVOMAT days from being treated as absences during the first rollout month.
    var deduction = monthPlanned.length ? Math.round(salary * absent / monthPlanned.length) : 0;
    var payable = Math.max(0, salary - deduction);
    var row = {
      MONTH:month, EMPLOYEE_ID:String(emp.EMPLOYEE_ID), MONTHLY_SALARY:salary, PLANNED_DAYS:monthPlanned.length,
      PRESENT_DAYS:present, ABSENT_DAYS:absent, WORKED_MIN:worked, LATE_MIN:late, EARLY_MIN:early, OVERTIME_MIN:overtime,
      ABSENCE_DEDUCTION:deduction, PAYABLE:payable, STATUS:pending ? 'PRELIMINARY' : 'READY', UPDATED_AT:nowIso_()
    };
    var found = findOne_(DAVOMAT.SHEETS.SALARY, function(r){ return monthKeyValue_(r.MONTH) === month && String(r.EMPLOYEE_ID) === String(emp.EMPLOYEE_ID); });
    if (found) updateRowObject_(DAVOMAT.SHEETS.SALARY, found._row, row); else appendObject_(DAVOMAT.SHEETS.SALARY, row);
    row.FULL_NAME = emp.FULL_NAME;
    row.POSITION = emp.POSITION;
    result.push(row);
  });
  return result;
}

function getSalaryReport(sessionToken, month) {
  requireAdmin_(sessionToken);
  return sanitizeForClient_(calculateSalaryMonth_(month || monthNow_()));
}

/* ==================== Photos.gs ==================== */
/** Control photos in Google Drive. */
function saveControlPhoto_(dataUrl, employeeId, eventType, eventId) {
  if (!dataUrl) return {fileId:'',url:''};
  var m = String(dataUrl).match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
  if (!m) throw new Error('PHOTO_FORMAT_INVALID');
  var mime = m[1] === 'png' ? 'image/png' : 'image/jpeg';
  var ext = m[1] === 'png' ? 'png' : 'jpg';
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 2.5 * 1024 * 1024) throw new Error('PHOTO_TOO_LARGE');
  var folderId = photoFolderId_();
  if (!folderId) throw new Error('PHOTO_FOLDER_NOT_CONFIGURED');
  var folder = DriveApp.getFolderById(folderId);
  var name = [today_(), employeeId, eventType, eventId].join('_') + '.' + ext;
  var file = folder.createFile(Utilities.newBlob(bytes, mime, name));
  return {fileId:file.getId(), url:file.getUrl()};
}

function deleteExpiredPhotos() {
  var days = toNumber_(getSetting_('PHOTO_RETENTION_DAYS',60),60);
  var cutoff = new Date(Date.now() - days * 86400000);
  var rows = rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS);
  var count = 0;
  rows.forEach(function(r){
    if (!r.PHOTO_FILE_ID || r.PHOTO_DELETED_AT) return;
    var when = r.SERVER_TIME instanceof Date ? r.SERVER_TIME : new Date(r.SERVER_TIME);
    if (isNaN(when.getTime()) || when >= cutoff) return;
    try {
      DriveApp.getFileById(String(r.PHOTO_FILE_ID)).setTrashed(true);
    } catch (err) {
      Logger.log('Photo delete: ' + err);
    }
    updateRowObject_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS, r._row, {PHOTO_FILE_ID:'', PHOTO_URL:'', PHOTO_DELETED_AT:nowIso_()});
    count++;
  });
  return {deleted:count, cutoff:formatDateTime_(cutoff)};
}

/* ==================== Telegram.gs ==================== */
/** Telegram reports. Configure token and chat ID in SETTINGS. */
function telegramSend_(text) {
  var token = getSecret_('TELEGRAM_BOT_TOKEN').trim();
  var chatId = String(getSetting_('TELEGRAM_CHAT_ID','')).trim();
  if (!token || !chatId) return {ok:false, skipped:true, reason:'TELEGRAM_NOT_CONFIGURED'};
  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method:'post', muteHttpExceptions:true, contentType:'application/json',
      payload:JSON.stringify({chat_id:chatId, text:text, parse_mode:'HTML', disable_web_page_preview:true})
    });
    var ok = response.getResponseCode() >= 200 && response.getResponseCode() < 300;
    appendObject_(DAVOMAT.SHEETS.TELEGRAM_LOG, {LOG_ID:uuid_(),TYPE:'MESSAGE',STATUS:ok?'SENT':'ERROR',MESSAGE:String(response.getContentText()).slice(0,4000),CREATED_AT:nowIso_()});
    return {ok:ok, code:response.getResponseCode()};
  } catch(err) {
    appendObject_(DAVOMAT.SHEETS.TELEGRAM_LOG, {LOG_ID:uuid_(),TYPE:'MESSAGE',STATUS:'ERROR',MESSAGE:String(err),CREATED_AT:nowIso_()});
    return {ok:false,error:String(err)};
  }
}

function scheduledEmployeesForDate_(dateKey) {
  return findAll_(DAVOMAT.SHEETS.EMPLOYEES, function(e){
    if (!normalizeBool_(e.ACTIVE)) return false;
    if (e.START_DATE && dateKeyValue_(e.START_DATE) > String(dateKey)) return false;
    try {
      var sch = getScheduleById_(e.SCHEDULE_ID);
      return !!(sch && scheduleForDate_(sch, dateKey).isWorkday);
    } catch (err) { return false; }
  });
}

function todayDashboardData_() {
  var date = today_();
  var employees = findAll_(DAVOMAT.SHEETS.EMPLOYEES, function(r){ return normalizeBool_(r.ACTIVE); });
  var scheduled = scheduledEmployeesForDate_(date);
  var rows = rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE).filter(function(r){ return dateKeyValue_(r.DATE) === date; });
  var map = {}; rows.forEach(function(r){ map[String(r.EMPLOYEE_ID)] = r; });
  var arrived=[], late=[], absent=[], early=[], overtime=[], review=[], working=[], notArrived=[];
  var now = new Date();
  scheduled.forEach(function(e){
    var r = map[String(e.EMPLOYEE_ID)];
    var scheduleRow = getScheduleById_(e.SCHEDULE_ID);
    var sch = scheduleRow ? scheduleForDate_(scheduleRow, date) : null;
    var scheduleEnded = !!(sch && sch.end && now.getTime() > sch.end.getTime());
    if (r && r.FIRST_IN) arrived.push(e); else notArrived.push(e);
    if (r && toNumber_(r.LATE_MIN,0)>0) late.push({employee:e,minutes:toNumber_(r.LATE_MIN,0)});
    if ((r && normalizeBool_(r.ABSENT)) || (!(r && r.FIRST_IN) && scheduleEnded)) absent.push(e);
    if (r && toNumber_(r.EARLY_MIN,0)>0) early.push({employee:e,minutes:toNumber_(r.EARLY_MIN,0)});
    if (r && toNumber_(r.OVERTIME_MIN,0)>0) overtime.push({employee:e,minutes:toNumber_(r.OVERTIME_MIN,0)});
    if ((r && normalizeBool_(r.REQUIRES_REVIEW)) || (r && r.FIRST_IN && !r.LAST_OUT && scheduleEnded)) review.push(e);
    if (r && r.FIRST_IN && !r.LAST_OUT) working.push(e);
  });
  return {
    date:date,
    total:employees.length,
    scheduledTotal:scheduled.length,
    arrived:arrived,
    late:late,
    absent:absent,
    notArrived:notArrived,
    early:early,    overtime:overtime,
    review:review,
    working:working,
    rows:rows
  };
}

function sendMorningReport() {
  var d = todayDashboardData_();
  var text = '<b>📊 ДАВОМАТ — ' + d.date + '</b>\n\n' +
    'Бугун графикда: <b>' + d.scheduledTotal + '</b>\n' +
    'Келди: <b>' + d.arrived.length + '</b>\n' +
    'Кечикди: <b>' + d.late.length + '</b>\n' +
    'Ҳали келмади: <b>' + d.notArrived.length + '</b>';
  if (d.late.length) text += '\n\n<b>⚠ Кечикканлар:</b>\n' + d.late.map(function(x,i){return (i+1)+'. '+x.employee.FULL_NAME+' — '+x.minutes+' дақ.';}).join('\n');
  if (d.notArrived.length) text += '\n\n<b>❌ Ҳали келмаганлар:</b>\n' + d.notArrived.slice(0,30).map(function(x,i){return (i+1)+'. '+x.FULL_NAME;}).join('\n');
  return telegramSend_(text);
}

function sendEveningReport() {
  var d = todayDashboardData_();
  var missingCount = d.notArrived.length;
  var text = '<b>📊 КУН ЯКУНИ — ' + d.date + '</b>\n\n' +
    'Графикда: <b>' + d.scheduledTotal + '</b>\n' +
    'Ишга келди: <b>' + d.arrived.length + ' / ' + d.scheduledTotal + '</b>\n' +
    'Келмади: <b>' + missingCount + '</b>\n' +
    'Эрта кетди: <b>' + d.early.length + '</b>\n' +
    'Ортиқча ишлади: <b>' + d.overtime.length + '</b>\n' +
    'Ёпилмаган смена: <b>' + d.review.length + '</b>';
  if (d.notArrived.length) text += '\n\n<b>❌ Келмаганлар:</b>\n' + d.notArrived.slice(0,30).map(function(x,i){return (i+1)+'. '+x.FULL_NAME;}).join('\n');
  if (d.review.length) text += '\n\n<b>⚠ Тасдиқлаш керак:</b>\n' + d.review.map(function(x,i){return (i+1)+'. '+x.FULL_NAME;}).join('\n');
  return telegramSend_(text);
}

function maybeSendLateAlert_(employee, summary) {
  var threshold = toNumber_(getSetting_('LATE_ALERT_MINUTES',30),30);
  if (toNumber_(summary.LATE_MIN,0) < threshold) return;
  telegramSend_('⚠ <b>Критик кечикиш</b>\n' + employee.FULL_NAME + '\nКечикиш: <b>' + summary.LATE_MIN + ' дақиқа</b>\n' + summary.DATE);
}

/* ==================== Admin.gs ==================== */
/** Admin API called by Admin.html through google.script.run. */
function getAdminBootstrap(sessionToken) {
  requireAdmin_(sessionToken);
  var d = todayDashboardData_();
  var attendance = getAttendanceReport(sessionToken, d.date, d.date);
  var empMap = {};
  rowsAsObjects_(DAVOMAT.SHEETS.EMPLOYEES).forEach(function(e){ empMap[String(e.EMPLOYEE_ID)] = e; });
  var recentEvents = rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS)
    .filter(function(r){ return String(r.STATUS) === 'ACCEPTED'; })
    .sort(function(a,b){ return new Date(b.EVENT_AT).getTime() - new Date(a.EVENT_AT).getTime(); })
    .slice(0,12)
    .map(function(r){ var e=empMap[String(r.EMPLOYEE_ID)]||{}; return {fullName:String(e.FULL_NAME||r.EMPLOYEE_ID),position:String(e.POSITION||''),eventType:String(r.EVENT_TYPE||''),eventAt:String(r.EVENT_AT||''),deviceId:String(r.DEVICE_ID||'')}; });
  var deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  var device = findOne_(DAVOMAT.SHEETS.DEVICES,function(r){return String(r.DEVICE_ID)===deviceId;});
  var lastSeen = device ? String(device.LAST_SEEN_AT||'') : '';
  var online = false;
  if (lastSeen) { var ld=new Date(lastSeen); online=!isNaN(ld.getTime()) && (Date.now()-ld.getTime()) < 90000; }
  var todayStates = {};
  attendance.forEach(function(r){ todayStates[String(r.EMPLOYEE_ID)]={status:String(r.STATUS||''),firstIn:String(r.FIRST_IN||''),lastOut:String(r.LAST_OUT||'')}; });
  return sanitizeForClient_({
    today:d.date,
    stats:{total:d.total,arrived:d.arrived.length,late:d.late.length,absent:d.absent.length,working:d.working.length,review:d.review.length,early:d.early.length,overtime:d.overtime.length},
    alerts:d.review.map(function(e){return {type:'review',text:e.FULL_NAME+' — ТАСДИҚЛАШ КЕРАК'};}),
    attendance:attendance,
    recentEvents:recentEvents,
    todayStates:todayStates,
    terminal:{deviceId:deviceId,online:online,lastSeenAt:lastSeen,name:device?String(device.NAME||''):''},
    settings:{photoRetentionDays:toNumber_(getSetting_('PHOTO_RETENTION_DAYS',60),60),deviceId:deviceId,telegramConfigured:!!(getSetting_('TELEGRAM_BOT_TOKEN','')&&getSetting_('TELEGRAM_CHAT_ID',''))}
  });
}
function listEmployees(sessionToken) {
  requireAdmin_(sessionToken);
  var schedules = {};
  rowsAsObjects_(DAVOMAT.SHEETS.SCHEDULES).forEach(function(s){ schedules[String(s.SCHEDULE_ID)] = s.NAME; });
  return sanitizeForClient_(rowsAsObjects_(DAVOMAT.SHEETS.EMPLOYEES).map(function(e){
    return {
      employeeId:String(e.EMPLOYEE_ID),fullName:String(e.FULL_NAME),position:String(e.POSITION||''),
      monthlySalary:toNumber_(e.MONTHLY_SALARY,0),scheduleId:String(e.SCHEDULE_ID),scheduleName:String(schedules[String(e.SCHEDULE_ID)]||''),
      startDate:dateKeyValue_(e.START_DATE),active:normalizeBool_(e.ACTIVE),faceStatus:String(e.FACE_STATUS||'NOT_ENROLLED')
    };
  }));
}

function createEmployee(sessionToken, payload) {
  requireAdmin_(sessionToken);
  payload = payload || {};
  var fullName = String(payload.fullName || '').trim();
  var position = String(payload.position || '').trim();
  var salary = Math.round(toNumber_(payload.monthlySalary,0));
  var scheduleId = String(payload.scheduleId || 'SCH-DEFAULT');
  var startDate = String(payload.startDate || today_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('EMPLOYEE_START_DATE_INVALID');
  if (!fullName || salary < 0 || !getScheduleById_(scheduleId)) throw new Error('EMPLOYEE_DATA_INVALID');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalized = fullName.toLocaleLowerCase();
    var nowMs = Date.now();
    var recentDuplicate = findOne_(DAVOMAT.SHEETS.EMPLOYEES, function(r){
      if (!normalizeBool_(r.ACTIVE)) return false;
      if (String(r.FULL_NAME || '').trim().toLocaleLowerCase() !== normalized) return false;
      if (String(r.POSITION || '').trim().toLocaleLowerCase() !== position.toLocaleLowerCase()) return false;
      if (Math.round(toNumber_(r.MONTHLY_SALARY,0)) !== salary) return false;
      if (String(r.SCHEDULE_ID) !== scheduleId || dateKeyValue_(r.START_DATE) !== startDate) return false;
      var created = new Date(r.CREATED_AT).getTime();
      return Number.isFinite(created) && (nowMs-created) < 120000;
    });
    if (recentDuplicate) {
      var existing = sanitizeForClient_(recentDuplicate);
      delete existing._row;
      existing.duplicateSuppressed = true;
      return existing;
    }

    var id = 'EMP-' + Utilities.formatDate(new Date(),DAVOMAT.TZ,'yyyyMMddHHmmss') + '-' + String(Math.floor(Math.random()*900+100));
    var row = {EMPLOYEE_ID:id,FULL_NAME:fullName,POSITION:position,MONTHLY_SALARY:salary,SCHEDULE_ID:scheduleId,START_DATE:startDate,ACTIVE:true,FACE_STATUS:'NOT_ENROLLED',CREATED_AT:nowIso_(),UPDATED_AT:nowIso_()};
    appendObject_(DAVOMAT.SHEETS.EMPLOYEES,row);
    audit_('admin','CREATE','EMPLOYEE',id,{},row,'');
    return sanitizeForClient_(row);
  } finally {
    lock.releaseLock();
  }
}

function updateEmployee(sessionToken, employeeId, patch) {
  requireAdmin_(sessionToken);
  var emp = findOne_(DAVOMAT.SHEETS.EMPLOYEES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);});
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');
  var before = sanitizeForClient_(emp);
  var upd = {UPDATED_AT:nowIso_()};
  if (patch.fullName != null) upd.FULL_NAME = String(patch.fullName).trim();
  if (patch.position != null) upd.POSITION = String(patch.position).trim();
  if (patch.monthlySalary != null) upd.MONTHLY_SALARY = Math.round(toNumber_(patch.monthlySalary,0));
  if (patch.scheduleId != null) { if(!getScheduleById_(String(patch.scheduleId))) throw new Error('SCHEDULE_NOT_FOUND'); upd.SCHEDULE_ID=String(patch.scheduleId); }
  if (patch.startDate != null) { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(patch.startDate))) throw new Error('EMPLOYEE_START_DATE_INVALID'); upd.START_DATE=String(patch.startDate); }
  if (patch.active != null) upd.ACTIVE = !!patch.active;
  updateRowObject_(DAVOMAT.SHEETS.EMPLOYEES,emp._row,upd);
  audit_('admin','UPDATE','EMPLOYEE',employeeId,before,upd,'');
  return {ok:true};
}

function deleteEmployee(sessionToken, employeeId) {
  requireAdmin_(sessionToken);
  var emp = findOne_(DAVOMAT.SHEETS.EMPLOYEES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);});
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');

  var hasHistory =
    findAll_(DAVOMAT.SHEETS.ATTENDANCE,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);}).length > 0 ||
    findAll_(DAVOMAT.SHEETS.ATTENDANCE_EVENTS,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);}).length > 0 ||
    findAll_(DAVOMAT.SHEETS.SALARY,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);}).length > 0 ||
    findAll_(DAVOMAT.SHEETS.CORRECTIONS,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);}).length > 0;

  var before = sanitizeForClient_(emp);
  if (hasHistory) {
    updateRowObject_(DAVOMAT.SHEETS.EMPLOYEES, emp._row, {ACTIVE:false,UPDATED_AT:nowIso_()});
    findAll_(DAVOMAT.SHEETS.FACE_PROFILES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId) && normalizeBool_(r.ACTIVE);})
      .forEach(function(r){updateRowObject_(DAVOMAT.SHEETS.FACE_PROFILES,r._row,{ACTIVE:false});});
    findAll_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,function(r){return String(r.EMPLOYEE_ID)===String(employeeId) && String(r.STATUS)==='OPEN';})
      .forEach(function(r){updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,r._row,{STATUS:'CANCELLED'});});
    audit_('admin','DEACTIVATE','EMPLOYEE',employeeId,before,{ACTIVE:false},'Delete requested; history retained');
    return {ok:true,mode:'deactivated'};
  }

  deleteRowsWhere_(DAVOMAT.SHEETS.FACE_PROFILES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);});
  deleteRowsWhere_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);});
  getSheet_(DAVOMAT.SHEETS.EMPLOYEES).deleteRow(emp._row);
  audit_('admin','DELETE','EMPLOYEE',employeeId,before,{},'Test/unused employee deleted');
  return {ok:true,mode:'deleted'};
}

function resetEmployeeFace(sessionToken, employeeId) {
  requireAdmin_(sessionToken);
  var emp = findOne_(DAVOMAT.SHEETS.EMPLOYEES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId);});
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');
  var count=0;
  findAll_(DAVOMAT.SHEETS.FACE_PROFILES,function(r){return String(r.EMPLOYEE_ID)===String(employeeId)&&normalizeBool_(r.ACTIVE);})
    .forEach(function(r){updateRowObject_(DAVOMAT.SHEETS.FACE_PROFILES,r._row,{ACTIVE:false});count++;});
  findAll_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,function(r){return String(r.EMPLOYEE_ID)===String(employeeId)&&String(r.STATUS)==='OPEN';})
    .forEach(function(r){updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,r._row,{STATUS:'CANCELLED'});});
  updateRowObject_(DAVOMAT.SHEETS.EMPLOYEES,emp._row,{FACE_STATUS:'NOT_ENROLLED',UPDATED_AT:nowIso_()});
  audit_('admin','FACE_RESET','EMPLOYEE',employeeId,{faceStatus:String(emp.FACE_STATUS||'')},{faceStatus:'NOT_ENROLLED',profilesDisabled:count},'');
  return {ok:true,profilesDisabled:count};
}

function listDevices(sessionToken) {
  requireAdmin_(sessionToken);
  return sanitizeForClient_(rowsAsObjects_(DAVOMAT.SHEETS.DEVICES).map(function(r){
    return {deviceId:String(r.DEVICE_ID),name:String(r.NAME||''),active:normalizeBool_(r.ACTIVE),lastSeenAt:String(r.LAST_SEEN_AT||''),createdAt:String(r.CREATED_AT||'')};
  }));
}

function setDeviceActive(sessionToken, deviceId, active) {
  requireAdmin_(sessionToken);
  var row=findOne_(DAVOMAT.SHEETS.DEVICES,function(r){return String(r.DEVICE_ID)===String(deviceId);});
  if(!row) throw new Error('DEVICE_NOT_FOUND');
  updateRowObject_(DAVOMAT.SHEETS.DEVICES,row._row,{ACTIVE:!!active,LAST_SEEN_AT:nowIso_()});
  audit_('admin',active?'ACTIVATE':'DEACTIVATE','DEVICE',deviceId,{ACTIVE:normalizeBool_(row.ACTIVE)},{ACTIVE:!!active},'');
  return {ok:true,deviceId:String(deviceId),active:!!active};
}

function cancelOpenEnrollmentSessionsForDevice_(deviceId) {
  findAll_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,function(r){
    return String(r.STATUS)==='OPEN' && (!r.DEVICE_ID || String(r.DEVICE_ID)===String(deviceId));
  }).forEach(function(r){
    updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,r._row,{STATUS:'CANCELLED'});
  });
}

function createEnrollmentSessionCore_(employeeId) {
  var emp = getEmployeeById_(employeeId);
  if (!emp) throw new Error('EMPLOYEE_NOT_FOUND');
  var deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  cancelOpenEnrollmentSessionsForDevice_(deviceId);
  var code = String(Math.floor(100000 + Math.random()*900000));
  var expires = new Date(Date.now()+DAVOMAT.ENROLLMENT_TTL_SECONDS*1000).toISOString();
  appendObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,{
    CODE:code,EMPLOYEE_ID:String(employeeId),DEVICE_ID:deviceId,STATUS:'OPEN',
    EXPIRES_AT:expires,CREATED_AT:nowIso_(),USED_AT:''
  });
  return {ok:true,code:code,fullName:String(emp.FULL_NAME),expiresAt:expires,ttlSeconds:DAVOMAT.ENROLLMENT_TTL_SECONDS,deviceId:deviceId};
}

function createEnrollmentSession(sessionToken, employeeId) {
  requireAdmin_(sessionToken);
  return createEnrollmentSessionCore_(employeeId);
}

function createTerminalPairingCode_(deviceId) {
  var code = Utilities.getUuid().replace(/-/g,'').slice(0,20);
  var key = 'DAVOMAT_PAIR_' + sha256Hex_(code);
  var payload = {deviceId:String(deviceId),expiresAt:Date.now()+10*60*1000,createdAt:Date.now()};
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(payload));
  return code;
}

function consumeTerminalPairingCode_(code) {
  code = String(code || '');
  if (!code) return null;
  var props = PropertiesService.getScriptProperties();
  var key = 'DAVOMAT_PAIR_' + sha256Hex_(code);
  var raw = props.getProperty(key);
  if (!raw) return null;
  props.deleteProperty(key);
  var data;
  try { data = JSON.parse(raw); } catch (e) { return null; }
  if (!data || !data.deviceId || Number(data.expiresAt || 0) < Date.now()) return null;
  return data;
}

function terminalPublicUrl_() {
  return String(getSetting_('TERMINAL_PUBLIC_URL','https://toxayusuf.github.io/DAVOMAT-Terminal/')).trim();
}

function backendPublicUrl_() {
  // Always prefer the URL of the deployment that is actually executing now.
  // A hard-coded deployment URL becomes stale when a new deployment is created/archived,
  // which caused the tablet link to open Google Drive 'file not found'.
  var live = String(ScriptApp.getService().getUrl() || '').trim();
  if (/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:$|[?#])/.test(live)) return live;
  return String(DAVOMAT.PUBLIC_WEB_APP_URL || '').trim();
}

function createEnrollmentLaunch(sessionToken, employeeId) {
  requireAdmin_(sessionToken);
  var enrollment = createEnrollmentSessionCore_(employeeId);
  var pairCode = createTerminalPairingCode_(enrollment.deviceId);
  var terminalUrl = terminalPublicUrl_();
  var backendUrl = backendPublicUrl_();
  if (!/^https:\/\//.test(terminalUrl)) throw new Error('TERMINAL_PUBLIC_URL_INVALID');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(backendUrl)) throw new Error('WEB_APP_URL_INVALID');
  var sep = terminalUrl.indexOf('?') >= 0 ? '&' : '?';
  var launchUrl = terminalUrl + sep +
    'backend=' + encodeURIComponent(backendUrl) +
    '&pair=' + encodeURIComponent(pairCode) +
    '&enroll=' + encodeURIComponent(enrollment.code) +
    '&v=080';
  return {
    ok:true,
    code:enrollment.code,
    fullName:enrollment.fullName,
    expiresAt:enrollment.expiresAt,
    launchUrl:launchUrl
  };
}

function createTerminalPairingLaunch(sessionToken) {
  requireAdmin_(sessionToken);
  var deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  var pairCode = createTerminalPairingCode_(deviceId);
  var terminalUrl = terminalPublicUrl_();
  var backendUrl = backendPublicUrl_();
  var sep = terminalUrl.indexOf('?') >= 0 ? '&' : '?';
  return {
    ok:true,
    launchUrl:terminalUrl + sep + 'backend=' + encodeURIComponent(backendUrl) + '&pair=' + encodeURIComponent(pairCode) + '&v=080'
  };
}

function getEnrollmentSessionStatus(sessionToken, code) {
  requireAdmin_(sessionToken);
  var row = findOne_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,function(r){return String(r.CODE)===String(code);});
  if (!row) return {ok:false,status:'NOT_FOUND'};
  var emp=getEmployeeById_(row.EMPLOYEE_ID);
  return {ok:true,status:String(row.STATUS||''),employeeId:String(row.EMPLOYEE_ID||''),fullName:emp?String(emp.FULL_NAME||''):'',usedAt:String(row.USED_AT||''),expiresAt:String(row.EXPIRES_AT||'')};
}

function listSchedules(sessionToken) {
  requireAdmin_(sessionToken);
  return sanitizeForClient_(rowsAsObjects_(DAVOMAT.SHEETS.SCHEDULES).filter(function(r){return normalizeBool_(r.ACTIVE);}).map(function(r){ delete r._row; return r; }));
}

function validateScheduleRow_(row) {
  var days = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  var re = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  days.forEach(function(k){
    var start = String(row[k + '_START'] || '');
    var end = String(row[k + '_END'] || '');
    if (!!start !== !!end) throw new Error('SCHEDULE_DAY_PAIR_REQUIRED_' + k);
    if (start && (!re.test(start) || !re.test(end) || start === end)) throw new Error('SCHEDULE_DAY_TIME_INVALID_' + k);
  });
  var lunchStart = String(row.LUNCH_START || '');
  var lunchEnd = String(row.LUNCH_END || '');
  if (!!lunchStart !== !!lunchEnd) throw new Error('LUNCH_PAIR_REQUIRED');
  if (lunchStart && (!re.test(lunchStart) || !re.test(lunchEnd) || lunchStart === lunchEnd)) throw new Error('LUNCH_TIME_INVALID');
  var grace = toNumber_(row.GRACE_MINUTES, 10);
  if (grace < 0 || grace > 180) throw new Error('GRACE_INVALID');
  row.GRACE_MINUTES = Math.round(grace);
  return row;
}

function saveSchedule(sessionToken, payload) {
  requireAdmin_(sessionToken);
  payload = payload || {};
  var id = String(payload.SCHEDULE_ID || payload.scheduleId || '').trim() || ('SCH-'+Utilities.formatDate(new Date(),DAVOMAT.TZ,'yyyyMMddHHmmss'));
  var existing = findOne_(DAVOMAT.SHEETS.SCHEDULES,function(r){return String(r.SCHEDULE_ID)===id;});
  var row = Object.assign({}, existing || {}, payload, {SCHEDULE_ID:id,ACTIVE:true,UPDATED_AT:nowIso_()});
  delete row._row;
  if (!row.NAME) throw new Error('SCHEDULE_NAME_REQUIRED');
  row = validateScheduleRow_(row);
  if (existing) updateRowObject_(DAVOMAT.SHEETS.SCHEDULES,existing._row,row); else appendObject_(DAVOMAT.SHEETS.SCHEDULES,row);
  audit_('admin',existing?'UPDATE':'CREATE','SCHEDULE',id,existing||{},row,'');
  return {ok:true,scheduleId:id};
}

function dateRange_(fromDate, toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) throw new Error('DATE_RANGE_INVALID');
  var start = new Date(fromDate + 'T12:00:00+05:00');
  var end = new Date(toDate + 'T12:00:00+05:00');
  if ((end.getTime() - start.getTime()) / 86400000 > 366) throw new Error('DATE_RANGE_TOO_LARGE');
  var out = [];
  for (var d = new Date(start.getTime()); d <= end; d = new Date(d.getTime() + 86400000)) out.push(dateKeyFromDate_(d));
  return out;
}

function virtualAttendanceStatus_(employee, dateKey) {
  var schRow = getScheduleById_(employee.SCHEDULE_ID);
  if (!schRow) return null;
  var sch = scheduleForDate_(schRow, dateKey);
  if (!sch.isWorkday) return null;
  var ended = dateKey < today_() || (dateKey === today_() && sch.end && new Date().getTime() > sch.end.getTime());
  return {
    DAILY_ID:dateKey + ':' + employee.EMPLOYEE_ID, DATE:dateKey, EMPLOYEE_ID:String(employee.EMPLOYEE_ID), SCHEDULE_ID:String(employee.SCHEDULE_ID),
    FIRST_IN:'', LAST_OUT:'', WORKED_MIN:0, LATE_MIN:0, EARLY_MIN:0, OVERTIME_MIN:0,
    ABSENT:ended, REQUIRES_REVIEW:false, STATUS:ended?'ABSENT':'PENDING', UPDATED_AT:''
  };
}

function getAttendanceReport(sessionToken, fromDate, toDate) {
  requireAdmin_(sessionToken);
  fromDate = String(fromDate || today_()); toDate = String(toDate || fromDate);
  var dates = dateRange_(fromDate, toDate);
  var employees = rowsAsObjects_(DAVOMAT.SHEETS.EMPLOYEES);
  var employeeMap = {}; employees.forEach(function(e){employeeMap[String(e.EMPLOYEE_ID)]=e;});
  var actual = rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE).filter(function(r){ var dk=dateKeyValue_(r.DATE); return dk>=fromDate && dk<=toDate; });
  var byKey = {}; actual.forEach(function(r){ byKey[dateKeyValue_(r.DATE)+':'+String(r.EMPLOYEE_ID)] = r; });
  var rows = actual.slice();

  dates.forEach(function(dateKey){
    employees.forEach(function(e){
      if (!normalizeBool_(e.ACTIVE)) return;
      var startDate = dateKeyValue_(e.START_DATE) || dateKeyValue_(e.CREATED_AT) || '0000-00-00';
      if (startDate && dateKey < startDate) return;
      var key = dateKey + ':' + String(e.EMPLOYEE_ID);
      if (byKey[key]) return;
      var virtual = virtualAttendanceStatus_(e,dateKey);
      if (virtual) { byKey[key]=virtual; rows.push(virtual); }
    });
  });

  rows = rows.map(function(r){
    var e=employeeMap[String(r.EMPLOYEE_ID)]||{};
    var out=Object.assign({},sanitizeForClient_(r),{FULL_NAME:e.FULL_NAME||'',POSITION:e.POSITION||''});
    if (out.STATUS === 'OPEN') {
      try {
        var schRow=getScheduleById_(out.SCHEDULE_ID), sch=scheduleForDate_(schRow,dateKeyValue_(out.DATE));
        if (sch.end && new Date().getTime() > sch.end.getTime()) { out.STATUS='REVIEW'; out.REQUIRES_REVIEW=true; }
      } catch(err) {}
    }
    return out;
  });
  rows.sort(function(a,b){ var c=dateKeyValue_(a.DATE).localeCompare(dateKeyValue_(b.DATE)); if(c) return c; return String(a.FULL_NAME).localeCompare(String(b.FULL_NAME)); });
  return rows;
}

function saveAdminSettings(sessionToken, payload) {
  requireAdmin_(sessionToken);
  payload = payload || {};
  var allowed = ['FACE_MATCH_THRESHOLD','LIVENESS_THRESHOLD','REALNESS_THRESHOLD','REQUIRE_ACTIVE_LIVENESS','ENROLL_SAMPLE_COUNT','MIN_EVENT_GAP_MINUTES','PHOTO_RETENTION_DAYS','TELEGRAM_CHAT_ID','LATE_ALERT_MINUTES','TERMINAL_PUBLIC_URL'];
  Object.keys(payload).forEach(function(k){
    if (k === 'TELEGRAM_BOT_TOKEN') {
      var token = String(payload[k] || '').trim();
      if (token && token !== '••••••••') setSecret_('TELEGRAM_BOT_TOKEN', token);
      return;
    }
    if (allowed.indexOf(k)>=0) setSetting_(k,String(payload[k]),'Updated from admin');
  });
  audit_('admin','UPDATE','SETTINGS','multiple',{},Object.keys(payload).filter(function(k){return k!=='TELEGRAM_BOT_TOKEN';}),'');
  return {ok:true};
}

function getAdminSettings(sessionToken) {
  requireAdmin_(sessionToken);
  var keys=['FACE_MATCH_THRESHOLD','LIVENESS_THRESHOLD','REALNESS_THRESHOLD','REQUIRE_ACTIVE_LIVENESS','ENROLL_SAMPLE_COUNT','MIN_EVENT_GAP_MINUTES','PHOTO_RETENTION_DAYS','TELEGRAM_CHAT_ID','LATE_ALERT_MINUTES','TERMINAL_PUBLIC_URL','DEVICE_ID'];
  var out={}; keys.forEach(function(k){out[k]=String(getSetting_(k,''));});
  out.TELEGRAM_BOT_TOKEN = getSecret_('TELEGRAM_BOT_TOKEN') ? '••••••••' : '';
  out.DEVICE_TOKEN_CONFIGURED = !!getSecret_(deviceSecretKey_(out.DEVICE_ID || 'terminal-01'));
  out.WEB_APP_URL = backendPublicUrl_();
  return out;
}


function getSystemDiagnostics(sessionToken) {
  requireAdmin_(sessionToken);
  function recent(sheetName,limit){
    var rows=rowsAsObjects_(sheetName);
    rows.sort(function(a,b){return new Date(b.UPDATED_AT||b.CREATED_AT||0).getTime()-new Date(a.UPDATED_AT||a.CREATED_AT||0).getTime();});
    return rows.slice(0,limit).map(function(r){var x=Object.assign({},r);delete x._row;return sanitizeForClient_(x);});
  }
  return {
    ok:true,version:DAVOMAT.VERSION,time:nowIso_(),
    devices:listDevices(sessionToken),
    recentSync:recent(DAVOMAT.SHEETS.SYNC_LOG,30),
    recentTelegram:recent(DAVOMAT.SHEETS.TELEGRAM_LOG,30),
    recentAudit:recent(DAVOMAT.SHEETS.ADMIN_AUDIT,50)
  };
}


/**
 * One round-trip bootstrap for the admin UI.
 * Keeps login fast by avoiding four sequential google.script.run calls.
 */
function getAdminAppData(sessionToken) {
  requireAdmin_(sessionToken);
  return {
    ok:true,
    version:DAVOMAT.VERSION,
    bootstrap:getAdminBootstrap(sessionToken),
    employees:listEmployees(sessionToken),
    schedules:listSchedules(sessionToken),
    settings:getAdminSettings(sessionToken),
    devices:listDevices(sessionToken)
  };
}


/**
 * v1.0.0: popup/opener RPC.
 * Camera stays on GitHub Pages. Apps Script remains the backend, but the external
 * terminal no longer embeds Apps Script in a third-party iframe. Instead it talks
 * to the Apps Script page that opened it via window.opener.postMessage().
 */
function terminalRequestWithConfiguredDevice_(req) {
  req = Object.assign({}, req || {});
  req.deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  req.deviceToken = getSecret_(deviceSecretKey_(req.deviceId));
  return terminalBridgeRequest(req);
}

function terminalAdminRequest(sessionToken, req) {
  requireAdmin_(sessionToken);
  return terminalRequestWithConfiguredDevice_(req);
}

function getTerminalHostKey_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('DAVOMAT_TERMINAL_HOST_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'').slice(0,16);
    props.setProperty('DAVOMAT_TERMINAL_HOST_KEY', key);
  }
  return key;
}

function terminalHostRequest(hostKey, req) {
  if (String(hostKey || '') !== String(getTerminalHostKey_())) throw new Error('TERMINAL_HOST_FORBIDDEN');
  return terminalRequestWithConfiguredDevice_(req);
}

function getTerminalHostUrl(sessionToken) {
  requireAdmin_(sessionToken);
  var base = String(ScriptApp.getService().getUrl() || backendPublicUrl_() || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:$|[?#])/.test(base)) {
    throw new Error('CURRENT_WEB_APP_URL_UNAVAILABLE');
  }
  return {
    ok:true,
    url:base + (base.indexOf('?') >= 0 ? '&' : '?') + 'terminal=1&k=' + encodeURIComponent(getTerminalHostKey_()),
    baseUrl:base,
    version:DAVOMAT.VERSION
  };
}

function terminalClientConfig_() {
  var deviceId = String(getSetting_('DEVICE_ID','terminal-01'));
  var deviceToken = getSecret_(deviceSecretKey_(deviceId));
  if (!deviceId || !deviceToken || !verifyDeviceToken_(deviceId, deviceToken)) throw new Error('DEVICE_TOKEN_INVALID');
  var backend = String(ScriptApp.getService().getUrl() || backendPublicUrl_() || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:$|[?#])/.test(backend)) throw new Error('CURRENT_WEB_APP_URL_UNAVAILABLE');
  return {url:backend, deviceId:deviceId, deviceToken:deviceToken, version:DAVOMAT.VERSION};
}

function base64WebSafeJson_(obj) {
  return Utilities.base64EncodeWebSafe(JSON.stringify(obj), Utilities.Charset.UTF_8).replace(/=+$/,'');
}

function terminalDirectUrl_(purpose, enrollmentCode) {
  var base = terminalPublicUrl_().replace(/[?#].*$/,'');
  var query = '?v=110&purpose=' + encodeURIComponent(String(purpose || 'attendance'));
  if (enrollmentCode) query += '&enroll=' + encodeURIComponent(String(enrollmentCode));
  return base + query + '#cfg=' + encodeURIComponent(base64WebSafeJson_(terminalClientConfig_()));
}

function redirectHtml_(title, targetUrl, fallbackText) {
  var safe = htmlEsc_(targetUrl);
  return '<!doctype html><html lang="uz-Cyrl"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>' + htmlEsc_(title) + '</title>' +
    '<style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#07101e;color:#fff}main{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(520px,92vw);background:#102039;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px;text-align:center}.btn{display:block;text-decoration:none;background:#3f75ef;color:#fff;padding:18px;border-radius:16px;font-weight:900;font-size:20px;margin-top:22px}.muted{color:#9fb0c8;line-height:1.5}</style></head><body><main><div class="card"><h1>DAVOMAT</h1><p class="muted">' + htmlEsc_(fallbackText || 'Терминал тайёр. Қуйидаги тугмани босинг.') + '</p><a class="btn" target="_top" rel="noopener" href="' + safe + '">DAVOMAT НИ ОЧИШ</a><p class="muted" style="margin-top:14px">Камера ишлаши учун терминал GitHub Pages да тўлиқ ойнада очилади.</p></div></main></body></html>';
}

function terminalHostHtml_(hostKey) {
  var expected = String(getTerminalHostKey_());
  if (String(hostKey || '') !== expected) {
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DAVOMAT</title></head><body style="font-family:Arial,sans-serif;padding:28px"><h2>DAVOMAT</h2><p>Терминал ҳаволаси нотўғри.</p></body></html>';
  }
  return redirectHtml_('DAVOMAT терминали', terminalDirectUrl_('attendance',''), 'Ишчи терминал очилмоқда…');
}

function enrollmentLauncherHtml_(sessionToken, employeeId) {
  requireAdmin_(String(sessionToken || ''));
  var r = createEnrollmentSessionCore_(String(employeeId || ''));
  return redirectHtml_('DAVOMAT — Юзни рўйхатга олиш', terminalDirectUrl_('enroll', r.code), (r.fullName || 'Ходим') + ' · камера очилмоқда…');
}

function htmlEsc_(v) {
  return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function exportAttendanceExcel(sessionToken, fromDate, toDate) {
  requireAdmin_(sessionToken);
  var rows = getAttendanceReport(sessionToken,fromDate,toDate);
  var ss = SpreadsheetApp.create('DAVOMAT_' + fromDate + '_' + toDate);
  var sh = ss.getSheets()[0]; sh.setName('Davomat');
  var headers=['DATE','FULL_NAME','POSITION','FIRST_IN','LAST_OUT','WORKED_MIN','LATE_MIN','EARLY_MIN','OVERTIME_MIN','ABSENT','REQUIRES_REVIEW','STATUS'];
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  if(rows.length) sh.getRange(2,1,rows.length,headers.length).setValues(rows.map(function(r){return headers.map(function(h){return r[h]==null?'':r[h];});}));
  sh.autoResizeColumns(1,headers.length);
  var id=ss.getId();
  return {ok:true,spreadsheetUrl:ss.getUrl(),xlsxUrl:'https://docs.google.com/spreadsheets/d/'+id+'/export?format=xlsx'};
}

/* ==================== Api.gs ==================== */
/** Cross-origin Face Terminal bridge. Reads use JSONP; writes use no-cors text/plain POST + polling. */
function parsePostPayload_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw && e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
  if (!raw) throw new Error('EMPTY_REQUEST');
  try { return JSON.parse(raw); } catch(err) { throw new Error('INVALID_JSON'); }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonpOutput_(callback, obj) {
  callback = String(callback || 'callback');
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) throw new Error('CALLBACK_INVALID');
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function recordRequest_(requestId, deviceId, action, status, result, message) {
  var found = findOne_(DAVOMAT.SHEETS.SYNC_LOG, function(r){ return String(r.REQUEST_ID) === String(requestId); });
  var patch = {
    REQUEST_ID:requestId, DEVICE_ID:deviceId || '', ACTION:action || '', STATUS:status,
    RESULT_JSON:result ? safeJson_(result) : '', MESSAGE:message || '', UPDATED_AT:nowIso_()
  };
  if (found) updateRowObject_(DAVOMAT.SHEETS.SYNC_LOG, found._row, patch);
  else { patch.CREATED_AT = nowIso_(); appendObject_(DAVOMAT.SHEETS.SYNC_LOG, patch); }
}

function requestStatusCacheKey_(deviceId,requestId){return 'davomat:req:'+String(deviceId)+':'+String(requestId);}
function cacheRequestStatus_(requestId,deviceId,action,status,result,message){var payload={requestId:String(requestId),deviceId:String(deviceId||''),action:String(action||''),status:String(status||''),result:result||null,message:String(message||''),updatedAt:nowIso_()};CacheService.getScriptCache().put(requestStatusCacheKey_(deviceId,requestId),JSON.stringify(payload),300);return payload;}
function getCachedRequestStatus_(requestId,deviceId){var raw=CacheService.getScriptCache().get(requestStatusCacheKey_(deviceId,requestId));if(!raw)return null;try{return JSON.parse(raw);}catch(e){return null;}}
function finalRequestStatusFromSheet_(requestId,deviceId){var row=findOne_(DAVOMAT.SHEETS.SYNC_LOG,function(r){return String(r.REQUEST_ID)===String(requestId)&&String(r.DEVICE_ID)===String(deviceId);});if(!row)return null;var result=null;try{result=row.RESULT_JSON?JSON.parse(String(row.RESULT_JSON)):null;}catch(err){}return {requestId:String(requestId),deviceId:String(deviceId),action:String(row.ACTION||''),status:String(row.STATUS||''),result:result,message:String(row.MESSAGE||''),updatedAt:String(row.UPDATED_AT||'')};}

function terminalApiGet_(params) {
  var api = String(params.api || '');
  if (api === 'health') return {ok:true, service:'DAVOMAT', time:nowIso_(), version:DAVOMAT.VERSION};

  if (api === 'provision') {
    var pair = consumeTerminalPairingCode_(params.pair_code || params.pair || '');
    if (!pair) return {ok:false,error:'PAIRING_CODE_INVALID'};
    var deviceIdPair = String(pair.deviceId || getSetting_('DEVICE_ID','terminal-01'));
    var deviceTokenPair = getSecret_(deviceSecretKey_(deviceIdPair));
    if (!deviceTokenPair || !verifyDeviceToken_(deviceIdPair, deviceTokenPair)) return {ok:false,error:'DEVICE_TOKEN_INVALID'};
    return {
      ok:true,
      backendUrl:backendPublicUrl_(),
      deviceId:deviceIdPair,
      deviceToken:deviceTokenPair,
      version:DAVOMAT.VERSION
    };
  }

  var deviceId = String(params.device_id || params.deviceId || '');
  var token = String(params.device_token || params.deviceToken || '');
  if (!verifyDeviceToken_(deviceId, token)) return {ok:false,error:'DEVICE_AUTH_FAILED'};

  if (api === 'bootstrap') {
    var employees = findAll_(DAVOMAT.SHEETS.EMPLOYEES, function(r){ return normalizeBool_(r.ACTIVE) && String(r.FACE_STATUS) === 'READY'; });
    var employeeMap = {};
    employees.forEach(function(e){ employeeMap[String(e.EMPLOYEE_ID)] = {employeeId:String(e.EMPLOYEE_ID),fullName:String(e.FULL_NAME),position:String(e.POSITION||'')}; });
    var profiles = findAll_(DAVOMAT.SHEETS.FACE_PROFILES, function(r){ return normalizeBool_(r.ACTIVE) && !!employeeMap[String(r.EMPLOYEE_ID)]; }).map(function(r){
      var embedding = [];
      try { embedding = JSON.parse(String(r.EMBEDDING_JSON || '[]')); } catch(err) { embedding = []; }
      return {profileId:String(r.PROFILE_ID),employeeId:String(r.EMPLOYEE_ID),embedding:embedding,quality:toNumber_(r.QUALITY_SCORE,0),pose:String(r.POSE_LABEL||'')};
    }).filter(function(p){ return Array.isArray(p.embedding) && p.embedding.length > 0; });
    return {
      ok:true, version:DAVOMAT.VERSION, employees:Object.keys(employeeMap).map(function(k){return employeeMap[k];}), profiles:profiles,
      settings:{
        matchThreshold:toNumber_(getSetting_('FACE_MATCH_THRESHOLD',0.62),0.62),
        livenessThreshold:toNumber_(getSetting_('LIVENESS_THRESHOLD',0.55),0.55),
        realnessThreshold:toNumber_(getSetting_('REALNESS_THRESHOLD',0.55),0.55),
        requireActiveLiveness:String(getSetting_('REQUIRE_ACTIVE_LIVENESS','true')).toLowerCase()==='true',
        enrollSampleCount:toNumber_(getSetting_('ENROLL_SAMPLE_COUNT',7),7),
        minEventGapMinutes:toNumber_(getSetting_('MIN_EVENT_GAP_MINUTES',2),2)
      },
      todayStates:(function(){
        var map={};
        rowsAsObjects_(DAVOMAT.SHEETS.ATTENDANCE).filter(function(r){return dateKeyValue_(r.DATE)===today_();}).forEach(function(r){map[String(r.EMPLOYEE_ID)]={status:String(r.STATUS||''),firstIn:String(r.FIRST_IN||''),lastOut:String(r.LAST_OUT||'')};});
        return map;
      })()
    };
  }

  if (api === 'requestStatus') {
    var requestId = String(params.request_id || params.requestId || '');
    var state = getCachedRequestStatus_(requestId, deviceId) || finalRequestStatusFromSheet_(requestId, deviceId);
    if (!state) return {ok:true, found:false, status:'PENDING'};
    return {ok:true, found:true, status:String(state.status||'PENDING'), result:state.result||null, message:String(state.message||'')};
  }

  if (api === 'pendingEnrollment') {
    var rowsPending = rowsAsObjects_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS)
      .filter(function(r){ return String(r.STATUS)==='OPEN' && (!r.DEVICE_ID || String(r.DEVICE_ID)===deviceId); })
      .sort(function(a,b){ return new Date(b.CREATED_AT).getTime()-new Date(a.CREATED_AT).getTime(); });
    for (var pi=0; pi<rowsPending.length; pi++) {
      var pr=rowsPending[pi];
      if (new Date(pr.EXPIRES_AT).getTime() < Date.now()) { updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS,pr._row,{STATUS:'EXPIRED'}); continue; }
      var pe=getEmployeeById_(pr.EMPLOYEE_ID);
      if (!pe) continue;
      return {ok:true,pending:true,code:String(pr.CODE),employee:{employeeId:String(pe.EMPLOYEE_ID),fullName:String(pe.FULL_NAME),position:String(pe.POSITION||'')}};
    }
    return {ok:true,pending:false};
  }

  if (api === 'enrollment') {
    var code = String(params.code || '');
    var rowEnroll = findOne_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS, function(r){ return String(r.CODE) === code && String(r.STATUS) === 'OPEN'; });
    if (!rowEnroll) return {ok:false,error:'ENROLLMENT_CODE_NOT_FOUND'};
    if (rowEnroll.DEVICE_ID && String(rowEnroll.DEVICE_ID) !== deviceId) return {ok:false,error:'ENROLLMENT_DEVICE_MISMATCH'};
    if (new Date(rowEnroll.EXPIRES_AT).getTime() < Date.now()) {
      updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS, rowEnroll._row, {STATUS:'EXPIRED'});
      return {ok:false,error:'ENROLLMENT_CODE_EXPIRED'};
    }
    var emp = getEmployeeById_(rowEnroll.EMPLOYEE_ID);
    if (!emp) return {ok:false,error:'EMPLOYEE_NOT_FOUND'};
    return {ok:true, code:code, employee:{employeeId:String(emp.EMPLOYEE_ID),fullName:String(emp.FULL_NAME),position:String(emp.POSITION||'')}};
  }

  return {ok:false,error:'API_NOT_FOUND'};
}


/**
 * Supported browser bridge for the external HTTPS Face Terminal.
 * The GitHub Pages terminal talks to a tiny Apps Script iframe with postMessage;
 * the iframe then uses google.script.run. This avoids CORS/JSONP/redirect issues.
 */
function terminalBridgeRequest(req) {
  req = req || {};
  var api = String(req.api || req.action || '');
  var deviceId = String(req.deviceId || req.device_id || '');
  var token = String(req.deviceToken || req.device_token || '');

  if (api === 'health') return {ok:true, service:'DAVOMAT', version:DAVOMAT.VERSION, time:nowIso_()};
  if (!verifyDeviceToken_(deviceId, token)) return {ok:false, error:'DEVICE_AUTH_FAILED'};

  if (api === 'bootstrap' || api === 'pendingEnrollment' || api === 'enrollment' || api === 'requestStatus') {
    var params = Object.assign({}, req.params || {});
    params.api = api;
    params.device_id = deviceId;
    params.device_token = token;
    if (req.code != null) params.code = req.code;
    if (req.requestId != null) params.request_id = req.requestId;
    return terminalApiGet_(params);
  }

  if (api === 'attendance' || api === 'enroll' || api === 'ping') {
    var payload = Object.assign({}, req.payload || {});
    payload.action = api;
    payload.deviceId = deviceId;
    payload.deviceToken = token;
    if (!payload.requestId) payload.requestId = String(req.requestId || uuid_());
    var ack = terminalApiPost_(payload);
    if (!ack || !ack.ok) return ack || {ok:false,error:'SERVER_ERROR'};
    var status = terminalApiGet_({api:'requestStatus', request_id:ack.requestId, device_id:deviceId, device_token:token});
    if (!status || !status.found) return {ok:false,error:'REQUEST_RESULT_NOT_FOUND'};
    if (status.status === 'ERROR') return status.result || {ok:false,error:status.message || 'SERVER_ERROR'};
    return status.result || {ok:true};
  }

  return {ok:false,error:'API_NOT_FOUND'};
}

function terminalBridgeHtml_(nonce) {
  nonce = String(nonce || '');
  var allowedOrigin = 'https://toxayusuf.github.io';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body>' +
    '<script>' +
    '(function(){' +
      '"use strict";' +
      'var NONCE=' + JSON.stringify(nonce) + ';' +
      'var ALLOWED=' + JSON.stringify(allowedOrigin) + ';' +
      'function send(target,origin,obj){try{target.postMessage(obj,origin);}catch(e){}}' +
      'window.addEventListener("message",function(ev){' +
        'if(ev.origin!==ALLOWED)return;' +
        'var m=ev.data||{};' +
        'if(m.channel!=="DAVOMAT_BRIDGE"||m.nonce!==NONCE||!m.id)return;' +
        'google.script.run.withSuccessHandler(function(r){send(ev.source,ev.origin,{channel:"DAVOMAT_BRIDGE",nonce:NONCE,id:m.id,ok:true,result:r});})' +
          '.withFailureHandler(function(err){send(ev.source,ev.origin,{channel:"DAVOMAT_BRIDGE",nonce:NONCE,id:m.id,ok:false,error:String((err&&err.message)||err||"SERVER_ERROR")});})' +
          '.terminalBridgeRequest(m.request||{});' +
      '});' +
      'send(top,ALLOWED,{channel:"DAVOMAT_BRIDGE",nonce:NONCE,type:"ready"});' +
    '})();' +
    '<\/script></body></html>';
}

function terminalApiPost_(payload) {
  payload=payload||{};
  var action=String(payload.action||''), requestId=String(payload.requestId||payload.request_id||uuid_()), deviceId=String(payload.deviceId||''), token=String(payload.deviceToken||'');
  if(!verifyDeviceToken_(deviceId,token)){var authErr={ok:false,error:'DEVICE_AUTH_FAILED'};cacheRequestStatus_(requestId,deviceId,action,'ERROR',authErr,'DEVICE_AUTH_FAILED');recordRequest_(requestId,deviceId,action,'ERROR',authErr,'DEVICE_AUTH_FAILED');return {ok:false,error:'DEVICE_AUTH_FAILED',requestId:requestId};}
  var existing=getCachedRequestStatus_(requestId,deviceId)||finalRequestStatusFromSheet_(requestId,deviceId);
  if(existing&&(existing.status==='DONE'||existing.status==='ERROR'))return {ok:existing.status==='DONE',requestId:requestId,error:existing.status==='ERROR'?(existing.message||'REQUEST_FAILED'):undefined};
  cacheRequestStatus_(requestId,deviceId,action,'PROCESSING',null,'');
  try{
    var result;
    if(action==='attendance'){
      var accepted=processAttendanceEvent_(payload);result=publicAttendanceResult_(accepted);
      cacheRequestStatus_(requestId,deviceId,action,'DONE',result,'');recordRequest_(requestId,deviceId,action,'DONE',result,'');
      finalizeAttendancePostCommit_(accepted,payload);
      return {ok:true,requestId:requestId};
    }
    if(action==='enroll')result=saveEnrollmentPayload_(payload);else if(action==='ping')result={ok:true,time:nowIso_()};else throw new Error('ACTION_NOT_SUPPORTED');
    cacheRequestStatus_(requestId,deviceId,action,'DONE',result,'');recordRequest_(requestId,deviceId,action,'DONE',result,'');return {ok:true,requestId:requestId};
  }catch(err){var errorResult={ok:false,error:String(err&&err.message?err.message:err)};cacheRequestStatus_(requestId,deviceId,action,'ERROR',errorResult,errorResult.error);recordRequest_(requestId,deviceId,action,'ERROR',errorResult,errorResult.error);return {ok:false,requestId:requestId,error:errorResult.error};}
}

function saveEnrollmentPayload_(payload) {
  var code = String(payload.enrollmentCode || '');
  var row = findOne_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS, function(r){ return String(r.CODE) === code && String(r.STATUS) === 'OPEN'; });
  if (!row) throw new Error('ENROLLMENT_CODE_NOT_FOUND');
  if (row.DEVICE_ID && String(row.DEVICE_ID) !== String(payload.deviceId)) throw new Error('ENROLLMENT_DEVICE_MISMATCH');
  if (new Date(row.EXPIRES_AT).getTime() < Date.now()) throw new Error('ENROLLMENT_CODE_EXPIRED');
  var employee = getEmployeeById_(row.EMPLOYEE_ID);
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  var samples = Array.isArray(payload.samples) ? payload.samples : [];
  if (samples.length < 6 || samples.length > 20) throw new Error('ENROLLMENT_SAMPLE_COUNT');
  var requireActive = String(getSetting_('REQUIRE_ACTIVE_LIVENESS','true')).toLowerCase() === 'true';
  var blinkOk = payload.blinkOk === true || String(payload.blinkOk) === 'true';
  if (requireActive && !blinkOk) throw new Error('ENROLLMENT_LIVENESS_REQUIRED');
  var minLive = toNumber_(getSetting_('LIVENESS_THRESHOLD',0.55),0.55);
  var minReal = toNumber_(getSetting_('REALNESS_THRESHOLD',0.55),0.55);
  var valid = samples.filter(function(s){
    return Array.isArray(s.embedding) && s.embedding.length >= 128 &&
      toNumber_(s.liveness,0) >= minLive && toNumber_(s.real,0) >= minReal;
  });
  if (valid.length < 6) throw new Error('ENROLLMENT_EMBEDDINGS_INVALID');

  var existing = findAll_(DAVOMAT.SHEETS.FACE_PROFILES, function(r){ return String(r.EMPLOYEE_ID) === String(employee.EMPLOYEE_ID) && normalizeBool_(r.ACTIVE); });
  existing.forEach(function(r){ updateRowObject_(DAVOMAT.SHEETS.FACE_PROFILES, r._row, {ACTIVE:false}); });
  valid.forEach(function(s, idx){
    appendObject_(DAVOMAT.SHEETS.FACE_PROFILES, {
      PROFILE_ID:uuid_(), EMPLOYEE_ID:String(employee.EMPLOYEE_ID), EMBEDDING_JSON:JSON.stringify(s.embedding),
      QUALITY_SCORE:toNumber_(s.quality,0), POSE_LABEL:String(s.pose || ('sample-'+(idx+1))), CREATED_AT:nowIso_(), ACTIVE:true
    });
  });
  updateRowObject_(DAVOMAT.SHEETS.EMPLOYEES, employee._row, {FACE_STATUS:'READY',UPDATED_AT:nowIso_()});
  updateRowObject_(DAVOMAT.SHEETS.ENROLLMENT_SESSIONS, row._row, {STATUS:'USED',USED_AT:nowIso_()});
  audit_('terminal:'+payload.deviceId,'FACE_ENROLL','EMPLOYEE',String(employee.EMPLOYEE_ID),{}, {profiles:valid.length}, 'Face enrollment');
  return {ok:true,status:'ENROLLED',employeeId:String(employee.EMPLOYEE_ID),fullName:String(employee.FULL_NAME),profiles:valid.length};
}

/* ==================== Tests.gs ==================== */
/** Non-destructive smoke tests. Run runDavomatSmokeTests() after setup. */
function runDavomatSmokeTests() {
  var checks = [];
  function check(name, fn) {
    try { var detail = fn(); checks.push({name:name,ok:true,detail:detail==null?'OK':detail}); }
    catch(err) { checks.push({name:name,ok:false,detail:String(err && err.message ? err.message : err)}); }
  }
  check('Spreadsheet configured', function(){ return getSpreadsheet_().getId(); });
  Object.keys(DAVOMAT.HEADERS).forEach(function(k){ check('Sheet '+DAVOMAT.SHEETS[k], function(){ return getSheet_(DAVOMAT.SHEETS[k]).getName(); }); });
  check('Photo folder', function(){ var id=photoFolderId_(); if(!id)throw new Error('missing'); var configured=String(getSetting_('PHOTO_FOLDER_ID','')||'').trim(); if(configured && id!==configured)throw new Error('folder id mismatch'); return DriveApp.getFolderById(id).getName(); });
  check('Default schedule', function(){ var s=getScheduleById_('SCH-DEFAULT'); if(!s)throw new Error('missing'); return s.NAME; });
  check('Device token', function(){ var id=String(getSetting_('DEVICE_ID','')); var token=getSecret_(deviceSecretKey_(id)); if(!id||!token)throw new Error('missing'); if(!verifyDeviceToken_(id,token))throw new Error('invalid'); return id; });
  check('Schedule Friday off', function(){ var s=getScheduleById_('SCH-DEFAULT'); var friday='2026-09-18'; var d=scheduleForDate_(s,friday); if(d.isWorkday)throw new Error('Friday must be off in default schedule'); return 'off'; });
  check('Schedule Monday work', function(){ var s=getScheduleById_('SCH-DEFAULT'); var monday='2026-09-14'; var d=scheduleForDate_(s,monday); if(!d.isWorkday)throw new Error('Monday must be workday'); return formatDateTime_(d.start)+'..'+formatDateTime_(d.end); });
  check('Date helper previous day', function(){ var prev=previousDateKey_('2026-09-21'); if(prev!=='2026-09-20')throw new Error('expected 2026-09-20, got '+prev); return prev; });
  check('Rapid opposite attendance mark', function(){ var original=acceptedEventsForEmployeeDate_; try { acceptedEventsForEmployeeDate_=function(){return [{EVENT_TYPE:'IN',EVENT_AT:'2026-09-21T09:31:16+05:00'}];}; var n=getNextEventType_('TEST','2026-09-21',new Date('2026-09-21T09:31:30+05:00'),'OUT'); if(n.type!=='OUT')throw new Error('OUT blocked after IN'); return 'IN->OUT allowed'; } finally { acceptedEventsForEmployeeDate_=original; } });
  check('Schema headers current', function(){ Object.keys(DAVOMAT.HEADERS).forEach(function(k){ var sh=getSheet_(DAVOMAT.SHEETS[k]); var got=sh.getRange(1,1,1,DAVOMAT.HEADERS[k].length).getValues()[0].map(String); if(JSON.stringify(got)!==JSON.stringify(DAVOMAT.HEADERS[k])) throw new Error('headers '+DAVOMAT.SHEETS[k]); }); return 'ok'; });
  var failed = checks.filter(function(x){return !x.ok;});
  var result = {ok:failed.length===0,checks:checks,failed:failed.length,time:nowIso_()};
  Logger.log(JSON.stringify(result,null,2));
  return result;
}

/* ==================== Code.gs ==================== */
/** Web entry points. Admin/launchers are HtmlService; Face Terminal uses JSONP + no-cors POST API. */
function doGet(e) {
  ensureSchemaCurrent_(false);
  var p = e && e.parameter ? e.parameter : {};
  if (String(p.launchEnroll || '') === '1') {
    try {
      return HtmlService.createHtmlOutput(enrollmentLauncherHtml_(p.session || '', p.employee || ''))
        .setTitle('DAVOMAT — Юзни рўйхатга олиш')
        .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
    } catch (err) {
      return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial;padding:28px"><h2>DAVOMAT</h2><p>Рўйхатга олишни бошлаб бўлмади.</p><p>'+htmlEsc_(String(err && err.message ? err.message : err))+'</p></body></html>');
    }
  }
  if (String(p.terminal || '') === '1') {
    return HtmlService.createHtmlOutput(terminalHostHtml_(p.k || ''))
      .setTitle('DAVOMAT терминали')
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  if (String(p.bridge || '') === '1') {
    return HtmlService.createHtmlOutput(terminalBridgeHtml_(p.nonce || ''))
      .setTitle('DAVOMAT Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  if (p.api) {
    var result;
    try { result = terminalApiGet_(p); } catch(err) { result = {ok:false,error:String(err && err.message ? err.message : err)}; }
    if (p.callback) return jsonpOutput_(p.callback,result);
    return jsonOutput_(result);
  }
  var tpl = HtmlService.createTemplateFromFile('Admin');
  tpl.version = DAVOMAT.VERSION;
  tpl.backendUrl = backendPublicUrl_();
  return tpl.evaluate().setTitle('DAVOMAT — Админ').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}

function doPost(e) {
  try { ensureSchemaCurrent_(false); return jsonOutput_(terminalApiPost_(parsePostPayload_(e))); }
  catch(err) { return jsonOutput_({ok:false,error:String(err && err.message ? err.message : err)}); }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}