'use client';
import {useEffect,useRef,useState} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {readContactMessageActor,readContactMessageActorForWrite} from '../inbox/inbox-request';
import {Button,Card,Icon,Segmented,Toggle,type IconName} from '../orbit-2026/ui';
import {notificationCopy} from '../orbit-2026/copy/notifications';
import {pickCopy} from '../orbit-2026/copy/types';
import type {InboxDeliveryPreferencesDTO,InboxDeliveryPreferencesInput} from '../../../../shared/contract/notification-delivery-policy';
import {inboxDeliveryPreferencesSchema} from '../../../../shared/api-schema/notification-delivery-policy';
import {quietHoursPatch} from './notifications/model';
import s from './notifications/NotificationSettings.module.css';

const endpoint='/api/inbox/delivery/preferences';
export function NotificationDeliverySettings({conversationId}:{conversationId?:string}){
 const {language}=useOrbitLanguage(),copy=(key:keyof typeof notificationCopy)=>pickCopy(notificationCopy[key],language);
 const [data,setData]=useState<InboxDeliveryPreferencesDTO|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[unavailable,setUnavailable]=useState(false);
 const [start,setStart]=useState('22:00'),[end,setEnd]=useState('07:30'),[invalidTime,setInvalidTime]=useState(false);
 const controller=useRef<AbortController|null>(null),lock=useRef(false);
 useEffect(()=>{const scope=new AbortController();controller.current=scope;setData(null);setError(false);setBusy(false);setUnavailable(false);lock.current=false;
  void(async()=>{const actor=await readContactMessageActor(scope.signal);if(!actor)throw Error();const r=await fetch(endpoint,{signal:scope.signal,cache:'no-store'});if(r.status===404){if(!scope.signal.aborted)setUnavailable(true);return;}
   const body=await r.json(),p=inboxDeliveryPreferencesSchema.safeParse(body.data);if(!r.ok||!p.success||p.data.actorId!==actor||await readContactMessageActor(scope.signal)!==actor)throw Error();if(!scope.signal.aborted)setData(p.data);
  })().catch(()=>{if(!scope.signal.aborted)setError(true);});
  const hide=()=>{if(document.visibilityState==='hidden'){scope.abort();setData(null);}else setAttempt(v=>v+1);};document.addEventListener('visibilitychange',hide);return()=>{scope.abort();document.removeEventListener('visibilitychange',hide);};
 },[attempt,language,conversationId]);
 useEffect(()=>{if(data){setStart(data.quietStart??'22:00');setEnd(data.quietEnd??'07:30');setInvalidTime(false);}},[data?.revision]);
 async function change(patch:Omit<InboxDeliveryPreferencesInput,'expectedRevision'>){const scope=controller.current;if(!data||lock.current||!scope||scope.signal.aborted)return;lock.current=true;setBusy(true);
  try{if(await readContactMessageActorForWrite(scope.signal)!==data.actorId)throw Error();const r=await fetch(endpoint,{method:'PUT',signal:scope.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...patch,expectedRevision:data.revision})});const body=await r.json(),p=inboxDeliveryPreferencesSchema.safeParse(body.data);if(!r.ok||!p.success||p.data.actorId!==data.actorId||await readContactMessageActor(scope.signal)!==data.actorId)throw Error();if(!scope.signal.aborted){setData(p.data);setError(false);}}
  catch{if(!scope.signal.aborted){setData(null);setError(true);setAttempt(v=>v+1);}}finally{if(!scope.signal.aborted){lock.current=false;setBusy(false);}}
 }
 const saveHours=()=>{const patch=quietHoursPatch(start,end);if(!patch){setInvalidTime(true);return;}setInvalidTime(false);void change(patch);};
 if(unavailable)return <p role="status" className={s.hint}>{copy('unavailable')}</p>;
 if(!data)return error?<div role="alert" className={s.error}>{copy('unavailable')} <Button label={copy('refresh')} onClick={()=>setAttempt(v=>v+1)}/></div>:<p className={s.hint}>{copy('refresh')}…</p>;
 const icons:Record<string,IconName>={message:'mail',reminder:'clock',suggestion:'sparkle',update:'refresh'};
 const row=(key:string,label:string,checked:boolean,patch:Omit<InboxDeliveryPreferencesInput,'expectedRevision'>,hint?:string)=><div key={key} className={s.row}>{icons[key]?<span className={s.rowIcon} aria-hidden="true"><Icon name={icons[key]} size={16}/></span>:null}<div className={s.rowText}><strong>{label}</strong>{hint?<span>{hint}</span>:null}</div><Toggle checked={checked} disabled={busy} label={label} onChange={()=>void change(patch)}/></div>;
 if(conversationId){const muted=data.mutedConversationIds.includes(conversationId);return <Card className={s.conversation}>{row('mute',copy('mute'),muted,{muteConversation:{conversationId,muted:!muted}})}</Card>;}
 return <div className={s.grid} data-notification-settings>
  <div className={s.main}><Card title={copy('channels')} className={s.channels}>
   {row('message',copy('message'),data.messageEnabled,{messageEnabled:!data.messageEnabled})}
   {row('reminder',copy('reminder'),data.reminderEnabled,{reminderEnabled:!data.reminderEnabled})}
   {row('suggestion',copy('suggestion'),data.suggestionEnabled,{suggestionEnabled:!data.suggestionEnabled})}
   {row('update',copy('update'),data.updateEnabled,{updateEnabled:!data.updateEnabled})}
   <div className={s.lockRow}><strong>{copy('lock')}</strong><Segmented segments={[{key:'private',label:copy('private')},{key:'full',label:copy('full')}]} value={data.lockScreenContent} onChange={value=>void change({lockScreenContent:value})} label={copy('lock')}/></div>
  </Card>
  </div>
  <div className={s.side}><Card title={copy('cap')}><Segmented segments={[1,2,3].map(value=>({key:String(value),label:copy('capItems').replace('{n}',String(value))}))} value={String(data.dailyCap??3)} onChange={value=>void change({dailyCap:Number(value) as 1|2|3})} label={copy('cap')}/><p className={s.hint}>{copy('capHint')}</p></Card>
   <Card title={copy('quiet')} trailing={<Toggle checked={data.quietHoursEnabled} disabled={busy} label={copy('quiet')} onChange={()=>void change({quietHoursEnabled:!data.quietHoursEnabled})}/>} className={s.quietCard}>
    <div className={s.time}><label>{copy('start')} <input type="time" value={start} onChange={event=>setStart(event.target.value)}/></label><label>{copy('end')} <input type="time" value={end} onChange={event=>setEnd(event.target.value)}/></label></div>
    {invalidTime?<p role="alert" className={s.error}>{copy('invalidTime')}</p>:null}
    <Button label={copy('save')} disabled={busy} onClick={saveHours}/>
    {row('meeting',copy('meeting'),data.meetingException!==false,{meetingException:data.meetingException===false})}
   </Card>
   <Card title={copy('secretary')}><p className={s.hint}>{copy('secretaryHint')}</p></Card>
   <p className={s.hint}>{copy('browser')}</p>
  </div>
  {error?<div role="alert" className={s.error}>{copy('unavailable')} <Button label={copy('refresh')} onClick={()=>setAttempt(v=>v+1)}/></div>:null}
 </div>;
}
