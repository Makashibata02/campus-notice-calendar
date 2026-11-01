const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/v0.3.0');fs.mkdirSync(out,{recursive:true});
 const env={...process.env,CAMPUS_TEST_DIR:path.join(root,'runtime-test','v030-review-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const a=await electron.launch({args:[root],env,timeout:60000});let p;let stage='启动';const errors=[],checks=[];
 const log=s=>{stage=s;console.log(s);};
 try{
  p=await a.firstWindow();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.getByRole('heading',{name:'日历',exact:true}).waitFor();
  const fixture=await a.evaluate(({app})=>{
   const path=process.getBuiltinModule('node:path');const req=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));const {Store}=req('./desktop/core.cjs');const s=new Store(app.getPath('userData'));
   try{
    s.put('settings',{...s.settings(),paused:true});
    const m1=s.importMaterial({name:'活动通知（合成）',type:'text',text:'来源 A：学术讲座和组会安排，以下均为界面测试合成内容。'});s.put('material',{...m1,status:'done'});
    const m2=s.importMaterial({name:'课程安排（合成）',type:'text',text:'来源 B：课程汇报及材料提交，以下均为界面测试合成内容。'});s.put('material',{...m2,status:'done'});
    for(let i=1;i<=40;i++)s.put('draft',{id:'draft-'+String(i).padStart(2,'0'),materialId:i<=23?m1.id:m2.id,title:'通知事项 '+String(i).padStart(2,'0'),kind:i%4===0?'task':'event',date:i===22?'':'2031-11-'+String((i-1)%27+1).padStart(2,'0'),allDay:true,location:i%2?'图书馆报告厅':'实验楼 B205',category:i<=23?'学术活动':'课程',quote:'引用：'+(i<=23?'来源 A':'来源 B'),missing:i===22?['具体日期']:[],...(i===23?{recurrence:{weekly:true}}:{})});
    const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);s.saveManual({title:'日历界面检查（合成）',kind:'event',date,allDay:false,start:date+'T14:00:00+08:00',end:date+'T15:00:00+08:00',location:'图书馆会议室',status:'active',reminderMinutes:30});
    s.saveManual({title:'论文材料提交（合成）',kind:'task',date,allDay:true,status:'active',reminderMinutes:1440});
    return {m1:m1.id,m2:m2.id};
   }finally{s.close();}
  });
  await p.reload();await p.getByRole('heading',{name:'日历',exact:true}).waitFor();
  async function size(width,height,zoom=1){await a.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().startsWith('campus://app/'));w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});await p.waitForTimeout(250);}
  const nav=name=>p.getByRole('navigation',{name:'主导航'}).getByTitle(name,{exact:true});
  async function capture(name){const png=await a.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().startsWith('campus://app/')).webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));fs.writeFileSync(path.join(out,name),Buffer.from(png,'base64'));}
  await size(1280,800);
  log('日历新建与视图操作');await p.getByRole('button',{name:'新建事项',exact:true}).click();let eventPane=p.getByRole('region',{name:'日历页面'}).locator('.detail-pane');await eventPane.getByLabel('名称',{exact:true}).fill('手工事项（界面）');await eventPane.getByRole('checkbox',{name:'仅日期，没有精确时刻',exact:true}).check();await eventPane.getByRole('combobox',{name:/^提醒/}).selectOption('off');await eventPane.getByRole('button',{name:'保存事项',exact:true}).click();await p.getByRole('status').filter({hasText:'事项已保存'}).waitFor();assert((await p.evaluate(()=>window.campus.snapshot())).events.some(e=>e.title==='手工事项（界面）'));
  await p.getByRole('button',{name:'月',exact:true}).click();assert.equal(await p.getByRole('button',{name:'月',exact:true}).getAttribute('aria-pressed'),'true');await capture('日历_月视图.png');await p.getByRole('button',{name:'列表',exact:true}).click();assert.equal(await p.getByRole('button',{name:'列表',exact:true}).getAttribute('aria-pressed'),'true');await capture('日历_列表视图.png');await p.getByRole('button',{name:'周',exact:true}).click();assert.equal(await p.getByRole('button',{name:'周',exact:true}).getAttribute('aria-pressed'),'true');await p.getByRole('button',{name:'上一个日期范围',exact:true}).click();await p.getByRole('button',{name:'今天',exact:true}).click();checks.push('日历手工入历、周/月/列表及日期导航');await capture('日历_1280.png');
  log('日历过期编辑保护');await p.locator('.agenda-row').filter({hasText:'日历界面检查（合成）'}).click();await eventPane.getByLabel('地点',{exact:true}).fill('旧表单里的修改');
  await p.evaluate(async()=>{const s=await window.campus.snapshot();const e=s.events.find(e=>e.title==='日历界面检查（合成）');await window.campus.saveEvent({...e,location:'后台已更新的地点'});});
  await eventPane.getByRole('button',{name:'保存事项',exact:true}).click();await eventPane.getByRole('alert').filter({hasText:'旧的编辑不会直接覆盖新内容'}).waitFor();assert(await eventPane.getByRole('button',{name:'保存事项',exact:true}).isDisabled());
  await eventPane.getByRole('button',{name:'重新载入当前记录',exact:true}).click();await p.getByRole('dialog',{name:'重新载入事项',exact:true}).getByRole('button',{name:'重新载入',exact:true}).click();assert.equal(await eventPane.getByLabel('地点',{exact:true}).inputValue(),'后台已更新的地点');await eventPane.getByRole('button',{name:'关闭详情',exact:true}).click();checks.push('日历旧版本表单不能覆盖后台更新，重新载入取得当前记录');
  log('审核列表密度与筛选');await nav('导入与审核').click();
  const review=p.getByRole('region',{name:'导入与审核页面'});const table=review.locator('.candidate-table');const rows=table.locator('tbody tr');
  assert.equal(await rows.count(),40);
  const visibleRows=await rows.evaluateAll(elements=>{const area=document.querySelector('.review-list').getBoundingClientRect();return elements.filter(e=>{const b=e.getBoundingClientRect();return b.top>=area.top&&b.bottom<=area.bottom;}).length;});assert(visibleRows>=8,'1280×800至少显示8条，目前'+visibleRows);
  await capture('审核列表_1280.png');checks.push('1280×800审核列表一屏'+visibleRows+'条');
  await review.getByLabel('按来源筛选',{exact:true}).selectOption(fixture.m2);assert.equal(await rows.count(),17);await review.getByRole('checkbox',{name:'全选当前结果',exact:true}).check();await review.getByRole('button',{name:'确认所选 (17)',exact:true}).waitFor();
  await review.getByLabel('按事项类型筛选',{exact:true}).selectOption('task');assert(await review.getByRole('button',{name:'删除所选 (0)',exact:true}).isDisabled());await review.getByLabel('按事项类型筛选',{exact:true}).selectOption('');
  checks.push('全选仅覆盖当前筛选，改变筛选清空选择');
  log('批量确认阻塞与原子删除');await review.getByLabel('按来源筛选',{exact:true}).selectOption(fixture.m1);await review.getByRole('checkbox',{name:'全选当前结果',exact:true}).check();
  const before=await p.evaluate(()=>window.campus.snapshot());await review.getByRole('button',{name:'确认所选 (23)',exact:true}).click();await review.locator('.review-blockers').waitFor();assert.equal((await p.evaluate(()=>window.campus.snapshot())).events.length,before.events.length);await review.getByRole('button',{name:'取消选择',exact:true}).click();
  await review.getByRole('checkbox',{name:'选择：通知事项 01',exact:true}).check();await review.getByRole('checkbox',{name:'选择：通知事项 02',exact:true}).check();await review.getByRole('button',{name:'删除所选 (2)',exact:true}).click();
  let dialog=p.getByRole('dialog',{name:'删除所选的 2 项？',exact:true});await dialog.waitFor();assert.equal(await p.evaluate(()=>document.activeElement.textContent),'取消');await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await p.evaluate(()=>window.campus.snapshot())).drafts.length,40);
  await review.getByRole('button',{name:'删除所选 (2)',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'删除 2 项',exact:true}).click();await p.getByRole('status').filter({hasText:'已删除2项待审核内容'}).waitFor();
  const after=await p.evaluate(()=>window.campus.snapshot());assert.equal(after.drafts.length,38);assert.deepEqual(after.events,before.events);assert.deepEqual(after.reminders,before.reminders);assert.deepEqual(after.materials,before.materials);checks.push('批量确认不静默跳过；取消删除、默认焦点与批量删除范围正确');
  log('编辑保留、来源跟随、单项确认');await review.getByRole('row',{name:'查看：通知事项 03',exact:true}).click();let pane=review.locator('.detail-pane');await pane.getByLabel('名称',{exact:true}).fill('尚未保存的 A');
  await review.getByRole('row',{name:'查看：通知事项 04',exact:true}).click();await pane.getByLabel('地点',{exact:true}).fill('已经保存的 B');await pane.getByRole('button',{name:'保存修改',exact:true}).click();await p.getByRole('status').filter({hasText:'修改已保存'}).waitFor();
  await review.getByRole('row',{name:'查看：尚未保存的 A',exact:true}).click();assert.equal(await pane.getByLabel('名称',{exact:true}).inputValue(),'尚未保存的 A');await nav('日历').click();await nav('导入与审核').click();assert.equal(await pane.getByLabel('名称',{exact:true}).inputValue(),'尚未保存的 A');
  await pane.getByRole('button',{name:'原通知',exact:true}).click();await pane.getByText('来源 A：学术讲座和组会安排，以下均为界面测试合成内容。',{exact:true}).waitFor();
  await pane.getByRole('button',{name:'关闭详情',exact:true}).click();await review.getByLabel('按来源筛选',{exact:true}).selectOption(fixture.m2);await review.getByRole('row',{name:'查看：通知事项 24',exact:true}).click();await pane.getByRole('button',{name:'原通知',exact:true}).click();await pane.getByText('来源 B：课程汇报及材料提交，以下均为界面测试合成内容。',{exact:true}).waitFor();
  await pane.getByRole('button',{name:'事项',exact:true}).click();await pane.getByRole('button',{name:'确认入历',exact:true}).click();await p.getByRole('status').filter({hasText:'已将1项写入日历'}).waitFor();assert.equal((await p.evaluate(()=>window.campus.snapshot())).events.length,before.events.length+1);
  checks.push('切行、切页、保存其他条目保留编辑；原通知跟随；单项确认正常');
  log('窗口缩放与键盘');await review.getByLabel('按来源筛选',{exact:true}).selectOption(fixture.m1);await review.getByRole('row',{name:'查看：尚未保存的 A',exact:true}).click();await capture('审核详情_1280.png');
  const layouts=[];for(const [width,height,zoom] of [[1024,768,1],[1280,800,1.25],[1280,800,1.5],[1440,900,1]]){await size(width,height,zoom);const metrics=await p.evaluate(()=>{const pane=document.querySelector('.workspace-page:not([hidden]) .detail-pane');const r=pane.getBoundingClientRect();const footer=pane.querySelector('.detail-footer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,paneRight:r.right,paneBottom:r.bottom,footerTop:footer.top,footerBottom:footer.bottom};});assert(!metrics.overflow);assert(metrics.paneRight<=metrics.width+1&&metrics.footerBottom<=metrics.height+1&&metrics.footerTop>=0);layouts.push({width,height,zoom,...metrics});await capture(`审核_${width}_${zoom}.png`);}
  await size(1024,768);await pane.getByLabel('名称',{exact:true}).focus();await p.keyboard.press('Escape');await pane.waitFor({state:'detached'});const focused=await p.evaluate(()=>document.activeElement.getAttribute('aria-label'));assert.equal(focused,'查看：尚未保存的 A');checks.push('1024/1280/1440及125%/150%缩放无页面溢出，详情按钮可见，Esc返回原行');
  log('批量删除全部与重启保留');await review.getByLabel('按来源筛选',{exact:true}).selectOption('');await review.getByRole('checkbox',{name:'全选当前结果',exact:true}).check();const remaining=(await p.evaluate(()=>window.campus.snapshot())).drafts.length;await review.getByRole('button',{name:`删除所选 (${remaining})`,exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:`删除 ${remaining} 项`,exact:true}).click();await review.getByRole('heading',{name:'没有待审核事项',exact:true}).waitFor();await p.reload();await nav('导入与审核').click();await review.getByRole('heading',{name:'没有待审核事项',exact:true}).waitFor();checks.push('删除全部后空态及重新载入持久化');
  assert.deepEqual(errors,[]);const report={passed:true,version:require('../package.json').version,at:new Date().toISOString(),isolatedUserData:true,realModelOrMailCalled:false,visibleRows,checks,layouts,pageErrors:errors};fs.writeFileSync(path.join(out,'审核与布局检查.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){if(p)await p.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});console.error('失败阶段：'+stage);throw e;}finally{await a.close();}
})().catch(e=>{console.error(e);process.exit(1);});
