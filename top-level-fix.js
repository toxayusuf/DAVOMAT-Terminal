(() => {
'use strict';

const VERSION = '1.4.0';
const CFG_KEY = 'davomat-terminal-config-v2';
const MODES = { inBtn:'IN', outBtn:'OUT', startEnrollBtn:'ENROLL' };

function embedded(){
  try { return window.self !== window.top; } catch { return true; }
}

function params(){
  const p = new URLSearchParams(location.search);
  return {
    handoff:(p.get('handoff')||'').toUpperCase(),
    purpose:(p.get('purpose')||'attendance').toLowerCase(),
    enroll:(p.get('enroll')||'')
  };
}

const IS_EMBEDDED = embedded();
const INITIAL_PARAMS = params();
const IS_LIGHTWEIGHT_LAUNCHER = IS_EMBEDDED && !INITIAL_PARAMS.handoff && INITIAL_PARAMS.purpose !== 'enroll' && !INITIAL_PARAMS.enroll;

// Critical rule: only a real iframe is a launcher. A top-level GitHub terminal
// must remain a live terminal even after ?handoff=... is removed from the URL.
window.__DAVOMAT_EMBEDDED__ = IS_EMBEDDED;
window.__DAVOMAT_LAUNCHER_MODE__ = IS_LIGHTWEIGHT_LAUNCHER;

function updateVersion(){
  document.querySelectorAll('.brand span').forEach(el => {
    if ((el.textContent || '').includes('Юз терминали')) el.textContent = 'Юз терминали · v' + VERSION;
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

function openDirect(mode){
  const url = buildDirectUrl(mode);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
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

function forceLauncher(){
  if (!IS_LIGHTWEIGHT_LAUNCHER) return;

  ['loadingView','setupView','cameraView','resultView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const idle = document.getElementById('idleView');
  if (idle) idle.classList.remove('hidden');

  const badge = document.getElementById('netBadge');
  if (badge) {
    badge.textContent = navigator.onLine ? 'ТАЙЁР' : 'ОФЛАЙН';
    badge.className = 'badge ' + (navigator.onLine ? 'online' : 'offline');
  }

  const enroll = document.getElementById('enrollBanner');
  if (enroll) enroll.classList.add('hidden');

  updateVersion();
  clockText();
}

function interceptLauncherActions(ev){
  if (!IS_LIGHTWEIGHT_LAUNCHER) return;
  const target = ev.target && ev.target.closest ? ev.target.closest('button') : null;
  if (!target) return;
  const mode = MODES[target.id];
  if (!mode || mode === 'ENROLL') return;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  openDirect(mode);
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
  if (IS_EMBEDDED || window.__DAVOMAT_AUTOSTART_ACTIVE__) return;
  const p = params();
  const mode = p.handoff;
  if (!['IN','OUT','ENROLL'].includes(mode)) return;

  window.__DAVOMAT_AUTOSTART_ACTIVE__ = true;
  const id = mode === 'IN' ? 'inBtn' : mode === 'OUT' ? 'outBtn' : 'startEnrollBtn';
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    updateVersion();
    const btn = document.getElementById(id);
    const idle = document.getElementById('idleView');
    if (btn && idle && !idle.classList.contains('hidden') && !btn.disabled) {
      clearInterval(timer);
      btn.click();
      setTimeout(cleanHandoffParam, 600);
      return;
    }
    if (attempts > 300) {
      clearInterval(timer);
      window.__DAVOMAT_AUTOSTART_ACTIVE__ = false;
    }
  }, 100);
}

document.addEventListener('click', interceptLauncherActions, true);

function ready(){
  updateVersion();
  forceLauncher();
  autoStartTopLevel();

  if (IS_LIGHTWEIGHT_LAUNCHER && !window.__DAVOMAT_LAUNCH_CLOCK__) {
    window.__DAVOMAT_LAUNCH_CLOCK__ = setInterval(() => {
      forceLauncher();
      updateVersion();
    }, 500);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else ready();
window.addEventListener('pageshow', ready);
window.addEventListener('online', forceLauncher);
window.addEventListener('offline', forceLauncher);
})();