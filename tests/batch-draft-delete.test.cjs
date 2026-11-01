const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Store}=require('../desktop/core.cjs');

function fixture(t){const dir=fs.mkdtempSync(path.join(process.cwd(),'runtime-test-'));const s=new Store(dir);t.after(()=>{s.close();assert.equal(path.dirname(dir),process.cwd());fs.rmSync(dir,{recursive:true,force:true});});return s;}
const event={title:'批量删除测试',kind:'event',date:'2030-11-05',allDay:true,location:'A101',reminderMinutes:30};
function draft(s,m,extra={}){return s.put('draft',{...event,id:randomUUID(),materialId:m.id,...extra});}
const records=s=>s.db.prepare('SELECT kind,id,data FROM records ORDER BY kind,id').all();

test('批量删除去重且只删除指定候选，保留来源、日历、提醒、其他候选与序号',t=>{
 const s=fixture(t),m=s.importMaterial({name:'合成通知',type:'text',text:'批量审核测试'});
 const existing=s.confirm([draft(s,m)])[0],a=draft(s,m,{targetId:existing.id}),b=draft(s,m,{title:'不完整内容',date:undefined}),kept=draft(s,m,{title:'保留内容'});
 const before=records(s),seq=s.seq(),ids=[a.id,b.id];
 assert.deepEqual(s.deleteDrafts([a.id,b.id,a.id]),{deletedIds:ids});
 assert.deepEqual(records(s),before.filter(r=>!(r.kind==='draft'&&ids.includes(r.id))));
 assert.deepEqual(s.get('draft',kept.id),kept);assert.equal(s.seq(),seq);
});

test('批量请求的非法列表和ID不会删除任何候选',t=>{
 const s=fixture(t),m=s.importMaterial({name:'通知'}),d=draft(s,m),before=records(s);
 for(const ids of [undefined,null,{},d.id,[],Array(1),[null],[undefined],[0],[''],['   '],[d.id,null],[d.id,{}]]){
  assert.throws(()=>s.deleteDrafts(ids),/有效的待确认事项/);assert.deepEqual(records(s),before);
 }
});

test('一项已被确认或移除时整批不删，不能将事件ID当作候选删除',t=>{
 const s=fixture(t),m=s.importMaterial({name:'通知'}),kept=draft(s,m,{title:'保留'}),confirmed=draft(s,m),removed=draft(s,m);
 const e=s.confirm([confirmed])[0];s.deleteDraft(removed.id);const before=records(s);
 for(const stale of [confirmed.id,removed.id,e.id,'不存在的候选']){
  assert.throws(()=>s.deleteDrafts([kept.id,stale]),/本次未删除/);assert.deepEqual(records(s),before);
 }
});

test('批量删除的中途数据库错误回滚已经执行的删除',t=>{
 const s=fixture(t),m=s.importMaterial({name:'通知'}),a=draft(s,m),b=draft(s,m),before=records(s),original=s.del.bind(s);
 s.del=(kind,id)=>{if(id===b.id)throw Error('模拟第二次删除失败');return original(kind,id);};
 assert.throws(()=>s.deleteDrafts([a.id,b.id]),/模拟第二次删除失败/);assert.deepEqual(records(s),before);
});

test('批量删除后迟到批量确认不恢复候选，单条接口仍返回原有格式',t=>{
 const s=fixture(t),m=s.importMaterial({name:'通知'}),a=draft(s,m),b=draft(s,m),kept=draft(s,m,{title:'尚待确认'});
 s.deleteDrafts([a.id,b.id]);const before=records(s);
 assert.throws(()=>s.confirm([kept,a]),/候选已移除或已确认/);assert.deepEqual(records(s),before);
 assert.deepEqual(s.deleteDraft(kept.id),{id:kept.id});assert.equal(s.all('draft').length,0);
 assert.equal(s.all('event').length,0);assert.equal(s.all('reminder').length,0);
});
