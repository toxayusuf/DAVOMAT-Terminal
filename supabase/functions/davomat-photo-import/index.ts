// One-time migration worker. Deploy with __IMPORT_HASH__ substituted privately.
// Do not enable after migration; replace deployment with HTTP 410 and discard access token.
import {createClient} from "npm:@supabase/supabase-js@2";
const EXPECTED_HASH="__IMPORT_HASH__";
async function sha(bytes:Uint8Array){
 const d=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function bytesFromPgBytea(value:unknown){
 const s=String(value||"");
 if(s.startsWith("\\x")){
  const h=s.slice(2);
  if(!/^[a-f0-9]+$/i.test(h)||h.length%2)throw Error("INVALID_HEX_BYTEA");
  return Uint8Array.from(h.match(/.{2}/g)!.map(b=>parseInt(b,16)));
 }
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error("INVALID_BASE64_BYTEA");
 return Uint8Array.from(atob(s),x=>x.charCodeAt(0));
}
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const raw=String(req.headers.get("x-import-token")||"");
 if(!/^[0-9a-f]{64}$/i.test(raw) ||
   await sha(new TextEncoder().encode(raw))!==EXPECTED_HASH)
  return new Response("Forbidden",{status:403});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return new Response("Not configured",{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:staged,error:errorStaged}=await db.from("davomat_photo_staging")
 .select("source_file_id,event_id,file_data,file_size,sha256");
 if(errorStaged)return new Response("Database read failed",{status:500});
 let copied=0;const failed:string[]=[];
 for(const s of staged||[]){
  try{
   const bytes=bytesFromPgBytea(s.file_data);
   if(bytes.length!==s.file_size||bytes.length<1000||
      bytes[0]!==255||bytes[1]!==216||
      bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)
    throw Error("IMAGE_INVALID");
   if(await sha(bytes)!==s.sha256)throw Error("HASH_MISMATCH");
   const {data:event,error:e}=await db.from("davomat_attendance_events")
    .select("id,employee_id,business_date,photo_path").eq("id",s.event_id).maybeSingle();
   if(e||!event||event.photo_path!=="legacy-drive:"+s.source_file_id)
    throw Error("EVENT_REFERENCE_INVALID");
   const path="photos/legacy/"+event.business_date+"/"+event.employee_id+"/"+event.id+".jpg";
   const {error:putError}=await db.storage.from("davomat-photos").upload(path,bytes,{
    contentType:"image/jpeg",upsert:true});
   if(putError)throw Error("STORAGE_UPLOAD_FAILED");
   const {error:changeError}=await db.from("davomat_attendance_events")
    .update({photo_path:path}).eq("id",event.id)
    .eq("photo_path",event.photo_path);
   if(changeError)throw Error("EVENT_UPDATE_FAILED");
   const {error:delError}=await db.from("davomat_photo_staging")
    .delete().eq("source_file_id",s.source_file_id);
   if(delError)throw Error("STAGING_CLEANUP_FAILED");
   await db.from("davomat_audit_log").insert({
    actor_id:"photo-migration",action:"IMPORT_PHOTO",entity:"ATTENDANCE_EVENT",
    entity_id:event.id,after_data:{path,sha256:s.sha256,bytes:s.file_size}
   });
   copied++;
  }catch(e){failed.push(String(e instanceof Error?e.message:"UNKNOWN_ERROR").slice(0,45))}
 }
 return new Response(JSON.stringify({ok:failed.length===0,copied,failedCount:failed.length,
  failedReasons:failed}),{
  status:failed.length?207:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
});
