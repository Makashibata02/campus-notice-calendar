const dns=require('node:dns').promises;
const net=require('node:net');
const {randomUUID}=require('node:crypto');
const MAX_TEXT=100000,MAX_IMAGES=10,VIEW_HEIGHT=1200,STEP=1100;
const blocked=new net.BlockList();
for(const [ip,bits]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,bits,'ipv4');
for(const [ip,bits]of [['2001:db8::',32],['2001::',32],['2002::',16]])blocked.addSubnet(ip,bits,'ipv6');
function fail(message,code='LINK_READ_FAILED'){return Object.assign(new Error(message),{code});}
function isPublicAddress(ip){const family=net.isIP(ip);if(family===4)return !blocked.check(ip,'ipv4');if(family===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!blocked.check(ip,'ipv6');return false;}
async function validatePublicUrl(raw,{lookup=dns.lookup}={}){
 if(typeof raw!=='string'||raw.length>8192)throw fail('请输入有效的网页链接','INVALID_URL');
 let url;try{url=new URL(raw.trim());}catch{throw fail('请输入完整的 http 或 https 链接','INVALID_URL');}
 const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!host||(!host.includes('.')&&!net.isIP(host))||/(^|\.)(localhost|local|internal|lan|home)$/i.test(host))throw fail('仅支持公开的 http/https 网页，不支持本机、内网或带账号密码的链接','UNSAFE_URL');
 let addresses;
 try{addresses=net.isIP(host)?[{address:host}]:await lookup(host,{all:true,verbatim:true});}catch{throw fail('无法解析网站地址，请检查链接或网络','DNS_FAILED');}
 if(!addresses.length||addresses.some(x=>!isPublicAddress(x.address)))throw fail('该链接指向本机、内网或保留地址，无法导入','UNSAFE_URL');
 url.hash='';return url.href;
}
function isAccessGate(text='',title='',url=''){
 if(/\/mp\/wappoc_appmsgcaptcha|\/captcha(?:\/|\?|$)/i.test(url))return true;
 const content=(title+'\n'+text).trim();
 return content.length<5000&&(/环境异常[\s\S]{0,150}(?:验证|访问)|请完成(?:安全)?验证|验证后(?:继续|才能)访问|访问过于频繁|此内容因违规无法查看|该内容已被发布者删除|该内容已被删除|访问已被禁止|access denied|verify (?:that )?you are human/i.test(content));
}
function meaningfulText(text){return text.replace(/!\[[^\]]*\]\([^\n]*?\)/g,'').replace(/<[^>]*>/g,'').replace(/https?:\/\/\S+/g,'').replace(/[\s#*_\[\]()<>-]/g,'').length>=35;}
function checkText(text){if(text.length>MAX_TEXT)throw fail('网页正文超过10万字符，请改为分段复制正文或上传截图','CONTENT_LIMIT');}
function capturePositions(height){
 const positions=[];for(let y=0;y<Math.max(1,height);y+=STEP){positions.push(y);if(y+VIEW_HEIGHT>=height)break;}
 if(positions.length>MAX_IMAGES)throw fail('网页过长，超过10段画面；请分段截图或复制需要的正文，未截断导入','CONTENT_LIMIT');
 return positions;
}
async function limitedBody(response,maxBytes){
 if(Number(response.headers.get('content-length'))>maxBytes)throw fail('网页或图片超过读取大小限制','CONTENT_LIMIT');
 const reader=response.body?.getReader();if(!reader)return Buffer.from(await response.arrayBuffer());
 const chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes)throw fail('网页或图片超过读取大小限制','CONTENT_LIMIT');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks);
}
async function fetchMarkdown(raw,key,{fetchImpl=fetch,lookup=dns.lookup,signal}={}){
 const url=await validatePublicUrl(raw,{lookup});
 if(!key)throw fail('尚未配置DeepSeek Key，使用本机网页读取','NO_API_KEY');
 const response=await fetchImpl('https://api.deepseek.com/v1/tools/fetch',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok){const code=response.status===403?'FETCH_POLICY_REJECTED':'FETCH_UNAVAILABLE';throw fail(`网页读取接口返回 ${response.status}`,code);}
 let data;try{data=JSON.parse((await limitedBody(response,2*1024*1024)).toString('utf8'));}catch(e){if(e.code)throw e;throw fail('网页读取接口返回格式无效','FETCH_UNAVAILABLE');}
 if(typeof data.content!=='string'||!data.content.trim())throw fail('网页读取接口未返回正文','FETCH_UNAVAILABLE');
 checkText(data.content);const title=typeof data.title==='string'?data.title.slice(0,200):'';
 if(isAccessGate(data.content,title,url))throw fail('文章要求验证或已不可访问。请打开原文后复制正文或上传截图','ACCESS_GATE');
 return {title,text:data.content};
}
function markdownImages(text,base){
 const found=[...text.matchAll(/!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+[^\n]*)?\)/gi)].map(m=>m[1]);
 for(const match of text.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi))try{found.push(new URL(match[1],base).href);}catch{}
 const urls=[...new Set(found.map(x=>x.replace(/&amp;/g,'&')))];
 if(urls.length>MAX_IMAGES)throw fail('文章图片超过10张，请选择需要的部分截图导入，未截断读取','CONTENT_LIMIT');
 return urls;
}
async function fetchImage(raw,nativeImage,{fetchImpl=fetch,lookup=dns.lookup,signal}={}){
 let url=raw,response;
 for(let redirect=0;redirect<6;redirect++){
  url=await validatePublicUrl(url,{lookup});response=await fetchImpl(url,{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
  if(response.status>=300&&response.status<400&&response.headers.get('location')){url=new URL(response.headers.get('location'),url).href;await response.body?.cancel();continue;}
  if(!response.ok)throw fail('文章图片暂时无法下载','IMAGE_UNAVAILABLE');break;
 }
 if(!response?.ok)throw fail('图片跳转过多，未读取该图片','IMAGE_UNAVAILABLE');
 if(!/^image\/(png|jpe?g|webp|gif)/i.test(response.headers.get('content-type')||''))throw fail('图片地址没有返回可识别图片','IMAGE_UNAVAILABLE');
 const bytes=await limitedBody(response,10*1024*1024);let image=nativeImage.createFromBuffer(bytes);
 if(image.isEmpty())throw fail('文章图片无法解码','IMAGE_UNAVAILABLE');
 let {width,height}=image.getSize();if(width>1250){image=image.resize({width:1250});({width,height}=image.getSize());}
 const positions=capturePositions(height);
 return positions.map(y=>'data:image/jpeg;base64,'+image.crop({x:0,y,width,height:Math.min(VIEW_HEIGHT,height-y)}).toJPEG(88).toString('base64'));
}
// This code only reads the page DOM. It never exposes application APIs to the page.
const PAGE_INFO=`(()=>{const root=document.querySelector('#js_content')||document.querySelector('article')||document.querySelector('main')||document.body;if(!root)return {text:'',height:0,title:document.title};const text=root.innerText||'';const candidates=[root,...root.querySelectorAll('*')].filter(e=>e.clientHeight>200&&e.scrollHeight>e.clientHeight+100&&/auto|scroll/.test(getComputedStyle(e).overflowY));const scroll=candidates.sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]||document.scrollingElement;window.__campusReaderScroll=scroll;const isPage=scroll===document.scrollingElement;const top=isPage?Math.max(0,root.getBoundingClientRect().top+window.scrollY):0;return {text,title:document.querySelector('#activity-name')?.innerText||document.title,height:isPage?Math.max(root.scrollHeight,root.getBoundingClientRect().height):scroll.scrollHeight,top,isPage,images:root.querySelectorAll('img').length,brokenImages:[...root.querySelectorAll('img')].filter(i=>!i.complete||!i.naturalWidth).length,hasCanvas:!!root.querySelector('canvas'),hasInteractive:!!root.querySelector('iframe,video,.swiper,.swiper-container,[role=tab]'),tooWide:root.scrollWidth>innerWidth+100,hasPassword:!!root.querySelector('input[type=password]'),url:location.href}})()`;
async function renderPage(url,{BrowserWindow,session,lookup=dns.lookup,signal}){
 if(signal?.aborted)throw fail('网页读取超时，请重试或补充截图','LINK_TIMEOUT');
 if(!BrowserWindow||!session)throw fail('网页渲染组件不可用','RENDER_UNAVAILABLE');
 const isolated=session.fromPartition('link-reader-'+randomUUID(),{cache:false});
 let win,blockedRequests=0,mainBlocked='',timer;
 const validated=new Map();
 const check=url=>{if(!validated.has(url))validated.set(url,validatePublicUrl(url,{lookup}));return validated.get(url);};
 isolated.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
 isolated.setPermissionCheckHandler(()=>false);
 isolated.on('will-download',event=>event.preventDefault());
 isolated.webRequest.onBeforeRequest((details,callback)=>{
  if(/^(data:|blob:)/i.test(details.url)&&!['mainFrame','subFrame'].includes(details.resourceType)){callback({cancel:false});return;}
  if(!['GET','HEAD','OPTIONS'].includes(details.method)){blockedRequests++;callback({cancel:true});return;}
  check(details.url).then(()=>callback({cancel:false}),()=>{blockedRequests++;if(details.resourceType==='mainFrame')mainBlocked='网页跳转到了不支持的地址';callback({cancel:true});});
 });
 const abort=()=>{if(win&&!win.isDestroyed())win.destroy();};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  win=new BrowserWindow({width:1000,height:VIEW_HEIGHT,useContentSize:true,show:false,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,offscreen:true,spellcheck:false}});
  const wc=win.webContents;wc.setAudioMuted(true);wc.setWindowOpenHandler(()=>({action:'deny'}));
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('will-prevent-unload',event=>event.preventDefault());
  timer=setTimeout(abort,45000);
  await win.loadURL(url);await new Promise(r=>setTimeout(r,1200));
  await wc.executeJavaScript(`(()=>{if(document.contentType.startsWith('image/')){const i=document.querySelector('img');if(i){i.style.cssText='display:block;max-width:none;width:'+Math.min(1000,i.naturalWidth)+'px;height:auto;margin:0';document.body.style.margin='0';}}})()`);
  if(mainBlocked)throw fail(mainBlocked,'UNSAFE_URL');
  let info=await wc.executeJavaScript(PAGE_INFO);await validatePublicUrl(info.url,{lookup});
  if(isAccessGate(info.text,info.title,info.url)||(info.hasPassword&&info.text.length<1000))throw fail('网页要求验证或登录。请在浏览器打开原文后，复制正文或上传截图','ACCESS_GATE');
  checkText(info.text);
  const images=[];const warnings=[];let y=0,finished=false;
  while(images.length<MAX_IMAGES){
   info=await wc.executeJavaScript(PAGE_INFO);capturePositions(info.height);
   await wc.executeJavaScript(`(()=>{const e=window.__campusReaderScroll;if(e===document.scrollingElement)window.scrollTo(0,${Math.round(info.top+y)});else if(e)e.scrollTop=${Math.round(y)};})()`);
   await new Promise(r=>setTimeout(r,450));
   await wc.executeJavaScript(`Promise.race([Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true});}))),new Promise(r=>setTimeout(r,2000))])`);
   const snapshot=await wc.capturePage();if(snapshot.isEmpty())throw fail('网页画面暂时无法读取','RENDER_UNAVAILABLE');
   images.push('data:image/jpeg;base64,'+snapshot.toJPEG(88).toString('base64'));
   info=await wc.executeJavaScript(PAGE_INFO);
   if(isAccessGate(info.text,info.title,info.url))throw fail('页面转入验证页，请打开原文并补充正文或截图','ACCESS_GATE');
   if(y+VIEW_HEIGHT>=info.height){finished=true;break;}y+=STEP;
  }
  if(!finished)throw fail('动态网页超过10段画面，请分段截图或复制正文，未截断导入','CONTENT_LIMIT');
  checkText(info.text);
  if(info.brokenImages)warnings.push(`${info.brokenImages}张网页图片未加载完成，可能缺少图中信息，请对照原文补充截图。`);
  if(info.hasInteractive||info.tooWide)warnings.push('已读取页面自动滚动时可见的画面；需点击翻页、横向滑动或播放的内容，请补充相应截图。');
  if(blockedRequests)warnings.push('部分网页附加请求未加载；如页面内容不完整，请补充截图。');
  if(!meaningfulText(info.text)&&!info.images&&!info.hasCanvas&&!info.hasInteractive)throw fail('页面未显示可读取的文章内容，请补充正文或截图','EMPTY_PAGE');
  return {title:info.title.trim().slice(0,200),text:info.text,images,warnings,finalUrl:info.url};
 }catch(e){if(signal?.aborted||(!e.code&&(!win||win.isDestroyed())))throw fail('网页读取超时，请重试或补充截图','LINK_TIMEOUT');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);abort();isolated.webRequest.onBeforeRequest(null);await isolated.clearStorageData().catch(()=>{});await isolated.clearCache().catch(()=>{});}
}
async function readLink(raw,options={}){
 const sourceUrl=await validatePublicUrl(raw,{lookup:options.lookup});
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),65000);
 const ctx={...options,signal:controller.signal};let fetched=null,downloaded=[],imageWarning='',fetchWarning='';
 try{
  if(options.apiKey){
   try{fetched=await fetchMarkdown(sourceUrl,options.apiKey,ctx);}
   catch(e){if(['CONTENT_LIMIT','ACCESS_GATE','FETCH_POLICY_REJECTED','UNSAFE_URL'].includes(e.code))throw e;fetchWarning=e.code==='FETCH_UNAVAILABLE'?e.message+'，已尝试本机网页读取。':'';}
  }
  if(fetched&&options.nativeImage){
   const imageUrls=markdownImages(fetched.text,sourceUrl);
   for(const imageUrl of imageUrls){
    try{downloaded.push(...await fetchImage(imageUrl,options.nativeImage,ctx));if(downloaded.length>MAX_IMAGES)throw fail('文章图片过长，超过10段画面，请分段上传，未截断导入','CONTENT_LIMIT');}
    catch(e){if(e.code==='CONTENT_LIMIT')throw e;imageWarning='部分文章图片未读取，请补充截图。';}
   }
  }
  try{
   const rendered=await renderPage(sourceUrl,ctx);
   return {...rendered,title:rendered.title||fetched?.title||new URL(sourceUrl).hostname,text:rendered.text.trim()?rendered.text:fetched?.text||'',warnings:[...(fetchWarning?[fetchWarning]:[]),...rendered.warnings],method:fetched?'fetch+render':'render',sourceUrl};
  }catch(e){
   if(['CONTENT_LIMIT','UNSAFE_URL','FETCH_POLICY_REJECTED'].includes(e.code))throw e;
   if(!fetched||(!meaningfulText(fetched.text)&&!downloaded.length))throw e;
   const warning=downloaded.length?'网页画面未读取，已取得接口正文及文章图片；动态H5交互内容可能遗漏，请核对原文。':'仅取得网页正文，图片及H5画面未读取；可能遗漏图中信息，请补充截图。';
   return {title:fetched.title||new URL(sourceUrl).hostname,text:fetched.text,images:downloaded,warnings:[warning,...(imageWarning?[imageWarning]:[])],method:downloaded.length?'fetch+images':'fetch-text-only',sourceUrl,finalUrl:sourceUrl};
  }
 }finally{clearTimeout(timeout);}
}
module.exports={readLink,validatePublicUrl,fetchMarkdown,isAccessGate,meaningfulText,capturePositions,markdownImages,isPublicAddress,fetchImage,renderPage};
