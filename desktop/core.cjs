const Database = require('better-sqlite3');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const uid = () => randomUUID();
const fields = ['title','category','kind','date','start','end','location','action','allDay','reminderMinutes'];
const label = {title:'名称',category:'分类',kind:'类型',date:'日期',start:'开始/截止时间',end:'结束时间',location:'地点',action:'行动要求',allDay:'仅日期',reminderMinutes:'提醒'};
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'') && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}
function validateItem(v){
 if(!v.title?.trim()) throw Error('请填写事项名称');
 if(!['event','task','course'].includes(v.kind)) throw Error('事项类型无效');
 if(!validDate(v.date)) throw Error('请确认具体日期');
 if(!v.allDay && (!v.start || !/(Z|[+-]\d{2}:\d{2})$/.test(v.start)||!Number.isFinite(Date.parse(v.start)))) throw Error('请确认精确时间，或选择仅日期');
 if(!v.allDay && v.end && (!Number.isFinite(Date.parse(v.end)) || Date.parse(v.end)<=Date.parse(v.start))) throw Error('结束时间必须晚于开始时间');
 if(!v.allDay && v.start && new Date(Date.parse(v.start)+8*3600000).toISOString().slice(0,10)!==v.date) throw Error('日期与北京时间不一致');
 if(v.reminderMinutes!=null && (!Number.isFinite(Number(v.reminderMinutes)) || Number(v.reminderMinutes)<0)) throw Error('提醒分钟数无效');
 return v;
}
function normalize(t){return (t||'').replace(/[\s\p{P}]/gu,'').toLowerCase();}
function targetTime(e){return Date.parse(e.allDay ? e.date+'T23:59:59+08:00' : e.start);}
function reminderTime(e){return e.allDay ? Date.parse(e.date+'T09:00:00+08:00') : targetTime(e)-Number(e.reminderMinutes??(e.kind==='task'?1440:30))*60000;}
class Store {
 constructor(dir){fs.mkdirSync(dir,{recursive:true});this.dir=dir;const file=path.join(dir,'calendar.sqlite');this.db=new Database(file);this.db.pragma('journal_mode = WAL');this.db.pragma('busy_timeout = 5000');
 const version=this.db.pragma('user_version',{simple:true});if(version>1)throw Error('数据库来自较新版本，请使用新版应用');
 if(version===0){this.db.exec('CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); PRAGMA user_version=1;');}
 this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('seq','0')").run();
 }
 all(k){return this.db.prepare('SELECT data FROM records WHERE kind=?').all(k).map(x=>JSON.parse(x.data));}
 get(k,id){let r=this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(k,id);return r?JSON.parse(r.data):null;}
 put(k,v){this.db.prepare('INSERT OR REPLACE INTO records VALUES (?,?,?)').run(k,v.id,JSON.stringify(v));return v;}
 del(k,id){this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(k,id);}
 seq(){return Number(this.db.prepare("SELECT value FROM metadata WHERE key='seq'").get().value);}
 next(){let n=this.seq()+1;this.db.prepare("UPDATE metadata SET value=? WHERE key='seq'").run(String(n));return n;}
 tx(fn){return this.db.transaction(fn)();}
 settings(){return this.get('settings','main')||{id:'main',model:'deepseek-flash',smtpHost:'smtp.qq.com',smtpPort:465,smtpSecure:true,smtpUser:'',recipient:'',paused:false,autoStart:false};}
 snapshot(){return {events:this.all('event').filter(e=>!e.deleted),materials:this.all('material'),drafts:this.all('draft'),series:this.all('series'),semesters:this.all('semester'),reminders:this.all('reminder'),settings:this.settings()};}
 deleteDrafts(ids){if(!Array.isArray(ids)||!ids.length||[...ids].some(id=>typeof id!=='string'||!id.trim()))throw Error('请选择有效的待确认事项');const unique=[...new Set(ids)];return this.tx(()=>{if(unique.some(id=>!this.get('draft',id)))throw Error('部分候选已移除或已确认，本次未删除，请重新选择');for(const id of unique)this.del('draft',id);return {deletedIds:unique};});}
 deleteDraft(id){this.deleteDrafts([id]);return {id};}
 importMaterial(m){return this.tx(()=>this.put('material',{...m,id:uid(),seq:this.next(),createdAt:new Date().toISOString(),status:'ready'}));}
 match(d){return this.all('event').find(e=>!e.deleted && !e.seriesId && normalize(e.title)===normalize(d.title) && normalize(e.category)===normalize(d.category) && e.kind===d.kind && e.date===d.date);}
 mergeDraft(d){
 const m=this.get('material',d.materialId);if(!m)throw Error('来源不存在');
  if(m.type==='web'&&m.status!=='done')throw Error('原网页正在重读或尚未识别成功，请先完成识别再确认');
 const old=d.targetId?this.get('event',d.targetId):this.match(d);
 if(d.targetId && (!old||old.deleted))throw Error('更新目标已删除，请重新选择');
 const e=old?structuredClone(old):{id:uid(),status:'active',version:0,fieldSeq:{},sources:[],changes:[]};
 const diffs=[];
 for(const f of fields){const value=d[f];if(value===undefined||(value===null&&f!=='reminderMinutes')||value==='')continue;
 if(m.seq<=(e.manualBarrier||0) && old) continue;
 if(m.seq<(e.fieldSeq[f]||0))continue;
 if(old && e[f]!==value)diffs.push(`${label[f]}由「${e[f]??'未填写'}」更新为「${value}」`);
 e[f]=value;e.fieldSeq[f]=m.seq;}
 for(const f of d.clearFields||[]){if(!['location','action','end'].includes(f))throw Error('不可清空该字段');if(m.seq>=(e.fieldSeq[f]||0)&&m.seq>(e.manualBarrier||0)){e[f]='';e.fieldSeq[f]=m.seq;}}
 if(e.reminderMinutes===undefined)e.reminderMinutes=e.kind==='task'?1440:30;
 e.sources=[...new Set([...e.sources,m.id])];e.latestSource=e.sources.reduce((a,b)=>(this.get('material',a)?.seq||0)>(this.get('material',b)?.seq||0)?a:b);if(e.latestSource===m.id||!e.quote)e.quote=d.quote||e.quote||'';
 e.changes=[...(e.changes||[]),...(diffs.length?[{at:new Date().toISOString(),text:diffs.join('；'),sourceId:m.id}]:[])];
 validateItem(e);return {event:e,existing:!!old,diffs};
 }
 confirm(drafts){return this.tx(()=>drafts.map(d=>{const persisted=this.get('draft',d.id);if(!persisted)throw Error('候选已移除或已确认');if(d.recurrence)throw Error('重复课程请通过学期与课表确认');if(persisted.materialId!==d.materialId)throw Error('来源不一致');const {event:e}=this.mergeDraft(d);const old=this.get('event',e.id);const changed=!old||fields.some(f=>e[f]!==old[f]);if(changed)e.version++;this.put('event',e);if(changed)this.syncReminder(e);this.del('draft',d.id);return e;}));}
 saveManual(input){return this.tx(()=>{const old=input.id?this.get('event',input.id):null;if(input.expectedVersion!==undefined&&(!old||old.deleted||old.version!==input.expectedVersion))throw Error('事项已被修改或移除，请重新打开并核对后保存');const e={id:uid(),status:'active',version:0,fieldSeq:{},sources:[],changes:[],...old};for(const f of fields)if(input[f]!==undefined)e[f]=input[f];if(input.status)e.status=input.status;if(input.deleted)e.deleted=true;validateItem(e);e.manualBarrier=this.seq();const changed=!old||fields.some(f=>e[f]!==old[f])||e.status!==old.status||!!e.deleted!==!!old.deleted;if(changed)e.version++;if(e.seriesId)e.exception=true;this.put('event',e);if(changed)this.syncReminder(e);return e;});}
 syncReminder(e){for(const r of this.all('reminder').filter(r=>r.eventId===e.id&&['pending','sending','failed'].includes(r.status))){r.status='cancelled';this.put('reminder',r);}
 if(e.deleted||e.status!=='active'||e.reminderMinutes===null)return;
 let r={id:`${e.id}:${e.version}`,eventId:e.id,version:e.version,title:e.title,scheduledAt:reminderTime(e),targetAt:targetTime(e),status:'pending',attempts:0,nextRetryAt:0};if(r.targetAt<=Date.now())r.status='missed';this.put('reminder',r);}
 saveSemester(v){if(!validDate(v.monday)||new Date(v.monday+'T00:00Z').getUTCDay()!==1)throw Error('学期锚点必须为周一');if(!Number.isInteger(+v.weeks)||v.weeks<1||v.weeks>54)throw Error('教学周数应为1—54');for(const [n,p] of Object.entries(v.periods||{})){if(!/^\d+$/.test(n)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)||p.end<=p.start)throw Error('节次时间表无效');}return this.put('semester',{...v,id:v.id||uid()});}
 expand(s){const term=this.get('semester',s.semesterId);if(!term)throw Error('请选择学期');if(!s.title?.trim())throw Error('请填写课程名');if(!Number.isInteger(+s.weekday)||s.weekday<1||s.weekday>7)throw Error('星期应为1—7');const a=term.periods[s.startPeriod],b=term.periods[s.endPeriod];if(!a||!b||+s.endPeriod<+s.startPeriod)throw Error('请检查起止节次');let weeks=s.explicitWeeks?.length?s.explicitWeeks:Array.from({length:term.weeks},(_,i)=>i+1).filter(w=>w>=s.fromWeek&&w<=s.toWeek&&(s.parity==='all'||w%2===(s.parity==='odd'?1:0)));weeks=[...new Set(weeks.map(Number))].sort((a,b)=>a-b);if(!weeks.length||weeks.some(w=>!Number.isInteger(w)||w<1||w>term.weeks))throw Error('教学周范围无效');return weeks.map(w=>{const date=new Date(Date.parse(term.monday+'T00:00Z')+((w-1)*7+(+s.weekday-1))*86400000).toISOString().slice(0,10);return {week:w,date,start:new Date(date+'T'+a.start+':00+08:00').toISOString(),end:new Date(date+'T'+b.end+':00+08:00').toISOString()};});}
 saveSeries(s){return this.tx(()=>{if(s.draftId&&!this.get('draft',s.draftId)&&!(s.id&&this.get('series',s.id)))throw Error('候选已移除或已确认，请重新选择');const draftId=s.draftId;s={...s,id:s.id||this.all('series').find(x=>x.semesterId===s.semesterId&&normalize(x.title)===normalize(s.title)&&+x.weekday===+s.weekday&&+x.startPeriod===+s.startPeriod&&+x.endPeriod===+s.endPeriod)?.id||uid()};const occurrences=this.expand(s);delete s.draftId;this.put('series',s);const keys=new Set();for(const x of occurrences){const id=`${s.id}:w${x.week}`;keys.add(id);const old=this.get('event',id);if(old?.exception)continue;const e={...old,id,title:s.title,category:s.category||'课程',kind:'course',location:s.location||'',action:'',date:x.date,start:x.start,end:x.end,allDay:false,status:'active',deleted:false,seriesId:s.id,week:x.week,reminderMinutes:s.reminderMinutes??30,version:(old?.version||0)+1,fieldSeq:{},sources:old?.sources||s.sourceIds||[],changes:old?.changes||[]};if(old?.status==='completed')e.status='completed';validateItem(e);const changed=!old||fields.some(f=>e[f]!==old[f])||e.status!==old.status||!!e.deleted!==!!old.deleted;if(!changed)e.version=old.version;this.put('event',e);if(changed)this.syncReminder(e);}for(const e of this.all('event').filter(e=>e.seriesId===s.id&&!keys.has(e.id))){e.status='cancelled';e.version++;this.put('event',e);this.syncReminder(e);}if(draftId)this.del('draft',draftId);return s;});}
 deleteSeries(id){this.tx(()=>{this.del('series',id);for(const e of this.all('event').filter(e=>e.seriesId===id)){e.status='cancelled';e.deleted=true;e.version++;this.put('event',e);this.syncReminder(e);}});}
 recoverSending(){for(const r of this.all('reminder').filter(r=>r.status==='sending'))this.put('reminder',{...r,status:'uncertain',error:'发送过程中应用退出，无法确定邮件服务是否已接收'});}
 close(){this.db.close();}
}
module.exports={Store,uid,validateItem,targetTime,reminderTime,validDate};
