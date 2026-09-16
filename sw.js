const SHELL_CACHE='davomat-shell-v1.3.0';
const MODEL_CACHE='davomat-model-runtime-v1';
const SHELL=['./','./index.html','./styles.css','./app.js','./top-level-fix.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(SHELL_CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==SHELL_CACHE && k!==MODEL_CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  const isModel=u.hostname==='cdn.jsdelivr.net' && (u.pathname.includes('/@vladmandic/human@') || u.pathname.includes('/models/'));

  if(isModel){
    e.respondWith(
      caches.open(MODEL_CACHE).then(async c=>{
        const hit=await c.match(e.request);
        if(hit) return hit;
        const r=await fetch(e.request,{cache:'force-cache'});
        try{await c.put(e.request,r.clone());}catch{}
        return r;
      }).catch(()=>fetch(e.request))
    );
    return;
  }

  if(u.origin===self.location.origin){
    e.respondWith(
      fetch(e.request,{cache:'no-store'}).then(r=>{
        const x=r.clone();
        caches.open(SHELL_CACHE).then(c=>c.put(e.request,x)).catch(()=>{});
        return r;
      }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
    );
  }
});