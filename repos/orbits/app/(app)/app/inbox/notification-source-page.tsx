'use client';
import {useEffect,useState} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {communicationRequest,readContactMessageActor} from './inbox-request';
import {notificationDetailView,type NotificationRow} from './notification-inbox-view-model';
import {verifiedSourceNote} from './notification-source-view-model';
export function NotificationSourcePage({notificationId}:{notificationId:string}) {
 const {t,language}=useOrbitLanguage(),[record,setRecord]=useState<NotificationRow|null>(null),[note,setNote]=useState<{title:string;body:string}|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let controller=new AbortController(),busy=false;setRecord(null);setNote(null);setError(false);
  async function load(){if(busy||document.visibilityState==='hidden')return;busy=true;const active=controller;try{
   const actor=await readContactMessageActor(active.signal),n=notificationDetailView(await communicationRequest('/api/inbox/notifications/'+encodeURIComponent(notificationId)+'?language='+language,{signal:active.signal}),actor,notificationId);
   if(n.target.status!=='available')throw Error();
   const original=n.sources[0]?.sourceKind==='note'?verifiedSourceNote(await communicationRequest('/api/notes/'+encodeURIComponent(n.sources[0].sourceId),{signal:active.signal}),n):null;
   if(await readContactMessageActor(active.signal)!==actor)throw Error();
   if(!active.signal.aborted){setRecord(n);setNote(original);setError(false);}
  }catch{if(!active.signal.aborted){setRecord(null);setNote(null);setError(true);}}finally{busy=false;}}
  function visibility(){controller.abort();controller=new AbortController();busy=false;setRecord(null);setNote(null);if(document.visibilityState!=='hidden')void load();}
  void load();const timer=setInterval(()=>void load(),15000);document.addEventListener('visibilitychange',visibility);
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
 },[notificationId,language,attempt]);
 return <section style={{maxWidth:720,margin:'32px auto',padding:24}}>
  <h1>{t({zh:'通知来源',en:'Notification source',ja:'通知の参照元'})}</h1>
  {error?<div role="alert"><p>{t({zh:'来源已变化或暂不可用，请返回通知刷新。',en:'The source changed or is unavailable. Refresh the notification.',ja:'参照元が変更されたか利用できません。通知を更新してください。'})}</p><button className="btn btn-secondary" onClick={()=>setAttempt(v=>v+1)}>{t({zh:'重试',en:'Retry',ja:'再試行'})}</button></div>:!record?<p role="status">{t({zh:'正在读取…',en:'Loading…',ja:'読み込み中…'})}</p>:<>
   <h2>{note?.title||record.title}</h2>
   {note?<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{note.body}</p>:<><h3>{t({zh:'原文摘录',en:'Source excerpts',ja:'原文の抜粋'})}</h3>{record.sources.map((source,index)=><p key={index} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.8}}>{source.excerpt}</p>)}</>}
  </>}
 </section>;
}
