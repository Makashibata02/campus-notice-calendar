import React,{useEffect,useMemo,useRef,useState} from 'react';
import {prepareMaterial} from './materials';
import {api,errorText,local,ItemFields,Drawer,Modal,useConfirm} from './ui';
import './review.css';

type Props={data:any;refresh:()=>Promise<any>;notify:(message:string)=>void;active:boolean;onCourseDraft:(draft:any)=>void;openRequest?:number;sourceRequest?:{id:string;nonce:number}};
const kinds:Record<string,string>={event:'活动',task:'截止任务',course:'课程'};
const materialStates:Record<string,string>={ready:'待识别',reading:'读取中',extracting:'识别中',done:'已识别',failed:'处理失败'};
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const validTime=(value:string)=>!!value&&Number.isFinite(Date.parse(value))&&/(Z|[+-]\d{2}:\d{2})$/.test(value);

export function getCandidateIssues(d:any,material?:any){
 const issues:string[]=[];
 if(!d.title?.trim())issues.push('请填写名称');
 // An explicitly chosen update target can supply omitted fields; the backend preview validates the merged item.
 if(!d.targetId){
  if(!validDate(d.date))issues.push('请补充具体日期');
  if(!d.allDay&&!validTime(d.start))issues.push('请确认时间或选择仅日期');
  if(d.end&&(!validTime(d.end)||!validTime(d.start)||Date.parse(d.end)<=Date.parse(d.start)))issues.push('请检查结束时间');
 }
 if(d.recurrence)issues.push('需要设置重复课程');
 if(!material)issues.push('原材料已不存在');
 else if(['reading','extracting'].includes(material.status))issues.push('原材料正在处理');
 else if(material.status==='failed'||(material.type==='web'&&material.status!=='done'))issues.push('原材料尚未识别成功');
 for(const text of d.missing||[])if(text&&!issues.includes(text))issues.push(text);
 return issues;
}

function MaterialBody({material,controls=false,busy=false,onExtract,onRetry,onSupplement,onViewMaterial}:any){
 const [preview,setPreview]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [baseDate,setBaseDate]=useState(material?.baseDate||''),[pages,setPages]=useState('');
 const id=material?.id;
 useEffect(()=>{setBaseDate(material?.baseDate||'');setPages('');},[id]);
 useEffect(()=>{
  let cancelled=false;setPreview(null);setError('');
  if(!material||material.status==='reading'){setLoading(false);return;}
  setLoading(true);
  prepareMaterial(material).then(p=>{if(!cancelled)setPreview(p);}).catch(e=>{if(!cancelled)setError(errorText(e));}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[id,material?.status,material?.readAt]);
 if(!material)return <div className="empty-state">原材料不存在。</div>;
 const working=busy||['reading','extracting'].includes(material.status);
 return <div className="material-body">
  <div className="material-heading"><span className={'status-pill '+material.status}>{materialStates[material.status]||material.status}</span><span className="muted">材料 #{material.seq}</span></div>
  <h3 className="material-name">{material.name}</h3>
  {material.sourceUrl&&<><p className="source-address">{material.sourceUrl}</p><div className="toolbar compact">
   <button onClick={()=>api.openSource({id}).catch((e:any)=>setError(errorText(e)))}>打开原文</button>
   {controls&&material.type==='web'&&<button disabled={working} onClick={()=>onRetry(material)}>重新读取</button>}
   {controls&&<button disabled={working} onClick={()=>onSupplement(material)}>补充正文或截图</button>}
  </div></>}
  {controls&&<div className="material-options">
   <label>原消息日期<input type="date" value={baseDate} onChange={e=>setBaseDate(e.target.value)} disabled={working}/></label>
   <p className="muted">用于解释“明天”等相对日期；不确定时留空。</p>
   {material.type==='pdf'&&<label>PDF 转图页码<input value={pages} onChange={e=>setPages(e.target.value)} placeholder="例如 1,3；留空按文字读取" disabled={working}/><span className="muted">扫描件或复杂表格可选页转图，每次最多10页。</span></label>}
   <button className="primary" disabled={working||(material.type==='web'&&!!error)} onClick={()=>onExtract(material,baseDate,pages)}>{working?(material.status==='reading'?'正在读取…':'正在处理…'):'识别此材料'}</button>
  </div>}
  {!controls&&onViewMaterial&&<button className="text-button" onClick={()=>onViewMaterial(id)}>在材料中查看处理记录</button>}
  {material.status==='reading'&&<p role="status" className="inline-progress">正在读取正文和页面图片…</p>}
  {material.status==='extracting'&&<p role="status" className="inline-progress">正在识别活动与任务，完成后可在待审核中查看。</p>}
  {material.error&&<p className="inline-error" role="alert">{material.error}</p>}
  {error&&error!==material.error&&<p className="inline-error" role="alert">{error}</p>}
  {(preview?.warnings||material.readWarnings||[]).map((w:string,i:number)=><p className="warning" key={i}>{w}</p>)}
  {loading&&<p className="muted" role="status">正在准备材料预览…</p>}
  {preview?.previews?.length>0?<details className="material-images"><summary>查看网页图片与页面截图（{preview.previews.length}张）</summary>{preview.previews.map((image:string,i:number)=><figure key={i}><figcaption>第{i+1}张</figcaption><img src={image} alt={`网页内容第${i+1}张`}/></figure>)}</details>:preview?.preview&&<figure className="material-image"><img src={preview.preview} alt="原材料预览"/></figure>}
  {preview?.text&&<><h4>正文</h4><pre className="material-text">{preview.text}</pre></>}
 </div>;
}

export function ReviewPage({data,refresh,notify,active,onCourseDraft,openRequest=0,sourceRequest}:Props){
 const [view,setView]=useState<'drafts'|'materials'>('drafts'),[query,setQuery]=useState(''),[sourceFilter,setSourceFilter]=useState(''),[kindFilter,setKindFilter]=useState(''),[problemsOnly,setProblemsOnly]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[currentId,setCurrentId]=useState(''),[detailTab,setDetailTab]=useState<'item'|'source'>('item'),[materialId,setMaterialId]=useState('');
 const [edits,setEdits]=useState<Record<string,any>>({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[blockers,setBlockers]=useState<{id:string;title:string;message:string}[]>([]),[writePreview,setWritePreview]=useState<any>(null);
 const [importOpen,setImportOpen]=useState(false),[importMode,setImportMode]=useState<'link'|'text'|'files'>('link'),[link,setLink]=useState(''),[text,setText]=useState(''),[importDate,setImportDate]=useState(''),[supplement,setSupplement]=useState<any>(null),[importBusy,setImportBusy]=useState(false),[importError,setImportError]=useState('');
 const [materialWork,setMaterialWork]=useState<{id:string;kind:string}|null>(null),[materialError,setMaterialError]=useState<{id:string;message:string}|null>(null);
 const {confirm,confirmation}=useConfirm();
 const deletedHere=useRef(new Set<string>()),knownIds=useRef(new Set<string>()),selectAll=useRef<HTMLInputElement>(null),fileHandler=useRef<(files:File[])=>void>(()=>{});
 const materials=useMemo(()=>[...data.materials].sort((a:any,b:any)=>b.seq-a.seq),[data.materials]);
 const byMaterial=useMemo(()=>new Map<string,any>(materials.map((m:any)=>[m.id,m])),[materials]);
 const drafts=useMemo(()=>data.drafts.map((d:any)=>edits[d.id]||d).sort((a:any,b:any)=>((byMaterial.get(b.materialId)?.seq||0)-(byMaterial.get(a.materialId)?.seq||0))||(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id)),[data.drafts,edits,byMaterial]);
 const filtered=useMemo(()=>drafts.filter((d:any)=>(!query||d.title?.toLowerCase().includes(query.toLowerCase()))&&(!sourceFilter||d.materialId===sourceFilter)&&(!kindFilter||d.kind===kindFilter)&&(!problemsOnly||getCandidateIssues(d,byMaterial.get(d.materialId)).length)),[drafts,query,sourceFilter,kindFilter,problemsOnly,byMaterial]);
 const current=drafts.find((d:any)=>d.id===currentId),currentMaterial=current&&byMaterial.get(current.materialId),material=byMaterial.get(materialId);
 const currentIssues=current?getCandidateIssues(current,currentMaterial):[];
 const filteredIds=filtered.map((d:any)=>d.id),selectedInView=selected.filter(id=>filteredIds.includes(id));
 const allSelected=filtered.length>0&&selectedInView.length===filtered.length;

 useEffect(()=>{setSelected([]);setBlockers([]);if(currentId&&!filtered.some((d:any)=>d.id===currentId))setCurrentId('');},[query,sourceFilter,kindFilter,problemsOnly,view]);
 useEffect(()=>{if(!active)setSelected([]);},[active]);
 useEffect(()=>{if(selectAll.current)selectAll.current.indeterminate=selectedInView.length>0&&!allSelected;},[selectedInView.length,allSelected]);
 useEffect(()=>{
  const ids=new Set<string>(data.drafts.map((d:any)=>d.id));
  const disappeared=[...knownIds.current].filter(id=>!ids.has(id));
  if(disappeared.some(id=>!deletedHere.current.has(id)&&(edits[id]||selected.includes(id)||currentId===id)))notify('部分候选已被重新识别或移除，旧的选择和编辑已清除。');
  setEdits(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>ids.has(id))));
  setSelected(previous=>previous.filter(id=>ids.has(id)));
  if(currentId&&!ids.has(currentId)){setCurrentId(data.drafts[0]?.id||'');setDetailTab('item');}
  setBlockers(previous=>previous.filter(x=>ids.has(x.id)));
  knownIds.current=ids;deletedHere.current.clear();
 },[data.drafts]);
 useEffect(()=>{if(openRequest){setImportOpen(true);setImportError('');setSupplement(null);setImportDate('');}},[openRequest]);
 useEffect(()=>{if(sourceRequest?.id){setView('materials');setMaterialId(sourceRequest.id);setMaterialError(null);}},[sourceRequest?.nonce]);
 useEffect(()=>{setWritePreview(null);setError('');},[currentId]);
 useEffect(()=>{const receive=(event:Event)=>fileHandler.current((event as CustomEvent<File[]>).detail||[]);window.addEventListener('campus:import-files',receive);return()=>window.removeEventListener('campus:import-files',receive);},[]);

 function openDraft(id:string){setCurrentId(id);setDetailTab('item');setError('');}
 function changeDraft(value:any){setEdits(previous=>({...previous,[value.id]:value}));setWritePreview(null);setBlockers(previous=>previous.filter(x=>x.id!==value.id));}
 function forget(ids:string[]){
  ids.forEach(id=>deletedHere.current.add(id));
  const removed=new Set(ids);setEdits(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!removed.has(id))));setSelected(previous=>previous.filter(id=>!removed.has(id)));setBlockers(previous=>previous.filter(x=>!removed.has(x.id)));
  if(removed.has(currentId)){const index=filtered.findIndex((d:any)=>d.id===currentId);const next=[...filtered.slice(index+1),...filtered.slice(0,index)].find((d:any)=>!removed.has(d.id));setCurrentId(next?.id||'');setDetailTab('item');}
 }
 async function saveDraft(d:any){setBusy('save');setError('');try{await api.saveDraft(d);setEdits(previous=>{const next={...previous};delete next[d.id];return next;});await refresh();notify('修改已保存');}catch(e){setError(`“${d.title}”：${errorText(e)}`);}finally{setBusy('');}}
 async function previewDraft(d:any){setBusy('preview');setError('');try{setWritePreview({id:d.id,result:await api.previewDraft(d)});}catch(e){setError(`“${d.title}”：${errorText(e)}`);}finally{setBusy('');}}
 async function confirmDrafts(items:any[]){
  if(!items.length||busy)return;setBusy('confirm');setError('');setBlockers([]);
  try{
   const problems:{id:string;title:string;message:string}[]=[];
   for(const d of items){const issues=getCandidateIssues(d,byMaterial.get(d.materialId));if(issues.length){problems.push({id:d.id,title:d.title,message:issues.join('；')});continue;}try{await api.previewDraft(d);}catch(e){problems.push({id:d.id,title:d.title,message:errorText(e)});}}
   if(problems.length){setBlockers(problems);return;}
   await api.confirm(items);forget(items.map(d=>d.id));await refresh();notify(`已将${items.length}项写入日历`);
  }catch(e){setError(errorText(e));await refresh();}finally{setBusy('');}
 }
 async function deleteDrafts(items:any[]){
  if(!items.length||busy)return;
  const ok=await confirm({title:items.length===1?'删除这条待审核事项？':`删除所选的 ${items.length} 项？`,message:'只删除待审核候选，原材料和已经入历的事项会保留。',detail:<><ul className="delete-titles">{items.slice(0,5).map(d=><li key={d.id}>{d.title||'未命名事项'}</li>)}</ul>{items.length>5&&<p className="muted">另有 {items.length-5} 项。</p>}</>,confirmLabel:items.length===1?'删除此项':`删除 ${items.length} 项`,danger:true});
  if(!ok)return;setBusy('delete');setError('');
  try{const result=await api.deleteDrafts({ids:items.map(d=>d.id)});forget(result.deletedIds);await refresh();notify(`已删除${result.deletedIds.length}项待审核内容，原材料已保留`);}catch(e){setError(errorText(e));await refresh();}finally{setBusy('');}
 }
 function showMaterial(id:string){setMaterialId(id);setView('materials');setMaterialError(null);}
 function beginImport(){setImportOpen(true);setImportError('');setSupplement(null);setImportDate('');}
 function beginSupplement(m:any){setSupplement(m);setImportMode('text');setImportDate(m.baseDate||'');setImportError('');setImportOpen(true);}
 async function imported(items:any[],message:string){await refresh();if(items.length){setMaterialId(items[items.length-1].id);setView('materials');setImportOpen(false);setSupplement(null);setMaterialError(null);notify(message);}}
 async function importNotice(){
  if(importBusy)return;setImportBusy(true);setImportError('');
  try{
   if(importMode==='link'){const m=await api.importLink({url:link.trim(),baseDate:importDate});await imported([m],m.status==='failed'?'网页未能完整读取，可查看原因并补充材料':'网页已读取，请检查后识别');setLink('');}
   else if(importMode==='text'){const m=await api.importText({name:text.trim().split(/\r?\n/)[0].slice(0,45),text,baseDate:importDate,sourceId:supplement?.id});await imported([m],'文字已保存，可以开始识别');setText('');}
  }catch(e){setImportError(errorText(e));notify('导入失败：'+errorText(e));await refresh();}finally{setImportBusy(false);}
 }
 async function chooseFiles(){if(importBusy)return;setImportBusy(true);setImportError('');try{const items=await api.selectFiles({sourceId:supplement?.id,baseDate:importDate});await imported(items,`已保存${items.length}份材料`);}catch(e){setImportError(errorText(e));await refresh();}finally{setImportBusy(false);}}
 async function addFiles(files:File[]){
  if(!files.length)return;if(importBusy){notify('正在导入，请稍候再添加文件');return;}if(files.length>10){setImportOpen(true);setImportMode('files');setImportError('每批最多10个文件，请分批添加。');return;}
  setImportBusy(true);setImportError('');const importedFiles:any[]=[];
  try{for(const f of files){importedFiles.push(await api.importBinary({name:f.name,bytes:Array.from(new Uint8Array(await f.arrayBuffer())),sourceId:importOpen?supplement?.id:undefined,baseDate:importOpen?importDate:''}));}await imported(importedFiles,`已保存${importedFiles.length}份材料`);}catch(e){await refresh();if(importedFiles.length){setMaterialId(importedFiles[importedFiles.length-1].id);setView('materials');}setImportOpen(true);setImportMode('files');setImportError(errorText(e)+(importedFiles.length?'；已添加的文件仍保留在材料中。':''));}finally{setImportBusy(false);}
 }
 fileHandler.current=addFiles;
 async function materialReplacementAllowed(m:any,action:string){const count=data.drafts.filter((d:any)=>d.materialId===m.id).length;if(!count)return true;return confirm({title:`${action}这份材料？`,message:`操作成功后会替换这份材料的 ${count} 条待审核候选，包括尚未保存的编辑。已经入历的事项会保留。`,confirmLabel:action});}
 async function retryMaterial(m:any){
  if(materialWork){notify('正在处理另一份材料，请稍候');return;}if(!await materialReplacementAllowed(m,'重新读取'))return;setMaterialWork({id:m.id,kind:'reading'});setMaterialError(null);
  try{const result=await api.retryLink({id:m.id});if(result.status!=='failed')data.drafts.filter((d:any)=>d.materialId===m.id).forEach((d:any)=>deletedHere.current.add(d.id));await refresh();if(result.status==='failed')setMaterialError({id:m.id,message:result.error||'读取失败，请补充正文或截图'});else notify('网页已重新读取，请检查后识别');}catch(e){setMaterialError({id:m.id,message:errorText(e)});await refresh();}finally{setMaterialWork(null);}
 }
 async function extractMaterial(m:any,baseDate:string,pages:string){
  if(materialWork){notify('正在处理另一份材料，请稍候');return;}if(!await materialReplacementAllowed(m,'重新识别'))return;setMaterialWork({id:m.id,kind:'extracting'});setMaterialError(null);
  try{const prepared=await prepareMaterial(m,pages);const result=await api.extract({id:m.id,baseDate,payload:prepared.payload});data.drafts.filter((d:any)=>d.materialId===m.id).forEach((d:any)=>deletedHere.current.add(d.id));const next=await refresh();setView('drafts');setSourceFilter(m.id);setQuery('');setKindFilter('');setProblemsOnly(false);setSelected([]);setDetailTab('item');setCurrentId(next.drafts.find((d:any)=>d.materialId===m.id)?.id||'');notify(result.count?`识别完成，共${result.count}项，请审核后入历`:'识别完成，没有发现需要入历的事项');}catch(e){setMaterialError({id:m.id,message:errorText(e)});await refresh();}finally{setMaterialWork(null);}
 }
 const selectedItems=filtered.filter((d:any)=>selectedInView.includes(d.id));
 return <div className="review-page">
  <div className="page-header"><div><h1>导入与审核</h1><p className="muted">先核对，再放进日历。</p></div><button className="primary" onClick={beginImport}>＋ 添加通知</button></div>
  <div className="review-viewbar"><div className="segmented" aria-label="审核视图"><button className={view==='drafts'?'active':''} onClick={()=>setView('drafts')}>待审核 <span className="count">{drafts.length}</span></button><button className={view==='materials'?'active':''} onClick={()=>setView('materials')}>材料 <span className="count">{materials.length}</span></button></div>{importBusy&&!importOpen&&<span role="status" className="inline-progress">正在导入材料…</span>}</div>
  {view==='drafts'?<div className="work-split review-content">
   <section className="review-main" aria-busy={!!busy}>
    <div className="review-filters"><input aria-label="搜索待审核标题" placeholder="搜索标题" value={query} disabled={!!busy} onChange={e=>setQuery(e.target.value)}/><select aria-label="按来源筛选" value={sourceFilter} disabled={!!busy} onChange={e=>setSourceFilter(e.target.value)}><option value="">全部来源</option>{materials.map((m:any)=><option key={m.id} value={m.id}>#{m.seq} {m.name}</option>)}</select><select aria-label="按事项类型筛选" value={kindFilter} disabled={!!busy} onChange={e=>setKindFilter(e.target.value)}><option value="">全部类型</option>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><label className="check"><input type="checkbox" checked={problemsOnly} disabled={!!busy} onChange={e=>setProblemsOnly(e.target.checked)}/>需要补充</label></div>
    <div className={'review-batchbar '+(selectedInView.length?'has-selection':'')}><label className="check"><input ref={selectAll} type="checkbox" checked={allSelected} disabled={!filtered.length||!!busy} onChange={e=>setSelected(e.target.checked?filteredIds:[])}/>全选当前结果</label><span className="selection-count">已选 {selectedInView.length} 项</span><div className="batch-buttons"><button className="primary" disabled={!selectedInView.length||!!busy} onClick={()=>confirmDrafts(selectedItems)}>确认所选 ({selectedInView.length})</button><button className="danger" disabled={!selectedInView.length||!!busy} onClick={()=>deleteDrafts(selectedItems)}>删除所选 ({selectedInView.length})</button><button className="text-button" disabled={!selectedInView.length||!!busy} onClick={()=>setSelected([])}>取消选择</button></div></div>
    {busy&&<div className="inline-progress review-feedback" role="status">{{save:'正在保存修改…',preview:'正在核对写入结果…',confirm:'正在检查并确认所选事项…',delete:'正在删除所选事项…'}[busy]}</div>}
    {error&&<div className="inline-error review-feedback" role="alert">{error}</div>}
    {blockers.length>0&&<div className="review-blockers" role="alert"><strong>本次尚未入历：{blockers.length} 项需要检查</strong><ul>{blockers.map(b=><li key={b.id}><button className="text-button" onClick={()=>openDraft(b.id)}>{b.title||'未命名事项'}</button><span>{b.message}</span></li>)}</ul></div>}
    <div className="review-list scroll-area">
     {filtered.length?<table className="candidate-table"><caption className="sr-only">待审核事项</caption><thead><tr><th className="candidate-check" aria-label="选择"/><th>事项</th><th className="candidate-date">日期 / 时间</th><th className="candidate-source">来源</th><th className="candidate-status">检查</th></tr></thead><tbody>{filtered.map((d:any)=>{const source=byMaterial.get(d.materialId),issues=getCandidateIssues(d,source);return <tr key={d.id} tabIndex={0} className={(currentId===d.id?'is-current ':'')+(selectedInView.includes(d.id)?'is-selected':'')} onClick={()=>openDraft(d.id)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();openDraft(d.id);}}} aria-label={`查看：${d.title}`}>
      <td className="candidate-check" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={'选择：'+d.title} checked={selectedInView.includes(d.id)} disabled={!!busy} onChange={e=>setSelected(previous=>e.target.checked?[...previous,d.id]:previous.filter(id=>id!==d.id))}/></td>
      <td className="candidate-title"><b title={d.title}>{d.title||'未命名事项'}</b><small>{kinds[d.kind]||'事项'}{d.location?' · '+d.location:''}{edits[d.id]?' · 未保存':''}<span className="compact-source"> · {source?.name||'来源已移除'}</span></small></td>
      <td className="candidate-date"><span>{d.date||'日期待确认'}</span><small>{d.allDay?'仅日期':d.start?local(d.start).slice(11)+(d.end?' — '+local(d.end).slice(11):''):'时间待确认'}</small></td>
      <td className="candidate-source"><span title={source?.name}>{source?.name||'来源已移除'}</span></td>
      <td className="candidate-status"><span className={'status-pill '+(issues.length?'needs-check':'ready')} title={issues.join('；')}>{d.recurrence?'重复课程':issues.length?'需补充':'可确认'}</span></td>
     </tr>;})}</tbody></table>:<div className="empty-state"><h3>{drafts.length?'没有符合筛选的候选':'没有待审核事项'}</h3><p>{drafts.length?'换一个关键词或来源试试。':'添加通知并完成识别后，在这里核对活动和任务。'}</p>{drafts.length?<button onClick={()=>{setQuery('');setSourceFilter('');setKindFilter('');setProblemsOnly(false);}}>清除筛选</button>:<button className="primary" onClick={beginImport}>添加通知</button>}</div>}
    </div><div className="review-list-footer">当前显示 {filtered.length} 项{sourceFilter?' · 已按来源筛选':''}</div>
   </section>
   {current&&active&&<Drawer title="审核事项" subtitle={edits[current.id]?'有未保存的修改':kinds[current.kind]||'事项'} onClose={()=>setCurrentId('')} footer={<><button disabled={!!busy} onClick={()=>saveDraft(current)}>保存修改</button>{current.recurrence?<button className="primary" disabled={!!busy} onClick={()=>onCourseDraft(current)}>设置课表</button>:<button className="primary" disabled={!!busy} onClick={()=>confirmDrafts([current])}>确认入历</button>}<button className="danger" aria-label={'删除待审核事项：'+current.title} disabled={!!busy} onClick={()=>deleteDrafts([current])}>删除</button></>}>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {blockers.find(b=>b.id===current.id)&&<p className="inline-error" role="alert">尚未入历：{blockers.find(b=>b.id===current.id)?.message}</p>}
    <div className="segmented detail-tabs"><button className={detailTab==='item'?'active':''} onClick={()=>setDetailTab('item')}>事项</button><button className={detailTab==='source'?'active':''} onClick={()=>setDetailTab('source')}>原通知</button></div>
    {detailTab==='source'?<MaterialBody key={current.materialId} material={currentMaterial} onViewMaterial={showMaterial}/>:<>
     <fieldset className="review-fields" disabled={!!busy}><ItemFields value={current} onChange={changeDraft}/></fieldset>
     {currentIssues.length>0&&<div className="warning"><strong>需要检查</strong><ul>{currentIssues.map((message:string,i:number)=><li key={i}>{message}</li>)}</ul>{!!current.missing?.length&&!current.recurrence&&<button disabled={!!busy} onClick={()=>changeDraft({...current,missing:[]})}>已对照原文核对上述提示</button>}</div>}
     <label className="review-write-mode">写入方式<select value={current.targetId||''} disabled={!!busy} onChange={e=>changeDraft({...current,targetId:e.target.value||undefined})}><option value="">新增 / 同日同名自动去重</option>{data.events.filter((e:any)=>!e.seriesId).map((e:any)=><option key={e.id} value={e.id}>更新：{e.title} · {e.date}</option>)}</select></label><button disabled={!!busy||!!current.recurrence} onClick={()=>previewDraft(current)}>预览写入结果</button>
     {writePreview?.id===current.id&&<div className="write-preview" role="status">{writePreview.result.existing?(writePreview.result.diffs.length?<><strong>将更新已有事项</strong><ul>{writePreview.result.diffs.map((line:string,i:number)=><li key={i}>{line}</li>)}</ul></>:'内容一致，不会重复新增。'):'确认后将新增一条日历事项。'}</div>}
     <h4>来源片段</h4><blockquote>{current.quote||'未提供引用，请在“原通知”中核对。'}</blockquote><p className="muted">{currentMaterial?.name||'来源已移除'}</p>
    </>}
   </Drawer>}
  </div>:<div className="work-split review-content">
   <section className="review-main"><div className="material-list-heading"><span>原材料</span><span className="muted">共 {materials.length} 份</span></div><div className="scroll-area material-list">
    {materials.length?materials.map((m:any)=><button key={m.id} className={'material-row '+(materialId===m.id?'is-current':'')} onClick={()=>{setMaterialId(m.id);setMaterialError(null);}}><span className="file-mark">{m.type==='web'?'链接':m.type==='text'?'文字':m.type.toUpperCase()}</span><span className="material-row-name"><b>{m.name}</b><small>#{m.seq} · {new Date(m.createdAt).toLocaleDateString('zh-CN')} · {drafts.filter((d:any)=>d.materialId===m.id).length} 项待审核</small></span><span className={'status-pill '+m.status}>{materialWork?.id===m.id?(materialWork?.kind==='reading'?'读取中':'识别中'):(materialStates[m.status]||m.status)}</span></button>):<div className="empty-state"><h3>还没有材料</h3><p>添加网页链接、通知文字、截图或 PDF。</p><button className="primary" onClick={beginImport}>添加通知</button></div>}
   </div></section>
   {material&&active&&<Drawer title="材料详情" onClose={()=>setMaterialId('')}>
    {materialError?.id===material.id&&<div className="inline-error" role="alert">{materialError?.message}</div>}
    <MaterialBody key={material.id} material={material} controls busy={materialWork?.id===material.id} onExtract={extractMaterial} onRetry={retryMaterial} onSupplement={beginSupplement}/>
    {drafts.some((d:any)=>d.materialId===material.id)&&<button className="text-button" onClick={()=>{setSourceFilter(material.id);setQuery('');setKindFilter('');setProblemsOnly(false);setView('drafts');setCurrentId('');}}>查看这份材料的待审核结果</button>}
   </Drawer>}
  </div>}
  {active&&importOpen&&<Modal title={supplement?'补充原网页材料':'添加通知'} onClose={()=>setImportOpen(false)} footer={<>{importMode!=='files'&&<button className="primary" disabled={importBusy||(importMode==='link'?!link.trim():!text.trim())} onClick={importNotice}>{importBusy?(importMode==='link'?'正在读取…':'正在保存…'):importMode==='link'?'读取链接':'保存文字'}</button>}<button onClick={()=>setImportOpen(false)}>{importBusy?'后台继续':'取消'}</button></>}>
   <div className="segmented import-tabs"><button disabled={importBusy||!!supplement} className={importMode==='link'?'active':''} onClick={()=>setImportMode('link')}>网页链接</button><button disabled={importBusy} className={importMode==='text'?'active':''} onClick={()=>setImportMode('text')}>文字</button><button disabled={importBusy} className={importMode==='files'?'active':''} onClick={()=>setImportMode('files')}>文件 / 截图</button></div>
   {supplement&&<div className="supplement-banner"><p>关联原网页：{supplement.name}</p><button className="text-button" disabled={importBusy} onClick={()=>setSupplement(null)}>取消关联</button></div>}
   {importMode==='link'?<><label htmlFor="notice-link">粘贴网页链接<input id="notice-link" type="url" placeholder="https://…" value={link} onChange={e=>setLink(e.target.value)} disabled={importBusy}/></label><p className="muted">支持公众号文章、公开网页和 H5 的正文与图片，最多10屏。报名二维码和小程序不处理。</p></>:importMode==='text'?<label htmlFor="notice-text">通知正文<textarea id="notice-text" rows={8} value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴完整通知，保留标题、时间、地点和要求。" disabled={importBusy}/></label>:<div className="file-drop-hint"><strong>拖入文件，或直接粘贴截图</strong><p>TXT、PNG、JPEG、WebP、PDF</p><button disabled={importBusy} onClick={chooseFiles}>选择截图 / PDF / TXT</button><p className="muted">每批最多10个文件；图片和 TXT 不超过10MB，PDF 不超过50MB。</p></div>}
   <label>原消息日期（可选）<input type="date" value={importDate} onChange={e=>setImportDate(e.target.value)} disabled={importBusy}/></label><p className="muted">只有原通知确切日期已知时才填写，用于理解“明天”等相对日期。</p>
   {importBusy&&<p className="inline-progress" role="status">{importMode==='link'?'正在读取文章正文和图片，可关闭此窗口后继续查看其他内容。':'正在保存材料…'}</p>}
   {importError&&<p className="inline-error" role="alert">{importError}</p>}
  </Modal>}
  {active&&confirmation}
 </div>;
}
