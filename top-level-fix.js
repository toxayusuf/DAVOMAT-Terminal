(() => {
'use strict';

const VERSION = '1.2.1';
const CFG_KEY = 'davomat-terminal-config-v2';
const MODES = { inBtn:'IN', outBtn:'OUT', startEnrollBtn:'ENROLL' };

function embedded(){
  try { return window.self !== window.top; } catch { return true; }
}

function updateVersion(){
  document.querySelectorAll('.brand span').forEach(el => {
    if ((el.textContent || '').includes('Юз терминали')) {
      el.textContent = 'Юз терминали · v' + VERSION;
    }
  });
}

function encodeCfg(raw){
  try {
    const bytes = new TextEncoder().encode(raw);
    let bin='';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  } catch { return ''; }
}

function buildDirectUrl(mode){
  const u = new URL(window.location.href);
  u.searchParams.set('handoff', mode);
  u.searchParams.set('terminal_build', VERSION);

  // Third-party iframe storage can be partitioned (especially on iPhone/Safari).
  // Therefore carry the already-provisioned device config explicitly into the
  // new top-level GitHub page instead of relying on shared localStorage.
  try {
    const raw = localStorage.getItem(CFG_KEY);
    const encoded = raw ? encodeCfg(raw) : '';
    if (encoded) u.hash = 'cfg=' + encoded;
  } catch {}

  return u.toString();
}

function openTopLevel(mode){
  const url = buildDirectUrl(mode);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  const toast = document.querySelector('#toast');
  if (toast) {
    toast.textContent = 'Камера хавфсиз ойнада очилмоқда…';
    toast.classList.remove('hidden');
  }
}

function interceptEmbeddedActions(ev){
  if (!embedded()) return;
  const target = ev.target && ev.target.closest ? ev.target.closest('button') : null;
  if (!target) return;
  const mode = MODES[target.id];
  if (!mode) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  openTopLevel(mode);
}

function cleanHandoffParam(){
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('handoff');
    u.searchParams.delete('terminal_build');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  } catch {}
}

function autoStartTopLevel(){
  if (embedded()) return;
  const p = new URLSearchParams(location.search);
  const mode = (p.get('handoff') || '').toUpperCase();
  if (!['IN','OUT','ENROLL'].includes(mode)) return;
  cleanHandoffParam();

  const id = mode === 'IN' ? 'inBtn' : mode === 'OUT' ? 'outBtn' : 'startEnrollBtn';
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    const btn = document.getElementById(id);
    const idle = document.getElementById('idleView');
    if (btn && idle && !idle.classList.contains('hidden') && !btn.disabled) {
      clearInterval(timer);
      btn.click();
      return;
    }
    if (attempts > 150) clearInterval(timer);
  }, 200);
}

document.addEventListener('click', interceptEmbeddedActions, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateVersion();
    autoStartTopLevel();
  });
} else {
  updateVersion();
  autoStartTopLevel();
}

window.addEventListener('pageshow', updateVersion);
})();