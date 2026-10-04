(() => {
"use strict";
const API="https://glrluvbgrdftpcmwbhtr.supabase.co/functions/v1/davomat-api";
const VERSION="2.0.0-preview";
const STORE="davomat-supabase-device-v1";
const HUMAN_URL="https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js";
const MODEL="https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/";
const $=q=>document.querySelector(q);
const state={device:null,human:null,camera:null,active:false,busy:false,
 mode:null,challenge:null,blinkStart:0,blinkMs:0,samples:[],lastSample:null,
 started:0,pendingEnrollment:null};
function display(id){for(const name of ["loadingView","setupView","idleView","cameraView","resultView"])$("#"+name).classList.toggle("hidden",name!==id)}
function message(top,sub){$("#instruction").textContent=top;$("#subInstruction").textContent=sub||""}
function clock(){const n=new Date();$("#idleClock").textContent=new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",hour:"2-digit",minute:"2-digit"}).format(n);$("#idleDate").textContent=new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",year:"numeric",month:"long",day:"numeric"}).format(n)}
function status(){const el=$("#netBadge");el.textContent=navigator.onLine?"ОНЛАЙН":"ОФЛАЙН";el.className="badge "+(navigator.onLine?"online":"offline")}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.remove("hidden");setTimeout(()=>e.classList.add("hidden"),4500)}
function errText(e){return typeof e==="string"?e:String(e?.message||e||"Хатолик")}
function api(action,payload={},device=true,timeout=30000){
 return (async()=>{
  if(!navigator.onLine)throw Error("INTERNET_REQUIRED");
  const headers={"Content-Type":"application/json"};
  if(device){if(!state.device)throw Error("DEVICE_NOT_PAIRED");
   headers["x-davomat-device"]=state.device.deviceId;
   headers["x-davomat-token"]=state.device.deviceToken;
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetch(API,{method:"POST",headers,body:JSON.stringify({action,...payload}),signal:controller.signal,cache:"no-store"});
   const data=await response.json();
   if(!data.ok)throw Error(data.error||"SERVER_ERROR");
   return data;
  }finally{clearTimeout(timer)}
 })();
}
async function ensureHuman(){
 if(state.human)return state.human;
 if(!window.Human?.Human){
  await new Promise((yes,no)=>{const sc=document.createElement("script");sc.src=HUMAN_URL;sc.onload=yes;sc.onerror=()=>no(Error("FACE_MODEL_LOAD_FAILED"));document.head.append(sc)});
 }
 const h=new Human.Human({backend:"webgl",modelBasePath:MODEL,cacheSensitivity:.72,
 face:{enabled:true,detector:{rotation:false,maxDetected:2},mesh:{enabled:true},
  description:{enabled:true},iris:{enabled:true},emotion:{enabled:false},
  antispoof:{enabled:true},liveness:{enabled:true}},
 body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:true}});
 await h.load();await h.warmup();state.human=h;return h;
}
function circle(){const t=$("#scanTicks");t.replaceChildren();for(let i=0;i<36;i++){const x=document.createElement("span");x.className="scan-tick";x.style.transform="translate(-50%,-50%) rotate("+(i*10)+"deg) translateY(-190px)";t.append(x)}}
function ring(f){const parts=[...document.querySelectorAll(".scan-tick")],n=Math.round(Math.min(1,Math.max(0,f))*36);parts.forEach((e,i)=>{e.classList.toggle("done",i<n);e.classList.toggle("active",i===n)})}
async function stopCamera(){
 state.active=false; if(state.camera){state.camera.getTracks().forEach(t=>t.stop());state.camera=null}
 $("#video").srcObject=null;
}
async function success(ok,fullName,info){
 display("resultView");
 $("#resultIcon").textContent=ok?"✓":"!";
 $("#resultTitle").textContent=ok?"МУВАФФАҚИЯТЛИ":"БЕЛГИЛАНМАДИ";
 $("#resultName").textContent=fullName||"";
 $("#resultPosition").textContent=ok?"":(info||"");
 $("#resultType").textContent=ok?(state.mode==="OUT"?"КЕТДИ":state.mode==="IN"?"КЕЛДИ":"ЮЗ ТАЙЁР"):"";
 $("#resultTime").textContent=new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",hour:"2-digit",minute:"2-digit"}).format(new Date());
 $("#resultNote").textContent=ok?"Серверда сақланди":(info||"Сервер қабул қилмади");
 setTimeout(()=>{state.busy=false;state.mode=null;display("idleView");ring(0)},ok?2400:4400);
}
function faceQuality(f){return {embedding:f?.embedding||[],live:Number(f?.live??0),real:Number(f?.real??0),score:Number(f?.score??f?.faceScore??f?.boxScore??0),size:Math.min(Number(f?.box?.[2]||0),Number(f?.box?.[3]||0))}}
function similarity(a,b){let dot=0,na=0,nb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return dot/(Math.sqrt(na)*Math.sqrt(nb)||1)}
function capture(){
 const v=$("#video"),c=document.createElement("canvas");
 c.width=480;c.height=360;c.getContext("2d").drawImage(v,0,0,c.width,c.height);
 return c.toDataURL("image/jpeg",.54);
}
function blink(result){
 const gestures=Object.values(result?.gesture||{}).map(g=>String(g?.gesture||g||""));
 const eyesClosed=gestures.includes("blink left eye")||gestures.includes("blink right eye");
 const now=performance.now();
 if(eyesClosed&&!state.blinkStart)state.blinkStart=now;
 if(!eyesClosed&&state.blinkStart){
  const ms=now-state.blinkStart;state.blinkStart=0;
  if(ms>=40&&ms<=900)state.blinkMs=Math.round(ms);
 }
 return state.blinkMs>=40;
}
async function scan(mode,code=""){
 if(state.active||state.busy)return;
 if(!state.device){setup("Терминал уланмаган");return}
 state.busy=true;state.mode=mode;state.samples=[];state.lastSample=null;
 state.blinkStart=0;state.blinkMs=0;state.challenge=null;state.pendingEnrollment=null;
 state.started=performance.now();
 try{
  if(mode==="ENROLL"){
   const r=await api("device.enrollmentInfo",{code});
   state.pendingEnrollment={...r,code};
  }else state.challenge=await api("device.challenge",{mode});
  display("cameraView");
  $("#modeBadge").textContent=mode==="IN"?"КЕЛДИ":mode==="OUT"?"КЕТДИ":"ЮЗНИ РЎЙХАТГА ОЛИШ";
  $("#cameraStatus").textContent="КАМЕРА ТАЙЁРЛАНМОҚДА…";
  $("#enrollCounter").classList.toggle("hidden",mode!=="ENROLL");
  $("#enrollCounter").textContent="0 / 6";
  $(".camera-card").classList.toggle("enroll-mode",mode==="ENROLL");
  $("#faceScanner").className="face-scanner "+(mode==="ENROLL"?"enrolling":"recognizing");
  message("Камера тайёрланмоқда","Бир марта кўзингизни юминг");
  const streamPromise=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:"user",width:{ideal:640},height:{ideal:480}}});
  const humanPromise=ensureHuman();
  state.camera=await streamPromise;
  $("#video").srcObject=state.camera; await $("#video").play();
  await humanPromise;
  state.active=true;state.busy=false; $("#cameraStatus").textContent="ТАЙЁР";
  requestAnimationFrame(frame);
 }catch(e){await stopCamera();state.busy=false;display("idleView");toast("Камера ёки сервер: "+errText(e))}
}
let lastFrame=0,validFrames=0;
async function frame(){
 if(!state.active)return;
 requestAnimationFrame(frame);
 if(state.busy||performance.now()-lastFrame<210)return;
 lastFrame=performance.now();
 if(performance.now()-state.started>39000){state.busy=true;await stopCamera();await success(false,"","Текширув вақти тугади");return}
 try{
  const r=await state.human.detect($("#video"));
  if(r.face?.length!==1){ring(.08);validFrames=0;message(r.face?.length>1?"Фақат бир киши":"Камерага қаранг","Юзингизни рамкада ушланг");return}
  const f=r.face[0],q=faceQuality(f);
  if(q.live<.55||q.real<.55||q.embedding.length<64||q.size<100||q.size>360){
   validFrames=0;message("Камерага қаранг","Юзни тўғри ёритинг");return;
  }
  if(!blink(r)){message("Бир марта кўзингизни юминг","Тириклик текширилмоқда");ring(.19);return}
  validFrames++;
  if(state.mode==="ENROLL"){
   if(state.lastSample&&similarity(q.embedding,state.lastSample)>.9994)return;
   if(state.samples.length>0&&Date.now()-(state.lastSampleAt||0)<350)return;
   state.samples.push({embedding:q.embedding.map(v=>Math.round(v*1e6)/1e6),
    quality:Math.min(1,(q.live+q.real+q.score)/3),pose:"sample-"+(state.samples.length+1)});
   state.lastSample=q.embedding;state.lastSampleAt=Date.now();
   $("#enrollCounter").textContent=state.samples.length+" / 6";ring(state.samples.length/6);
   message(state.pendingEnrollment?.employee?.full_name||"Ходим",
    state.samples.length<6?"Бошингизни секин айлантиринг":"Сақланмоқда");
   if(state.samples.length<6)return;
  } else if(validFrames<3){ring(validFrames/3);message("Текширилмоқда","Юз аниқланмоқда");return}
  state.busy=true;
  const emb=q.embedding.map(v=>Math.round(v*1e6)/1e6);
  const photo=state.mode==="ENROLL"?null:capture();
  await stopCamera();
  display("resultView");$("#resultIcon").textContent="…";$("#resultTitle").textContent="САҚЛАНМОҚДА";
  $("#resultName").textContent="";$("#resultPosition").textContent="";
  $("#resultType").textContent="";$("#resultTime").textContent="";
  $("#resultNote").textContent="Сервер тасдиғи кутилмоқда";
  try{
   let result;
   if(state.mode==="ENROLL"){
    result=await api("device.enroll",{code:state.pendingEnrollment.code,blinkOk:true,
     blinkMs:state.blinkMs,samples:state.samples},30000);
   }else{
    result=await api("device.mark",{eventId:crypto.randomUUID(),nonce:state.challenge.nonce,
     mode:state.mode,embedding:emb,livenessScore:q.live,realScore:q.real,
     blinkOk:true,blinkMs:state.blinkMs,photoDataUrl:photo},true,45000);
   }
   // device.mark must be called with device credentials.
   await success(true,result.fullName||state.pendingEnrollment?.employee?.full_name||"","");
  }catch(e){await success(false,"",errText(e))}
 }catch(e){console.error("SCAN_ERROR",e?.message||"error");}
}
function setup(error){
 display("setupView");$("#setupError").textContent=error||"";
 const root=$("#setupDetail");
 root.replaceChildren();
 const label=document.createElement("p");label.textContent="Админкадан бир марталик улаш кодини киритинг.";root.append(label);
 const input=document.createElement("input");input.id="pairCode";input.placeholder="Улаш коди";input.autocomplete="off";input.style.cssText="padding:14px;width:100%;border-radius:14px;border:1px solid #8da6cd;margin:10px 0";root.append(input);
 const button=document.createElement("button");button.className="primary-btn";button.textContent="ТЕРМИНАЛНИ УЛАШ";root.append(button);
 button.onclick=async()=>{button.disabled=true;try{
  const r=await api("pair",{code:input.value.trim()},false,20000);
  state.device={deviceId:r.deviceId,deviceToken:r.deviceToken};
  localStorage.setItem(STORE,JSON.stringify(state.device));await init();
 }catch(e){$("#setupError").textContent=errText(e)}finally{button.disabled=false}};
 $("#retrySetupBtn").textContent="Қайта текшириш";
}
async function init(){
 try{
  state.device=JSON.parse(localStorage.getItem(STORE)||"null");
  if(!state.device){setup("");return}
  display("loadingView");
  await api("device.bootstrap",{},true,20000);
  display("idleView");
  const url=new URL(location.href),code=url.searchParams.get("enroll");
  if(code)scan("ENROLL",code).catch(e=>toast(errText(e)));
 }catch(e){state.device=null;localStorage.removeItem(STORE);setup(errText(e))}
}
function service(){
 const modal=$("#modal");
 $("#modalContent").innerHTML="<h2>DAVOMAT сервис</h2><p>Face ID серверда текширилади. Версия: "+VERSION+
  "</p><p>Рўйхатга олиш коди</p><input id='enrollInput' placeholder='Рўйхатга олиш коди' style='width:100%;padding:14px;border-radius:12px'>"+
  "<button id='enrollGo' class='primary-btn'>ЮЗНИ РЎЙХАТГА ОЛИШ</button>"+
  "<p><a href='./admin' target='_blank' rel='noopener'>Админка</a></p>";
 modal.classList.remove("hidden");
 $("#enrollGo").onclick=()=>{const code=$("#enrollInput").value.trim();modal.classList.add("hidden");scan("ENROLL",code)}
}
circle();clock();setInterval(clock,1000);status();
window.addEventListener("online",status);window.addEventListener("offline",status);
$("#inBtn").onclick=()=>scan("IN");$("#outBtn").onclick=()=>scan("OUT");
$("#adminBtn").onclick=service;
$("#startEnrollBtn").onclick=()=>service();
$("#retrySetupBtn").onclick=()=>init();
$("#cancelCameraBtn").onclick=async()=>{await stopCamera();state.busy=false;display("idleView")};
$("#modalClose").onclick=()=>$("#modal").classList.add("hidden");
$("#modal").onclick=e=>{if(e.target===$("#modal"))$("#modal").classList.add("hidden")};
$("#loadingTitle").textContent="DAVOMAT 2.0";
$("#loadingDetail").textContent="Supabase билан уланмоқда";
const brand=document.querySelector(".brand span");if(brand)brand.textContent="Юз терминали · v"+VERSION;
init();
})();
