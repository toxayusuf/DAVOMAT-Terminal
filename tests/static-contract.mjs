import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const app=read('app.js'), index=read('index.html'), sw=read('sw.js'), code=read('apps-script/Code.gs'), admin=read('apps-script/Admin.html');

new Function(app);
new Function(sw.replace(/\bself\b/g,'globalThis.self'));
for (const m of admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new Function(m[1]);
new Function(code);

assert.equal((index.match(/app\.js/g)||[]).length,1,'index must load exactly one app.js');
assert(!/top-level-fix|face-db-fix/.test(index),'legacy hotfix runtime must not be referenced');
assert(index.includes('1.5.0-prod-20260918-1'),'index build id mismatch');
assert(sw.includes("VERSION='1.5.0-prod-20260918-1'"),'SW build id mismatch');
assert(sw.includes("fetch(event.request,{cache:'no-store'})"),'navigation must be network-first/no-store');
assert(!sw.includes('top-level-fix.js')&&!sw.includes('face-db-fix.js'),'SW must not cache dead hotfixes');

assert(app.includes('DB_VERSION = 2'),'IndexedDB migration version missing');
assert(app.includes("QUEUE_STORE = 'offlineQueue'"),'offline queue store missing');
assert(app.includes("DEAD_STORE = 'deadLetter'"),'dead-letter store missing');
assert(app.includes('QUEUE_MAX_RETRIES = 5'),'retry ceiling missing');
assert(app.includes('faces.length>1'),'multiple-face guard missing');
assert(app.includes('maxDetected:2'),'detector must allow multi-face detection');
assert(app.includes('S.hits<3'),'recognition must require consecutive matches');
assert(app.includes('await stopCamera();\n  showSaving'),'camera must stop before server wait');
assert(app.includes('await cacheDelete(BOOT_CACHE_KEY)'),'Face DB cache must be invalidated after enrollment');
assert(!app.includes('function qload()'),'localStorage queue must not be runtime queue');

assert(code.includes("VERSION: '1.5.0'"),'backend version mismatch');
assert(code.includes("var schemaVersion = '2026-09-18.1'"),'schema version mismatch');
assert(code.includes('function migrateSecrets_()'),'secret migration missing');
assert(code.includes("getSecret_('TELEGRAM_BOT_TOKEN')"),'Telegram secret must come from Script Properties');
assert(!code.includes("initialPin = '409874'"),'hardcoded recovery PIN forbidden');
assert(code.includes('CacheService.getScriptCache()'),'requestStatus cache missing');
assert(!code.includes("recordRequest_(requestId, deviceId, action, 'PROCESSING'"),'PROCESSING must not hit Sheets');
assert(code.includes('tryLock(3000)'),'critical lock must be bounded');
assert(code.includes('finalizeAttendancePostCommit_'),'post-commit processing missing');
assert(code.includes('attendanceBusinessDate_'),'overnight shift business date missing');
assert(code.includes('normalizeBool_(r.ACTIVE)'),'inactive employee guard missing');

const gasMethods=[...new Set([...admin.matchAll(/\bgas\(\s*['\"]([^'\"]+)['\"]/g)].map(m=>m[1]))];
const missing=gasMethods.filter(name=>!code.includes('function '+name+'('));
assert.deepEqual(missing,[],'Admin calls missing backend methods: '+missing.join(', '));
assert(!admin.includes('кейинги қадамда'),'unfinished UI placeholder found');
assert(!admin.includes('cfgDeviceToken'),'device secret must not render in admin');

console.log('STATIC CONTRACT PASS');
console.log(JSON.stringify({gasMethods:gasMethods.length,build:'1.5.0-prod-20260918-1'},null,2));
