(() => {
'use strict';

const VERSION = '1.3.1';
const CFG_KEY = 'davomat-terminal-config-v2';
const MODES = { inBtn:'IN', outBtn:'OUT', startEnrollBtn:'ENROLL' };

function embedded(){
  try { return window.self !== window.top; } catch { return true; }
}

window.__DAVOMAT_EMBEDDED__ = embedded();

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

function currentCfgEncoded(){
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return encodeCfg(raw);
  } catch {}
  try {
    const hp = new URLSearchParams(location.hash.slice(1));
    return hp.get('cfg') || '';
  } catch { return ''; }
}

function buildDirectUrl(mode){
  const u = new URL(window.location.href);
  u.searchParams.set('handoff', mode);
  u.searchParams.set('terminal_build', VERSION);
  const encoded = currentCfgEncoded();
  if (encoded) u.hash = 'cfg=' + encoded;
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
    toast.textContent = 'Камера очилмоқда…';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1800);
  }
}

function clockText(){
  try {
    const d = new Date();
    const clock = document.getElementById('idleClock');
    const date = document.getElementById('idleDate');
    if (clock) clock.textContent = new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'}).format(d);
    if (date) date.textContent = new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'long',year:'numeric'}).format(d);
  } catch {}
}

function activateEmbeddedLauncher(){
  if (!embedded()) return;

  // The Apps Script page is only a launcher. It must NEVER wait for server,
  // employee bootstrap or Face AI. Those belong to the top-level GitHub page.
  ['loadingView','setupView','cameraView','resultView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const idle = document.getElementById('idleView');
  if (idle) idle.classList.remove('hidden');

  const badge = document.getElementById('netBadge');
  if (badge) {
    badge.textContent = 'ТАЙЁР';
    badge.className = 'badge online';
  }

  const enroll = document.getElementById('enrollBanner');
  if (enroll) enroll.classList.add('hidden');

  updateVersion();
  clockText();
  if (!window.__DAVOMAT_LAUNCH_CLOCK__) {
    window.__DAVOMAT_LAUNCH_CLOCK__ = setInterval(clockText, 1000);
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
    if (attempts > 180) clearInterval(timer);
  }, 100);
}

// Capture clicks even if the heavy terminal bundle is unavailable.
document.addEventListener('click', interceptEmbeddedActions, true);

function ready(){
  updateVersion();
  activateEmbeddedLauncher();
  autoStartTopLevel();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else ready();
window.addEventListener('pageshow', ready);
})();