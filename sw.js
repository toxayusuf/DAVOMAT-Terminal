const VERSION='1.4.0-hotfix1';
const SHELL_CACHE=`davomat-shell-v${VERSION}`;
const MODEL_CACHE='davomat-model-runtime-v1';
const SHELL=[
  './',
  './index.html',
  './styles.css?v=1.4.0',
  './app.js?v=1.4.0',
  './top-level-fix.js?v=1.4.0-hotfix1',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==SHELL_CACHE&&key!==MODEL_CACHE).map(key=>caches.delete(key)));
    if(self.registration.navigationPreload){
      try{await self.registration.navigationPreload.enable();}catch{}
    }
    await self.clients.claim();
  })());
});

function isHumanModel(url){
  return url.hostname==='cdn.jsdelivr.net' &&
    (url.pathname.includes('/@vladmandic/human@') || url.pathname.includes('/models/'));
}

async function modelCacheFirst(request){
  const cache=await caches.open(MODEL_CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request,{cache:'force-cache'});
  if(response&&response.ok){try{await cache.put(request,response.clone());}catch{}}
  return response;
}

async function navigationShell(event){
  const cache=await caches.open(SHELL_CACHE);
  const cached=await cache.match('./index.html');
  const networkPromise=(async()=>{
    try{
      const preload=await event.preloadResponse;
      const response=preload||await fetch(event.request,{cache:'no-cache'});
      if(response&&response.ok){try{await cache.put('./index.html',response.clone());}catch{}}
      return response;
    }catch{return null;}
  })();
  event.waitUntil(networkPromise);
  if(cached)return cached;
  const network=await networkPromise;
  if(network)return network;
  return new Response('DAVOMAT offline',{status:503,headers:{'Content-Type':'text/plain; charset=UTF-8'}});
}

async function shellStaleWhileRevalidate(event){
  const cache=await caches.open(SHELL_CACHE);
  const cached=await cache.match(event.request);
  const networkPromise=fetch(event.request,{cache:'no-cache'})
    .then(async response=>{
      if(response&&response.ok){try{await cache.put(event.request,response.clone());}catch{}}
      return response;
    })
    .catch(()=>null);
  event.waitUntil(networkPromise);
  if(cached)return cached;
  const network=await networkPromise;
  if(network)return network;
  return cache.match('./index.html');
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(isHumanModel(url)){
    event.respondWith(modelCacheFirst(event.request).catch(()=>fetch(event.request)));
    return;
  }

  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith(navigationShell(event));
    return;
  }

  event.respondWith(shellStaleWhileRevalidate(event));
});