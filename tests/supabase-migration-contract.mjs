import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync(new URL('../supabase/migrations/202610040001_davomat.sql',import.meta.url),'utf8');
const README=fs.readFileSync(new URL('../supabase/README.md',import.meta.url),'utf8');
const expected=['settings','schedules','employees','admin_users','devices','face_profiles','enrollment_sessions','attendance_events','attendance_days','corrections','salary','request_log','audit_log','notification_log'];
for (const table of expected){
  assert.match(sql,new RegExp('create table if not exists public\\.davomat_'+table+'\\b'),'missing '+table);
}
assert.match(sql,/enable row level security/,'RLS missing');
assert.match(sql,/revoke all on public/,'restricted grants missing');
assert.match(sql,/davomat-photos/,'private photo bucket missing');
assert.match(sql,/values\('davomat-photos','davomat-photos',false/,'photo bucket must be private');
assert.doesNotMatch(sql,/revoke\s+all\s+on\s+storage\.objects/i,'must not revoke global Storage grants');
assert.doesNotMatch(sql,/(?:service_role|secret)\s*[:=]\s*['"](?:eyJ|sb_secret_)/i,'secret key in migration');
assert.match(README,/tohirjon\.uzb@gmail\.com ONLY/,'wrong owner account guard');
assert.match(README,/NO LIVE CUTOVER/,'rollout guard missing');
console.log('SUPABASE MIGRATION CONTRACT PASS');
console.log(JSON.stringify({tables:expected.length,privateBucket:true,ownerConfirmed:false},null,2));
