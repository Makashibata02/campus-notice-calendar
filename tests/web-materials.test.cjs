const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Store}=require('../desktop/core.cjs');const {WebMaterials}=require('../desktop/web-materials.cjs');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
function fixture(t,reader){const dir=fs.mkdtempSync(path.join(process.cwd(),'runtime-link-'));const store=new Store(dir);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});return {store,web:new WebMaterials(store,reader,async()=> 'test-key')};}
const page=()=>({title:'课程通知',text:'2027年11月3日14时课程汇报',images:[image],warnings:[],method:'render',finalUrl:'https://example.com/article'});
test('网页图像保存并在重启后可读，读取不会自动创建日程',async t=>{
 const {store,web}=fixture(t,async()=>page());const m=await web.import({url:'https://example.com/article'});
 const reopened=new Store(store.dir);try{const restored=new WebMaterials(reopened,async()=>page(),async()=> '');const r=restored.read(m.id);assert.equal(r.images[0],image);assert.match(r.text,/课程汇报/);assert.equal(reopened.all('event').length,0);assert.equal(reopened.all('draft').length,0);}finally{reopened.close();}
});
test('重读网页沿用来源序号，失败不提供旧内容冒充读取成功',async t=>{
 let reject=false;const {store,web}=fixture(t,async()=>{if(reject)throw Error('微信要求验证');return page();});
 const m=await web.import({url:'https://example.com/article'});const other=store.importMaterial({type:'text',name:'后上传'});reject=true;
 const failed=await web.retry(m.id);assert.equal(failed.seq,m.seq);assert.ok(other.seq>failed.seq);assert.equal(failed.status,'failed');assert.equal(web.read(m.id).images.length,0);assert.equal(web.read(m.id).text,'');assert.match(web.read(m.id).error,/验证/);
 reject=false;assert.equal((await web.retry(m.id)).seq,m.seq);
});
test('超过图像上限保留失败材料，不静默丢弃后半篇文章',async t=>{
 const {store,web}=fixture(t,async()=>({...page(),images:Array(11).fill(image)}));const m=await web.import({url:'https://example.com/long'});
 assert.equal(m.status,'failed');assert.match(m.error,/10屏/);assert.equal(store.all('event').length,0);
});
test('补充材料继承保存的原文地址，忽略界面提供的替换地址',async t=>{
 const {web}=fixture(t,async()=>page());const m=await web.import({url:'https://example.com/article'});
 assert.deepEqual(web.source({sourceId:m.id,sourceUrl:'file:///C:/secret'}),{baseDate:'',sourceId:m.id,sourceUrl:'https://example.com/article'});
 assert.throws(()=>web.source({sourceId:'missing'}),/不存在/);
});
test('重读成功移除过期候选但不删除已经确认的日历事项',async t=>{
 const {store,web}=fixture(t,async()=>page());const m=await web.import({url:'https://example.com/article'});
 store.put('draft',{id:'old-draft',materialId:m.id});store.put('event',{id:'confirmed',sources:[m.id],title:'已确认'});
 await web.retry(m.id);assert.equal(store.all('draft').length,0);assert.equal(store.get('event','confirmed').title,'已确认');
});
