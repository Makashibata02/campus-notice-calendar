const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');const {Store}=require('../desktop/core.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(process.cwd(),'runtime-test-'));let store=new Store(dir);t.after(()=>{store.close();assert.equal(path.dirname(dir),process.cwd());fs.rmSync(dir,{recursive:true,force:true});});return {get store(){return store;},reopen(){store.close();store=new Store(dir);return store;}};}
const event={title:'候选删除检查',kind:'event',date:'2027-11-05',start:'2027-11-05T07:00:00Z',end:'2027-11-05T08:00:00Z',allDay:false,location:'A101',reminderMinutes:30};
function draft(s,m,extra={}){return s.put('draft',{...event,id:randomUUID(),materialId:m.id,...extra});}
function records(s){return s.db.prepare('SELECT kind,id,data FROM records ORDER BY kind,id').all();}
function course(s){const term=s.saveSemester({name:'候选课程测试',monday:'2027-01-04',weeks:4,periods:{1:{start:'08:00',end:'08:45'}}});return {title:'课程候选',semesterId:term.id,weekday:2,fromWeek:1,toWeek:4,parity:'all',explicitWeeks:[],startPeriod:1,endPeriod:1,location:'A101',reminderMinutes:30};}

test('删除待审核更新候选只移除自身，保留原通知、已有日历、提醒与其他候选',t=>{
 const {store:s}=fixture(t),m=s.importMaterial({name:'原通知',type:'text',text:'合成通知'});
 const e=s.confirm([draft(s,m)])[0],other=draft(s,m,{title:'另一条候选'}),removed=draft(s,m,{targetId:e.id,location:'新地点'});
 s.put('settings',{...s.settings(),recipient:'review@example.com'});
 const before=records(s),seq=s.seq();s.deleteDraft(removed.id);
 assert.deepEqual(records(s),before.filter(r=>!(r.kind==='draft'&&r.id===removed.id)));
 assert.deepEqual(s.get('draft',other.id),other);assert.equal(s.seq(),seq);
 const after=records(s);assert.throws(()=>s.deleteDraft(e.id),/候选/);assert.deepEqual(records(s),after);
});

test('删除在重启后保留，重复删除和迟到批量确认不能恢复候选',t=>{
 const f=fixture(t),s=f.store,m=s.importMaterial({name:'待审核通知'}),removed=draft(s,m),kept=draft(s,m,{title:'应保留的候选'});
 s.deleteDraft(removed.id);const reopened=f.reopen(),before=records(reopened);
 assert.equal(reopened.get('draft',removed.id),null);assert.throws(()=>reopened.deleteDraft(removed.id),/候选/);
 assert.throws(()=>reopened.confirm([kept,removed]),/候选/);assert.deepEqual(records(reopened),before);
 assert.equal(reopened.all('event').length,0);assert.equal(reopened.all('reminder').length,0);
});

test('已删除课程候选不能通过旧课表表单新建或冒用无效系列ID入历',t=>{
 const {store:s}=fixture(t),c=course(s),m=s.importMaterial({name:'课程通知'}),d=draft(s,m,{kind:'course',recurrence:{parity:'all'}});
 s.deleteDraft(d.id);const before=records(s);
 for(const input of [{...c,draftId:d.id},{...c,id:'不存在的系列',draftId:d.id}])assert.throws(()=>s.saveSeries(input),/候选/);
 assert.deepEqual(records(s),before);
 // 自动匹配到同名系列也不能让已删除候选绕过检查。
 s.saveSeries(c);const after=records(s);assert.throws(()=>s.saveSeries({...c,draftId:d.id}),/候选/);assert.deepEqual(records(s),after);
});

test('课程候选确认后清除一次性draftId，整个系列仍能正常修改',t=>{
 const {store:s}=fixture(t),c=course(s),m=s.importMaterial({name:'重复课程通知'}),d=draft(s,m,{kind:'course',recurrence:{parity:'all'}});
 const saved=s.saveSeries({...c,draftId:d.id,sourceIds:[m.id]});assert.equal(s.get('draft',d.id),null);
 const persisted=s.get('series',saved.id);assert.equal(Object.hasOwn(persisted,'draftId'),false);
 const ids=s.all('event').map(e=>e.id).sort();const updated=s.saveSeries({...persisted,location:'B202'});
 assert.equal(updated.id,saved.id);assert.deepEqual(s.all('event').map(e=>e.id).sort(),ids);
 assert.ok(s.all('event').every(e=>e.location==='B202'));assert.equal(s.all('series').length,1);
 const before=records(s);assert.throws(()=>s.deleteDraft(d.id),/候选/);assert.deepEqual(records(s),before);
});

test('兼容旧版系列残留draftId：有效已有系列可修改，无效ID仍拒绝',t=>{
 const {store:s}=fixture(t),saved=s.saveSeries(course(s));
 const legacy={...saved,draftId:'旧版已消费候选'};s.put('series',legacy);
 const updated=s.saveSeries({...legacy,location:'C303'});assert.equal(updated.id,saved.id);
 assert.ok(s.all('event').every(e=>e.location==='C303'));assert.equal(Object.hasOwn(s.get('series',saved.id),'draftId'),false);
 const before=records(s);assert.throws(()=>s.saveSeries({...legacy,id:'伪造系列ID'}),/候选/);assert.deepEqual(records(s),before);
});
