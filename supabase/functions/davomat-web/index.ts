// DAVOMAT Supabase test web host. Preserves the original terminal appearance.
// This is an isolated preview, not the live Google Apps Script deployment.
const routes: Record<string,{file:string,type:string,cache:string}> = {
 "/":{file:"index.html",type:"text/html; charset=utf-8",cache:"no-cache, no-store, must-revalidate"},
 "/admin":{file:"admin.html",type:"text/html; charset=utf-8",cache:"no-cache, no-store, must-revalidate"},
 "/assets/styles.css":{file:"styles.css",type:"text/css; charset=utf-8",cache:"public, max-age=300"},
 "/assets/terminal.js":{file:"terminal.js",type:"text/javascript; charset=utf-8",cache:"public, max-age=300"},
 "/assets/admin.js":{file:"admin.js",type:"text/javascript; charset=utf-8",cache:"public, max-age=300"}
};
Deno.serve(async request=>{
 const path=new URL(request.url).pathname;
 const mark="/davomat-web";
 const suffix=(path.slice(path.indexOf(mark)+mark.length)||"/").replace(/\/+$/,"")||"/";
 const item=routes[suffix];
 if(!item)return new Response("Not found",{status:404});
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405});
 try{
  const content=await Deno.readTextFile(new URL("./"+item.file,import.meta.url));
  const headers=new Headers({
   "Content-Type":item.type,"Cache-Control":item.cache,
   "Referrer-Policy":"strict-origin-when-cross-origin",
   "X-Content-Type-Options":"nosniff",
   "X-Frame-Options":"DENY",
   "Permissions-Policy":"camera=(self), microphone=()",
   "Content-Security-Policy":
    "default-src 'self' https://cdn.jsdelivr.net; "+
    "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net; "+
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "+
    "connect-src 'self' https://cdn.jsdelivr.net https://*.supabase.co; "+
    "img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; "+
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
  });
  return new Response(request.method==="HEAD"?null:content,{status:200,headers});
 }catch(_e){return new Response("Resource unavailable",{status:503})}
});
