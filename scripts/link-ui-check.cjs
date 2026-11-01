const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

// This is a local integration fixture: no provider or public webpage is called.
(async()=>{
 const root=path.resolve(__dirname,'..');
 const reports=path.join(root,'validation');
 const profile=path.join(root,'runtime-test','link-ui-'+Date.now());
 fs.mkdirSync(reports,{recursive:true});
 const env={...process.env,CAMPUS_TEST_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const a=await electron.launch({args:[root],env,timeout:60000});
 const report={at:new Date().toISOString(),version:require('../package.json').version,passed:false,network:'本地HTTPS协议页面＋模拟DeepSeek响应；没有真实模型调用',checks:[],profile};
 try{
  const p=await a.firstWindow();p.setDefaultTimeout(90000);
  await p.waitForSelector('h1');
  await a.evaluate(({app,shell})=>{
   const state=globalThis.__linkUiTest={pages:[],modelCalls:[],opened:[],fetchCalls:[],blockText:false};
   const dns=process.getBuiltinModule('node:dns').promises;
   dns.lookup=async(host,options)=>{
    if(host!=='example.org')throw Error('Fixture blocked unexpected DNS host');
    return options?.all?[{address:'93.184.216.34',family:4}]:{address:'93.184.216.34',family:4};
   };
   shell.openExternal=async url=>{state.opened.push(url);};
   const page=(title,body)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><style>body{margin:0;padding:38px;font:24px/1.7 sans-serif;background:#fff;color:#18283d}article{max-width:850px}h1{font-size:38px}canvas,img{display:block;max-width:100%;margin:20px 0}</style><article>${body}</article></html>`;
   const pages={
    '/campus-test/text':page('公开文字通知','<h1>公开文字通知</h1><p>文献研读会于2027年11月5日15:00至16:00在实验楼B205举行，请提前准备五分钟汇报。本页为本地合成的公开通知测试页面，用于验证网页正文可以保留并送入审核流程。</p>'),
    '/campus-test/h5':page('H5画布通知','<h1>H5画布通知</h1><p>以下通知由页面脚本延迟绘制。请查看下方海报。</p><canvas id="poster" width="780" height="420"></canvas><script>setTimeout(()=>{const c=document.getElementById("poster").getContext("2d");c.fillStyle="#10b981";c.fillRect(0,0,780,420);c.fillStyle="#102830";c.font="bold 38px sans-serif";c.fillText("合成数据 · 科研方法讲座",35,90);c.font="32px sans-serif";c.fillText("2027年11月6日 14:00—16:00",35,180);c.fillText("教学楼 A101",35,255);c.fillText("提前准备课程汇报",35,330);},300)</script>'),
    '/campus-test/image':page('图片通知','<h1>图片通知</h1><img width="780" height="420" alt="合成讲座海报" src="https://example.org/campus-test/poster.svg">'),
    '/campus-test/gate':page('访问验证','<h1>环境异常</h1><p>请完成验证后继续访问。</p>')
   };
   const poster='<svg xmlns="http://www.w3.org/2000/svg" width="780" height="420"><rect width="780" height="420" fill="#f97316"/><g fill="#192332" font-family="sans-serif"><text x="35" y="90" font-size="38">合成数据 · 图片里的活动</text><text x="35" y="180" font-size="32">2027年11月7日 09:00—10:00</text><text x="35" y="255" font-size="32">实验楼 C301</text></g></svg>';
   app.on('session-created',s=>{
    s.protocol.handle('https',request=>{
     const url=new URL(request.url);state.pages.push(url.href);
     if(url.hostname!=='example.org')return new Response('fixture blocked',{status:403});
     if(url.pathname==='/campus-test/poster.svg')return new Response(poster,{headers:{'Content-Type':'image/svg+xml'}});
     const body=state.blockText&&url.pathname==='/campus-test/text'?pages['/campus-test/gate']:pages[url.pathname];
     return new Response(body||'not found',{status:body?200:404,headers:{'Content-Type':'text/html; charset=utf-8'}});
    });
   });
   globalThis.fetch=async(url,options={})=>{
    if(url==='https://api.deepseek.com/v1/tools/fetch'){
     const requested=JSON.parse(options.body).url;state.fetchCalls.push(requested);
     const pathname=new URL(requested).pathname;
     if(pathname==='/campus-test/gate'||(state.blockText&&pathname==='/campus-test/text'))return Response.json({title:'访问验证',content:'环境异常，请完成验证后继续访问。'});
     if(pathname==='/campus-test/text')return Response.json({title:'公开文字通知',content:'文献研读会于2027年11月5日15:00至16:00在实验楼B205举行，请提前准备五分钟汇报。此内容为本地集成检查合成材料。'});
     return Response.json({title:pathname.endsWith('h5')?'H5画布通知':'图片通知',content:'本页内容主要位于图像或画布中。'});
    }
    if(url==='https://api.deepseek.com/chat/completions'){
     const body=JSON.parse(options.body),parts=body.messages.find(m=>m.role==='user').content;
     const images=parts.filter(x=>x.type==='image_url');
     const text=parts.filter(x=>x.type==='text').map(x=>x.text).join('\n');
     state.modelCalls.push({images:images.length,textLength:text.length});
     const n=state.modelCalls.length;
     return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{title:`模拟识别候选${n}`,kind:'event',date:'2027-11-06',start:'2027-11-06T14:00:00+08:00',end:'2027-11-06T16:00:00+08:00',allDay:false,location:'A101',quote:'本地模拟模型结果，仅检查图文请求与候选流程',missing:[]}]})}}],usage:{total_tokens:1}});
    }
    throw Error('Fixture blocked unexpected network request');
   };
  });
  await p.evaluate(()=>window.campus.saveSecrets({apiKey:'LOCAL-MOCK-NOT-A-REAL-KEY'}));
  await p.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:/导入与审核/}).click();
  const review=p.locator('.review-page');
  const readLink=async(url)=>{
   await review.getByRole('button',{name:'＋ 添加通知',exact:true}).click();
   await p.getByRole('dialog').getByRole('button',{name:'网页链接',exact:true}).click();
   await p.getByLabel('粘贴网页链接',{exact:true}).fill(url);
   await p.getByRole('dialog').getByRole('button',{name:'读取链接',exact:true}).click();
   await p.getByRole('dialog').waitFor({state:'hidden'});
   await review.getByRole('heading',{name:'材料详情',exact:true}).waitFor();
  };
  const materialView=async()=>{await review.locator('.review-viewbar').getByRole('button',{name:/^材料/}).click();await review.getByRole('heading',{name:'材料详情',exact:true}).waitFor();};
  const links=['text','h5','image'];
  const records=[];
  for(const name of links){
   console.log('检查网页：'+name);
   const url='https://example.org/campus-test/'+name;
   await readLink(url);
   const snapshot=await p.evaluate(()=>window.campus.snapshot());
   const m=snapshot.materials.find(x=>x.sourceUrl===url&&x.type==='web');
   assert(m&&m.status==='ready','网页材料应读取成功：'+name);
   const raw=await p.evaluate(id=>window.campus.readMaterial({id}),m.id);
   assert(raw.images.length>0&&raw.images.length<=10,'正文/H5/图片都应保留真实渲染图像');
   if(name==='text')assert(raw.text.includes('五分钟汇报'),'普通网页应提取正文');
   if(name==='h5'||name==='image'){
    const pixels=await p.evaluate(async({images,kind})=>{
     let count=0;
     for(const data of images){
      const image=new Image();image.src=data;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const values=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      for(let n=0;n<values.length;n+=4){
       const r=values[n],g=values[n+1],b=values[n+2];
       if(kind==='h5'?r<60&&g>130&&g<220&&b>70&&b<170:r>200&&g>60&&g<160&&b<70)count++;
      }
     }
     return count;
    },{images:raw.images,kind:name});
    assert(pixels>50000,'图像应包含延迟canvas或图片海报实际像素：'+name);
    records.push({kind:name,sourcePixels:pixels,images:raw.images.length});
    fs.writeFileSync(path.join(reports,`链接导入-${name}-原页面.jpg`),Buffer.from(raw.images[0].split(',')[1],'base64'));
   }
   await review.getByRole('button',{name:'识别此材料',exact:true}).click();
   await p.locator('.toast').filter({hasText:'识别完成'}).waitFor();
   const after=await p.evaluate(()=>window.campus.snapshot());
   assert(after.drafts.some(d=>d.materialId===m.id),'应产生该材料的候选');
   assert.equal(after.events.length,0,'没有人工确认前不得写入日历');
   if(name==='text'){
    await materialView();
    await review.getByRole('button',{name:'重新读取',exact:true}).click();
    await p.getByRole('dialog').getByRole('button',{name:'重新读取',exact:true}).click();
    await expect.poll(async()=>{const s=await p.evaluate(()=>window.campus.snapshot());const material=s.materials.find(x=>x.id===m.id);return material.status==='ready'&&material.readAt!==m.readAt&&!s.drafts.some(d=>d.materialId===m.id);},{timeout:90000}).toBe(true);
    const retry=await p.evaluate(()=>window.campus.snapshot());
    assert.equal(retry.materials.find(x=>x.id===m.id).seq,m.seq,'重读应保持原上传序号');
    assert(!retry.drafts.some(d=>d.materialId===m.id),'成功重读应清除旧候选');
    await a.evaluate(()=>{globalThis.__linkUiTest.blockText=true;});
    await review.getByRole('button',{name:'重新读取',exact:true}).click();
    await expect.poll(async()=>(await p.evaluate(()=>window.campus.snapshot())).materials.find(x=>x.id===m.id).status).toBe('failed');
    const failedRaw=await p.evaluate(id=>window.campus.readMaterial({id}),m.id);
    assert(failedRaw.error&&!failedRaw.images?.length,'失败重读不得提供旧页面冒充成功');
    await expect(review.getByRole('button',{name:'识别此材料',exact:true})).toBeDisabled();
    await a.evaluate(()=>{globalThis.__linkUiTest.blockText=false;});
    await review.getByRole('button',{name:'重新读取',exact:true}).click();
    await expect.poll(async()=>(await p.evaluate(()=>window.campus.snapshot())).materials.find(x=>x.id===m.id).status).toBe('ready');
   }
   if(name==='h5'){
    await review.locator('.detail-tabs').getByRole('button',{name:'原通知',exact:true}).click();
    await review.locator('.material-images summary').click();
    await p.screenshot({path:path.join(reports,'链接导入-H5界面.png'),fullPage:true});
   }
  }
  const gateUrl='https://example.org/campus-test/gate';
  await readLink(gateUrl);
  await review.locator('.inline-error').filter({hasText:/验证/}).first().waitFor();
  const beforeSupplement=await p.evaluate(()=>window.campus.snapshot());
  const gate=beforeSupplement.materials.find(m=>m.sourceUrl===gateUrl&&m.type==='web');
  assert.equal(gate.status,'failed');
  await expect(review.getByRole('button',{name:'识别此材料',exact:true})).toBeDisabled();
  await review.getByRole('button',{name:'打开原文',exact:true}).click();
  assert((await a.evaluate(()=>globalThis.__linkUiTest.opened)).includes(gateUrl));
  await review.getByRole('button',{name:'补充正文或截图',exact:true}).click();
  await p.getByRole('dialog').getByLabel('通知正文',{exact:true}).fill('手工补充的合成通知：2027年11月8日14:00在A101召开研读会。');
  await p.getByRole('dialog').getByRole('button',{name:'保存文字',exact:true}).click();
  await p.getByRole('dialog').waitFor({state:'hidden'});
  await p.locator('.toast').filter({hasText:'文字已保存'}).waitFor();
  const final=await p.evaluate(()=>window.campus.snapshot());
  const supplement=final.materials.find(m=>m.type==='text'&&m.sourceId===gate.id);
  assert(supplement&&supplement.sourceUrl===gateUrl,'补充文字应保留原网页关联');
  assert(supplement.seq>gate.seq,'补充材料应作为新上传');
  assert.equal(final.events.length,0);
  assert.equal(final.reminders.length,0);
  const observed=await a.evaluate(()=>globalThis.__linkUiTest);
  assert.equal(observed.modelCalls.length,3);
  assert(observed.modelCalls.every(call=>call.images>0));
  assert(observed.pages.some(url=>url.endsWith('/poster.svg')),'图片资源应经隔离session加载');
  report.passed=true;
  report.checks=['导入弹窗链接输入与读取成功状态','普通网页正文','延迟H5 canvas真实像素截图','图片海报真实像素截图','图文请求进入模拟模型','仅生成候选，不写入日历或提醒','原通知侧栏随候选切换','重读保留上传序号并移除旧候选','失败重读不提供旧内容且可恢复','验证页拒绝识别','打开原文调用','补充正文保留来源关联'];
  report.imageEvidence=records;report.modelCalls=observed.modelCalls;report.materials=final.materials.length;report.events=final.events.length;report.reminders=final.reminders.length;
  await p.screenshot({path:path.join(reports,'链接导入-补充正文界面.png'),fullPage:true});
  console.log(JSON.stringify(report,null,2));
 }catch(error){report.error=error.message;try{await (await a.firstWindow()).screenshot({path:path.join(reports,'链接导入-失败现场.png'),fullPage:true});}catch{}throw error;}
 finally{fs.writeFileSync(path.join(reports,'v0.3.0_链接导入界面检查.json'),JSON.stringify(report,null,2));await a.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
