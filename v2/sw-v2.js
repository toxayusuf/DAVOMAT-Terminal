const VERSION="davomat-v2-sw-2.0.3";
const STATIC_CACHE=VERSION+"-static";
const MODEL_CACHE=VERSION+"-models";
const STATIC=["./","./index.html","./admin.html","./assets/styles.css","./assets/terminal.js","./assets/admin.js"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(STATIC_CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith("davomat-v2-sw-")&&k!==STATIC_CACHE&&k!==MODEL_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
function human(u){return u.hostname==="cdn.jsdelivr.net"&&u.pathname.includes("/@vladmandic/human@3.3.6/")}
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const u=new URL(event.request.url);
 if(human(u)){
  event.respondWith((async()=>{
   const c=await caches.open(MODEL_CACHE);
   const hit=await c.match(event.request);
   if(hit)return hit;
   const res=await fetch(event.request,{cache:"no-cache"});
   if(res&&res.ok){try{await c.put(event.request,res.clone())}catch{}}
   return res;
  })());
  return;
 }
 if(u.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const c=await caches.open(STATIC_CACHE);
  if(event.request.mode==="navigate"){
   try{
    const res=await fetch(event.request,{cache:"no-store"});
    if(res&&res.ok)try{await c.put(event.request,res.clone())}catch{}
    return res;
   }catch{return (await c.match(event.request))||(await c.match("./index.html"))||new Response("DAVOMAT v2 offline",{status:503})}
  }
  const hit=await c.match(event.request);
  const net=fetch(event.request,{cache:"no-cache"}).then(async res=>{if(res&&res.ok)try{await c.put(event.request,res.clone())}catch{};return res}).catch(()=>null);
  event.waitUntil(net);
  return hit||(await net)||new Response("Asset unavailable",{status:503});
 })());
});