import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const sb=createClient("https://glrluvbgrdftpcmwbhtr.supabase.co",await fetch("https://glrluvbgrdftpcmwbhtr.supabase.co/functions/v1/davomat-api",{cache:"no-store"}).then(async response=>{if(!response.ok)throw Error("API_UNAVAILABLE");const info=await response.json();if(!info.publicAnonKey)throw Error("PUBLIC_CONFIG_UNAVAILABLE");return info.publicAnonKey;}),{
 auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
});
const API="https://glrluvbgrdftpcmwbhtr.supabase.co/functions/v1/davomat-api";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const state={session:null,admin:null,data:null,page:"overview",filter:"",busy:false};
const date=s=>{const n=new Date(s);return Number.isFinite(n.getTime())?new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Tashkent"}).format(n):"—"};
const money=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(Number(n||0))+" сум";
function notify(msg){const e=$("#notice");e.textContent=String(msg);e.style.display="block";clearTimeout(notify.t);notify.t=setTimeout(()=>e.style.display="none",5000)}
async function api(action,payload={}){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token)throw Error("Нужно войти повторно");
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
 try{
  const res=await fetch(API,{method:"POST",
   headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
   body:JSON.stringify({action,...payload}),signal:ctrl.signal,cache:"no-store"});
  const data=await res.json();
  if(!data.ok)throw Error(data.error||"SERVER_ERROR");
  return data;
 }finally{clearTimeout(timer)}
}
function login(){
 $("#app").innerHTML='<div class="layout-login fade"><div class="login-head"><div class="mark">D</div><h1>DAVOMAT</h1><p class="subtle">Панель управления · безопасный вход</p></div>'+
 '<div class="card"><h3>Ваш аккаунт</h3><label class="subtle">Почта</label><input class="input" id="email" type="email" value="tohirjon.uzb@gmail.com" autocomplete="username">'+
 '<label class="subtle">Пароль (если уже задан в Supabase Auth)</label><input class="input" id="pass" type="password" autocomplete="current-password" placeholder="Пароль">'+
 '<button class="button primary" style="width:100%;margin:9px 0" id="login">Войти</button>'+
 '<button class="button" style="width:100%" id="email-link">Отправить письмо для входа</button>'+
 '<p class="subtle" style="line-height:1.6">Доступ разрешён только подтверждённому администратору. Логин в Supabase Dashboard не создаёт автоматически пользователя Supabase Auth.</p></div></div>';
 $("#login").onclick=async()=>{try{
  const {error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#pass").value});
  if(error)throw error;await start();
 }catch(e){notify(e.message)}};
 $("#email-link").onclick=async()=>{try{
  const email=$("#email").value.trim();
  if(email!=="tohirjon.uzb@gmail.com")throw Error("Укажите аккаунт владельца");
  const {error}=await sb.auth.signInWithOtp({email,
    options:{emailRedirectTo:location.href.split("#")[0],shouldCreateUser:true}});
  if(error)throw error;
  notify("Проверьте почту: письмо для входа отправлено. Откройте ссылку.");
 }catch(e){notify(e.message)}};
}
const nav=[
 ["overview","Обзор"],["employees","Сотрудники"],["attendance","Посещаемость"],
 ["salary","Зарплата"],["devices","Устройства"]
];
function shell(){
 $("#app").innerHTML='<div class="shell fade"><aside><div class="logo"><span class="mark">D</span>DAVOMAT</div>'+
 nav.map(([id,label])=>'<button class="nav" data-page="'+id+'">'+label+'</button>').join("")+
 '<p class="subtle" style="padding:15px 8px">Supabase · 2.0 Preview</p>'+
 '<button class="nav" id="logout">Выйти</button></aside>'+
 '<main><div class="head"><div><h1 id="pageTitle">DAVOMAT</h1><div class="subtle" id="userEmail"></div></div>'+
 '<div style="display:flex;gap:8px;align-items:center"><span class="pill">Защищённое соединение</span><button class="button" id="reload">Обновить</button></div></div>'+
 '<div id="body"></div></main></div>';
 $("#userEmail").textContent=state.admin?.email||"";
 $("#logout").onclick=()=>sb.auth.signOut().then(()=>{state.session=null;state.data=null;login()});
 $("#reload").onclick=()=>load();
 for(const e of document.querySelectorAll("[data-page]"))
  e.onclick=()=>{state.page=e.dataset.page;render()};
}
function table(headers,rows){
 return '<div class="table-wrap"><table class="table"><thead><tr>'+headers.map(s=>'<th>'+esc(s)+'</th>').join("")+
 '</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
}
const td=s=>'<td>'+s+'</td>';
const card=(title,inner)=>'<div class="card"><h3>'+esc(title)+'</h3>'+inner+'</div>';
const tag=(s)=>'<span class="subtle">'+esc(s)+'</span>';
function renderOverview(){
 const d=state.data,emps=d.employees||[],days=d.days||[],events=d.events||[];
 const active=emps.filter(e=>e.active).length,ready=emps.filter(e=>e.active&&e.face_status==="READY").length;
 const reviewed=days.filter(e=>e.requires_review).length;
 const vals=[
 ["Сотрудники",active,emps.length+" всего"],["Face ID готов",ready,active+" активных"],
 ["Отметки",events.filter(e=>e.status==="ACCEPTED").length,events.length+" событий"],
 ["На проверке",reviewed,"дневных записей"]
 ];
 const list=events.slice(0,12).map(e=>'<tr>'+td(tag(date(e.event_at)))+td(esc(findEmp(e.employee_id)))+
 td(esc(e.event_type||"—"))+td(esc(e.status))+'</tr>');
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Tashkent"});
 const dayRows=days.filter(x=>x.business_date===today).map(x=>'<tr>'+
 td(esc(findEmp(x.employee_id)))+td(esc(x.status))+td(esc(date(x.first_in)))+td(esc(date(x.last_out)))+
 td(esc(x.worked_min))+'</tr>');
 return '<div class="metrics">'+vals.map(([name,n,detail])=>'<div class="card">'+
 '<div class="subtle">'+esc(name)+'</div><div class="stat">'+n+'</div><div class="subtle">'+esc(detail)+'</div></div>').join("")+
 '</div><div class="grid2">'+card("Последние отметки",table(["Время","Сотрудник","Тип","Статус"],list))+
 card("Сегодня",table(["Сотрудник","Статус","Пришёл","Ушёл","Минуты"],dayRows))+'</div>';
}
function findEmp(id){return state.data.employees.find(x=>x.id===id)?.full_name||id||"—"}
function renderEmployees(){
 const employees=state.data.employees||[];
 const rows=employees.map(e=>'<tr>'+td('<strong>'+esc(e.full_name)+'</strong>')+td(esc(e.position||""))+
 td(e.active?"Активен":"Отключён")+td(esc(e.face_status))+td(money(e.monthly_salary))+
 td('<button class="mini" data-enroll="'+esc(e.id)+'">Face ID</button>'+
 '<button class="mini warn" data-reset="'+esc(e.id)+'">Face reset</button>')+'</tr>');
 return card("Сотрудники / Face ID",'<p class="subtle">Сохранены идентификаторы сотрудников. Регистрация выполняется камерой терминала.</p>'+
 table(["Имя","Должность","Активность","Face ID","Оклад","Управление"],rows));
}
function renderAttendance(){
 const rows=(state.data.days||[]).map(x=>'<tr>'+td(esc(x.business_date))+
 td(esc(findEmp(x.employee_id)))+td(esc(x.status))+td(esc(date(x.first_in)))+
 td(esc(date(x.last_out)))+td(esc(x.worked_min))+
 td(esc(x.late_min))+td(x.requires_review?"Проверить":"—")+'</tr>');
 return card("Посещаемость",table(["Дата","Сотрудник","Статус","Приход","Уход","Мин.","Опоздание","Контроль"],rows));
}
function renderSalary(){
 const rows=(state.data.salaries||[]).map(s=>'<tr>'+
 td(esc(s.month))+td(esc(findEmp(s.employee_id)))+td(esc(s.planned_days))+
 td(esc(s.absent_days))+td(money(s.absence_deduction))+
 td(money(s.payable))+td(esc(s.status))+'</tr>');
 return card("Начисление зарплаты",'<p class="subtle">Перенесённые расчёты требуют сверки перед использованием для выплат.</p>'+
 table(["Месяц","Сотрудник","Дни плана","Пропуски","Удержано","К выплате","Статус"],rows));
}
function renderDevices(){
 return '<div class="grid2">'+card("Подключение терминала",
 '<p class="subtle">Создайте одноразовый код, затем введите его на тестовом терминале.</p>'+
 '<label class="subtle">ID устройства</label><input class="input" value="terminal-01" id="deviceId">'+
 '<label class="subtle">Название</label><input class="input" value="DAVOMAT Terminal" id="deviceName">'+
 '<button class="button primary" id="pair">Создать код подключения</button>'+
 '<div class="code" style="margin-top:19px" id="pairResult"></div>'+
 '<p class="subtle">Код действителен 10 минут и используется только один раз.</p>')+
 card("Тестовый терминал",'<p>Перед запуском необходимо подключить устройство к новой базе.</p>'+
 '<p><a href="./" target="_blank" rel="noopener">Открыть DAVOMAT 2.0 →</a></p>'+
 '<p class="subtle">Рабочая версия Google Apps Script остаётся без изменений.</p>')+'</div>';
}
function render(){
 if(!state.data)return;
 for(const n of document.querySelectorAll(".nav[data-page]"))n.classList.toggle("on",n.dataset.page===state.page);
 const titles={overview:"Обзор",employees:"Сотрудники",attendance:"Посещаемость",
 salary:"Зарплата",devices:"Устройства"};
 $("#pageTitle").textContent=titles[state.page]||"DAVOMAT";
 $("#body").className="fade";
 $("#body").innerHTML=state.page==="overview"?renderOverview():state.page==="employees"?renderEmployees():
 state.page==="attendance"?renderAttendance():state.page==="salary"?renderSalary():renderDevices();
 for(const el of document.querySelectorAll("[data-enroll]"))el.onclick=async()=>{
  try{const r=await api("admin.enrollment",{employeeId:el.dataset.enroll,deviceId:"terminal-01"});
   const link=new URL("./",location.href);link.searchParams.set("enroll",r.code);
   notify("Код регистрации: "+r.code+" (8 минут). Откройте терминал по ссылке.");
   const panel=document.createElement("div");panel.className="card";panel.style.marginTop="18px";
   panel.innerHTML='<div class="subtle">Одноразовый код регистрации</div><p class="code">'+esc(r.code)+'</p>'+
   '<a href="'+esc(link.href)+'" target="_blank" rel="noopener">Открыть терминал для регистрации →</a>';
   $("#body").prepend(panel);
  }catch(e){notify(e.message)}
 };
 for(const el of document.querySelectorAll("[data-reset]"))el.onclick=async()=>{
  if(!confirm("Выключить все зарегистрированные Face ID-профили сотрудника?"))return;
  try{await api("admin.resetFace",{employeeId:el.dataset.reset});notify("Face ID сброшен");await load()}
  catch(e){notify(e.message)}
 };
 if($("#pair"))$("#pair").onclick=async()=>{
  try{
   const r=await api("admin.pairing",{deviceId:$("#deviceId").value,name:$("#deviceName").value});
   $("#pairResult").textContent=r.code;
   notify("Код готов. Перейдите на тестовый терминал.");
  }catch(e){notify(e.message)}
 };
}
async function load(){
 try{
  $("#body").innerHTML='<div class="card">Загрузка данных…</div>';
  state.data=await api("admin.dashboard");render();
 }catch(e){notify(e.message)}
}
async function start(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){login();return}
 try{
  state.session=session;
  state.admin=(await api("admin.whoami")).admin;
  shell();await load();
 }catch(e){notify("Доступ к админке не подтверждён: "+e.message);login()}
}
sb.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){state.session=null;state.data=null;login()}
});
start();
