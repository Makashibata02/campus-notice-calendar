export interface CalendarItem {id:string; title:string; category?:string; kind:'event'|'task'|'course';date:string;start?:string;end?:string;allDay:boolean;location?:string;action?:string;status:'active'|'completed'|'cancelled';reminderMinutes:number|null;seriesId?:string;sources:string[];changes:{at:string;text:string}[]}
export interface SourceMaterial {id:string;seq:number;name:string;type:string;status:string;baseDate?:string;error?:string;sourceUrl?:string;sourceId?:string;finalUrl?:string;readMethod?:string;readWarnings?:string[];imagesCount?:number}
export interface CandidateItem extends Partial<CalendarItem>{id:string;materialId:string;quote?:string;missing:string[];targetId?:string;recurrence?:unknown}
export interface Semester {id:string;name:string;monday:string;weeks:number;periods:Record<string,{start:string;end:string}>}
export interface CourseSeries {id:string;semesterId:string;title:string;weekday:number;fromWeek:number;toWeek:number;parity:'all'|'odd'|'even';explicitWeeks:number[];startPeriod:number;endPeriod:number;location:string}
export interface ReminderJob {id:string;eventId:string;title:string;status:string;scheduledAt:number;error?:string}
declare global {interface Window {campus:Record<string,(payload?:any)=>Promise<any>>}}
