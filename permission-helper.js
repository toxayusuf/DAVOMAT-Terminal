(() => {
'use strict';

const VERSION='1.1.2';
const CAMERA_ORIGIN=location.origin;
const CAMERA_HOST=location.hostname;

async function cameraPermissionState(){
  try{
    if(!navigator.permissions?.query) return 'unknown';
    const p=await navigator.permissions.query({name:'camera'});
    return p?.state||'unknown';
  }catch{
    return 'unknown';
  }
}

function stateText(state){
  if(state==='granted') return 'РУХСАТ БЕРИЛГАН';
  if(state==='denied') return 'БЛОКЛАНГАН';
  if(state==='prompt') return 'БИРИНЧИ РУХСАТ КУТИЛМОҚДА';
  return 'НОМАЪЛУМ';
}

function osHelp(){
  const ua=navigator.userAgent||'';
  if(/Windows/i.test(ua)){
    return 'Агар шу сайт учун Camera = Allow бўлса, Windows → Settings → Privacy & security → Camera → Camera access ва Let desktop apps access your camera ни ёқинг. Камерани ишлатаётган Zoom/Telegram/бошқа дастурни ҳам ёпиб кўринг.';
  }
  if(/iPhone|iPad|iPod/i.test(ua)){
    return 'Safari орқали очинг. iPhone Settings → Apps → Safari → Camera → Allow. Агар DAVOMAT бошқа илова ичида очилган бўлса, Safari\'да очинг.';
  }
  if(/Android/i.test(ua)){
    return 'Chrome → сайт белгиси → Permissions → Camera → Allow. Шунингдек Android Settings → Apps → Chrome → Permissions → Camera → Allow.';
  }
  return 'Браузер ва операцион тизим камерага рухсат берганини текширинг.';
}

async function rewriteCameraModal(){
  const modal=document.querySelector('#modal');
  const box=document.querySelector('#modalContent');
  if(!modal||!box||modal.classList.contains('hidden')) return;
  const text=box.textContent||'';
  if(!text.includes('Камерага рухсат керак')) return;
  if(box.dataset.permissionHelpVersion===VERSION) return;

  const state=await cameraPermissionState();
  box.dataset.permissionHelpVersion=VERSION;

  let main='';
  if(CAMERA_HOST==='toxayusuf.github.io'){
    main=`
      <div style="text-align:left;line-height:1.55;margin:12px 0;padding:12px;border-radius:12px;background:rgba(90,134,255,.10);border:1px solid rgba(90,134,255,.28)">
        <b>МУҲИМ:</b> камера DAVOMAT терминали ишлаётган <b>${CAMERA_HOST}</b> сайтига тегишли.<br>
        <b>script.google.com</b> учун берилган Camera = Allow бу ерга ўтмайди.
      </div>`;
  }

  let action='';
  if(state==='denied'){
    action=`<p style="text-align:left"><b>Ҳозирги ҳолат:</b> Chrome айнан <b>${CAMERA_HOST}</b> учун камерани блоклаган.<br><br>
      DAVOMAT саҳифасига қайтинг → адрес сатри чапидаги сайт белгиси → <b>Site settings / Настройки сайта</b> → <b>Camera / Камера → Allow / Разрешить</b> → саҳифани янгиланг.</p>`;
  }else if(state==='granted'){
    action=`<p style="text-align:left"><b>Сайт рухсати тўғри.</b> Лекин камера ҳали ҳам очилмаяпти. Бу ҳолатда браузердан юқори даражадаги — Windows/iOS/Android камера рухсати ёки камерани бошқа дастур эгаллаб тургани текширилади.<br><br>${osHelp()}</p>`;
  }else{
    action=`<p style="text-align:left">Бу сайт камерага биринчи марта мурожаат қилмоқда. <b>ҚАЙТА СИНАШ</b> ни босганда браузернинг Camera сўрови чиқса, <b>Allow / Разрешить</b> ни танланг.</p>`;
  }

  const oldRetry=box.querySelector('#cameraRetry');
  box.innerHTML=`
    <h2>Камера рухсатини текширинг</h2>
    ${main}
    <div class="service-stat"><span>Камера ишлайдиган сайт</span><b style="word-break:break-all">${CAMERA_ORIGIN}</b></div>
    <div class="service-stat"><span>Chrome рухсати</span><b>${stateText(state)}</b></div>
    ${action}
    <button id="cameraRetry2" class="primary-btn" style="margin-top:14px">ҚАЙТА СИНАШ</button>
  `;
  const retry=box.querySelector('#cameraRetry2');
  retry.onclick=()=>{
    modal.classList.add('hidden');
    if(oldRetry) oldRetry.click();
    else {
      const btn=document.querySelector('#inBtn');
      if(btn) btn.click();
    }
  };
}

const observer=new MutationObserver(()=>{ rewriteCameraModal().catch(()=>{}); });
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

window.addEventListener('pageshow',()=>rewriteCameraModal().catch(()=>{}));

// Keep the visible build number synchronized without changing the Apps Script backend.
for(const el of document.querySelectorAll('.brand span')){
  if((el.textContent||'').includes('Юз терминали')) el.textContent='Юз терминали · v'+VERSION;
}
})();