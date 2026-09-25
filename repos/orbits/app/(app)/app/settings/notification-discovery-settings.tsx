'use client';
import {useEffect,useRef,useState} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {readContactMessageActor} from '../inbox/inbox-request';
import type {NotificationDiscoveryStatusDTO} from '../../../../shared/contract/notification-discovery';
import {notificationDiscoveryStatusSchema} from '../../../../shared/api-schema/notification-discovery';
const endpoint='/api/inbox/discovery/preferences';
export function NotificationDiscoverySettings(){
 const {t,language}=useOrbitLanguage(),[data,setData]=useState<NotificationDiscoveryStatusDTO|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const controller=useRef<AbortController|null>(null),lock=useRef(false);
 useEffect(()=>{const scope=new AbortController();controller.current=scope;setData(null);setError(false);setBusy(false);lock.current=false;const load=async()=>{const actor=await readContactMessageActor(scope.signal);if(!actor)throw Error();const r=await fetch(endpoint,{signal:scope.signal,cache:'no-store'});if(r.status===404)return;const body=await r.json(),parsed=notificationDiscoveryStatusSchema.safeParse(body.data);if(!r.ok||!parsed.success||parsed.data.preferences.actorId!==actor||await readContactMessageActor(scope.signal)!==actor)throw Error();if(!scope.signal.aborted)setData(parsed.data);};void load().catch(()=>{if(!scope.signal.aborted)setError(true);});const hide=()=>{if(document.visibilityState==='hidden'){scope.abort();setData(null);}else setAttempt(v=>v+1);};document.addEventListener('visibilitychange',hide);return()=>{scope.abort();document.removeEventListener('visibilitychange',hide);};},[attempt,language]);
 async function change(key:'enabled'|'messageAnalysisEnabled',value:boolean){const scope=controller.current;if(!data||lock.current||!scope||scope.signal.aborted)return;lock.current=true;setBusy(true);try{if(await readContactMessageActor(scope.signal)!==data.preferences.actorId)throw Error();const r=await fetch(endpoint,{method:'PUT',signal:scope.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({[key]:value,expectedRevision:data.preferences.revision,language,timeZone:data.preferences.timeZone})});const result=await r.json(),parsed=notificationDiscoveryStatusSchema.safeParse(result.data);if(!r.ok||!parsed.success||parsed.data.preferences.actorId!==data.preferences.actorId||await readContactMessageActor(scope.signal)!==data.preferences.actorId)throw Error();if(!scope.signal.aborted){setData(parsed.data);setError(false);}}catch{if(!scope.signal.aborted){setData(null);setError(true);}}finally{if(!scope.signal.aborted){lock.current=false;setBusy(false);}}}
 if(!data&&!error)return null;
 return <section style={{padding:'20px 0',borderBottom:'1px solid var(--border)'}}>
  <h3>{t({zh:'AI 自主发现',en:'AI discovery',ja:'AI による発見'})}</h3>
  <p>{t({zh:'从已保存的信息发现具体提醒和建议。接受建议后才会创建待办。',en:'Find reminders and suggestions in saved information. Tasks are created only when you accept.',ja:'保存された情報から通知や提案を見つけます。承認したときだけタスクを作成します。'})}</p>
  {data? <>{(['enabled','messageAnalysisEnabled'] as const).map(key=><label key={key} style={{display:'flex',alignItems:'center',gap:16,padding:'14px 0'}}><span style={{flex:1}}>{t(key==='enabled'?{zh:'自主发现',en:'Enable discovery',ja:'自動で発見する'}:{zh:'分析联系人消息',en:'Analyze contact messages',ja:'連絡先のメッセージを分析'})}</span><input type="checkbox" checked={data.preferences[key]} disabled={busy} onChange={e=>void change(key,e.target.checked)} style={{width:20,height:20,minHeight:20}}/></label>)}
   <p style={{color:'var(--text-3)'}}>{t({zh:'使用云端笔记、待办、日程、目标和联系人资料。邮件与外部日历尚不可用。',en:'Uses saved notes, tasks, schedules, goals and contacts. Email and external calendars are unavailable.',ja:'メモ、タスク、予定、目標、連絡先情報を使用します。メールと外部カレンダーは未対応です。'})}</p>
   {data.lastError||(data.preferences.enabled&&(!data.lastRoundAt||Date.now()-Date.parse(data.lastRoundAt)>180000))?<p role="status">{t({zh:'发现暂不可用，已有提醒和通信仍可使用。',en:'Discovery is unavailable. Existing reminders and messages still work.',ja:'発見機能を利用できません。既存の通知とメッセージは利用できます。'})}</p>:null}
   <p>{t({zh:'等待处理',en:'Pending',ja:'待機中'})} · {(data.counts.queued??0)+(data.counts.running??0)}　{t({zh:'处理失败',en:'Failed',ja:'失敗'})} · {data.counts.failed??0}</p>
  </>:null}
  {error?<p role="alert">{t({zh:'未能确认设置，请刷新后重试。',en:'Could not confirm this setting. Refresh and retry.',ja:'設定を確認できませんでした。更新して再試行してください。'})}</p>:null}
  <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>setAttempt(v=>v+1)}>{t({zh:'刷新发现状态',en:'Refresh discovery status',ja:'発見の状態を更新'})}</button>
 </section>;
}
