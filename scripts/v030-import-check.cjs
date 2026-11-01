const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'runtime-test','v030-import-'+Date.now()),reports=path.join(root,'validation');
 const env={...process.env,CAMPUS_TEST_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root],env,timeout:60000});
 const report={version:require('../package.json').version,at:new Date().toISOString(),passed:false,profile,network:'模拟模型响应，不访问真实服务、不发邮件',checks:[]};
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForSelector('h1');
  await app.evaluate(()=>{globalThis.__importCalls=[];globalThis.fetch=async(url,options)=>{
   if(url!=='https://api.deepseek.com/chat/completions')throw Error('Unexpected network request blocked by fixture');
   const body=JSON.parse(options.body),parts=body.messages.find(m=>m.role==='user').content;
   const call={text:parts.filter(x=>x.type==='text').map(x=>x.text).join('\n'),images:parts.filter(x=>x.type==='image_url').length};globalThis.__importCalls.push(call);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{title:'模拟文件候选'+globalThis.__importCalls.length,kind:'event',date:'2030-11-05',allDay:true,quote:'合成结果，仅检查输入管线',missing:[]}]})}}],usage:{total_tokens:1}});
  };});
  await page.evaluate(async()=>{await window.campus.saveSettings({paused:true});await window.campus.saveSecrets({apiKey:'LOCAL-MOCK-NOT-A-REAL-KEY'});});
  const review=page.locator('.review-page');
  const navigateReview=()=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:/导入与审核/}).click();
  const chooseFile=async(file)=>{
   await navigateReview();await review.getByRole('button',{name:'＋ 添加通知',exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:'文件 / 截图',exact:true}).click();
   await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
   await page.getByRole('dialog').getByRole('button',{name:'选择截图 / PDF / TXT',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});await review.getByRole('heading',{name:'材料详情',exact:true}).waitFor();
  };
  const importViaEvent=async(file,method)=>{
   await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'日历',exact:true}).click();
   await page.evaluate(({name,bytes,method})=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(bytes)],name));const event=method==='paste'?new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true}):new DragEvent('drop',{dataTransfer:transfer,bubbles:true});document.querySelector('.app-shell').dispatchEvent(event);},{name:path.basename(file),bytes:Array.from(fs.readFileSync(file)),method});
   await review.getByRole('heading',{name:'材料详情',exact:true}).waitFor();
   await expect.poll(async()=>(await page.evaluate(()=>window.campus.snapshot())).materials.some(m=>m.name===path.basename(file))).toBe(true);
   await expect(review.locator('.material-name')).toHaveText(path.basename(file));
  };
  const extract=async()=>{const expected=await app.evaluate(()=>globalThis.__importCalls.length+1);await review.getByRole('button',{name:'识别此材料',exact:true}).click();await expect.poll(async()=>(await page.evaluate(()=>window.campus.snapshot())).drafts.some(d=>d.title==='模拟文件候选'+expected)).toBe(true);await review.getByRole('heading',{name:'审核事项',exact:true}).waitFor();};
  const materialView=async()=>{await review.locator('.review-viewbar').getByRole('button',{name:/^材料/}).click();await review.getByRole('heading',{name:'材料详情',exact:true}).waitFor();};

  await chooseFile(path.join(root,'materials/inputs/D01.txt'));
  await review.locator('.material-text').waitFor();await extract();
  let calls=await app.evaluate(()=>globalThis.__importCalls);assert.equal(calls[0].images,0);assert(calls[0].text.includes(fs.readFileSync(path.join(root,'materials/inputs/D01.txt'),'utf8').trim()));
  await importViaEvent(path.join(root,'materials/inputs/D02.png'),'paste');
  await review.getByAltText('原材料预览',{exact:true}).waitFor();await extract();
  calls=await app.evaluate(()=>globalThis.__importCalls);assert(calls[1].images>0);

  await importViaEvent(path.join(root,'materials/inputs/D03.pdf'),'drop');
  await review.locator('.material-text').filter({hasText:'第1页'}).waitFor();
  await page.screenshot({path:path.join(reports,'v0.3.0_PDF文字预览.png')});await extract();
  calls=await app.evaluate(()=>globalThis.__importCalls);assert.equal(calls[2].images,0);assert(calls[2].text.includes('[第1页]'));
  const beforeReparse=await page.evaluate(()=>window.campus.snapshot());const textPdf=beforeReparse.materials.find(m=>m.name==='D03.pdf');const oldDraft=beforeReparse.drafts.find(d=>d.materialId===textPdf.id);
  await materialView();await review.getByLabel('PDF 转图页码',{exact:false}).fill('1');
  await review.getByRole('button',{name:'识别此材料',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'重新识别',exact:true}).click();
  await expect.poll(async()=>(await page.evaluate(()=>window.campus.snapshot())).drafts.some(d=>d.title==='模拟文件候选4')).toBe(true);
  calls=await app.evaluate(()=>globalThis.__importCalls);assert.equal(calls[3].images,1);assert(calls[3].text.includes('所选PDF页码：1'));
  const reparsed=await page.evaluate(()=>window.campus.snapshot());assert(!reparsed.drafts.some(d=>d.id===oldDraft.id));assert.equal(reparsed.materials.find(m=>m.id===textPdf.id).seq,textPdf.seq);

  const scannedFile=path.join(profile,'扫描通知.pdf');
  await app.evaluate(async({BrowserWindow},{file,image})=>{
   const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
   try{await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><style>@page{margin:10mm}body{margin:0}img{width:100%;height:auto}</style><img src="'+image+'">'));await window.webContents.executeJavaScript('document.querySelector("img").decode()');const bytes=await window.webContents.printToPDF({printBackground:true,pageSize:'A4'});process.getBuiltinModule('node:fs').writeFileSync(file,bytes);}finally{window.destroy();}
  },{file:scannedFile,image:'data:image/png;base64,'+fs.readFileSync(path.join(root,'materials/inputs/D02.png')).toString('base64')});
  await chooseFile(scannedFile);await review.locator('.inline-error').filter({hasText:'文字较少'}).waitFor();
  await review.getByLabel('PDF 转图页码',{exact:false}).fill('1');await extract();
  calls=await app.evaluate(()=>globalThis.__importCalls);assert.equal(calls[4].images,1);assert.equal(calls.length,5);
  const final=await page.evaluate(()=>window.campus.snapshot());assert.equal(final.events.length,0);assert.equal(final.reminders.length,0);assert.equal(final.materials.length,4);assert.equal(final.drafts.length,4);
  report.passed=true;report.checks=['文件弹窗导入TXT并送入文字识别','从日历粘贴PNG自动进入材料视图','从日历拖入PDF自动进入材料视图','PDF文字提取保留页码','同一PDF选页转图识别并替换旧候选','扫描PDF提示文字不足并支持指定页转图','仅生成候选不入历或发信'];report.modelInputs=calls.map(c=>({images:c.images,textLength:c.text.length}));report.materials=final.materials.length;report.drafts=final.drafts.length;
  console.log(JSON.stringify(report,null,2));
 }catch(e){report.error=e.message;try{await (await app.firstWindow()).screenshot({path:path.join(reports,'v0.3.0_文件导入失败现场.png')});}catch{}throw e;}
 finally{fs.writeFileSync(path.join(reports,'v0.3.0_文件导入检查.json'),JSON.stringify(report,null,2));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
