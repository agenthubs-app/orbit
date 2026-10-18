'use client';
import {notificationWebSourceHref} from './notification-source-view-model';
import { scanSecretaryNotificationPage, secretaryKind } from '../../../../shared/compute/secretary-source';
import {notificationDisplayZone,notificationLocalDay} from '../../../../shared/compute/inbox-notification-day';
import {inboxDeliveryPreferencesSchema} from '../../../../shared/api-schema/notification-delivery-policy';
import { CategoryTabs, Icon, ListRow, type RowAction } from '../orbit-2026/ui';
import styles from './typed-notifications-tab.module.css';
import {useEffect,useRef,useState} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {communicationRequest,invalidateInboxActorConfirmation,readContactMessageActor,readContactMessageActorForWrite} from './inbox-request';
import {notificationInboxView,notificationDetailView,type NotificationRow,type NotificationCategory,type NotificationList} from './notification-inbox-view-model';

const categories={all:{zh:'全部',en:'All',ja:'すべて'},secretary:{zh:'秘书',en:'Secretary',ja:'秘書'},reminder:{zh:'提醒',en:'Reminders',ja:'リマインダー'},suggestion:{zh:'建议',en:'Suggestions',ja:'提案'},update:{zh:'动态',en:'Updates',ja:'更新'},history:{zh:'历史记录',en:'History',ja:'履歴'}};
const actions={read:{zh:'标为已读',en:'Mark read',ja:'既読にする'},dismiss:{zh:'忽略',en:'Dismiss',ja:'非表示'},handle:{zh:'已处理',en:'Mark handled',ja:'対応済みにする'},accept:{zh:'加入待办',en:'Add task',ja:'タスクに追加'},snooze:{zh:'一小时后提醒',en:'Remind in one hour',ja:'1時間後に通知'}};
export function NotificationCategoryIcon({kind}:{kind:NotificationCategory}){return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{kind==='reminder'?<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>:kind==='suggestion'?<><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7z"/><path d="M20 3v4m-2-2h4"/></>:<><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/></>}</svg>;}
export function NotificationRecordCard({notification:n,onOpen,onAction,timeZone}:{notification:NotificationRow;onOpen:()=>void;onAction?:(action:'read'|'accept'|'snooze')=>void;timeZone?:string}) {
 const {t,language}=useOrbitLanguage();
 const zone=notificationDisplayZone(timeZone);
 const formatActorTime=(value:string)=>new Intl.DateTimeFormat(language,{timeZone:zone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 const hoverActions:RowAction[]=onAction?(['read','accept','snooze'] as const).filter(action=>n.actions.includes(action)&&!(action==='read'&&n.readAt)).map(action=>({key:action,label:t(actions[action]),icon:action==='read'?'check':action==='accept'?'plus':'clock',tone:action==='read'?'lav':action==='accept'?'ok':'coral',onSelect:()=>onAction(action)})):[];
 return <ListRow title={n.title} onSelect={onOpen}
  leading={<span style={{display:'grid',placeItems:'center',width:38,height:38,borderRadius:12,flexShrink:0,background:'var(--surface-2)',color:'var(--accent-text)'}}>{secretaryKind(n)?'✦':<NotificationCategoryIcon kind={n.kind}/>}</span>}
  subtitle={[t(categories[n.kind]),n.reason,n.sources[0]?.excerpt,n.dueAt?`${t({zh:'截止时间',en:'Due',ja:'期限'})} · ${formatActorTime(n.dueAt)}`:null].filter(Boolean).join(' · ')}
  trailing={<span style={{display:'grid',gap:6,justifyItems:'end'}}>{!n.readAt&&n.disposition==='open'?<span aria-label={t({zh:'未读',en:'Unread',ja:'未読'})} style={{width:6,height:6,borderRadius:3,background:'var(--accent-text)'}}/>:null}<small>{formatActorTime(n.occurredAt)}</small></span>}
  hoverActions={hoverActions} />;
}
export function TypedNotificationsTab({actorId,onIdentityChanged}:{actorId:string;onIdentityChanged:()=>void}) {
 const {t,language}=useOrbitLanguage();const [filter,setFilter]=useState<keyof typeof categories>('all'),[data,setData]=useState<NotificationList|null>(null),[detail,setDetail]=useState<NotificationRow|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[timeZone,setTimeZone]=useState('Asia/Tokyo');
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('filter')==='secretary')setFilter('secretary');},[]);
 function selectFilter(next:keyof typeof categories){setFilter(next);setDetail(null);const url=new URL(window.location.href);url.searchParams.set('filter',next);window.history.replaceState(window.history.state,'',url);}
 const scope=useRef<AbortController|null>(null),pending=useRef<{id:string;request:{action:keyof typeof actions;expectedRevision:number;idempotencyKey:string;scheduledFor?:string}}|null>(null),lock=useRef(false),query=`language=${language}${filter==='history'?'&history=true':filter==='all'||filter==='secretary'?'':'&kind='+filter}`;
 const changed=useRef(onIdentityChanged);changed.current=onIdentityChanged;
 const detailId=useRef<string|null>(null);detailId.current=detail?.id??null;
 async function request(path:string,options:RequestInit={},controller=scope.current){
  if(!controller||controller.signal.aborted)throw new Error();
  // Reads share the per-cycle identity confirmation; writes pass the fresh pre-write barrier (W0031).
  const write=!!options.method&&options.method.toUpperCase()!=='GET';
  if(await (write?readContactMessageActorForWrite:readContactMessageActor)(controller.signal)!==actorId){invalidateInboxActorConfirmation();changed.current();throw new Error();}
  let result:unknown;
  try{result=await communicationRequest(path,{...options,signal:controller.signal});}
  catch(error){if(!controller.signal.aborted)invalidateInboxActorConfirmation();throw error;}
  if(controller.signal.aborted)throw new Error();
  if(await readContactMessageActor(controller.signal)!==actorId){invalidateInboxActorConfirmation();changed.current();throw new Error();}
  return result;
 }
 useEffect(()=>{
  const controller=new AbortController();scope.current=controller;setData(null);setDetail(null);setTimeZone('Asia/Tokyo');let loading=false;
  void request('/api/inbox/delivery/preferences',{},controller).then(raw=>{
    const parsed=inboxDeliveryPreferencesSchema.safeParse(raw);
    if(!controller.signal.aborted&&parsed.success&&parsed.data.actorId===actorId)setTimeZone(notificationDisplayZone(parsed.data.timeZone));
  }).catch(()=>{});
  async function refresh(){if(loading||document.visibilityState==='hidden')return;loading=true;try{
    const load=async(cursor?:string)=>notificationInboxView(await request('/api/inbox/notifications?'+query+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);
    const next=filter==='secretary'?await scanSecretaryNotificationPage(load):await load();
    const selected=detailId.current?notificationDetailView(await request('/api/inbox/notifications/'+encodeURIComponent(detailId.current)+'?language='+language,{},controller),actorId,detailId.current):null;
    if(!controller.signal.aborted){setData({...next,items:[...next.items]});if(selected)setDetail(selected);setError('');}
  }catch{if(!controller.signal.aborted){invalidateInboxActorConfirmation();setData(null);setDetail(null);setError(t({zh:'通知读取失败，请重试。',en:'Could not load notifications. Retry.',ja:'通知を読み込めません。再試行してください。'}));}}finally{loading=false;}}
  void refresh();const timer=setInterval(()=>void refresh(),15000);document.addEventListener('visibilitychange',refresh);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[actorId,query,filter,attempt]);
 async function open(id:string){try{
  let next=notificationDetailView(await request('/api/inbox/notifications/'+encodeURIComponent(id)+'?language='+language),actorId,id);
  if(!next.readAt&&next.actions.includes('read')){
   const receipt=await request('/api/inbox/notifications/'+encodeURIComponent(id)+'/actions?language='+language,{method:'POST',body:JSON.stringify({action:'read',expectedRevision:next.revision,idempotencyKey:crypto.randomUUID()})}) as {notification:unknown};
   next=notificationDetailView(receipt.notification,actorId,id);
   setData(old=>old?{...old,items:old.items.map(row=>row.id===id?next:row)}:old);
  }
  if(!scope.current?.signal.aborted)setDetail(next);
 }catch{setError(t({zh:'无法更新通知，请重试。',en:'Could not update the notification. Retry.',ja:'通知を更新できません。再試行してください。'}));}}
 async function actFor(record:NotificationRow,action:keyof typeof actions){
  if(lock.current||pending.current&&pending.current.id!==record.id)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);setDetail(record);
  const intent=pending.current??{id:record.id,request:{action,expectedRevision:record.revision,idempotencyKey:crypto.randomUUID(),...(action==='snooze'?{scheduledFor:new Date(Date.now()+3600000).toISOString()}:{})}};pending.current=intent;
  try{const result=await request('/api/inbox/notifications/'+encodeURIComponent(intent.id)+'/actions?language='+language,{method:'POST',body:JSON.stringify(intent.request)},controller) as {notification:unknown};const n=notificationDetailView(result.notification,actorId,intent.id);if(controller.signal.aborted)return;pending.current=null;setDetail(n);setError('');setData(old=>old?{...old,items:old.items.map(row=>row.id===n.id?n:row)}:old);
  }catch{if(!controller.signal.aborted)setError(t({zh:'操作尚未确认。可以重试同一操作，或刷新查看最新状态。',en:'Action unconfirmed. Retry the same action or refresh its state.',ja:'操作を確認できません。同じ操作を再試行するか、更新してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 async function act(action:keyof typeof actions){if(detail)await actFor(detail,action);}
 async function markRead(){if(!data||lock.current)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);const snapshot=data.items.filter(n=>!n.readAt&&n.actions.includes('read')).map(n=>({id:n.id,expectedRevision:n.revision}));try{for(let i=0;i<snapshot.length;i+=50){const items=snapshot.slice(i,i+50);const result=await request('/api/inbox/notifications/read',{method:'POST',body:JSON.stringify({items,idempotencyKey:crypto.randomUUID()})},controller) as {results?:{id:string;error?:string;notification?:NotificationRow}[]};if(!result.results||items.some(n=>!result.results!.some(r=>r.id===n.id&&!r.error&&r.notification?.actorId===actorId&&r.notification.readAt)))throw new Error();}if(!controller.signal.aborted)setAttempt(n=>n+1);}catch{if(!controller.signal.aborted)setError(t({zh:'部分通知未能标记，请刷新后重试。',en:'Some notifications could not be marked. Refresh and retry.',ja:'一部の通知を既読にできませんでした。更新して再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 async function more(){if(!data?.nextCursor||lock.current)return;const previous=data,controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);try{const load=async(cursor?:string)=>notificationInboxView(await request('/api/inbox/notifications?'+query+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);const next=filter==='secretary'?await scanSecretaryNotificationPage(load,previous.nextCursor):await load(previous.nextCursor);if(!controller.signal.aborted)setData(old=>old===previous?{...next,items:[...new Map([...old.items,...next.items].map(n=>[n.id,n])).values()]}:old);}catch{if(!controller.signal.aborted)setError(t({zh:'加载失败，请重试。',en:'Could not load more. Retry.',ja:'読み込めません。再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 const dispositions={open:{zh:'未处理',en:'Open',ja:'未対応'},handled:{zh:'已处理',en:'Handled',ja:'対応済み'},dismissed:{zh:'已忽略',en:'Dismissed',ja:'非表示'},accepted:{zh:'已加入待办',en:'Task added',ja:'タスクに追加済み'},expired:{zh:'已过期',en:'Expired',ja:'期限切れ'},archived:{zh:'已归档',en:'Archived',ja:'アーカイブ済み'}};
 let previousDay='';
 return <div className={styles.root}>
  {error?<div role="alert">{error} <button className="btn btn-ghost" type="button" onClick={()=>{pending.current=null;setAttempt(n=>n+1);}}>{t({zh:'刷新',en:'Refresh',ja:'更新'})}</button>{pending.current?<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void act(pending.current!.request.action)}>{t({zh:'重试操作',en:'Retry action',ja:'操作を再試行'})}</button>:null}</div>:null}
  {!data&&!error?<p role="status">{t({zh:'正在读取通知…',en:'Loading notifications…',ja:'通知を読み込み中…'})}</p>:null}
  {data?<div className={styles.workspace}>
   <section className={`${styles.list} ${detail?styles.detailOpen:''}`} aria-label={t({zh:'通知列表',en:'Notifications',ja:'通知一覧'})}>
    <CategoryTabs label={t({zh:'通知类别',en:'Notification categories',ja:'通知の分類'})} value={filter} onChange={key=>selectFilter(key as keyof typeof categories)} options={(Object.keys(categories) as (keyof typeof categories)[]).map(k=>({key:k,label:t(categories[k])}))} />
    <div className={styles.toolbar}><button type="button" className="btn btn-ghost" disabled={busy||!data.items.some(n=>!n.readAt&&n.actions.includes('read'))} onClick={()=>void markRead()}>{t({zh:'全部已读',en:'Mark all read',ja:'すべて既読'})}</button><a className="btn btn-ghost" href="/app/settings/notifications" aria-label={t({zh:'通知设置',en:'Notification settings',ja:'通知の設定'})}><Icon name="settings" size={16}/></a></div>
    {data.items.map(n=>{
      const zone=notificationDisplayZone(timeZone),day=new Date(n.occurredAt).toLocaleDateString(language,{timeZone:zone,month:'long',day:'numeric'});
      const dayKey=notificationLocalDay(n.occurredAt,zone),heading=dayKey!==previousDay;previousDay=dayKey;
      return <div key={n.id} className={n.id===detail?.id?styles.selected:''}>{heading?<h3 className={styles.day}>{day}</h3>:null}<NotificationRecordCard notification={n} timeZone={zone} onOpen={()=>void open(n.id)} onAction={action=>void actFor(n,action)}/></div>;
    })}
    {!data.items.length?<p className={styles.empty}>{t({zh:'暂无通知',en:'No notifications',ja:'通知はありません'})}</p>:null}
    {data.nextCursor?<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>void more()}>{t({zh:'加载更多',en:'Load more',ja:'さらに読み込む'})}</button>:null}
   </section>
   <section className={`${styles.detail} ${detail?styles.detailVisible:''}`} aria-label={t({zh:'通知详情',en:'Notification detail',ja:'通知の詳細'})}>
   {detail?<>
    <button className={`btn btn-ghost ${styles.back}`} type="button" disabled={busy||!!pending.current} onClick={()=>setDetail(null)}>{t({zh:'返回通知',en:'Back to notifications',ja:'通知に戻る'})}</button>
    <div style={{display:'flex',gap:8,alignItems:'center'}}><NotificationCategoryIcon kind={detail.kind}/>{t(categories[detail.kind])}</div><h3 style={{fontSize:24,margin:0}}>{detail.title}</h3><p style={{margin:0,lineHeight:1.7}}>{detail.reason}</p>
    <p>{t(dispositions[detail.disposition])} · {detail.readAt?t({zh:'已读',en:'Read',ja:'既読'}):t({zh:'未读',en:'Unread',ja:'未読'})}</p>
    <div style={{fontSize:13,opacity:.75}}>{detail.dueAt?<p>{t({zh:'截止时间',en:'Due',ja:'期限'})} · {formatOrbitDateTime(detail.dueAt,language)}</p>:null}{detail.scheduledFor?<p>{t({zh:'提醒时间',en:'Reminder time',ja:'通知時刻'})} · {formatOrbitDateTime(detail.scheduledFor,language)}</p>:null}<p>{t({zh:'发生时间',en:'Occurred',ja:'発生日時'})} · {formatOrbitDateTime(detail.occurredAt,language)}</p></div>
    <div style={{border:'1px solid var(--line)',borderRadius:14,padding:18}}><strong>{t({zh:'关联内容',en:'Related item',ja:'関連する内容'})}</strong>{detail.sources.map((s,i)=><div key={i}>{s.excerpt?<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{s.excerpt}</p>:null}<time style={{fontSize:12}}>{formatOrbitDateTime(s.occurredAt,language)}</time></div>)}</div>
    {notificationWebSourceHref(detail)?<a className="btn btn-primary" href={notificationWebSourceHref(detail)!}>{t({zh:'打开内容',en:'Open item',ja:'内容を開く'})}</a>:null}
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{detail.actions.filter(a=>a!=='read'||!detail.readAt).map(action=><button type="button" className="btn btn-ghost" key={action} disabled={busy||!!pending.current} onClick={()=>void act(action)}>{t(actions[action])}</button>)}</div>
   </>:<p className={styles.placeholder}>{t({zh:'选择一条通知查看详情',en:'Select a notification to read it',ja:'通知を選ぶと詳細を表示します'})}</p>}
   </section>
  </div>:null}
 </div>;
}
