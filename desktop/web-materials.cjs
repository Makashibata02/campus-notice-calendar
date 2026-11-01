const fs=require('node:fs');
const path=require('node:path');
const {uid,validDate}=require('./core.cjs');

class WebMaterials {
 constructor(store,reader,getKey){this.store=store;this.reader=reader;this.getKey=getKey;this.active=new Set();}
 async import(input){
  let url;try{url=new URL(String(input.url||'').trim());}catch{throw Error('请输入完整的 http 或 https 网页链接');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)throw Error('请输入有效的公开网页链接');
  if(input.baseDate&&!validDate(input.baseDate))throw Error('原消息日期无效');
  const material=this.store.importMaterial({type:'web',name:url.hostname+' 网页',sourceUrl:url.href,baseDate:input.baseDate||''});
  return this.retry(material.id);
 }
 async retry(id){
  const material=this.store.get('material',id);
  if(!material||material.type!=='web')throw Error('网页材料不存在');
  if(this.active.has(id))throw Error('该网页正在读取，请稍候');
  if(this.active.size>=2)throw Error('已有两个网页正在读取，请稍候');
  this.active.add(id);
  this.store.put('material',{...material,status:'reading',error:undefined});
  const newFiles=[];
  try{
   const result=await this.reader(material.sourceUrl,await this.getKey());
   if(typeof result.text!=='string'||result.text.length>100000)throw Error('网页正文过长，请分段粘贴或上传截图');
   if(!Array.isArray(result.images)||result.images.length>10)throw Error('网页超过10屏，请分段上传截图');
   if(!result.text.trim()&&!result.images.length)throw Error('网页没有可读取的内容，请补充正文或截图');
   const folder=path.join(this.store.dir,'materials');fs.mkdirSync(folder,{recursive:true});
   let total=0;
   for(const image of result.images){
    const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if(!match)throw Error('网页图像内容无效，请重新读取');
    const bytes=Buffer.from(match[2],'base64');total+=bytes.length;
    if(!bytes.length||bytes.length>10*1024*1024||total>30*1024*1024)throw Error('网页图片过大，请分段上传截图');
    const name=uid()+(match[1]==='png'?'.png':'.jpg');
    fs.writeFileSync(path.join(folder,name),bytes);newFiles.push(name);
   }
   const updated={...material,name:String(result.title||material.name).slice(0,200),text:result.text,webImages:newFiles,imagesCount:newFiles.length,finalUrl:result.finalUrl||material.sourceUrl,readMethod:result.method,readWarnings:result.warnings||[],readAt:new Date().toISOString(),status:'ready'};
   delete updated.error;
   this.store.put('material',updated);
   // Results from a previous reading must not be mistaken for the refreshed page.
   for(const draft of this.store.all('draft').filter(d=>d.materialId===id))this.store.del('draft',draft.id);
   for(const name of material.webImages||[])fs.rmSync(path.join(folder,path.basename(name)),{force:true});
   return updated;
  }catch(e){
   for(const name of newFiles)fs.rmSync(path.join(this.store.dir,'materials',name),{force:true});
   const failed={...material,status:'failed',error:e.message||'网页读取失败，请补充正文或截图'};
   this.store.put('material',failed);return failed;
  }finally{this.active.delete(id);}
 }
 read(id){
  const m=this.store.get('material',id);if(!m||m.type!=='web')throw Error('网页材料不存在');
  if(m.status==='failed'||m.status==='reading')return {type:'web',text:'',images:[],warnings:m.readWarnings||[],sourceUrl:m.sourceUrl,error:m.error||'网页正在读取'};
  return {type:'web',text:m.text||'',images:(m.webImages||[]).map(name=>'data:image/'+(name.endsWith('.png')?'png':'jpeg')+';base64,'+fs.readFileSync(path.join(this.store.dir,'materials',path.basename(name))).toString('base64')),warnings:m.readWarnings||[],sourceUrl:m.sourceUrl,method:m.readMethod};
 }
 source(input={}){
  if(input.baseDate&&!validDate(input.baseDate))throw Error('原消息日期无效');
  const base={baseDate:input.baseDate||''};
  if(!input.sourceId)return base;
  const material=this.store.get('material',input.sourceId);
  if(!material?.sourceUrl)throw Error('补充材料的原网页不存在');
  return {...base,sourceUrl:material.sourceUrl,sourceId:material.id};
 }
}
module.exports={WebMaterials};
