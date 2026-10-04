import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OWNER_EMAIL = "tohirjon.uzb@gmail.com";
const VERSION = "2.0.0-preview";
const ORIGINS = new Set([
  "https://toxayusuf.github.io",
  "https://glrluvbgrdftpcmwbhtr.supabase.co",
  "https://davomat.dev",
  "https://www.davomat.dev"
]);

function httpHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-davomat-device,x-davomat-token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}
function reply(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: httpHeaders(req) });
}
function error(req: Request, code: string, status = 400) {
  return reply(req, { ok: false, error: code }, status);
}
function client() {
  if (!PROJECT_URL || !SERVICE_KEY) throw new Error("SERVER_CONFIGURATION");
  return createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
function token(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hash(text: string) {
  const bytes = new TextEncoder().encode(text);
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function failIf(err: unknown) {
  if (err) throw new Error("DATABASE_ERROR");
}
async function verifyDevice(req: Request, db: ReturnType<typeof client>) {
  const deviceId = String(req.headers.get("x-davomat-device") || "").trim();
  const raw = String(req.headers.get("x-davomat-token") || "");
  if (!deviceId || raw.length < 32 || raw.length > 200) return null;
  const { data, error: e } = await db.from("davomat_devices")
    .select("id,token_hash,active").eq("id", deviceId).maybeSingle();
  if (e || !data?.active) return null;
  const digest = await hash(raw);
  // Both hashes are ASCII 64 characters; constant work regardless of first mismatch.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= digest.charCodeAt(i) ^ data.token_hash.charCodeAt(i);
  return diff === 0 ? deviceId : null;
}
async function verifyAdmin(req: Request, db: ReturnType<typeof client>, autoClaim = false) {
  const raw = req.headers.get("Authorization") || "";
  const jwt = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!jwt || jwt.length > 5000) return null;
  const { data: auth, error: e } = await db.auth.getUser(jwt);
  const u = auth?.user;
  if (e || !u || !u.email_confirmed_at) return null;
  let { data: role } = await db.from("davomat_admin_users")
    .select("role,enabled").eq("user_id", u.id).maybeSingle();
  if (!role && autoClaim && u.email?.toLowerCase() === OWNER_EMAIL) {
    const { count } = await db.from("davomat_admin_users").select("user_id", { count: "exact", head: true });
    if (count === 0) {
      const { error: claimErr } = await db.from("davomat_admin_users").upsert({
        user_id: u.id, role: "owner", enabled: true
      }, { onConflict: "user_id" });
      failIf(claimErr);
      role = { role: "owner", enabled: true };
    }
  }
  if (!role?.enabled) return null;
  return { id: u.id, email: u.email || "", role: role.role };
}
function checkEmbedding(embedding: unknown): number[] | null {
  if (!Array.isArray(embedding) || embedding.length < 64 || embedding.length > 1024) return null;
  const a = embedding.map(Number);
  return a.every(x => Number.isFinite(x) && Math.abs(x) < 1000) ? a : null;
}
function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return -1;
  let dot = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return x > 0 && y > 0 ? dot / (Math.sqrt(x) * Math.sqrt(y)) : -1;
}
async function recognizedFace(db: ReturnType<typeof client>, embedding: number[]) {
  const { data: profiles, error: e } = await db.from("davomat_face_profiles")
    .select("employee_id,embedding").eq("active", true);
  failIf(e);
  const { data: employees, error: empErr } = await db.from("davomat_employees")
    .select("id,full_name,position").eq("active", true).eq("face_status", "READY");
  failIf(empErr);
  const allowed = new Map((employees || []).map(x => [x.id, x]));
  const scores = new Map<string, number>();
  for (const row of profiles || []) {
    if (!allowed.has(row.employee_id)) continue;
    const score = cosine(embedding, row.embedding as number[]);
    if (score > (scores.get(row.employee_id) ?? -1)) scores.set(row.employee_id, score);
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [bestId, score] = ranked[0] || ["", -1];
  const second = ranked[1]?.[1] ?? -1;
  const { data: setting } = await db.from("davomat_settings")
    .select("value").eq("key", "FACE_MATCH_THRESHOLD").maybeSingle();
  // Prevent unsafe legacy settings from lowering the minimum to 0.62.
  const minMatch = Math.max(0.80, Number(setting?.value || 0.8));
  return bestId && score >= minMatch && score - second >= 0.035
    ? { person: allowed.get(bestId)!, score } : null;
}
function checkProof(x: Record<string, unknown>) {
  const live = Number(x.livenessScore), real = Number(x.realScore);
  const blinkMs = Number(x.blinkMs);
  return x.blinkOk === true && Number.isFinite(live) && Number.isFinite(real)
    && live >= 0.55 && real >= 0.55 && live <= 1 && real <= 1
    && blinkMs >= 40 && blinkMs <= 900;
}
function jpegFromDataUrl(x: unknown) {
  const s = String(x || "");
  if (!s.startsWith("data:image/jpeg;base64,") || s.length > 1000000) throw new Error("PHOTO_REQUIRED");
  const base64 = s.slice(23);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("PHOTO_INVALID");
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  if (bytes.length < 3000 || bytes.length > 524288) throw new Error("PHOTO_SIZE_INVALID");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
    throw new Error("PHOTO_INVALID");
  return bytes;
}
function validDate(value: unknown) {
  const d = new Date(String(value || ""));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
async function run(req: Request, x: Record<string, any>) {
  const db = client();
  const action = String(x.action || "");
  if (action === "health") return { ok: true, service: "DAVOMAT", version: VERSION };

  if (action === "pair") {
    const code = String(x.code || "").trim();
    if (!/^[A-Za-z0-9_-]{12,22}$/.test(code)) return { ok: false, error: "PAIR_CODE_INVALID" };
    const h = await hash(code);
    const { data: pairing } = await db.from("davomat_device_pairings")
      .select("id,device_id,used_at,expires_at").eq("code_hash", h).maybeSingle();
    if (!pairing || pairing.used_at || Date.parse(pairing.expires_at) < Date.now())
      return { ok: false, error: "PAIR_CODE_INVALID" };
    // Serialized by the unique code+consumed flag. Never return an old token.
    const rawToken = token(32);
    const { data: claimed, error: claimErr } = await db.from("davomat_device_pairings")
      .update({ used_at: new Date().toISOString() }).eq("id", pairing.id).is("used_at", null).select("id");
    failIf(claimErr);
    if (!claimed?.length) return { ok: false, error: "PAIR_CODE_USED" };
    const { error: devErr } = await db.from("davomat_devices").update({
      token_hash: await hash(rawToken), active: true
    }).eq("id", pairing.device_id);
    failIf(devErr);
    return { ok: true, deviceId: pairing.device_id, deviceToken: rawToken };
  }

  if (action.startsWith("admin.")) {
    const admin = await verifyAdmin(req, db, true);
    if (!admin) return { ok: false, error: "ADMIN_FORBIDDEN" };
    if (action === "admin.whoami") return { ok: true, admin };
    if (action === "admin.dashboard") {
      const [emps, days, events, schedules, salaries] = await Promise.all([
        db.from("davomat_employees").select("id,full_name,position,active,face_status,monthly_salary,schedule_id,start_date").order("full_name"),
        db.from("davomat_attendance_days").select("*").order("business_date", { ascending: false }).limit(200),
        db.from("davomat_attendance_events").select("id,employee_id,event_type,event_at,status,review_reason,match_score,liveness_score,realness_score,blink_ok,photo_path").order("server_time", { ascending: false }).limit(200),
        db.from("davomat_schedules").select("*"),
        db.from("davomat_salary").select("*").order("month", { ascending: false }).limit(200)
      ]);
      for (const r of [emps,days,events,schedules,salaries]) failIf(r.error);
      return { ok: true, employees: emps.data, days: days.data, events: events.data,
        schedules:schedules.data, salaries:salaries.data };
    }
    if (action === "admin.pairing") {
      if (!["owner","admin"].includes(admin.role)) return { ok:false, error:"ADMIN_FORBIDDEN" };
      const id = String(x.deviceId || "terminal-01").trim();
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(id)) return { ok:false, error:"DEVICE_ID_INVALID" };
      const { error: devErr } = await db.from("davomat_devices").upsert({
        id, name: String(x.name || "DAVOMAT Terminal").slice(0,128),
        token_hash: await hash(token(32)), active: false
      }, { onConflict: "id" });
      failIf(devErr);
      const code = token(12);
      const { error: pairErr } = await db.from("davomat_device_pairings").insert({
        code_hash: await hash(code), device_id: id,
        expires_at: new Date(Date.now()+10*60000).toISOString(), created_by: admin.id
      });
      failIf(pairErr);
      return { ok:true, code, expiresInSeconds:600, deviceId:id };
    }
    if (action === "admin.enrollment") {
      if (!["owner","admin"].includes(admin.role)) return { ok:false,error:"ADMIN_FORBIDDEN" };
      const id = String(x.employeeId || ""), deviceId = String(x.deviceId || "terminal-01");
      const { data: emp } = await db.from("davomat_employees").select("id,active").eq("id", id).maybeSingle();
      if (!emp?.active) return { ok:false,error:"EMPLOYEE_NOT_ACTIVE" };
      const code = token(12);
      const { error: enErr } = await db.from("davomat_enrollment_sessions").insert({
        code_hash: await hash(code), employee_id:id, device_id:deviceId, status:"OPEN",
        expires_at:new Date(Date.now()+8*60000).toISOString()
      });
      failIf(enErr);
      return {ok:true,code,expiresInSeconds:480};
    }
    if (action === "admin.resetFace") {
      if (!["owner","admin"].includes(admin.role)) return {ok:false,error:"ADMIN_FORBIDDEN"};
      const id = String(x.employeeId||"");
      const { error: pErr } = await db.from("davomat_face_profiles").update({active:false}).eq("employee_id",id);
      failIf(pErr);
      const { error: eErr } = await db.from("davomat_employees").update({
        face_status:"NOT_ENROLLED", updated_at:new Date().toISOString()
      }).eq("id",id);
      failIf(eErr);
      await db.from("davomat_enrollment_sessions").update({ status:"CANCELLED" })
        .eq("employee_id",id).eq("status","OPEN");
      return {ok:true};
    }
    if (action === "admin.photoUrl") {
      const path = String(x.path||"");
      if (!path.startsWith("photos/")) return {ok:false,error:"PHOTO_PATH_INVALID"};
      const {data,error:e}=await db.storage.from("davomat-photos").createSignedUrl(path,120);
      failIf(e);
      return {ok:true,url:data.signedUrl};
    }
    return {ok:false,error:"ACTION_UNKNOWN"};
  }

  const deviceId = await verifyDevice(req,db);
  if (!deviceId) return {ok:false,error:"DEVICE_AUTH_FAILED"};
  await db.from("davomat_devices").update({ last_seen_at:new Date().toISOString() }).eq("id",deviceId);
  if (action === "device.bootstrap") {
    return {ok:true,version:VERSION,deviceId,faceMatchMinimum:0.80};
  }
  if (action === "device.challenge") {
    const mode=String(x.mode||"");
    if (!["IN","OUT"].includes(mode)) return {ok:false,error:"MODE_INVALID"};
    const nonce=token(24);
    const {error:e}=await db.from("davomat_scan_sessions").insert({
      nonce_hash:await hash(nonce),device_id:deviceId,requested_mode:mode,
      expires_at:new Date(Date.now()+40*1000).toISOString()
    });
    failIf(e);
    return {ok:true,nonce,mode,expiresInSeconds:40,challenge:"blink"};
  }
  if (action === "device.mark") {
    if (!checkProof(x)) return {ok:false,error:"LIVENESS_REQUIRED"};
    const emb=checkEmbedding(x.embedding);
    if (!emb) return {ok:false,error:"INVALID_EMBEDDING"};
    const person=await recognizedFace(db,emb);
    if (!person) return {ok:false,error:"FACE_NOT_MATCHED"};
    const mode=String(x.mode||"");
    if (!["IN","OUT"].includes(mode)) return {ok:false,error:"MODE_INVALID"};
    const eid=String(x.eventId||"");
    if(!/^[0-9a-f-]{36}$/i.test(eid))return {ok:false,error:"EVENT_ID_INVALID"};
    const image=jpegFromDataUrl(x.photoDataUrl);
    const eventAt=new Date().toISOString();
    const path="photos/"+eventAt.slice(0,10)+"/"+person.person.id+"/"+eid+".jpg";
    // Store the evidence before the mark; on rejection, remove orphan.
    const {error:imgErr}=await db.storage.from("davomat-photos").upload(path,image,{
      contentType:"image/jpeg",upsert:false
    });
    failIf(imgErr);
    const {data,error:e}=await db.rpc("davomat_commit_mark",{
      p_event_id:eid,p_device_id:deviceId,p_employee_id:person.person.id,
      p_nonce_hash:await hash(String(x.nonce||"")),p_requested_type:mode,
      p_event_at:eventAt,p_match:person.score,p_live:Number(x.livenessScore),
      p_real:Number(x.realnessScore),p_blink:true,p_photo_path:path,p_source:"LIVE"
    });
    if(e) {
      await db.storage.from("davomat-photos").remove([path]);
      const message=String(e.message||"");
      if (message.includes("EVENT_TYPE_MISMATCH")) return {ok:false,error:"EVENT_TYPE_MISMATCH"};
      if (message.includes("ALREADY_MARKED")) return {ok:false,error:"ALREADY_MARKED"};
      if (message.includes("CHALLENGE_INVALID")) return {ok:false,error:"CHALLENGE_INVALID"};
      return {ok:false,error:"ATTENDANCE_NOT_SAVED"};
    }
    return {...data,fullName:person.person.full_name,position:person.person.position};
  }
  if (action === "device.enrollmentInfo") {
    const code=String(x.code||"");
    const {data}=await db.from("davomat_enrollment_sessions")
      .select("employee_id,status,device_id,expires_at")
      .eq("code_hash",await hash(code)).maybeSingle();
    if(!data||data.status!=="OPEN"||data.device_id!==deviceId||Date.parse(data.expires_at)<Date.now())
      return {ok:false,error:"ENROLLMENT_NOT_FOUND"};
    const {data:emp}=await db.from("davomat_employees")
      .select("id,full_name,position,active").eq("id",data.employee_id).maybeSingle();
    if(!emp?.active)return {ok:false,error:"EMPLOYEE_NOT_ACTIVE"};
    return {ok:true,employee:emp,samples:6};
  }
  if(action==="device.enroll") {
    if(x.blinkOk!==true || Number(x.blinkMs)<40 || Number(x.blinkMs)>900)
      return {ok:false,error:"ENROLLMENT_LIVENESS_REQUIRED"};
    const code=String(x.code||"");
    const h=await hash(code);
    const {data:session}=await db.from("davomat_enrollment_sessions")
      .select("id,employee_id,device_id,status,expires_at")
      .eq("code_hash",h).maybeSingle();
    if(!session||session.status!=="OPEN"||session.device_id!==deviceId||
      Date.parse(session.expires_at)<Date.now())return {ok:false,error:"ENROLLMENT_NOT_FOUND"};
    if(!Array.isArray(x.samples)||x.samples.length!==6)return {ok:false,error:"SIX_SAMPLES_REQUIRED"};
    const samples=x.samples.map((s:Record<string,unknown>)=>({
      employee_id:session.employee_id,embedding:checkEmbedding(s.embedding),
      pose_label:String(s.pose||""),quality_score:Number(s.quality)
    }));
    if(samples.some((s:any)=>!s.embedding||!Number.isFinite(s.quality_score)||s.quality_score<0.55||s.quality_score>1))
      return {ok:false,error:"SAMPLE_QUALITY_LOW"};
    const {data:claimed,error:ce}=await db.from("davomat_enrollment_sessions")
      .update({status:"USED",used_at:new Date().toISOString()})
      .eq("id",session.id).eq("status","OPEN").select("id");
    failIf(ce);
    if(!claimed?.length)return {ok:false,error:"SESSION_ALREADY_USED"};
    const {error:old}=await db.from("davomat_face_profiles").update({active:false})
      .eq("employee_id",session.employee_id).eq("active",true);
    failIf(old);
    const {error:pe}=await db.from("davomat_face_profiles").insert(samples.map((s:any)=>({...s,active:true})));
    failIf(pe);
    const {error:ee}=await db.from("davomat_employees").update({
      face_status:"READY",updated_at:new Date().toISOString()
    }).eq("id",session.employee_id);
    failIf(ee);
    return {ok:true,status:"ENROLLED",profiles:samples.length,employeeId:session.employee_id};
  }
  return {ok:false,error:"ACTION_UNKNOWN"};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:httpHeaders(req)});
  if(req.method==="GET")return reply(req,{ok:true,service:"DAVOMAT",version:VERSION,mode:"preview",publicAnonKey:Deno.env.get("SUPABASE_ANON_KEY")||""});
  if(req.method!=="POST")return error(req,"METHOD_NOT_ALLOWED",405);
  const size=Number(req.headers.get("content-length")||0);
  if(size>1500000)return error(req,"PAYLOAD_TOO_LARGE",413);
  try {
    const x=await req.json();
    if (!x||typeof x!=="object"||Array.isArray(x))return error(req,"INVALID_BODY");
    const result=await run(req,x);
    return reply(req,result,result?.ok===false?400:200);
  } catch(e) {
    console.error("DAVOMAT_API_ERROR",String((e as Error).message||"ERROR").slice(0,120));
    return error(req,"SERVER_ERROR",500);
  }
});
