const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('../desktop/core.cjs');

function fixture(t){const dir=fs.mkdtempSync(path.join(process.cwd(),'runtime-test-'));const s=new Store(dir);t.after(()=>{s.close();assert.equal(path.dirname(dir),process.cwd());fs.rmSync(dir,{recursive:true,force:true});});return s;}
const event={title:'日历编辑版本检查',kind:'event',date:'2030-11-05',allDay:true,location:'A101',reminderMinutes:30};
const records=s=>s.db.prepare('SELECT kind,id,data FROM records ORDER BY kind,id').all();

test('过期日历表单不能覆盖较新字段或取消较新的提醒',t=>{
 const s=fixture(t),old=s.saveManual(event);
 const latest=s.saveManual({...old,location:'新地点',expectedVersion:old.version});
 assert.equal(latest.version,old.version+1);
 const before=records(s);
 for(const input of [{...old,location:'迟到旧值'},{...old,deleted:true}]){
  assert.throws(()=>s.saveManual({...input,expectedVersion:old.version}),/事项已被修改或移除/);
  assert.deepEqual(records(s),before);
 }
});

test('已删除事项即使版本匹配，也不能通过旧详情重新保存',t=>{
 const s=fixture(t),old=s.saveManual(event),removed=s.saveManual({...old,deleted:true,expectedVersion:old.version}),before=records(s);
 assert.equal(removed.deleted,true);
 assert.throws(()=>s.saveManual({...removed,deleted:false,title:'尝试复活',expectedVersion:removed.version}),/事项已被修改或移除/);
 assert.deepEqual(records(s),before);
});

test('带预期版本的缺失事项或无ID请求不创建任何新事件',t=>{
 const s=fixture(t),before=records(s);
 for(const id of [undefined,'不存在的事项']){
  assert.throws(()=>s.saveManual({...event,id,expectedVersion:1}),/事项已被修改或移除/);
  assert.deepEqual(records(s),before);
 }
});

test('当前版本正常保存，不持久化expectedVersion，旧调用仍兼容',t=>{
 const s=fixture(t),original=s.saveManual(event);
 const current=s.saveManual({...original,location:'B202',expectedVersion:original.version});
 assert.equal(current.location,'B202');assert.equal(Object.hasOwn(current,'expectedVersion'),false);
 assert.equal(Object.hasOwn(s.get('event',current.id),'expectedVersion'),false);
 const legacy=s.saveManual({...current,location:'C303'});
 assert.equal(legacy.id,current.id);assert.equal(legacy.location,'C303');
 assert.equal(s.all('event').length,1);
});
