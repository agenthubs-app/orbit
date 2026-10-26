'use client';
import {notificationWebSourceHref} from './notification-source-view-model';
import { scanSecretaryNotificationPage, secretaryKind } from '../../../../shared/compute/secretary-source';
import {notificationDisplayZone,notificationLocalDay} from '../../../../shared/compute/inbox-notification-day';
import {inboxDeliveryPreferencesSchema} from '../../../../shared/api-schema/notification-delivery-policy';
import type {InboxDeliveryPreferencesDTO} from '../../../../shared/contract/notification-delivery-policy';
import { CategoryTabs, Icon, MacTile } from '../orbit-2026/ui';
import { ShellPage } from '../orbit-2026/shell/slots';
import styles from './typed-notifications-tab.module.css';
import {useEffect,useMemo,useRef,useState,type ComponentProps} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {communicationRequest,invalidateInboxActorConfirmation,readContactMessageActor,readContactMessageActorForWrite} from './inbox-request';
import {notificationInboxView,notificationDetailView,type NotificationRow,type NotificationCategory,type NotificationList} from './notification-inbox-view-model';
import {NotificationStatusRail,type WeekCounts} from './notification-status-rail';

const categories={all:{zh:'全部',en:'All',ja:'すべて'},secretary:{zh:'秘书',en:'Secretary',ja:'秘書'},reminder:{zh:'提醒',en:'Reminders',ja:'リマインダー'},suggestion:{zh:'建议',en:'Suggestions',ja:'提案'},update:{zh:'动态',en:'Updates',ja:'更新'},history:{zh:'历史记录',en:'History',ja:'履歴'}};
// b5 #6 row actions: 既読 / タスクに追加 / 1時間後.
const actions={read:{zh:'已读',en:'Read',ja:'既読'},dismiss:{zh:'不需要',en:'Not needed',ja:'不要'},handle:{zh:'已处理',en:'Mark handled',ja:'対応済みにする'},accept:{zh:'加入待办',en:'Add task',ja:'タスクに追加'},snooze:{zh:'1小时后',en:'In 1 hour',ja:'1時間後'}};
const days={today:{zh:'今天',en:'Today',ja:'今日'},yesterday:{zh:'昨天',en:'Yesterday',ja:'昨日'},week:{zh:'本周',en:'This week',ja:'今週'},earlier:{zh:'更早',en:'Earlier',ja:'それ以前'}};
// b5 #7: the category chips appear once the list is long enough to need them (or a filter is on).
const CATEGORY_CHIPS_FROM=5;
const dayIndex=(day:string)=>Math.round(Date.parse(day+'T00:00:00Z')/86400000);
/** 今日 / 昨日 / 今週 (Monday start) / それ以前, in the reader's zone. */
export function notificationDayGroup(occurredAt:string,now:string,timeZone:string):keyof typeof days {
 const today=notificationLocalDay(now,timeZone),diff=dayIndex(today)-dayIndex(notificationLocalDay(occurredAt,timeZone));
 if(diff<=0)return 'today';if(diff===1)return 'yesterday';
 const sinceMonday=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;
 return diff<=sinceMonday?'week':'earlier';
}
function notificationTile(n:NotificationRow):{emoji:string;tone:ComponentProps<typeof MacTile>['tone']} {
 const source=n.sources[0]?.sourceKind;
 if(source==='batch')return {emoji:'🗂️',tone:'teal'};
 if(source==='event_deadline'||source==='event_pick'||source==='event_prep')return {emoji:'🎟️',tone:'apricot'};
 if(secretaryKind(n)||n.kind==='suggestion')return {emoji:'✨',tone:'lav'};
 if(n.kind==='reminder')return {emoji:'⏰',tone:'apricot'};
 return {emoji:'🔄',tone:'blue'};
}
export function NotificationRecordCard({notification:n,onOpen,onAction,timeZone,now,disabled=false}:{notification:NotificationRow;onOpen:()=>void;onAction?:(action:'read'|'accept'|'snooze'|'dismiss')=>void;timeZone?:string;now:string;disabled?:boolean}) {
 const {t,language}=useOrbitLanguage();
 const zone=notificationDisplayZone(timeZone),tile=notificationTile(n);
 const sameDay=notificationLocalDay(n.occurredAt,zone)===notificationLocalDay(now,zone);
 const time=new Intl.DateTimeFormat(language,{timeZone:zone,...(sameDay?{hour:'numeric',minute:'2-digit'}:{month:'numeric',day:'numeric'})}).format(new Date(n.occurredAt));
 const rowActions=onAction?(['read','accept','snooze'] as const).filter(action=>n.actions.includes(action)&&!(action==='read'&&n.readAt)):[];
 const confirm=onAction&&n.kind==='suggestion'&&n.disposition==='open'&&n.actions.includes('accept');
 const subtitle=[n.reason,n.sources[0]?.excerpt,n.dueAt?`${t({zh:'截止时间',en:'Due',ja:'期限'})} · ${new Intl.DateTimeFormat(language,{timeZone:zone,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(n.dueAt))}`:null].filter(Boolean).join(' · ');
 return <tr className={styles.row}>
  <td className={styles.tileCell}><MacTile emoji={tile.emoji} tone={tile.tone} size="sm"/></td>
  <td className={styles.body}>
   <button type="button" className={`btn ${styles.title}`} onClick={onOpen}>{n.title}</button>
   {subtitle?<div className={styles.lbl}>{subtitle}</div>:null}
   {confirm?<div className={styles.confirm}><span className={styles.lbl}>{t({zh:'加入待办吗？',en:'Add it to your tasks?',ja:'タスクに追加しますか？'})}</span>
    {n.actions.includes('dismiss')?<button type="button" className={`btn ${styles.sm}`} disabled={disabled} onClick={()=>onAction('dismiss')}>{t(actions.dismiss)}</button>:null}
    <button type="button" className={`btn ${styles.sm} ${styles.primary}`} disabled={disabled} onClick={()=>onAction('accept')}>{t({zh:'加入',en:'Add',ja:'追加する'})}</button></div>:null}
  </td>
  <td className={styles.actsCell}><div className={styles.acts}>{rowActions.map(action=><button key={action} type="button" className={`btn ${styles.sm}`} disabled={disabled} aria-label={`${t(actions[action])} ${n.title}`} onClick={()=>onAction!(action)}><Icon name={action==='read'?'check':action==='accept'?'plus':'clock'} size={16}/>{t(actions[action])}</button>)}</div></td>
  <td className={styles.timeCell}><span className={styles.lbl}>{time}</span>{!n.readAt&&n.disposition==='open'?<i className={styles.unread} aria-label={t({zh:'未读',en:'Unread',ja:'未読'})}/>:null}</td>
 </tr>;
}
const WEEK_PAGES=4;
export function TypedNotificationsTab({actorId,onIdentityChanged}:{actorId:string;onIdentityChanged:()=>void}) {
 const {t,language}=useOrbitLanguage();const [filter,setFilter]=useState<keyof typeof categories>('all'),[data,setData]=useState<NotificationList|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[timeZone,setTimeZone]=useState('Asia/Tokyo');
 const [preferences,setPreferences]=useState<InboxDeliveryPreferencesDTO|null>(null),[usage,setUsage]=useState<{used:number;cap:number}|null>(null),[week,setWeek]=useState<WeekCounts|null>(null),[statsVersion,setStatsVersion]=useState(0),[quietBusy,setQuietBusy]=useState(false);
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('filter')==='secretary')setFilter('secretary');},[]);
 function selectFilter(next:keyof typeof categories){setFilter(next);const url=new URL(window.location.href);url.searchParams.set('filter',next);window.history.replaceState(window.history.state,'',url);}
 const scope=useRef<AbortController|null>(null),pending=useRef<{id:string;request:{action:keyof typeof actions;expectedRevision:number;idempotencyKey:string;scheduledFor?:string}}|null>(null),lock=useRef(false),query=`language=${language}${filter==='history'?'&history=true':filter==='all'||filter==='secretary'?'':'&kind='+filter}`;
 const changed=useRef(onIdentityChanged);changed.current=onIdentityChanged;
 async function request(path:string,options:RequestInit={},controller=scope.current,allowMissing=false){
  if(!controller||controller.signal.aborted)throw new Error();
  // Reads share the per-cycle identity confirmation; writes pass the fresh pre-write barrier (W0031).
  const write=!!options.method&&options.method.toUpperCase()!=='GET';
  if(await (write?readContactMessageActorForWrite:readContactMessageActor)(controller.signal)!==actorId){invalidateInboxActorConfirmation();changed.current();throw new Error();}
  let result:unknown;
  try{result=await communicationRequest(path,{...options,signal:controller.signal});}
  catch(error){if(!controller.signal.aborted&&!(allowMissing&&error instanceof Error&&error.message==='NOT_FOUND'))invalidateInboxActorConfirmation();throw error;}
  if(controller.signal.aborted)throw new Error();
  if(await readContactMessageActor(controller.signal)!==actorId){invalidateInboxActorConfirmation();changed.current();throw new Error();}
  return result;
 }
 useEffect(()=>{
  const controller=new AbortController();scope.current=controller;setData(null);let loading=false;
  async function refresh(){if(loading||document.visibilityState==='hidden')return;loading=true;try{
    const load=async(cursor?:string)=>notificationInboxView(await request('/api/inbox/notifications?'+query+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);
    const next=filter==='secretary'?await scanSecretaryNotificationPage(load):await load();
    if(!controller.signal.aborted){setData({...next,items:[...next.items]});setError('');}
  }catch{if(!controller.signal.aborted){invalidateInboxActorConfirmation();setData(null);setError(t({zh:'通知读取失败，请重试。',en:'Could not load notifications. Retry.',ja:'通知を読み込めません。再試行してください。'}));}}finally{loading=false;}}
  void refresh();const timer=setInterval(()=>void refresh(),15000);document.addEventListener('visibilitychange',refresh);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actorId,query,filter,attempt]);
 // The rail (b5 #6 通知の状態): preferences, today's push quota and this week's breakdown. Each part is
 // optional — a missing source hides its card instead of showing an invented number.
 useEffect(()=>{
  const controller=new AbortController();
  void request('/api/inbox/delivery/preferences',{},controller,true).then(raw=>{
    const parsed=inboxDeliveryPreferencesSchema.safeParse(raw);
    if(!controller.signal.aborted&&parsed.success&&parsed.data.actorId===actorId){setTimeZone(notificationDisplayZone(parsed.data.timeZone));setPreferences(parsed.data);}
  }).catch(()=>{});
  void request('/api/inbox/delivery/usage',{},controller,true).then(raw=>{
    const value=raw as {actorId?:unknown;used?:unknown;cap?:unknown};
    if(!controller.signal.aborted&&value?.actorId===actorId&&Number.isSafeInteger(value.used)&&Number.isSafeInteger(value.cap)&&(value.cap as number)>0)setUsage({used:value.used as number,cap:value.cap as number});
  }).catch(()=>{});
  void (async()=>{
    const now=new Date().toISOString(),counts:WeekCounts={reminder:0,suggestion:0,update:0,history:0};let cursor:string|null=null;
    for(let page=0;page<WEEK_PAGES;page++){
      const list=notificationInboxView(await request('/api/inbox/notifications?language='+language+'&history=true'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);
      let older=false;
      for(const n of list.items){
        const group=notificationDayGroup(n.occurredAt,now,timeZone);if(group==='earlier'){older=true;continue;}
        if(n.disposition!=='open')counts.history++;else counts[n.kind]++;
      }
      cursor=list.nextCursor;if(older||!cursor)break;
    }
    if(!controller.signal.aborted)setWeek(counts);
  })().catch(()=>{if(!controller.signal.aborted)setWeek(null);});
  return()=>controller.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actorId,language,statsVersion,timeZone]);
 async function setQuiet(next:boolean){
  const current=preferences,controller=scope.current;if(!current||!controller||quietBusy)return;setQuietBusy(true);
  try{const raw=await request('/api/inbox/delivery/preferences',{method:'PUT',body:JSON.stringify({expectedRevision:current.revision,quietHoursEnabled:next})},controller);
   const parsed=inboxDeliveryPreferencesSchema.safeParse(raw);if(!controller.signal.aborted&&parsed.success&&parsed.data.actorId===actorId)setPreferences(parsed.data);
  }catch{if(!controller.signal.aborted){setError(t({zh:'无法更新免打扰时段，请重试。',en:'Could not update quiet hours. Retry.',ja:'静かな時間帯を変更できません。再試行してください。'}));setStatsVersion(n=>n+1);}}
  finally{if(!controller.signal.aborted)setQuietBusy(false);}
 }
 async function open(record:NotificationRow){
  const href=notificationWebSourceHref(record);
  try{
   if(!record.readAt&&record.actions.includes('read')){
    const receipt=await request('/api/inbox/notifications/'+encodeURIComponent(record.id)+'/actions?language='+language,{method:'POST',body:JSON.stringify({action:'read',expectedRevision:record.revision,idempotencyKey:crypto.randomUUID()})}) as {notification:unknown};
    const next=notificationDetailView(receipt.notification,actorId,record.id);
    setData(old=>old?{...old,items:old.items.map(row=>row.id===record.id?next:row)}:old);
   }
   if(href&&!scope.current?.signal.aborted)window.location.assign(href);
  }catch{setError(t({zh:'无法更新通知，请重试。',en:'Could not update the notification. Retry.',ja:'通知を更新できません。再試行してください。'}));}
 }
 async function actFor(record:NotificationRow,action:keyof typeof actions){
  if(lock.current||pending.current&&pending.current.id!==record.id)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);
  const intent=pending.current??{id:record.id,request:{action,expectedRevision:record.revision,idempotencyKey:crypto.randomUUID(),...(action==='snooze'?{scheduledFor:new Date(Date.now()+3600000).toISOString()}:{})}};pending.current=intent;
  try{const result=await request('/api/inbox/notifications/'+encodeURIComponent(intent.id)+'/actions?language='+language,{method:'POST',body:JSON.stringify(intent.request)},controller) as {notification:unknown};const n=notificationDetailView(result.notification,actorId,intent.id);if(controller.signal.aborted)return;pending.current=null;setError('');setData(old=>old?{...old,items:old.items.map(row=>row.id===n.id?n:row)}:old);setStatsVersion(v=>v+1);
  }catch{if(!controller.signal.aborted)setError(t({zh:'操作尚未确认。可以重试同一操作，或刷新查看最新状态。',en:'Action unconfirmed. Retry the same action or refresh its state.',ja:'操作を確認できません。同じ操作を再試行するか、更新してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 async function retryPending(){const intent=pending.current,row=intent&&data?.items.find(n=>n.id===intent.id);if(intent&&row)await actFor(row,intent.request.action);}
 async function markRead(){if(!data||lock.current)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);const snapshot=data.items.filter(n=>!n.readAt&&n.actions.includes('read')).map(n=>({id:n.id,expectedRevision:n.revision}));try{for(let i=0;i<snapshot.length;i+=50){const items=snapshot.slice(i,i+50);const result=await request('/api/inbox/notifications/read',{method:'POST',body:JSON.stringify({items,idempotencyKey:crypto.randomUUID()})},controller) as {results?:{id:string;error?:string;notification?:NotificationRow}[]};if(!result.results||items.some(n=>!result.results!.some(r=>r.id===n.id&&!r.error&&r.notification?.actorId===actorId&&r.notification.readAt)))throw new Error();}if(!controller.signal.aborted)setAttempt(n=>n+1);}catch{if(!controller.signal.aborted)setError(t({zh:'部分通知未能标记，请刷新后重试。',en:'Some notifications could not be marked. Refresh and retry.',ja:'一部の通知を既読にできませんでした。更新して再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 async function more(){if(!data?.nextCursor||lock.current)return;const previous=data,controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);try{const load=async(cursor?:string)=>notificationInboxView(await request('/api/inbox/notifications?'+query+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);const next=filter==='secretary'?await scanSecretaryNotificationPage(load,previous.nextCursor):await load(previous.nextCursor);if(!controller.signal.aborted)setData(old=>old===previous?{...next,items:[...new Map([...old.items,...next.items].map(n=>[n.id,n])).values()]}:old);}catch{if(!controller.signal.aborted)setError(t({zh:'加载失败，请重试。',en:'Could not load more. Retry.',ja:'読み込めません。再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 const rail=useMemo(()=><NotificationStatusRail language={language} usage={usage} preferences={preferences} week={week} quietBusy={quietBusy} onQuietChange={next=>void setQuiet(next)}/>,
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [language,usage,preferences,week,quietBusy]);
 const now=data?.asOf??new Date().toISOString();
 const showCategories=!!data&&(filter!=='all'||data.items.length>=CATEGORY_CHIPS_FROM||data.items.length===0);
 let previousGroup='';
 return <div className={styles.root}>
  <ShellPage rightRail={rail}/>
  {error?<div role="alert" className={styles.alert}>{error} <button className="btn btn-ghost" type="button" onClick={()=>{pending.current=null;setAttempt(n=>n+1);}}>{t({zh:'刷新',en:'Refresh',ja:'更新'})}</button>{pending.current?<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void retryPending()}>{t({zh:'重试操作',en:'Retry action',ja:'操作を再試行'})}</button>:null}</div>:null}
  {!data&&!error?<p role="status">{t({zh:'正在读取通知…',en:'Loading notifications…',ja:'通知を読み込み中…'})}</p>:null}
  {data?<section className={styles.card} aria-label={t({zh:'通知列表',en:'Notifications',ja:'通知一覧'})}>
   {showCategories?<div className={styles.toolbar}>
    <CategoryTabs label={t({zh:'通知类别',en:'Notification categories',ja:'通知の分類'})} value={filter} onChange={key=>selectFilter(key as keyof typeof categories)} options={(Object.keys(categories) as (keyof typeof categories)[]).map(k=>({key:k,label:t(categories[k])}))} />
    {data.items.some(n=>!n.readAt&&n.actions.includes('read'))?<button type="button" className={`btn ${styles.sm}`} disabled={busy} onClick={()=>void markRead()}>{t({zh:'全部已读',en:'Mark all read',ja:'すべて既読'})}</button>:null}
   </div>:null}
   {data.items.length?<table className={styles.table}><tbody>
    {data.items.map(n=>{
      const group=notificationDayGroup(n.occurredAt,now,timeZone),heading=group!==previousGroup;previousGroup=group;
      return [heading?<tr key={'g:'+group}><td colSpan={4} className={styles.day}><b>{t(days[group])}</b></td></tr>:null,
       <NotificationRecordCard key={n.id} notification={n} timeZone={timeZone} now={now} disabled={busy} onOpen={()=>void open(n)} onAction={action=>void actFor(n,action)}/>];
    })}
   </tbody></table>:<p className={styles.empty}>{t({zh:'暂无通知',en:'No notifications',ja:'通知はありません'})}</p>}
   {data.nextCursor?<button type="button" className={`btn ${styles.sm} ${styles.more}`} disabled={busy} onClick={()=>void more()}>{t({zh:'加载更多',en:'Load more',ja:'さらに読み込む'})}</button>:null}
  </section>:null}
 </div>;
}
export type {NotificationCategory};
