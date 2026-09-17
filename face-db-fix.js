(() => {
'use strict';

const CFG_KEY = 'davomat-terminal-config-v2';
const DB_NAME = 'davomat-fast-cache';
const DB_STORE = 'kv';
const BOOT_CACHE_KEY = 'bootstrap-v3';

let faceState = 'loading'; // loading | ready | empty | error | skip
let pendingActionId = '';
let checkPromise = null;
let enrollmentRedirectStarted = false;

function isTopLevel(){
  try { return window.self === window.top; } catch { return false; }
}

function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
}

function loadCfg(){
  try {
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (cfg && cfg.url && cfg.deviceId && cfg.deviceToken) return cfg;
  } catch {}
  return null;
}

function toast(text, ms=4500){
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}

function markEmptyUi(){
  ['inBtn','outBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.dataset.faceDbEmpty = '1';
    const sub = btn.querySelector('.action-sub');
    if (sub) sub.textContent = 'Аввал юзни рўйхатга олинг';
  });
}

function clearEmptyUi(){
  const labels = {inBtn:'Ишга кириш', outBtn:'Ишдан чиқиш'};
  Object.keys(labels).forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    delete btn.dataset.faceDbEmpty;
    const sub = btn.querySelector('.action-sub');
    if (sub) sub.textContent = labels[id];
  });
}

function showNoFaces(){
  markEmptyUi();
  toast('Face ID базасида фаол юз йўқ. Аввал «РЎЙХАТГА ОЛИШ» орқали ходим юзини сақланг.', 6500);
  const banner = document.getElementById('enrollBanner');
  if (banner && !banner.classList.contains('hidden')) {
    try { banner.scrollIntoView({behavior:'smooth', block:'center'}); } catch {}
  }
}

function jsonp(api, params={}, timeout=12000){
  return new Promise((resolve,reject) => {
    const cfg = loadCfg();
    if (!cfg) return reject(new Error('CONFIG_REQUIRED'));
    const cb = '__davomat_faceguard_' + uuid().replace(/[^A-Za-z0-9_$]/g,'');
    const script = document.createElement('script');
    let done = false;
    let timer = null;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { delete window[cb]; } catch { window[cb] = undefined; }
      try { script.remove(); } catch {}
    };
    window[cb] = data => { cleanup(); resolve(data); };
    const url = new URL(cfg.url);
    url.searchParams.set('api', api);
    url.searchParams.set('device_id', cfg.deviceId);
    url.searchParams.set('device_token', cfg.deviceToken);
    Object.keys(params).forEach(k => {
      const v = params[k];
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
    url.searchParams.set('callback', cb);
    url.searchParams.set('_', String(Date.now()));
    script.async = true;
    script.src = url.toString();
    script.onerror = () => { cleanup(); reject(new Error('NETWORK_ERROR')); };
    timer = setTimeout(() => { cleanup(); reject(new Error('TIMEOUT')); }, timeout);
    document.head.appendChild(script);
  });
}

async function checkFaceDb(){
  if (!isTopLevel()) {
    faceState = 'skip';
    return null;
  }
  if (checkPromise) return checkPromise;
  checkPromise = (async () => {
    try {
      const data = await jsonp('bootstrap', {}, 18000);
      if (!data?.ok) throw new Error(data?.error || 'BOOTSTRAP_FAILED');
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      const employees = Array.isArray(data.employees) ? data.employees : [];
      if (profiles.length > 0 && employees.length > 0) {
        faceState = 'ready';
        clearEmptyUi();
        if (pendingActionId) {
          const id = pendingActionId;
          pendingActionId = '';
          setTimeout(() => document.getElementById(id)?.click(), 0);
        }
      } else {
        faceState = 'empty';
        pendingActionId = '';
        showNoFaces();
      }
      return data;
    } catch (err) {
      console.warn('DAVOMAT face database guard', err);
      faceState = 'error';
      pendingActionId = '';
      return null;
    } finally {
      checkPromise = null;
    }
  })();
  return checkPromise;
}

function interceptAttendance(ev){
  if (!isTopLevel()) return;
  const btn = ev.target?.closest?.('#inBtn,#outBtn');
  if (!btn) return;

  if (faceState === 'ready' || faceState === 'error' || faceState === 'skip') return;

  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

  if (faceState === 'loading') {
    pendingActionId = btn.id;
    toast('Face ID базаси текширилмоқда…', 2200);
    checkFaceDb();
    return;
  }

  showNoFaces();
}

async function clearBootstrapCache(){
  try {
    await new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME,1);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(DB_STORE,'readwrite');
        tx.objectStore(DB_STORE).delete(BOOT_CACHE_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  } catch (err) {
    console.warn('DAVOMAT cache clear', err);
  }
}

async function enrollmentCompleted(){
  if (enrollmentRedirectStarted) return;
  enrollmentRedirectStarted = true;
  await clearBootstrapCache();
  try {
    localStorage.setItem('davomat-face-db-updated', String(Date.now()));
  } catch {}
  setTimeout(() => {
    const clean = location.origin + location.pathname + '?face_refresh=' + Date.now();
    location.replace(clean);
  }, 450);
}

function watchEnrollmentResult(){
  const title = document.getElementById('resultTitle');
  if (!title) return;
  const check = () => {
    if ((title.textContent || '').trim() === 'ЮЗ ТАЙЁР') enrollmentCompleted();
  };
  new MutationObserver(check).observe(title,{childList:true,subtree:true,characterData:true});
  check();
}

function bootGuard(){
  if (!isTopLevel()) {
    faceState = 'skip';
    return;
  }
  document.addEventListener('click', interceptAttendance, true);
  watchEnrollmentResult();
  setTimeout(checkFaceDb, 250);
  window.addEventListener('storage', ev => {
    if (ev.key === 'davomat-face-db-updated') {
      faceState = 'loading';
      setTimeout(checkFaceDb, 100);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootGuard, {once:true});
else bootGuard();
})();
