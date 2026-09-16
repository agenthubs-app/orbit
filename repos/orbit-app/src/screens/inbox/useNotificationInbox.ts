import {useCallback,useEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import type {ApiResult} from '../../api/types';
import type {InboxNotificationKind,InboxNotificationListDTO} from '../../api/contract/inbox-notifications';
import {INBOX_NOTIFICATIONS_PATH,notificationInboxData} from '../../api/inbox-notifications';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
import {emitMessageStateInvalidation} from '../../api/message-state';
type Get=(path:string,options?:{signal?:AbortSignal})=>Promise<ApiResult<unknown>>;
type Post=(path:string,body:unknown)=>Promise<ApiResult<unknown>>;
export function useNotificationInbox(actorId:string,get:Get,post:Post,isCurrent:()=>boolean) {
 const {language,t}=useOrbitLocale();const [filter,setFilter]=useState<'all'|'history'|InboxNotificationKind>('all'),[attempt,setAttempt]=useState(0);
 const [snapshot,setSnapshot]=useState<{scope:typeof isCurrent;query:string;data:InboxNotificationListDTO}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 // The parent remounts on account, credentials or server changes. Retain only
 // rollout capability across foreground refreshes, never notification content.
 const [enabled,setEnabled]=useState<boolean|undefined>(undefined);
 const query=`language=${language}${filter==='history'?'&history=true':filter==='all'?'':'&kind='+filter}`;
 const pageLock=useRef(false),mutationLock=useRef(false),lifetime=useRef<AbortController|null>(null);
 const data=isCurrent()&&snapshot?.scope===isCurrent&&snapshot.query===query?snapshot.data:null;
 const refresh=useCallback(()=>{if(isCurrent())setAttempt(n=>n+1);},[isCurrent]);
 useEffect(()=>{
  if(!isCurrent())return;const controller=new AbortController();lifetime.current=controller;setSnapshot(null);setError('');
  void get(INBOX_NOTIFICATIONS_PATH+'?'+query,{signal:controller.signal}).then(result=>{
   if(controller.signal.aborted||!isCurrent())return;const next=result.success?notificationInboxData(result.data,actorId):null;
   if(next){setEnabled(next.enabled);setSnapshot({scope:isCurrent,query,data:next});}else setError(t('typedInbox.error'));
  }).catch(()=>{if(!controller.signal.aborted&&isCurrent())setError(t('typedInbox.error'));});
  return()=>controller.abort();
 },[actorId,get,isCurrent,query,attempt]);
 useEffect(()=>{if(!isCurrent())return;const timer=setInterval(refresh,15000);return()=>clearInterval(timer);},[isCurrent,refresh]);
 const latest=useRef(data);latest.current=data;
 async function more(){
  const page=data,controller=lifetime.current;if(!page?.nextCursor||pageLock.current||!controller||controller.signal.aborted)return;
  pageLock.current=true;setBusy(true);
  try{const result=await get(INBOX_NOTIFICATIONS_PATH+'?'+query+'&cursor='+encodeURIComponent(page.nextCursor),{signal:controller.signal});if(controller.signal.aborted||!isCurrent()||latest.current!==page)return;const next=result.success?notificationInboxData(result.data,actorId):null;if(!next)throw new Error();setSnapshot({scope:isCurrent,query,data:{...next,items:[...new Map([...page.items,...next.items].map(n=>[n.id,n])).values()]}});setError('');}catch{if(isCurrent()&&!controller.signal.aborted)setError(t('typedInbox.error'));}finally{pageLock.current=false;if(isCurrent())setBusy(false);}
 }
 async function markRead(){
  if(!data||mutationLock.current||!isCurrent())return;const scope=isCurrent,items=data.items.filter(n=>!n.readAt&&n.actions.includes('read')).map(n=>({id:n.id,expectedRevision:n.revision}));mutationLock.current=true;setBusy(true);
  try{for(let index=0;index<items.length;index+=50){if(!scope())return;const batch=items.slice(index,index+50);const result=await post(INBOX_NOTIFICATIONS_PATH+'/read',{items:batch,idempotencyKey:randomUUID()});if(!scope())return;
    const rows=result.success?(result.data as {results?:{id:string;notification?:{readAt?:string;actorId?:string};error?:string}[]})?.results:null;
    if(!rows||rows.length!==batch.length||batch.some(i=>!rows.some(r=>r.id===i.id&&!r.error&&r.notification?.readAt&&r.notification.actorId===actorId)))throw new Error();}
   emitMessageStateInvalidation();refresh();
  }catch{if(scope())setError(t('typedInbox.conflict'));}finally{mutationLock.current=false;if(scope())setBusy(false);}
 }
 return {data,enabled,error,busy,filter,setFilter,more,markRead,refresh};
}
