const test=require('node:test');
const assert=require('node:assert/strict');
const {validatePublicUrl,fetchMarkdown,isAccessGate,capturePositions,markdownImages,readLink,fetchImage}=require('../desktop/link-reader.cjs');
const publicLookup=async()=>[{address:'93.184.216.34',family:4}];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('链接只允许公开网页，拒绝本机、内网、混合DNS、带凭据和特殊协议',async()=>{
 for(const value of ['file:///C:/secret','javascript:alert(1)','https://user:pass@example.org/a','http://localhost/','http://127.1/','http://2130706433/','http://10.0.0.1/','http://100.64.0.1/','http://[::1]/','http://[::ffff:127.0.0.1]/','http://[fd00::1]/','http://192.168.0.1/'])await assert.rejects(validatePublicUrl(value,{lookup:publicLookup}));
 await assert.rejects(validatePublicUrl('https://example.org/',{lookup:async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}]}),{code:'UNSAFE_URL'});
 assert.equal(await validatePublicUrl(' https://example.org/article#section ',{lookup:publicLookup}),'https://example.org/article');
});

test('Fetch仅向官方接口发送Key；正文、图片地址保留但尚不算图片识别',async()=>{
 let called;
 const result=await fetchMarkdown('https://example.org/article','TEST-KEY',{lookup:publicLookup,fetchImpl:async(url,options)=>{called={url,options};return json({title:'课程通知',content:'课程汇报安排如下，请准备五分钟汇报，时间为下周二上午九点，具体教室见图片。\n![课表](https://example.org/poster.png)'});}});
 assert.equal(called.url,'https://api.deepseek.com/v1/tools/fetch');
 assert.equal(called.options.headers.Authorization,'Bearer TEST-KEY');
 assert.deepEqual(JSON.parse(called.options.body),{url:'https://example.org/article'});
 assert.equal(result.title,'课程通知');assert.equal(result.images,undefined);
 assert.deepEqual(markdownImages(result.text,'https://example.org/article'),['https://example.org/poster.png']);
});

test('HTTP200验证页、被删除文章和Fetch策略拒绝不进入识别',async()=>{
 assert.equal(isAccessGate('环境异常，请完成验证。'),true);
 assert.equal(isAccessGate('','', 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=x'),true);
 await assert.rejects(fetchMarkdown('https://example.org/article','TEST',{lookup:publicLookup,fetchImpl:async()=>json({title:'验证',content:'环境异常，请完成验证后继续访问'})}),{code:'ACCESS_GATE'});
 let rendered=false;
 await assert.rejects(readLink('https://example.org/article',{lookup:publicLookup,apiKey:'TEST',fetchImpl:async()=>json({},403),BrowserWindow:class{constructor(){rendered=true;}}}),{code:'FETCH_POLICY_REJECTED'});
 assert.equal(rendered,false);
});

test('接口正文为空、超长及图片/截图超限明确报错，不静默截断',async()=>{
 await assert.rejects(fetchMarkdown('https://example.org/a','TEST',{lookup:publicLookup,fetchImpl:async()=>json({content:''})}),{code:'FETCH_UNAVAILABLE'});
 await assert.rejects(fetchMarkdown('https://example.org/a','TEST',{lookup:publicLookup,fetchImpl:async()=>json({content:'文'.repeat(100001)})}),{code:'CONTENT_LIMIT'});
 assert.equal(capturePositions(11100).length,10);
 assert.throws(()=>capturePositions(11101),{code:'CONTENT_LIMIT'});
 assert.throws(()=>markdownImages(Array.from({length:11},(_,i)=>`![图](https://example.org/${i}.png)`).join('\n'),'https://example.org'),{code:'CONTENT_LIMIT'});
});

test('下载文章图片的每次重定向均校验，拒绝跳到内网',async()=>{
 let calls=0;
 await assert.rejects(fetchImage('https://example.org/poster.png',{}, {lookup:publicLookup,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});}}),{code:'UNSAFE_URL'});
 assert.equal(calls,1);
});

test('图片/H5不可读取时只保留已取得正文并明确警告；纯图片不冒充成功',async()=>{
 const opts={lookup:publicLookup,apiKey:'TEST',fetchImpl:async()=>json({title:'活动',content:'讲座将于十一月八日上午十点举行，地点为教学楼一零一教室。请提前五分钟入场并带好学生证。'})};
 const result=await readLink('https://example.org/a',opts);
 assert.equal(result.method,'fetch-text-only');assert.equal(result.images.length,0);assert.match(result.warnings[0],/图片及H5画面未读取/);
 await assert.rejects(readLink('https://example.org/a',{...opts,fetchImpl:async()=>json({title:'海报',content:'![活动海报](https://example.org/poster.png)'})}),{code:'RENDER_UNAVAILABLE'});
});
