import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const ctx={console,Math,Date,JSON,Object,Array,String,Number,Boolean,RegExp,Error,Map,Set};
vm.createContext(ctx);
vm.runInContext(code,ctx,{filename:'Code.gs'});

const dateKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
ctx.dateKeyFromDate_=dateKey;

const night={SCHEDULE_ID:'NIGHT',FRI_START:'20:00',FRI_END:'05:00',LUNCH_START:'',LUNCH_END:'',GRACE_MINUTES:10};
let sch=ctx.scheduleForDate_(night,'2026-09-18');
assert.equal(sch.isWorkday,true);
assert.equal(sch.overnight,true);
assert.equal((sch.end-sch.start)/3600000,9);

ctx.getScheduleById_=()=>night;
assert.equal(ctx.attendanceBusinessDate_({SCHEDULE_ID:'NIGHT'},new Date('2026-09-19T02:00:00+05:00')),'2026-09-18');
assert.equal(ctx.attendanceBusinessDate_({SCHEDULE_ID:'NIGHT'},new Date('2026-09-19T08:00:00+05:00')),'2026-09-19');

let events=[];
ctx.findOne_=(sheet,pred)=>sheet===ctx.DAVOMAT.SHEETS.ATTENDANCE_EVENTS?(events.find(pred)||null):null;
ctx.getEmployeeById_=()=>({EMPLOYEE_ID:'E1',FULL_NAME:'Test Employee',POSITION:'QA',SCHEDULE_ID:'S1'});
ctx.attendanceBusinessDate_=()=> '2026-09-18';
ctx.getSetting_=(k,f)=>f;
ctx.getNextEventType_=()=>({type:'IN',reason:''});
ctx.appendRejectedEvent_=()=>{throw new Error('unexpected rejection')};
ctx.dateToIso_=d=>new Date(d).toISOString();
ctx.appendObject_=(sheet,obj)=>{if(sheet===ctx.DAVOMAT.SHEETS.ATTENDANCE_EVENTS){events.push({...obj,_row:events.length+2});return events.length+1;}return 1;};
const payload={eventId:'evt-1',employeeId:'E1',deviceId:'terminal-01',matchScore:.91,livenessScore:.9,realScore:.9,requestedEventType:'IN',clientTime:'2026-09-18T09:00:00+05:00',blinkOk:true};
const one=ctx.processAttendanceEventUnlocked_(payload);
const two=ctx.processAttendanceEventUnlocked_(payload);
assert.equal(one.status,'accepted');
assert.equal(two.status,'duplicate');
assert.equal(events.length,1,'duplicate event must not append twice');

ctx.findOne_=()=>null;
ctx.getEmployeeById_=()=>null;
assert.throws(()=>ctx.processAttendanceEventUnlocked_({...payload,eventId:'evt-disabled',employeeId:'DISABLED'}),/EMPLOYEE_NOT_FOUND/);

let rejected=0;
ctx.findOne_=()=>null;
ctx.getEmployeeById_=()=>({EMPLOYEE_ID:'E1',FULL_NAME:'Test',POSITION:'QA',SCHEDULE_ID:'S1'});
ctx.appendRejectedEvent_=()=>{rejected++;};
const low=ctx.processAttendanceEventUnlocked_({...payload,eventId:'evt-low',livenessScore:.2});
assert.equal(low.ok,false);
assert.equal(low.reason,'FACE_PROOF_LOW');
assert.equal(rejected,1);

ctx.getEmployeeById_=()=>({EMPLOYEE_ID:'E1',SCHEDULE_ID:'S1'});
ctx.getScheduleById_=()=>({SCHEDULE_ID:'S1'});
ctx.scheduleForDate_=()=>({isWorkday:true,start:new Date('2026-09-18T09:00:00+05:00'),end:new Date('2026-09-18T18:00:00+05:00'),lunchStart:new Date('2026-09-18T13:00:00+05:00'),lunchEnd:new Date('2026-09-18T14:00:00+05:00'),graceMinutes:10});
const inAt=new Date('2026-09-18T09:15:00+05:00'),outAt=new Date('2026-09-18T18:30:00+05:00');
ctx.effectiveInOut_=()=>({firstIn:inAt,lastOut:outAt,intervals:[{inAt,outAt}],openIn:null});
ctx.nowIso_=()=> '2026-09-18T18:31:00+05:00';
ctx.dateToIso_=d=>new Date(d).toISOString();
const summary=ctx.buildDaySummary_('E1','2026-09-18',false);
assert.equal(summary.WORKED_MIN,495);
assert.equal(summary.LATE_MIN,15);
assert.equal(summary.EARLY_MIN,0);
assert.equal(summary.OVERTIME_MIN,30);
assert.equal(summary.STATUS,'COMPLETE');

ctx.findAll_=(sheet,pred)=>sheet===ctx.DAVOMAT.SHEETS.EMPLOYEES?[{EMPLOYEE_ID:'E1',FULL_NAME:'Test',POSITION:'QA',MONTHLY_SALARY:3000000,SCHEDULE_ID:'S1',START_DATE:'2026-09-01',ACTIVE:true}].filter(pred):[];
ctx.getScheduleById_=()=>({SCHEDULE_ID:'S1'});
ctx.scheduleForDate_=()=>({isWorkday:true});
ctx.today_=()=> '2026-10-01';
const days=ctx.monthDates_('2026-09');
const attendance=days.map((d,i)=>({DATE:d,EMPLOYEE_ID:'E1',FIRST_IN:i===0?'':d+'T09:00:00+05:00',ABSENT:i===0,WORKED_MIN:i===0?0:480,LATE_MIN:0,EARLY_MIN:0,OVERTIME_MIN:0,REQUIRES_REVIEW:false}));
ctx.rowsAsObjects_=sheet=>sheet===ctx.DAVOMAT.SHEETS.ATTENDANCE?attendance:[];
ctx.findOne_=()=>null;
ctx.appendObject_=()=>1;
ctx.updateRowObject_=()=>{};
const salary=ctx.calculateSalaryMonth_('2026-09')[0];
assert.equal(salary.PLANNED_DAYS,30);
assert.equal(salary.ABSENT_DAYS,1);
assert.equal(salary.ABSENCE_DEDUCTION,100000);
assert.equal(salary.PAYABLE,2900000);

console.log('BUSINESS CONTRACT PASS');
console.log(JSON.stringify({overnightHours:9,idempotentEvents:events.length,workedMin:summary.WORKED_MIN,payable:salary.PAYABLE},null,2));
