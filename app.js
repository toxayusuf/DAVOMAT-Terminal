(() => {
'use strict';

const $ = s => document.querySelector(s);
const VERSION = '1.5.0';
const CFG_KEY = 'davomat-terminal-config-v2';
const Q_KEY = 'davomat-offline-queue-v2'; // legacy migration only
const DB_NAME = 'davomat-fast-cache';
const DB_VERSION = 2;
const DB_STORE = 'kv';
const QUEUE_STORE = 'offlineQueue';
const DEAD_STORE = 'deadLetter';
const BOOT_CACHE_KEY = 'bootstrap-v4';
const BOOT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const QUEUE_MAX_RETRIES = 5;
const MODEL = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/';
const HUMAN_LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js';

let dbPromise = null;

const S = {
  cfg: null, human: null, humanInit: null, humanLibInit: null, stream: null,
  profiles: [], employees: new Map(), thr: {match:.62, live:.55, real:.55}, samples: 6,
  pending: null, mode: null, retryMode: null, busy: false, running: false,
  hit: null, hits: 0, pollTimer: null, bootCacheUsed: false, challenge: null, sessionDeadline: 0,
  perf: {
    bootAt: performance.now(), bootstrapMs: 0, humanMs: 0, cameraMs: 0,
    saveMs: 0, photoMs: 0, photoBytes: 0, localAckMs: 0, polls: 0
  }
};

const MSG = {
  DEVICE_AUTH_FAILED:'Қурилма рухсати рад этилди', EMPLOYEE_NOT_FOUND:'Ходим топилмади',
  FACE_PROOF_LOW:'Юз текширувидан ўтмади', EVENT_TYPE_INVALID:'Нотўғри белги тури',
  EVENT_TYPE_MISMATCH:'Нотўғри тугма танланди', ALREADY_MARKED:'Белги аллақачон қабул қилинган. Бироз кутинг.',
  NETWORK_ERROR:'Интернет билан алоқа йўқ', TIMEOUT:'Сервер жавоб бермади',
  ENROLLMENT_CODE_NOT_FOUND:'Рўйхатга олиш вазифаси топилмади', ENROLLMENT_CODE_EXPIRED:'Рўйхатга олиш вақти тугади',
  ENROLLMENT_DEVICE_MISMATCH:'Рўйхатга олиш бошқа қурилма учун', ENROLL_FAILED:'Юзни сақлашда хато',
  CONFIG_REQUIRED:'DAVOMAT ни админкадаги «Телефон/планшетни улаш» орқали бир марта очинг',
  CAMERA_PERMISSION_DENIED:'Камерага рухсат берилмаган', CAMERA_UNAVAILABLE:'Камера топилмади ёки браузер камерани қўлламайди',
  CAMERA_INSECURE:'Камера фақат хавфсиз HTTPS саҳифада ишлайди'
};

const friendly = e => MSG[String(e?.message || e || '')] || String(e?.message || e || 'Номаълум хато');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
function ttime(d){return new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'}).format(d||new Date())}
function tdate(d){return new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'long',year:'numeric'}).format(d||new Date())}
function show(id){['loadingView','setupView','idleView','cameraView','resultView'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id))}
function toast(x,ms=2800){const e=$('#toast');e.textContent=x;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),ms)}
function instruction(a,b=''){$('#instruction').textContent=a;$('#subInstruction').textContent=b}
function net(){const b=$('#netBadge'),on=navigator.onLine;b.textContent=on?'ОНЛАЙН':'ОФЛАЙН';b.className='badge '+(on?'online':'offline')}
function updateVersion(){document.querySelectorAll('.brand span').forEach(el=>{if((el.textContent||'').includes('Юз терминали'))el.textContent='Юз терминали · v'+VERSION})}
function validCfg(c){return !!(c&&/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(String(c.url||''))&&c.deviceId&&c.deviceToken)}
function saveCfg(c){localStorage.setItem(CFG_KEY,JSON.stringify(c));S.cfg=c}
function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'null')}catch{return null}}
function launchParams(){const p=new URLSearchParams(location.search);return{purpose:(p.get('purpose')||'attendance').trim(),enroll:(p.get('enroll')||'').trim(),handoff:(p.get('handoff')||'').trim().toUpperCase()}}
function decodeCfgHash(){try{const p=new URLSearchParams(location.hash.slice(1)),raw=p.get('cfg');if(!raw)return null;let x=raw.replace(/-/g,'+').replace(/_/g,'/');x+='='.repeat((4-x.length%4)%4);const text=new TextDecoder().decode(Uint8Array.from(atob(x),ch=>ch.charCodeAt(0))),cfg=JSON.parse(text);return validCfg(cfg)?cfg:null}catch(e){console.warn('cfg hash',e);return null}}
function importLaunchConfig(){const cfg=decodeCfgHash();if(cfg){saveCfg(cfg);try{history.replaceState(null,'',location.pathname+location.search)}catch{}}}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){dbPromise=null;reject(new Error('NO_IDB'));return}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);
      if(!db.objectStoreNames.contains(QUEUE_STORE)){
        const q=db.createObjectStore(QUEUE_STORE,{keyPath:'id'});
        q.createIndex('createdAt','createdAt',{unique:false});
        q.createIndex('status','status',{unique:false});
      }
      if(!db.objectStoreNames.contains(DEAD_STORE))db.createObjectStore(DEAD_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{dbPromise=null;reject(req.error||new Error('IDB_ERROR'))};
    req.onblocked=()=>console.warn('DAVOMAT IndexedDB upgrade blocked by another tab');
  });
  return dbPromise;
}
async function cacheGet(key){try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly'),req=tx.objectStore(DB_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}catch{return null}}
async function cacheSet(key,value){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}catch{}}
async function cacheDelete(key){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}catch{}}
async function queuePut(ev){
  const db=await openDb();
  const row=Object.assign({id:ev.id||ev.eventId||ev.requestId||uuid(),status:'PENDING',retryCount:0,createdAt:Date.now(),nextAttemptAt:0,lastError:''},ev);
  row.id=String(row.id);
  await new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite');tx.objectStore(QUEUE_STORE).put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
  return row;
}
async function queueAll(){
  try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readonly'),req=tx.objectStore(QUEUE_STORE).getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)));req.onerror=()=>reject(req.error)})}catch{return[]}
}
async function queueDelete(id){
  const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(QUEUE_STORE,'readwrite');tx.objectStore(QUEUE_STORE).delete(String(id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
async function queueMoveDead(ev,error){
  const db=await openDb(),row=Object.assign({},ev,{status:'DEAD',lastError:String(error||ev.lastError||'UNKNOWN'),deadAt:Date.now()});
  await new Promise((resolve,reject)=>{const tx=db.transaction([QUEUE_STORE,DEAD_STORE],'readwrite');tx.objectStore(DEAD_STORE).put(row);tx.objectStore(QUEUE_STORE).delete(String(row.id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
async function queueCount(){return (await queueAll()).length}
async function deadCount(){
  try{const db=await openDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(DEAD_STORE,'readonly'),req=tx.objectStore(DEAD_STORE).count();req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>reject(req.error)})}catch{return 0}
}
async function migrateLegacyQueue(){
  let legacy=[];try{legacy=JSON.parse(localStorage.getItem(Q_KEY)||'[]')}catch{}
  if(Array.isArray(legacy)&&legacy.length){
    for(const ev of legacy){try{await queuePut(Object.assign({},ev,{id:ev.id||ev.eventId||ev.requestId||uuid(),migratedFrom:'localStorage'}))}catch(e){console.warn('legacy queue migration',e)}}
  }
  try{localStorage.removeItem(Q_KEY)}catch{}
}

function jsonp(api,params={},timeout=12000){
  return new Promise((resolve,reject)=>{
    if(!S.cfg)return reject(new Error('CONFIG_REQUIRED'));
    const cb='__davomat_cb_'+uuid().replace(/[^A-Za-z0-9_$]/g,''),s=document.createElement('script');
    let done=false,timer=null;
    const cleanup=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);try{delete window[cb]}catch{window[cb]=undefined}try{s.remove()}catch{}};
    window[cb]=data=>{cleanup();resolve(data)};
    const u=new URL(S.cfg.url);
    u.searchParams.set('api',api);u.searchParams.set('device_id',S.cfg.deviceId);u.searchParams.set('device_token',S.cfg.deviceToken);
    Object.keys(params||{}).forEach(k=>{const v=params[k];if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v))});
    u.searchParams.set('callback',cb);u.searchParams.set('_',String(Date.now()));
    s.async=true;s.src=u.toString();s.onerror=()=>{cleanup();reject(new Error('NETWORK_ERROR'))};
    timer=setTimeout(()=>{cleanup();reject(new Error('TIMEOUT'))},timeout);document.head.appendChild(s);
  });
}

async function postAndWait(action,payload,timeout=60000){
  if(!S.cfg)throw new Error('CONFIG_REQUIRED');
  const requestId=payload.requestId||payload.request_id||uuid();
  const body=Object.assign({},payload,{action,requestId,deviceId:S.cfg.deviceId,deviceToken:S.cfg.deviceToken});
  let sendError=null;
  const sendPromise=fetch(S.cfg.url,{method:'POST',mode:'no-cors',redirect:'follow',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body)}).catch(e=>{sendError=e});
  const started=Date.now(),delays=[120,180,280,450,700,1000,1500];let n=0;
  while(Date.now()-started<timeout){
    const delay=delays[Math.min(n,delays.length-1)]+Math.floor(Math.random()*60);
    await sleep(delay);n++;S.perf.polls=n;
    try{
      const r=await jsonp('requestStatus',{request_id:requestId},8000);
      if(r?.found){
        if(r.status==='DONE')return r.result||{ok:true};
        if(r.status==='ERROR')throw new Error(r.result?.error||r.message||'SERVER_ERROR');
      }
    }catch(e){if(e?.message!=='TIMEOUT'&&e?.message!=='NETWORK_ERROR')throw e}
    if(sendError&&!navigator.onLine)throw new Error('NETWORK_ERROR');
  }
  await sendPromise;
  if(sendError)throw new Error('NETWORK_ERROR');
  throw new Error('TIMEOUT');
}
function retryableQueueError(err){
  const code=String(err?.message||err||'');
  return ['NETWORK_ERROR','TIMEOUT','SERVER_BUSY_RETRY','REQUEST_RESULT_NOT_FOUND'].includes(code);
}
async function syncQueue(){
  if(!navigator.onLine||!S.cfg)return;
  const rows=await queueAll(),now=Date.now();
  for(const ev of rows){
    if((ev.nextAttemptAt||0)>now)continue;
    try{
      const r=await postAndWait(ev.action,ev,60000);
      if(!r?.ok)throw new Error(r?.reason||r?.error||'SYNC_REJECTED');
      await queueDelete(ev.id);
    }catch(e){
      const retryCount=(Number(ev.retryCount)||0)+1;
      if(!retryableQueueError(e)||retryCount>QUEUE_MAX_RETRIES){
        await queueMoveDead(Object.assign({},ev,{retryCount}),e?.message||e);
        continue;
      }
      const backoff=Math.min(30*60*1000,Math.pow(2,retryCount-1)*15000);
      await queuePut(Object.assign({},ev,{retryCount,status:'RETRY',lastError:String(e?.message||e),nextAttemptAt:Date.now()+backoff}));
    }
  }
}

function ticks(){const w=$('#scanTicks');w.innerHTML='';for(let i=0;i<36;i++){const e=document.createElement('span');e.className='scan-tick';e.style.transform=`translate(-50%,-50%) rotate(${i*10}deg) translateY(-190px)`;w.appendChild(e)}}
function ring(f=0){const a=[...document.querySelectorAll('.scan-tick')],n=Math.round(Math.max(0,Math.min(1,f))*a.length);a.forEach((e,i)=>{e.classList.toggle('done',i<n);e.classList.toggle('active',i===n&&n<a.length)})}

async function ensureHumanLib(){if(window.Human?.Human)return window.Human;if(S.humanLibInit)return S.humanLibInit;S.humanLibInit=new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src=HUMAN_LIB;sc.async=true;sc.crossOrigin='anonymous';sc.onload=()=>window.Human?.Human?resolve(window.Human):reject(new Error('HUMAN_LIB_FAILED'));sc.onerror=()=>reject(new Error('HUMAN_LIB_FAILED'));document.head.appendChild(sc)}).catch(e=>{S.humanLibInit=null;throw e});return S.humanLibInit}
async function initHuman(){if(S.human)return S.human;if(S.humanInit)return S.humanInit;const started=performance.now();S.humanInit=(async()=>{await ensureHumanLib();S.human=new Human.Human({backend:'webgl',modelBasePath:MODEL,cacheSensitivity:.72,face:{enabled:true,detector:{rotation:false,maxDetected:2},mesh:{enabled:true},description:{enabled:true},iris:{enabled:true},emotion:{enabled:false},antispoof:{enabled:true},liveness:{enabled:true}},body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:true}});await S.human.load();await S.human.warmup();S.perf.humanMs=Math.round(performance.now()-started);return S.human})().catch(e=>{S.human=null;S.humanInit=null;throw e});return S.humanInit}
function scheduleHumanLibPreload(){const preload=()=>ensureHumanLib().catch(()=>{});if('requestIdleCallback' in window)requestIdleCallback(preload,{timeout:1500});else setTimeout(preload,500)}

function applyBootstrap(r){if(!r?.ok)return false;S.profiles=(r.profiles||[]).filter(p=>Array.isArray(p.embedding)&&p.embedding.length);S.employees=new Map((r.employees||[]).map(e=>[String(e.employeeId),e]));S.thr={match:+r.settings?.matchThreshold||.62,live:+r.settings?.livenessThreshold||.55,real:+r.settings?.realnessThreshold||.55};S.samples=Math.max(6,Math.min(8,+r.settings?.enrollSampleCount||6));return true}
function hasFaceDb(){return S.profiles.length>0&&S.employees.size>0}
async function bootstrap(){const started=performance.now(),r=await jsonp('bootstrap',{},24000);if(!r?.ok)throw new Error(r?.error||'BOOTSTRAP_FAILED');applyBootstrap(r);S.perf.bootstrapMs=Math.round(performance.now()-started);cacheSet(BOOT_CACHE_KEY,{ts:Date.now(),data:r});return r}
async function restoreBootstrapCache(){const cached=await cacheGet(BOOT_CACHE_KEY);if(!cached?.data?.ok)return false;if(Date.now()-(cached.ts||0)>BOOT_CACHE_MAX_AGE&&navigator.onLine)return false;if(!applyBootstrap(cached.data))return false;S.bootCacheUsed=true;return true}
async function loadEnrollment(code){const r=await jsonp('enrollment',{code},18000);if(!r?.ok)throw new Error(r?.error||'ENROLLMENT_CODE_NOT_FOUND');S.pending={pending:true,code:r.code,employee:r.employee};renderPending();return r}
async function pending(){if(!navigator.onLine||!S.cfg||S.running||S.mode==='ENROLL')return;try{const r=await jsonp('pendingEnrollment',{},10000);S.pending=r?.pending?r:null;renderPending()}catch(e){console.warn('pending enrollment',e)}}
function renderPending(){const b=$('#enrollBanner');b.classList.toggle('hidden',!S.pending);if(S.pending){$('#enrollBannerName').textContent=S.pending.employee?.fullName||'Ходим';$('#startEnrollBtn').textContent='РЎЙХАТГА ОЛИШ'}}

function browserKind(){const ua=navigator.userAgent||'',ios=/iPhone|iPad|iPod/i.test(ua),android=/Android/i.test(ua),chrome=/Chrome|CriOS/i.test(ua)&&!/Edg|OPR/i.test(ua),safari=/Safari/i.test(ua)&&!/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua),inApp=/(FBAN|FBAV|Instagram|Line\/|Telegram|GSA\/|YaBrowser|DuckDuckGo|wv\))/i.test(ua);return{ua,ios,android,chrome,safari,inApp}}
async function permissionState(){try{if(!navigator.permissions?.query)return'unknown';const st=await navigator.permissions.query({name:'camera'});return st?.state||'unknown'}catch{return'unknown'}}
function cameraHelp(mode,err){S.retryMode=mode;const b=browserKind(),name=String(err?.name||''),detail=String(err?.cause?.message||err?.message||'');let steps='';if(b.ios)steps=`<div style="text-align:left;line-height:1.55;margin-top:10px"><b>iPhone / iPad:</b><br>Safari'да очинг → <b>aA</b> → <b>Website Settings</b> → <b>Camera → Allow</b>.</div>`;else if(b.android)steps=`<div style="text-align:left;line-height:1.55;margin-top:10px"><b>Android:</b><br>Сайт белгиси → <b>Permissions / Камера</b> → <b>Allow</b>.</div>`;else steps=`<div style="text-align:left;line-height:1.55;margin-top:10px"><b>Chrome / Edge:</b><br>Манзил сатридаги сайт белгиси → <b>Camera</b> → <b>Allow</b> → саҳифани янгиланг.</div>`;$('#modalContent').innerHTML=`<h2>Камерага рухсат керак</h2><p>DAVOMAT камерани ўзи мажбуран ёқа олмайди.</p>${steps}<div class="service-stat" style="margin-top:14px"><span>Хато</span><b>${name||'Permission'}</b></div><div class="hint" style="word-break:break-word;margin-top:8px">${detail}</div><button id="cameraRetry" class="primary-btn" style="margin-top:16px">ҚАЙТА СИНАШ</button>`;$('#modal').classList.remove('hidden');$('#cameraRetry').onclick=()=>{$('#modal').classList.add('hidden');session(S.retryMode||mode)}}

async function waitFirstFrame(video){
  if(video.readyState>=2&&video.videoWidth>0)return;
  await new Promise(resolve=>{
    let done=false,timer=null;
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);resolve()};
    if('requestVideoFrameCallback' in video){try{video.requestVideoFrameCallback(()=>finish())}catch{video.addEventListener('loadeddata',finish,{once:true})}}
    else video.addEventListener('loadeddata',finish,{once:true});
    timer=setTimeout(finish,1500);
  });
}
async function startCamera(){const started=performance.now();await stopCamera();if(!window.isSecureContext)throw new Error('CAMERA_INSECURE');if(!navigator.mediaDevices?.getUserMedia)throw new Error('CAMERA_UNAVAILABLE');if(document.visibilityState!=='visible')await new Promise(resolve=>{const done=()=>{if(document.visibilityState==='visible'){document.removeEventListener('visibilitychange',done);resolve()}};document.addEventListener('visibilitychange',done);setTimeout(()=>{document.removeEventListener('visibilitychange',done);resolve()},900)});const state=await permissionState();if(state==='denied'){const e=new Error('CAMERA_PERMISSION_DENIED');e.name='NotAllowedError';throw e}const attempts=[{video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false},{video:true,audio:false}];let last=null;for(const constraints of attempts){try{const stream=await navigator.mediaDevices.getUserMedia(constraints);S.stream=stream;const video=$('#video');video.srcObject=stream;video.setAttribute('playsinline','');video.muted=true;await video.play();await waitFirstFrame(video);S.perf.cameraMs=Math.round(performance.now()-started);return stream}catch(e){last=e;if(e?.name==='NotAllowedError'||e?.name==='SecurityError')break;if(!(e?.name==='OverconstrainedError'||e?.name==='NotFoundError'||e?.name==='AbortError'))break}}if(last?.name==='NotAllowedError'||last?.name==='SecurityError'){const e=new Error('CAMERA_PERMISSION_DENIED');e.name=last.name;e.cause=last;throw e}throw last||new Error('CAMERA_UNAVAILABLE')}
async function stopCamera(){S.running=false;if(S.stream){S.stream.getTracks().forEach(t=>t.stop());S.stream=null}if($('#video'))$('#video').srcObject=null}
function capturePhotoCanvas(face){const v=$('#video'),vw=v.videoWidth||640,vh=v.videoHeight||480;let sx=0,sy=0,sw=vw,sh=vh;const box=face?.box;if(Array.isArray(box)&&box.length>=4){const[x,y,w,h]=box.map(Number),size=Math.max(w,h)*1.65,cx=x+w/2,cy=y+h/2;sx=Math.max(0,cx-size/2);sy=Math.max(0,cy-size/2);sw=Math.min(size,vw-sx);sh=Math.min(size,vh-sy)}const max=320,scale=Math.min(1,max/Math.max(sw,sh)),c=document.createElement('canvas');c.width=Math.max(180,Math.round(sw*scale));c.height=Math.max(180,Math.round(sh*scale));c.getContext('2d',{alpha:false}).drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);return c}
async function encodePhotoCanvas(canvas){const started=performance.now();const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PHOTO_ENCODE_FAILED')),'image/jpeg',.44));S.perf.photoMs=Math.round(performance.now()-started);S.perf.photoBytes=blob.size||0;return await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result||''));fr.onerror=()=>reject(fr.error||new Error('PHOTO_READ_FAILED'));fr.readAsDataURL(blob)})}
function sim(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return dot/(Math.sqrt(aa)*Math.sqrt(bb)||1)}
function quality(f){return{emb:f?.embedding||[],live:Number(f?.live??0),real:Number(f?.real??0),score:Number(f?.score??f?.faceScore??f?.boxScore??0),size:Number(Math.min(f?.box?.[2]||0,f?.box?.[3]||0)),distance:Number(f?.distance??0)}}
function resetChallenge(){S.challenge={blinkStart:0,blinkOk:false,blinkMs:0,startedAt:performance.now()}}
function gestureNames(result){return Object.values(result?.gesture||{}).map(g=>String(g?.gesture||g||''))}
function updateBlinkChallenge(result){
  if(!S.challenge)resetChallenge();
  const now=performance.now(),names=gestureNames(result),blinking=names.includes('blink left eye')||names.includes('blink right eye');
  if(blinking&&!S.challenge.blinkStart)S.challenge.blinkStart=now;
  if(!blinking&&S.challenge.blinkStart){
    const ms=Math.abs(now-S.challenge.blinkStart);S.challenge.blinkStart=0;
    if(ms>=40&&ms<=900){S.challenge.blinkOk=true;S.challenge.blinkMs=Math.round(ms)}
  }
  return S.challenge.blinkOk;
}
function challengeReady(result,face){
  const q=quality(face);
  if(q.live<S.thr.live||q.real<S.thr.real)return false;
  return updateBlinkChallenge(result);
}
function match(emb){const best=new Map();for(const p of S.profiles){const s=sim(emb,p.embedding||[]),id=String(p.employeeId);if(!best.has(id)||s>best.get(id))best.set(id,s)}const a=[...best].sort((x,y)=>y[1]-x[1]);if(!a.length)return null;const[id,score]=a[0],second=a[1]?.[1]||0;if(score<S.thr.match||score-second<.035)return null;return{emp:S.employees.get(id),score}}

function showSaving(emp,mode,clientTime){show('resultView');$('#resultIcon').textContent='✓';$('#resultTitle').textContent='ҚАБУЛ ҚИЛИНДИ';$('#resultName').textContent=emp?.fullName||'';$('#resultPosition').textContent=emp?.position||'';$('#resultType').textContent=mode==='OUT'?'КЕТДИ':'КЕЛДИ';$('#resultTime').textContent=ttime(new Date(clientTime||Date.now()));$('#resultNote').textContent='Серверга сақланмоқда…'}
function confirmSuccess(r){show('resultView');$('#resultIcon').textContent='✓';$('#resultTitle').textContent='МУВАФФАҚИЯТЛИ';$('#resultName').textContent=r.fullName||$('#resultName').textContent||'';$('#resultPosition').textContent=r.position||$('#resultPosition').textContent||'';$('#resultType').textContent=r.eventType==='OUT'?'КЕТДИ':'КЕЛДИ';$('#resultTime').textContent=ttime(new Date(r.serverTime||Date.now()));$('#resultNote').textContent='Белги сақланди';setTimeout(idle,900)}
async function success(r){await stopCamera();confirmSuccess(r)}
async function fail(x){await stopCamera();show('resultView');$('#resultIcon').textContent='!';$('#resultTitle').textContent='БЕЛГИЛАНМАДИ';$('#resultType').textContent='';$('#resultTime').textContent='';$('#resultNote').textContent=x;setTimeout(idle,2200)}
function idle(){stopCamera();S.mode=null;S.busy=false;S.hit=null;S.hits=0;S.challenge=null;S.sessionDeadline=0;if($('#cameraTimeout'))$('#cameraTimeout').textContent='';show('idleView');ring(0);renderPending()}

async function attendance(face){
  const q=quality(face);
  if(q.live<S.thr.live||q.real<S.thr.real||!q.emb.length)return instruction('Камерага қаранг','Юзни тўғри ёритинг');
  if(q.size<100)return instruction('Яқинроқ туринг','Юзингизни рамкага яқинлаштиринг');
  if(q.size>360)return instruction('Бироз узоқроқ туринг','Юзингизни рамка ичида ушланг');
  const m=match(q.emb);
  if(!m?.emp){S.hit=null;S.hits=0;return instruction('Юз аниқланмади','Камерага тўғри қаранг')}
  if(S.hit===m.emp.employeeId)S.hits++;else{S.hit=m.emp.employeeId;S.hits=1}
  ring(Math.min(1,S.hits/3));
  if(S.hits<3)return instruction(m.emp.fullName,'Текширилмоқда…');

  S.busy=true;
  const id=uuid(),clientTime=new Date().toISOString();
  const ackStarted=performance.now();
  const photoCanvas=capturePhotoCanvas(face);
  await stopCamera();
  showSaving(m.emp,S.mode,clientTime);
  S.perf.localAckMs=Math.round(performance.now()-ackStarted);

  let photoDataUrl='';
  try{photoDataUrl=await encodePhotoCanvas(photoCanvas)}catch(e){console.warn('photo encode',e)}
  const ev={id,requestId:id,action:'attendance',eventId:id,employeeId:m.emp.employeeId,clientTime,requestedEventType:S.mode,clientSuggestedType:S.mode,matchScore:m.score,livenessScore:q.live,realScore:q.real,blinkOk:!!S.challenge?.blinkOk,blinkMs:Number(S.challenge?.blinkMs||0),photoDataUrl,offline:!navigator.onLine};
  const saveStarted=performance.now();
  try{
    if(!navigator.onLine){await queuePut(ev);$('#resultIcon').textContent='✓';$('#resultTitle').textContent='ОФЛАЙН ҚАБУЛ ҚИЛИНДИ';$('#resultNote').textContent='Интернет келганда автоматик юборилади';setTimeout(idle,1100);return}
    const r=await postAndWait('attendance',ev,60000);
    S.perf.saveMs=Math.round(performance.now()-saveStarted);
    if(!r?.ok){if(r?.reason==='EVENT_TYPE_MISMATCH'){const need=r.expectedType==='OUT'?'КЕТДИ':'КЕЛДИ';throw new Error('Сизга ҳозир «'+need+'» ни босиш керак')}throw new Error(r?.reason||r?.error||'SERVER_REJECTED')}
    confirmSuccess(r);
  }catch(e){await fail(friendly(e))}
}

async function enroll(face){const en=S.pending?._enroll||(S.pending._enroll={arr:[],last:null,lastAt:0}),q=quality(face);if(!S.challenge?.blinkOk)return instruction(S.pending.employee.fullName,'Бир марта кўзингизни юминг');if(q.live<S.thr.live||q.real<S.thr.real||!q.emb.length||q.size<120)return instruction(S.pending.employee.fullName,'Юзни рамка ичида ушланг');if(Date.now()-en.lastAt<280)return;if(en.last&&sim(q.emb,en.last)>.9994)return instruction(S.pending.employee.fullName,'Бошингизни секин айлантиринг');en.arr.push({embedding:Array.from(q.emb,v=>Math.round(v*1e6)/1e6),quality:(q.live+q.real+q.score)/3,liveness:q.live,real:q.real,pose:'sample-'+(en.arr.length+1)});en.last=Array.from(q.emb);en.lastAt=Date.now();ring(en.arr.length/S.samples);$('#enrollCounter').textContent=`${en.arr.length} / ${S.samples}`;instruction(S.pending.employee.fullName,en.arr.length<S.samples?'Бошингизни секин айлантиринг':'Юз сақланмоқда…');if(en.arr.length<S.samples)return;S.busy=true;const id=uuid();try{const r=await postAndWait('enroll',{id,requestId:id,action:'enroll',enrollmentCode:S.pending.code,samples:en.arr,blinkOk:!!S.challenge?.blinkOk,blinkMs:Number(S.challenge?.blinkMs||0)},70000);if(!r?.ok)throw new Error(r?.error||'ENROLL_FAILED');await stopCamera();show('resultView');$('#resultIcon').textContent='✓';$('#resultTitle').textContent='ЮЗ ТАЙЁР';$('#resultName').textContent=r.fullName||'';$('#resultPosition').textContent='';$('#resultType').textContent='';$('#resultTime').textContent='';$('#resultNote').textContent='Ходим рўйхатдан ўтди';S.pending=null;await cacheDelete(BOOT_CACHE_KEY);try{await bootstrap()}catch(e){console.warn('Face DB refresh after enrollment',e)}setTimeout(()=>idle(),1200)}catch(e){await fail('Рўйхатга олиш хатоси: '+friendly(e))}}

async function loop(){if(!S.running)return;requestAnimationFrame(loop);const now=performance.now();if(S.sessionDeadline){const left=Math.max(0,Math.ceil((S.sessionDeadline-now)/1000));$('#cameraTimeout').textContent=left?'Текширув: '+left+' с':'';if(now>S.sessionDeadline&&!S.busy){S.busy=true;await fail('Текширув вақти тугади. Қайта урининг.');return}}if(S.busy||(loop.last&&now-loop.last<240))return;loop.last=now;try{const r=await S.human.detect($('#video')),faces=r?.face||[];if(faces.length>1){S.hit=null;S.hits=0;ring(0);return instruction('Фақат бир киши','Камера олдида фақат бир киши турсин')}const f=faces[0];if(!f){ring(0);return instruction(S.mode==='ENROLL'?(S.pending?.employee?.fullName||'Ходим'):(S.mode==='IN'?'КЕЛДИ':'КЕТДИ'),'Юзингизни рамка ичида ушланг')}const q=quality(f);if(q.live<S.thr.live||q.real<S.thr.real){S.hit=null;S.hits=0;ring(.08);return instruction('Камерага қаранг','Тириклик текширилмоқда…')}if(!challengeReady(r,f)){ring(.18);return instruction(S.mode==='ENROLL'?(S.pending?.employee?.fullName||'Ходим'):(S.mode==='IN'?'КЕЛДИ':'КЕТДИ'),'Бир марта кўзингизни юминг')}if(S.mode==='ENROLL')await enroll(f);else await attendance(f)}catch(e){console.error(e)}}

async function session(mode){if(S.running||S.busy)return;if((mode==='IN'||mode==='OUT')&&!hasFaceDb())return toast('Face ID базасида фаол юз йўқ. Аввал ходим юзини рўйхатга олинг.',6000);if(mode==='ENROLL'&&!S.pending)return toast('Рўйхатга олиш вазифаси йўқ');S.mode=mode;S.retryMode=mode;S.hit=null;S.hits=0;resetChallenge();S.sessionDeadline=performance.now()+(mode==='ENROLL'?35000:22000);show('cameraView');document.querySelector('.camera-card').classList.toggle('enroll-mode',mode==='ENROLL');$('#faceScanner').className='face-scanner '+(mode==='ENROLL'?'enrolling':'recognizing');$('#enrollCounter').classList.toggle('hidden',mode!=='ENROLL');$('#modeBadge').textContent=mode==='IN'?'КЕЛДИ':mode==='OUT'?'КЕТДИ':'ЮЗНИ РЎЙХАТГА ОЛИШ';$('#enrollCounter').textContent=`0 / ${S.samples}`;instruction(mode==='ENROLL'?S.pending.employee.fullName:(mode==='IN'?'КЕЛДИ':'КЕТДИ'),'Камера тайёрланмоқда…');$('#cameraStatus').textContent='КАМЕРА ТАЙЁРЛАНМОҚДА…';ring(0);try{const cameraPromise=startCamera(),humanPromise=initHuman();await cameraPromise;$('#cameraStatus').textContent='ЮЗ МОДЕЛИ ТАЙЁРЛАНМОҚДА…';instruction(mode==='ENROLL'?S.pending.employee.fullName:(mode==='IN'?'КЕЛДИ':'КЕТДИ'),mode==='ENROLL'?'Бошингизни секин айлантиринг':'Камерага қаранг');await humanPromise;$('#cameraStatus').textContent='ТАЙЁР';S.running=true;loop.last=0;loop()}catch(e){console.error('camera/session',e);await stopCamera();S.busy=false;show('idleView');if(e?.message==='CAMERA_PERMISSION_DENIED'||e?.name==='NotAllowedError'||e?.name==='SecurityError')cameraHelp(mode,e);else toast('Камера очилмади: '+friendly(e),4500)}}

async function service(){const q=await queueCount(),dead=await deadCount(),photoKb=S.perf.photoBytes?Math.round(S.perf.photoBytes/1024):0;$('#modalContent').innerHTML=`<h2>Сервис</h2><div class="service-grid"><div class="service-stat"><span>Версия</span><b>${VERSION}</b></div><div class="service-stat"><span>Юзли ходимлар</span><b>${S.employees.size}</b></div><div class="service-stat"><span>Кэш</span><b>${S.bootCacheUsed?'ТЕЗ':'ЯНГИ'}</b></div><div class="service-stat"><span>Офлайн навбат</span><b>${q}</b></div><div class="service-stat"><span>Хатолар навбати</span><b>${dead}</b></div><div class="service-stat"><span>Liveness</span><b>${S.challenge?.blinkOk?'BLINK PASS':'LIVE + REAL'}</b></div><div class="service-stat"><span>База</span><b>${S.perf.bootstrapMs||0} ms</b></div><div class="service-stat"><span>Face AI</span><b>${S.perf.humanMs||0} ms</b></div><div class="service-stat"><span>Камера</span><b>${S.perf.cameraMs||0} ms</b></div><div class="service-stat"><span>Local ACK</span><b>${S.perf.localAckMs||0} ms</b></div><div class="service-stat"><span>Фото</span><b>${S.perf.photoMs||0} ms / ${photoKb} KB</b></div><div class="service-stat"><span>Сақлаш</span><b>${S.perf.saveMs||0} ms</b></div><div class="service-stat"><span>Polls</span><b>${S.perf.polls||0}</b></div></div><button id="reload" class="secondary-btn">Базани янгилаш</button>`;$('#modal').classList.remove('hidden');$('#reload').onclick=()=>bootstrap().then(()=>toast('База янгиланди')).catch(e=>toast(friendly(e)))}

async function boot(){const lp=launchParams();try{updateVersion();importLaunchConfig();S.cfg=loadCfg();if(!validCfg(S.cfg))throw new Error('CONFIG_REQUIRED');await migrateLegacyQueue();if(window.__DAVOMAT_EMBEDDED__&&lp.purpose!=='enroll'){show('idleView');scheduleHumanLibPreload();return}show('loadingView');scheduleHumanLibPreload();if(lp.purpose==='enroll'){if(!lp.enroll)throw new Error('ENROLLMENT_CODE_NOT_FOUND');$('#loadingTitle').textContent='Рўйхатга олиш тайёрланмоқда…';$('#loadingDetail').textContent='Ходим маълумоти олинмоқда';await loadEnrollment(lp.enroll);S.samples=6;show('idleView');renderPending();return}const cached=await restoreBootstrapCache();if(cached){show('idleView');setTimeout(()=>bootstrap().catch(e=>console.warn('bootstrap refresh',e)),700)}else{$('#loadingDetail').textContent='Ходимлар маълумоти олинмоқда';await bootstrap();show('idleView')}setTimeout(()=>syncQueue(),1800);setTimeout(()=>pending(),2600);S.pollTimer=setInterval(()=>pending(),45000)}catch(e){console.error(e);await stopCamera();show('setupView');$('#setupError').textContent='Терминал очилмади.';$('#setupDetail').textContent=friendly(e)}}
function clock(){const n=new Date();$('#idleClock').textContent=ttime(n);$('#idleDate').textContent=tdate(n)}

ticks();clock();setInterval(clock,1000);net();updateVersion();
window.addEventListener('online',()=>{net();setTimeout(()=>syncQueue(),500);setTimeout(()=>bootstrap().catch(()=>{}),1200)});window.addEventListener('offline',net);
$('#retrySetupBtn').onclick=()=>location.reload();$('#inBtn').onclick=()=>session('IN');$('#outBtn').onclick=()=>session('OUT');$('#startEnrollBtn').onclick=()=>session('ENROLL');$('#cancelCameraBtn').onclick=idle;$('#adminBtn').onclick=service;$('#modalClose').onclick=()=>$('#modal').classList.add('hidden');$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').classList.add('hidden')};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js?v=1.5.0-prod-20260921-2',{updateViaCache:'none'}).then(r=>r.update().catch(()=>{})).catch(()=>{});
boot();
})();
