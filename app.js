(() => {
'use strict';
const $=s=>document.querySelector(s), VERSION='0.9.1', CFG='davomat-terminal-config-v1', Q='davomat-offline-queue-v1';
const MODEL='https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/';
const S={cfg:null,human:null,stream:null,profiles:[],employees:new Map(),thr:{match:.62,live:.55,real:.55},samples:7,pending:null,mode:null,busy:false,running:false,hit:null,hits:0,timer:null,autoEnrollCode:null,launchEnrollCode:null,launchBackend:null,bridgeFrame:null,bridgeTarget:null,bridgeReady:false,bridgeInit:null,bridgeNonce:null,bridgePending:new Map(),humanInit:null};
const msg={DEVICE_AUTH_FAILED:'Қурилма рухсати рад этилди',EMPLOYEE_NOT_FOUND:'Ходим топилмади',FACE_PROOF_LOW:'Юз текширувидан ўтмади',EVENT_TYPE_MISMATCH:'Нотўғри тугма танланди',ALREADY_MARKED:'Белги жуда тез такрорланди',NETWORK_ERROR:'Интернет билан алоқа йўқ',BRIDGE_TIMEOUT:'DAVOMAT сервер мости жавоб бермади',BRIDGE_ERROR:'DAVOMAT сервер мостида хато',TIMEOUT:'Сервер жавоб бермади',ENROLLMENT_TASK_NOT_FOUND:'Рўйхатга олиш вазифаси келмади. Админкадан қайта босинг.'};
const friendly=e=>msg[String(e?.message||e||'')]||String(e?.message||e||'Номаълум хато');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
const ttime=d=>new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'}).format(d||new Date());
const tdate=d=>new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'long',year:'numeric'}).format(d||new Date());
function show(id){['loadingView','setupView','idleView','cameraView','resultView'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id));}
function toast(x){const e=$('#toast');e.textContent=x;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2500)}
function instruction(a,b=''){ $('#instruction').textContent=a; $('#subInstruction').textContent=b; }
function net(){const b=$('#netBadge'),on=navigator.onLine;b.textContent=on?'ОНЛАЙН':'ОФЛАЙН';b.className='badge '+(on?'online':'offline');}
function valid(c){return c&&/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(c.url||'')&&c.deviceId&&c.deviceToken}
function saveCfg(c){localStorage.setItem(CFG,JSON.stringify(c));S.cfg=c}
function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG)||'null')}catch{return null}}
function launchParams(){const p=new URLSearchParams(location.search);return {backend:(p.get('backend')||'').trim(),pair:(p.get('pair')||'').trim(),enroll:(p.get('enroll')||'').trim(),purpose:(p.get('purpose')||'').trim()}}
function importHash(){try{const raw=new URLSearchParams(location.hash.slice(1)).get('cfg');if(!raw)return;let x=raw.replace(/-/g,'+').replace(/_/g,'/');x+='='.repeat((4-x.length%4)%4);const c=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(x),ch=>ch.charCodeAt(0))));if(valid(c)){saveCfg(c);history.replaceState(null,'',location.pathname+location.search)}}catch(e){console.warn(e)}}
function bridgeCleanup(reason){
  S.bridgeReady=false;
  S.bridgeInit=null;
  if(S.bridgeFrame){try{S.bridgeFrame.remove()}catch{}S.bridgeFrame=null}
  S.bridgeTarget=null;
  for(const [id,p] of S.bridgePending){clearTimeout(p.timer);p.reject(new Error(reason||'BRIDGE_ERROR'))}
  S.bridgePending.clear();
}
function bridgeMessage(ev){
  const m=ev.data||{};
  if(m.channel!=='DAVOMAT_BRIDGE'||m.nonce!==S.bridgeNonce)return;
  if(m.type==='ready'){
    S.bridgeTarget=ev.source;
    S.bridgeReady=true;
    if(S._bridgeReadyResolve){S._bridgeReadyResolve(true);S._bridgeReadyResolve=null;S._bridgeReadyReject=null}
    return;
  }
  if(!S.bridgeTarget||ev.source!==S.bridgeTarget||!m.id)return;
  const p=S.bridgePending.get(m.id);if(!p)return;
  S.bridgePending.delete(m.id);clearTimeout(p.timer);
  if(m.ok)p.resolve(m.result);else p.reject(new Error(m.error||'BRIDGE_ERROR'));
}
window.addEventListener('message',bridgeMessage);
function initBridge(timeout=15000){
  if(S.bridgeReady&&S.bridgeFrame)return Promise.resolve(true);
  if(S.bridgeInit)return S.bridgeInit;
  S.bridgeNonce=uuid().replace(/[^A-Za-z0-9_-]/g,'');
  S.bridgeInit=new Promise((resolve,reject)=>{
    S._bridgeReadyResolve=resolve;S._bridgeReadyReject=reject;
    const f=document.createElement('iframe');
    f.id='davomatBridge';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
    f.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    f.src=S.cfg.url+(S.cfg.url.includes('?')?'&':'?')+'bridge=1&nonce='+encodeURIComponent(S.bridgeNonce)+'&v='+encodeURIComponent(VERSION);
    f.onerror=()=>{if(!S.bridgeReady){bridgeCleanup('BRIDGE_ERROR');reject(new Error('BRIDGE_ERROR'))}};
    S.bridgeFrame=f;document.body.appendChild(f);
    setTimeout(()=>{if(!S.bridgeReady){bridgeCleanup('BRIDGE_TIMEOUT');reject(new Error('BRIDGE_TIMEOUT'))}},timeout);
  });
  return S.bridgeInit;
}
async function bridgeCall(api,data={},timeout=30000){
  await initBridge();
  const id=uuid();
  const request={api,deviceId:S.cfg.deviceId,deviceToken:S.cfg.deviceToken};
  if(api==='attendance'||api==='enroll'||api==='ping')request.payload=data;
  else if(api==='enrollment')request.code=data.code||'';
  else if(api==='requestStatus')request.requestId=data.requestId||data.request_id||'';
  else if(data&&Object.keys(data).length)request.params=data;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{S.bridgePending.delete(id);reject(new Error('TIMEOUT'))},timeout);
    S.bridgePending.set(id,{resolve,reject,timer});
    try{if(!S.bridgeTarget)throw new Error('BRIDGE_ERROR');S.bridgeTarget.postMessage({channel:'DAVOMAT_BRIDGE',nonce:S.bridgeNonce,id,request},'*')}
    catch(e){clearTimeout(timer);S.bridgePending.delete(id);reject(e)}
  });
}
function qload(){try{return JSON.parse(localStorage.getItem(Q)||'[]')}catch{return[]}}
function qsave(a){localStorage.setItem(Q,JSON.stringify(a))}
async function syncQueue(){if(!navigator.onLine||!S.cfg)return;const a=qload(),left=[];for(let i=0;i<a.length;i++){const ev=a[i];try{const r=await bridgeCall(ev.action,ev,30000);if(!r?.ok)throw new Error(r?.reason||r?.error||'SYNC_REJECTED')}catch(e){left.push(...a.slice(i));break}}qsave(left);}
function ticks(){const w=$('#scanTicks');w.innerHTML='';for(let i=0;i<36;i++){const e=document.createElement('span');e.className='scan-tick';e.style.transform=`translate(-50%,-50%) rotate(${i*10}deg) translateY(-190px)`;w.appendChild(e)}}
function ring(f=0){const a=[...document.querySelectorAll('.scan-tick')],n=Math.round(Math.max(0,Math.min(1,f))*a.length);a.forEach((e,i)=>{e.classList.toggle('done',i<n);e.classList.toggle('active',i===n&&n<a.length)})}
async function initHuman(){if(S.human)return S.human;if(S.humanInit)return S.humanInit;S.humanInit=(async()=>{S.human=new Human.Human({backend:'webgl',modelBasePath:MODEL,cacheSensitivity:.7,face:{enabled:true,detector:{rotation:true,maxDetected:1},mesh:{enabled:true},description:{enabled:true},iris:{enabled:false},emotion:{enabled:false},antispoof:{enabled:true},liveness:{enabled:true}},body:{enabled:false},hand:{enabled:false},object:{enabled:false}});await S.human.load();await S.human.warmup();return S.human})().catch(e=>{S.human=null;S.humanInit=null;throw e});return S.humanInit}
async function bootstrap(){const r=await bridgeCall('bootstrap');if(!r.ok)throw new Error(r.error);S.profiles=r.profiles||[];S.employees=new Map((r.employees||[]).map(e=>[String(e.employeeId),e]));S.thr={match:+r.settings?.matchThreshold||.62,live:+r.settings?.livenessThreshold||.55,real:+r.settings?.realnessThreshold||.55};S.samples=Math.max(6,Math.min(8,+r.settings?.enrollSampleCount||7));}
async function pending(){if(!navigator.onLine||!S.cfg||S.running)return;try{const r=await bridgeCall('pendingEnrollment',{},12000);S.pending=r?.pending?r:null;renderPending();if(S.pending&&!S.busy&&!S.running&&S.autoEnrollCode!==S.pending.code){S.autoEnrollCode=S.pending.code;const code=S.pending.code;setTimeout(()=>{if(S.pending?.code===code&&!S.running&&!S.busy)session('ENROLL')},350)}if(!S.pending)S.autoEnrollCode=null}catch(e){console.warn('pendingEnrollment',e)}}
async function waitForPendingEnrollment(timeout=15000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const r=await bridgeCall('pendingEnrollment',{},10000);
    if(r?.pending){S.pending=r;renderPending();return true}
    await sleep(500);
  }
  return false;
}
async function loadEnrollmentByCode(code){if(!code||!S.cfg)return false;const r=await bridgeCall('enrollment',{code},12000);if(!r?.ok)throw new Error(r?.error||'ENROLLMENT_NOT_FOUND');S.pending={pending:true,code:r.code,employee:r.employee};renderPending();S.autoEnrollCode=r.code;setTimeout(()=>{if(S.pending?.code===r.code&&!S.running&&!S.busy)session('ENROLL')},250);return true}
function renderPending(){const b=$('#enrollBanner');b.classList.toggle('hidden',!S.pending);if(S.pending){$('#enrollBannerName').textContent=S.pending.employee?.fullName||'Ходим';$('#startEnrollBtn').textContent='РЎЙХАТГА ОЛИШНИ БОШЛАШ'}}
async function startCamera(){await stopCamera();S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});$('#video').srcObject=S.stream;await $('#video').play();}
async function stopCamera(){S.running=false;if(S.stream){S.stream.getTracks().forEach(t=>t.stop());S.stream=null}$('#video').srcObject=null}
function photo(){const v=$('#video'),c=document.createElement('canvas');c.width=Math.min(v.videoWidth||640,800);c.height=Math.round(c.width*(v.videoHeight||480)/(v.videoWidth||640));c.getContext('2d').drawImage(v,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.72)}
function sim(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return dot/(Math.sqrt(aa)*Math.sqrt(bb)||1)}
function quality(f){return {emb:f?.embedding||[],live:Number(f?.live??0),real:Number(f?.real??0),score:Number(f?.score??0),size:Number(f?.box?.[2]||0)}}
function match(emb){const best=new Map();for(const p of S.profiles){const s=sim(emb,p.embedding||[]),id=String(p.employeeId);if(!best.has(id)||s>best.get(id))best.set(id,s)}const a=[...best].sort((x,y)=>y[1]-x[1]);if(!a.length)return null;const [id,score]=a[0],second=a[1]?.[1]||0;if(score<S.thr.match||score-second<.035)return null;return {emp:S.employees.get(id),score}}
async function success(r){await stopCamera();show('resultView');$('#resultIcon').textContent='✓';$('#resultTitle').textContent='МУВАФФАҚИЯТЛИ';$('#resultName').textContent=r.fullName||'';$('#resultPosition').textContent=r.position||'';$('#resultType').textContent=r.eventType==='OUT'?'КЕТДИ':'КЕЛДИ';$('#resultTime').textContent=ttime(new Date(r.serverTime||Date.now()));$('#resultNote').textContent='Белги сақланди';setTimeout(idle,2200)}
async function fail(x){await stopCamera();show('resultView');$('#resultIcon').textContent='!';$('#resultTitle').textContent='БЕЛГИЛАНМАДИ';$('#resultName').textContent='';$('#resultPosition').textContent='';$('#resultType').textContent='';$('#resultTime').textContent='';$('#resultNote').textContent=x;setTimeout(idle,2600)}
function idle(){stopCamera();S.mode=null;S.busy=false;S.hit=null;S.hits=0;show('idleView');ring(0);renderPending()}
async function attendance(face){const q=quality(face);if(q.live<S.thr.live||q.real<S.thr.real||!q.emb.length)return instruction('Камерага қаранг','Юзни тўғри ёритинг');const m=match(q.emb);if(!m?.emp){S.hit=null;S.hits=0;return instruction('Юз аниқланмади','Камерага тўғри қаранг')}if(S.hit===m.emp.employeeId)S.hits++;else{S.hit=m.emp.employeeId;S.hits=1}ring(Math.min(1,S.hits/3));if(S.hits<3)return instruction(m.emp.fullName,'Текширилмоқда…');S.busy=true;const id=uuid(),ev={id,requestId:id,action:'attendance',eventId:id,employeeId:m.emp.employeeId,clientTime:new Date().toISOString(),requestedEventType:S.mode,clientSuggestedType:S.mode,matchScore:m.score,livenessScore:q.live,realScore:q.real,blinkOk:false,photoDataUrl:photo(),offline:!navigator.onLine};try{if(!navigator.onLine){const a=qload();a.push(ev);qsave(a);await stopCamera();return success({fullName:m.emp.fullName,position:m.emp.position,eventType:S.mode,serverTime:new Date().toISOString()})}const r=await bridgeCall('attendance',ev,45000);if(!r?.ok)throw new Error(r?.reason||r?.error||'SERVER_REJECTED');await success(r)}catch(e){await fail(friendly(e))}}
async function enroll(face){const en=S.pending?._enroll||(S.pending._enroll={arr:[],last:null,lastAt:0});const q=quality(face);if(q.live<S.thr.live||q.real<S.thr.real||!q.emb.length||q.size<120)return instruction(S.pending.employee.fullName,'Юзни рамка ичида ушланг');if(Date.now()-en.lastAt<300)return;if(en.last&&sim(q.emb,en.last)>.9995)return instruction(S.pending.employee.fullName,'Бошингизни секин айлантиринг');en.arr.push({embedding:Array.from(q.emb,v=>Math.round(v*1e6)/1e6),quality:(q.live+q.real+q.score)/3,pose:'sample-'+(en.arr.length+1)});en.last=Array.from(q.emb);en.lastAt=Date.now();ring(en.arr.length/S.samples);$('#enrollCounter').textContent=`${en.arr.length} / ${S.samples}`;instruction(S.pending.employee.fullName,en.arr.length<S.samples?'Бошингизни секин айлантиринг':'Юз сақланмоқда…');if(en.arr.length<S.samples)return;S.busy=true;const id=uuid();try{const r=await bridgeCall('enroll',{id,requestId:id,action:'enroll',enrollmentCode:S.pending.code,samples:en.arr},60000);if(!r?.ok)throw new Error(r?.error||'ENROLL_FAILED');S.pending=null;S.autoEnrollCode=null;await bootstrap();await stopCamera();show('resultView');$('#resultIcon').textContent='✓';$('#resultTitle').textContent='ЮЗ ТАЙЁР';$('#resultName').textContent=r.fullName||'';$('#resultPosition').textContent='';$('#resultType').textContent='';$('#resultTime').textContent='';$('#resultNote').textContent='Ходим рўйхатдан ўтди';setTimeout(idle,1800)}catch(e){await fail('Рўйхатга олиш хатоси: '+friendly(e))}}
async function loop(){if(!S.running)return;requestAnimationFrame(loop);if(S.busy||loop.last&&performance.now()-loop.last<320)return;loop.last=performance.now();try{const r=await S.human.detect($('#video'));const f=r?.face?.[0];if(!f){ring(0);return instruction(S.mode==='ENROLL'?(S.pending?.employee?.fullName||'Ходим'):(S.mode==='IN'?'КЕЛДИ':'КЕТДИ'),'Юзингизни рамка ичида ушланг')}if(S.mode==='ENROLL')await enroll(f);else await attendance(f)}catch(e){console.error(e)}}
async function session(mode){if(S.running||S.busy)return;if(mode==='ENROLL'&&!S.pending)return toast('Рўйхатга олиш вазифаси йўқ');S.mode=mode;S.hit=null;S.hits=0;show('cameraView');document.querySelector('.camera-card').classList.toggle('enroll-mode',mode==='ENROLL');$('#faceScanner').className='face-scanner '+(mode==='ENROLL'?'enrolling':'recognizing');$('#enrollCounter').classList.toggle('hidden',mode!=='ENROLL');$('#modeBadge').textContent=mode==='IN'?'КЕЛДИ':mode==='OUT'?'КЕТДИ':'ЮЗНИ РЎЙХАТГА ОЛИШ';$('#enrollCounter').textContent=`0 / ${S.samples}`;instruction(mode==='ENROLL'?S.pending.employee.fullName:(mode==='IN'?'КЕЛДИ':'КЕТДИ'),mode==='ENROLL'?'Бошингизни секин айлантиринг':'Камера тайёрланмоқда…');ring(0);try{await Promise.all([startCamera(),initHuman()]);S.running=true;loop()}catch(e){idle();toast('Камера очилмади: '+friendly(e))}}
function service(){const q=qload().length;$('#modalContent').innerHTML=`<h2>Сервис</h2><div class="service-grid"><div class="service-stat"><span>Версия</span><b>${VERSION}</b></div><div class="service-stat"><span>Юзли ходимлар</span><b>${S.employees.size}</b></div><div class="service-stat"><span>Офлайн навбат</span><b>${q}</b></div><div class="service-stat"><span>Камера</span><b>${S.stream?'ЁҚИЛГАН':'ЎЧИҚ'}</b></div></div><button id="reload" class="secondary-btn">Базани янгилаш</button><button id="reset" class="secondary-btn">Терминал созламалари</button>`;$('#modal').classList.remove('hidden');$('#reload').onclick=()=>bootstrap().then(()=>toast('База янгиланди'));$('#reset').onclick=()=>{localStorage.removeItem(CFG);location.reload()}}
async function boot(){
  const lp=launchParams();
  try{
    importHash();
    S.cfg=loadCfg();
    if(!valid(S.cfg)){show('setupView');$('#setupError').textContent='Терминал ҳали уланмаган. Администратор орқали бир марта уланг.';return}
    show('loadingView');
    $('#loadingTitle').textContent=lp.purpose==='enroll'?'Рўйхатга олиш тайёрланмоқда…':'DAVOMAT тайёрланмоқда…';
    $('#loadingDetail').textContent='Серверга уланмоқда';
    await initBridge();
    $('#loadingDetail').textContent='Маълумотлар олинмоқда';
    await bootstrap();
    const enrollCode=lp.enroll||'';
    if(enrollCode){
      $('#loadingDetail').textContent='Ходим топилмоқда';
      await loadEnrollmentByCode(enrollCode);
      $('#loadingDetail').textContent='Камера тайёрланмоқда';
      await initHuman();
      await session('ENROLL');
    }else if(lp.purpose==='enroll'){
      $('#loadingDetail').textContent='Рўйхатга олиш вазифаси кутилмоқда';
      const got=await waitForPendingEnrollment(15000);
      if(!got)throw new Error('ENROLLMENT_TASK_NOT_FOUND');
      $('#loadingDetail').textContent='Камера тайёрланмоқда';
      await initHuman();
      await session('ENROLL');
    }else{
      await pending();
      if(S.pending){
        $('#loadingDetail').textContent='Рўйхатга олиш вазифаси топилди';
        await initHuman();
        await session('ENROLL');
      }else{
        show('idleView');
        initHuman().catch(e=>console.warn('human preload',e));
      }
    }
    syncQueue();
    setInterval(pending,4000);
    setInterval(()=>navigator.onLine&&syncQueue(),30000);
  }catch(e){
    console.error(e);
    await stopCamera();
    show('setupView');
    $('#setupError').textContent=lp.purpose==='enroll'?'Рўйхатга олиш бошланмади. «Қайта уриниш» ни босинг.':'Терминал серверга уланмади. «Қайта уриниш» ни босинг.';
    const detail=$('#setupDetail');if(detail)detail.textContent=friendly(e);
  }
}
function clock(){const n=new Date();$('#idleClock').textContent=ttime(n);$('#idleDate').textContent=tdate(n)}
ticks();clock();setInterval(clock,1000);net();window.addEventListener('online',()=>{net();if(!S.bridgeReady)bridgeCleanup();initBridge().then(()=>{syncQueue();pending()}).catch(()=>{})});window.addEventListener('offline',net);
$('#retrySetupBtn').onclick=()=>{bridgeCleanup();location.reload()};$('#inBtn').onclick=()=>session('IN');$('#outBtn').onclick=()=>session('OUT');$('#startEnrollBtn').onclick=()=>session('ENROLL');$('#cancelCameraBtn').onclick=idle;$('#adminBtn').onclick=service;$('#modalClose').onclick=()=>$('#modal').classList.add('hidden');$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').classList.add('hidden')};
boot();
})();