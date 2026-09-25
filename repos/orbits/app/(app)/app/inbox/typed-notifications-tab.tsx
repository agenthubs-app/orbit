'use client';
import {notificationWebSourceHref} from './notification-source-view-model';
import {useEffect,useRef,useState} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {formatOrbitDateTime} from '../orbit-datetime';
import {communicationRequest,readContactMessageActor} from './inbox-request';
import {notificationInboxView,notificationDetailView,type NotificationRow,type NotificationCategory,type NotificationList} from './notification-inbox-view-model';

const categories={all:{zh:'全部',en:'All',ja:'すべて'},reminder:{zh:'提醒',en:'Reminders',ja:'リマインダー'},suggestion:{zh:'建议',en:'Suggestions',ja:'提案'},update:{zh:'动态',en:'Updates',ja:'更新'},history:{zh:'历史记录',en:'History',ja:'履歴'}};
const actions={read:{zh:'标为已读',en:'Mark read',ja:'既読にする'},dismiss:{zh:'忽略',en:'Dismiss',ja:'非表示'},handle:{zh:'已处理',en:'Mark handled',ja:'対応済みにする'},accept:{zh:'加入待办',en:'Add task',ja:'タスクに追加'},snooze:{zh:'一小时后提醒',en:'Remind in one hour',ja:'1時間後に通知'}};
export function NotificationCategoryIcon({kind}:{kind:NotificationCategory}){return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{kind==='reminder'?<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>:kind==='suggestion'?<><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7z"/><path d="M20 3v4m-2-2h4"/></>:<><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/></>}</svg>;}
export function NotificationRecordCard({notification:n,onOpen}:{notification:NotificationRow;onOpen:()=>void}) {
 const {t,language}=useOrbitLanguage();
 return <button type="button" className="ri-row" onClick={onOpen} style={{alignItems:'flex-start',gap:14,padding:20,textAlign:'left',width:'100%'}}>
  <span style={{display:'grid',placeItems:'center',width:38,height:38,borderRadius:12,flexShrink:0,background:'var(--surface-2)',color:'var(--accent)'}}><NotificationCategoryIcon kind={n.kind}/></span>
  <span style={{display:'grid',gap:7,minWidth:0,flex:1}}><span style={{fontSize:12,color:'var(--text-3)'}}>{t(categories[n.kind])} · {formatOrbitDateTime(n.occurredAt,language)}</span><strong style={{fontSize:16,overflowWrap:'anywhere'}}>{n.title}</strong><span style={{fontSize:14,lineHeight:1.5,opacity:.75}}>{n.reason}</span>{n.sources[0]?.excerpt?<span style={{fontSize:12,opacity:.65}}>{t({zh:'来源',en:'Source',ja:'参照元'})} · {n.sources[0].excerpt}</span>:null}{n.dueAt?<span style={{fontSize:12}}>{t({zh:'截止时间',en:'Due',ja:'期限'})} · {formatOrbitDateTime(n.dueAt,language)}</span>:null}</span>
  {!n.readAt&&n.disposition==='open'?<span aria-label={t({zh:'未读',en:'Unread',ja:'未読'})} style={{width:6,height:6,borderRadius:3,background:'var(--accent)',marginTop:8}}/>:null}
 </button>;
}
export function TypedNotificationsTab({actorId,onIdentityChanged}:{actorId:string;onIdentityChanged:()=>void}) {
 const {t,language}=useOrbitLanguage();const [filter,setFilter]=useState<keyof typeof categories>('all'),[data,setData]=useState<NotificationList|null>(null),[detail,setDetail]=useState<NotificationRow|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const scope=useRef<AbortController|null>(null),pending=useRef<{id:string;request:{action:keyof typeof actions;expectedRevision:number;idempotencyKey:string;scheduledFor?:string}}|null>(null),lock=useRef(false),query=`language=${language}${filter==='history'?'&history=true':filter==='all'?'':'&kind='+filter}`;
 const changed=useRef(onIdentityChanged);changed.current=onIdentityChanged;
 const detailId=useRef<string|null>(null);detailId.current=detail?.id??null;
 async function request(path:string,options:RequestInit={},controller=scope.current){
  if(!controller||controller.signal.aborted)throw new Error();
  if(await readContactMessageActor(controller.signal)!==actorId){changed.current();throw new Error();}
  const result=await communicationRequest(path,{...options,signal:controller.signal});
  if(controller.signal.aborted)throw new Error();
  if(await readContactMessageActor(controller.signal)!==actorId){changed.current();throw new Error();}
  return result;
 }
 useEffect(()=>{
  const controller=new AbortController();scope.current=controller;setData(null);setDetail(null);let loading=false;
  async function refresh(){if(loading||document.visibilityState==='hidden')return;loading=true;try{
    const next=notificationInboxView(await request('/api/inbox/notifications?'+query,{},controller),actorId);
    const selected=detailId.current?notificationDetailView(await request('/api/inbox/notifications/'+encodeURIComponent(detailId.current)+'?language='+language,{},controller),actorId,detailId.current):null;
    if(!controller.signal.aborted){setData(next);if(selected)setDetail(selected);setError('');}
  }catch{if(!controller.signal.aborted){setData(null);setDetail(null);setError(t({zh:'通知读取失败，请重试。',en:'Could not load notifications. Retry.',ja:'通知を読み込めません。再試行してください。'}));}}finally{loading=false;}}
  void refresh();const timer=setInterval(()=>void refresh(),15000);document.addEventListener('visibilitychange',refresh);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[actorId,query,attempt]);
 async function open(id:string){try{const next=notificationDetailView(await request('/api/inbox/notifications/'+encodeURIComponent(id)+'?language='+language),actorId,id);if(!scope.current?.signal.aborted)setDetail(next);}catch{setError(t({zh:'来源已不可用，请刷新。',en:'Source unavailable. Refresh.',ja:'参照元を利用できません。更新してください。'}));}}
 async function act(action:keyof typeof actions){
  if(!detail||lock.current)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);
  const intent=pending.current??{id:detail.id,request:{action,expectedRevision:detail.revision,idempotencyKey:crypto.randomUUID(),...(action==='snooze'?{scheduledFor:new Date(Date.now()+3600000).toISOString()}:{})}};pending.current=intent;
  try{const result=await request('/api/inbox/notifications/'+encodeURIComponent(intent.id)+'/actions?language='+language,{method:'POST',body:JSON.stringify(intent.request)},controller) as {notification:unknown};const n=notificationDetailView(result.notification,actorId,intent.id);if(controller.signal.aborted)return;pending.current=null;setDetail(n);setError('');setData(old=>old?{...old,items:old.items.map(row=>row.id===n.id?n:row)}:old);
  }catch{if(!controller.signal.aborted)setError(t({zh:'操作尚未确认。可以重试同一操作，或刷新查看最新状态。',en:'Action unconfirmed. Retry the same action or refresh its state.',ja:'操作を確認できません。同じ操作を再試行するか、更新してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 async function markRead(){if(!data||lock.current)return;const controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);const snapshot=data.items.filter(n=>!n.readAt&&n.actions.includes('read')).map(n=>({id:n.id,expectedRevision:n.revision}));try{for(let i=0;i<snapshot.length;i+=50){const items=snapshot.slice(i,i+50);const result=await request('/api/inbox/notifications/read',{method:'POST',body:JSON.stringify({items,idempotencyKey:crypto.randomUUID()})},controller) as {results?:{id:string;error?:string;notification?:NotificationRow}[]};if(!result.results||items.some(n=>!result.results!.some(r=>r.id===n.id&&!r.error&&r.notification?.actorId===actorId&&r.notification.readAt)))throw new Error();}if(!controller.signal.aborted)setAttempt(n=>n+1);}catch{if(!controller.signal.aborted)setError(t({zh:'部分通知未能标记，请刷新后重试。',en:'Some notifications could not be marked. Refresh and retry.',ja:'一部の通知を既読にできませんでした。更新して再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 async function more(){if(!data?.nextCursor||lock.current)return;const previous=data,controller=scope.current;if(!controller)return;lock.current=true;setBusy(true);try{const next=notificationInboxView(await request('/api/inbox/notifications?'+query+'&cursor='+encodeURIComponent(previous.nextCursor!),{},controller),actorId);if(!controller.signal.aborted)setData(old=>old===previous?{...next,items:[...new Map([...old.items,...next.items].map(n=>[n.id,n])).values()]}:old);}catch{if(!controller.signal.aborted)setError(t({zh:'加载失败，请重试。',en:'Could not load more. Retry.',ja:'読み込めません。再試行してください。'}));}finally{lock.current=false;if(!controller.signal.aborted)setBusy(false);}}
 const dispositions={open:{zh:'未处理',en:'Open',ja:'未対応'},handled:{zh:'已处理',en:'Handled',ja:'対応済み'},dismissed:{zh:'已忽略',en:'Dismissed',ja:'非表示'},accepted:{zh:'已加入待办',en:'Task added',ja:'タスクに追加済み'},expired:{zh:'已过期',en:'Expired',ja:'期限切れ'},archived:{zh:'已归档',en:'Archived',ja:'アーカイブ済み'}};
 return <div style={{padding:16}}>
  {error?<div role="alert">{error} <button className="btn btn-ghost" type="button" onClick={()=>{pending.current=null;setAttempt(n=>n+1);}}>{t({zh:'刷新',en:'Refresh',ja:'更新'})}</button>{pending.current?<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void act(pending.current!.request.action)}>{t({zh:'重试操作',en:'Retry action',ja:'操作を再試行'})}</button>:null}</div>:null}
  {!data&&!error?<p role="status">{t({zh:'正在读取通知…',en:'Loading notifications…',ja:'通知を読み込み中…'})}</p>:null}
  {detail?<section style={{display:'grid',gap:18,padding:8}}>
    <button className="btn btn-ghost" type="button" disabled={busy||!!pending.current} onClick={()=>setDetail(null)}>{t({zh:'返回通知',en:'Back to notifications',ja:'通知に戻る'})}</button>
    <div style={{display:'flex',gap:8,alignItems:'center'}}><NotificationCategoryIcon kind={detail.kind}/>{t(categories[detail.kind])}</div><h3 style={{fontSize:24,margin:0}}>{detail.title}</h3><p style={{margin:0,lineHeight:1.7}}>{detail.reason}</p>
    <p>{t(dispositions[detail.disposition])} · {detail.readAt?t({zh:'已读',en:'Read',ja:'既読'}):t({zh:'未读',en:'Unread',ja:'未読'})}</p>
    <div style={{fontSize:13,opacity:.75}}>{detail.dueAt?<p>{t({zh:'截止时间',en:'Due',ja:'期限'})} · {formatOrbitDateTime(detail.dueAt,language)}</p>:null}{detail.scheduledFor?<p>{t({zh:'提醒时间',en:'Reminder time',ja:'通知時刻'})} · {formatOrbitDateTime(detail.scheduledFor,language)}</p>:null}<p>{t({zh:'发生时间',en:'Occurred',ja:'発生日時'})} · {formatOrbitDateTime(detail.occurredAt,language)}</p></div>
    <div style={{border:'1px solid var(--border)',borderRadius:14,padding:18}}><strong>{t({zh:'来源',en:'Source',ja:'参照元'})}</strong>{detail.sources.map((s,i)=><div key={i}>{s.excerpt?<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{s.excerpt}</p>:null}<time style={{fontSize:12}}>{formatOrbitDateTime(s.occurredAt,language)}</time></div>)}</div>
    {notificationWebSourceHref(detail)?<a className="btn btn-primary" href={notificationWebSourceHref(detail)!}>{t({zh:'查看来源',en:'View source',ja:'参照元を開く'})}</a>:null}
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{detail.actions.filter(a=>a!=='read'||!detail.readAt).map(action=><button type="button" className="btn btn-ghost" key={action} disabled={busy||!!pending.current} onClick={()=>void act(action)}>{t(actions[action])}</button>)}</div>
  </section>:data?<>
    <div role="tablist" style={{display:'flex',flexWrap:'wrap',gap:4}}>{(Object.keys(categories) as (keyof typeof categories)[]).map(k=><button type="button" className={'btn '+(filter===k?'btn-primary':'btn-ghost')} role="tab" aria-selected={filter===k} key={k} onClick={()=>setFilter(k)}>{t(categories[k])}</button>)}</div>
    <div style={{display:'flex',justifyContent:'flex-end',padding:8}}><button type="button" className="btn btn-ghost" disabled={busy||!data.items.some(n=>!n.readAt&&n.actions.includes('read'))} onClick={()=>void markRead()}>{t({zh:'全部已读',en:'Mark all read',ja:'すべて既読'})}</button></div>
    {data.items.map(n=><NotificationRecordCard key={n.id} notification={n} onOpen={()=>void open(n.id)}/>)}{!data.items.length?<p style={{padding:32,textAlign:'center'}}>{t({zh:'暂无通知',en:'No notifications',ja:'通知はありません'})}</p>:null}
    {data.nextCursor?<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>void more()}>{t({zh:'加载更多',en:'Load more',ja:'さらに読み込む'})}</button>:null}
  </>:null}
 </div>;
}
