import React,{useEffect,useId,useRef,useState,ReactNode} from 'react';
import './types';

export const api=window.campus;
export const errorText=(e:any)=>String(e?.message||e||'操作失败').replace(/^Error invoking remote method '[^']+': Error: /,'');
export const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export const local=(v:string)=>v&&Number.isFinite(Date.parse(v))?new Date(Date.parse(v)+8*3600000).toISOString().slice(0,16):'';
export const iso=(v:string)=>v?new Date(v+':00+08:00').toISOString():'';
export const emptyEvent=()=>({title:'',kind:'event',category:'',date:today(),allDay:false,start:'',end:'',location:'',action:'',reminderMinutes:30,status:'active'});
export const labels:Record<string,string>={pending:'待发送',sending:'发送中',accepted:'邮件服务已接收',failed:'失败',uncertain:'结果不确定',cancelled:'已取消',missed:'已错过',ready:'待识别',reading:'读取中',extracting:'识别中',done:'已识别',active:'有效',completed:'已完成'};
export const dateText=(v:any)=>!v.date?'待补日期':v.allDay?v.date+' · 仅日期':v.date+' '+(local(v.start).slice(11)||'待补时间');

export function Icon({name,size=20}:{name:string;size?:number}){
 const paths:Record<string,ReactNode>={
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h6"/></>,
  inbox:<><path d="M4 4h16l2 12v4H2v-4L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6M8 8h8M8 11h5"/></>,
  book:<><path d="M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 1-3ZM3 17h17M7 7h8M7 10h6"/></>,
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M9 21h6"/></>,
  settings:<><path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 3 3-2 4-1 3-4-2-3-1-4-4-3-4 1Z"/><circle cx="12" cy="12" r="3"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,left:<path d="m14 6-6 6 6 6"/>,right:<path d="m10 6 6 6-6 6"/>,
  search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,help:<><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 17h.01"/></>,
  panel:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,check:<path d="m4 12 5 5L20 6"/>,trash:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.calendar}</svg>;
}

type ContainerProps={title:string;subtitle?:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;className?:string};
export function Drawer({title,subtitle,onClose,children,footer,className=''}:ContainerProps){
 const ref=useRef<HTMLElement>(null),closeRef=useRef(onClose),id=useId();closeRef.current=onClose;
 useEffect(()=>{
  const before=document.activeElement as HTMLElement;
  ref.current?.querySelector<HTMLElement>('[data-autofocus],input,button,select,textarea')?.focus({preventScroll:true});
  const handler=(e:KeyboardEvent)=>{if(ref.current?.closest('[hidden]')||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();closeRef.current();}if(e.key==='Tab'&&matchMedia('(max-width:1199px)').matches){const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);if(before?.isConnected)before.focus({preventScroll:true});};
 },[]);
 return <aside ref={ref} className={'detail-pane '+className} aria-labelledby={id}><header className="detail-header"><div><h2 id={id}>{title}</h2>{subtitle&&<p className="muted">{subtitle}</p>}</div><button className="icon-button" aria-label="关闭详情" onClick={onClose}><Icon name="close"/></button></header><div className="detail-body">{children}</div>{footer&&<footer className="detail-footer">{footer}</footer>}</aside>;
}

export function Modal({title,subtitle,onClose,children,footer,className=''}:ContainerProps){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const before=document.activeElement as HTMLElement;ref.current?.showModal();ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();return()=>{ref.current?.close();if(before?.isConnected)before.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={'modal '+className} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}}><header className="detail-header"><div><h2 id={id}>{title}</h2>{subtitle&&<p className="muted">{subtitle}</p>}</div><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><Icon name="close"/></button></header><div className="modal-body">{children}</div>{footer&&<footer className="detail-footer">{footer}</footer>}</dialog>;
}

type ConfirmOptions={title:string;message:string;detail?:ReactNode;confirmLabel?:string;danger?:boolean};
export function useConfirm(){
 const [options,setOptions]=useState<ConfirmOptions|null>(null);const resolver=useRef<((v:boolean)=>void)|null>(null);
 const resolve=(value:boolean)=>{resolver.current?.(value);resolver.current=null;setOptions(null);};
 useEffect(()=>()=>{resolver.current?.(false);},[]);
 const confirm=(value:ConfirmOptions)=>new Promise<boolean>(resolve=>{resolver.current?.(false);resolver.current=resolve;setOptions(value);});
 const confirmation=options&&<Modal title={options.title} onClose={()=>resolve(false)} className="confirm-modal" footer={<><button data-autofocus onClick={()=>resolve(false)}>取消</button><button className={options.danger?'danger-solid':'primary'} onClick={()=>resolve(true)}>{options.confirmLabel||'确认'}</button></>}><p className="confirm-message">{options.message}</p>{options.detail}</Modal>;
 return {confirm,confirmation};
}

export function ItemFields({value:v,onChange:set}:{value:any;onChange:(v:any)=>void}){
 return <div className="field-grid"><label className="wide">名称<input value={v.title||''} onChange={e=>set({...v,title:e.target.value})}/></label><label>类型<select value={v.kind||'event'} onChange={e=>set({...v,kind:e.target.value,reminderMinutes:e.target.value==='task'?1440:30})}><option value="event">活动</option><option value="task">截止任务</option><option value="course">课程</option></select></label><label>课程 / 项目<input value={v.category||''} onChange={e=>set({...v,category:e.target.value})}/></label><label className="wide">日期<input type="date" value={v.date||''} onChange={e=>set({...v,date:e.target.value,...(v.allDay?{}:{start:'',end:''})})}/></label><label className="check wide"><input type="checkbox" checked={!!v.allDay} onChange={e=>set({...v,allDay:e.target.checked,start:'',end:''})}/>仅日期，没有精确时刻</label>{!v.allDay&&<><label className="wide">开始 / 截止时间（北京时间）<input type="datetime-local" value={local(v.start)} onChange={e=>set({...v,start:iso(e.target.value),date:e.target.value.slice(0,10)})}/></label><label className="wide">结束时间（可选）<input type="datetime-local" value={local(v.end)} onChange={e=>set({...v,end:iso(e.target.value)})}/></label></>}<label className="wide">地点<input value={v.location||''} onChange={e=>set({...v,location:e.target.value})}/></label><label className="wide">提醒<select value={v.reminderMinutes===null?'off':String(v.reminderMinutes??30)} onChange={e=>set({...v,reminderMinutes:e.target.value==='off'?null:+e.target.value})}><option value="off">关闭</option><option value="0">准时 / 仅日期当天09:00</option><option value="10">提前10分钟</option><option value="30">提前30分钟</option><option value="60">提前1小时</option><option value="1440">提前1天</option></select></label><label className="wide">行动要求<textarea rows={3} value={v.action||''} onChange={e=>set({...v,action:e.target.value})}/></label></div>;
}
