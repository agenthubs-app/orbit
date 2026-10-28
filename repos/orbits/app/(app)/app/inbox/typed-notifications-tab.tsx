'use client';
import {notificationWebSourceHref} from './notification-source-view-model';
import { scanSecretaryNotificationPage, secretaryKind } from '../../../../shared/compute/secretary-source';
import {notificationDisplayZone,notificationLocalDay} from '../../../../shared/compute/inbox-notification-day';
import {inboxDeliveryPreferencesSchema} from '../../../../shared/api-schema/notification-delivery-policy';
import type {InboxDeliveryPreferencesDTO} from '../../../../shared/contract/notification-delivery-policy';
import { CategoryTabs, Icon, MacTile, type IconName } from '../orbit-2026/ui';
import { ShellPage } from '../orbit-2026/shell/slots';
import { ScopedPageSkeleton } from '../orbit-2026/shell/RouteSkeleton';
import { lastAnswer, rememberAnswer } from '../orbit-last-answer';
import ws from './inbox-workspace.module.css';
import {inboxListTime} from './inbox-list-time';
import {useEffect,useMemo,useRef,useState,type ComponentProps} from 'react';
import {useOrbitLanguage} from '../orbit-language-context';
import {communicationRequest,invalidateInboxActorConfirmation,readContactMessageActor,readContactMessageActorForWrite} from './inbox-request';
import {notificationInboxView,notificationDetailView,type NotificationRow,type NotificationCategory,type NotificationList} from './notification-inbox-view-model';
import {NotificationStatusRail,type WeekCounts} from './notification-status-rail';

const categories={all:{zh:'全部',en:'All',ja:'すべて'},secretary:{zh:'秘书',en:'Secretary',ja:'秘書'},reminder:{zh:'提醒',en:'Reminders',ja:'リマインダー'},suggestion:{zh:'建议',en:'Suggestions',ja:'提案'},update:{zh:'动态',en:'Updates',ja:'更新'},history:{zh:'历史记录',en:'History',ja:'履歴'}};
// b5 #6 row actions: 既読 / タスクに追加 / 1時間後.
const actions={read:{zh:'已读',en:'Read',ja:'既読'},dismiss:{zh:'不需要',en:'Not needed',ja:'不要'},handle:{zh:'已处理',en:'Mark handled',ja:'対応済みにする'},accept:{zh:'加入待办',en:'Add task',ja:'タスクに追加'},snooze:{zh:'1小时后',en:'In 1 hour',ja:'1時間後'}};
const days={today:{zh:'今天',en:'Today',ja:'今日'},yesterday:{zh:'昨天',en:'Yesterday',ja:'昨日'},week:{zh:'本周',en:'This week',ja:'今週'},earlier:{zh:'更早',en:'Earlier',ja:'それ以前'}};
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
const kindLabel=(n:NotificationRow)=>secretaryKind(n)?categories.secretary:n.disposition!=='open'?categories.history:categories[n.kind];
function notificationTime(at:string,now:string,zone:string,language:string){
 const sameDay=notificationLocalDay(at,zone)===notificationLocalDay(now,zone);
 return new Intl.DateTimeFormat(language,{timeZone:zone,...(sameDay?{hour:'numeric',minute:'2-digit'}:{month:'numeric',day:'numeric'})}).format(new Date(at));
}
/** b5 D05 list row: tile, two lines (title, reason · source · due), time and the unread dot. Actions live in the detail pane. */
export function NotificationRecordCard({notification:n,onSelect,selected=false,timeZone,now}:{notification:NotificationRow;onSelect:()=>void;selected?:boolean;timeZone?:string;now:string}) {
 const {t,language}=useOrbitLanguage();
 const zone=notificationDisplayZone(timeZone),tile=notificationTile(n);
 const unread=!n.readAt&&n.disposition==='open';
 const subtitle=[n.reason,n.sources[0]?.excerpt,n.dueAt?`${t({zh:'截止时间',en:'Due',ja:'期限'})} · ${new Intl.DateTimeFormat(language,{timeZone:zone,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(n.dueAt))}`:null].filter(Boolean).join(' · ');
 return <button type="button" aria-pressed={selected} className={`${ws.row}${unread?' '+ws.unread:''}${selected?' '+ws.sel:''}`} onClick={onSelect}>
  <MacTile emoji={tile.emoji} tone={tile.tone} size="sm"/>
  <span style={{minWidth:0}}><span className={ws.rowTitle}>{n.title}</span>{subtitle?<span className={`${ws.lbl} ${ws.rowSub}`}>{subtitle}</span>:null}</span>
  <span className={ws.rowEnd}><span className={ws.lbl}>{inboxListTime(n.occurredAt,now,zone,language,t(days.yesterday))}</span>{unread?<i className={ws.dot} aria-label={t({zh:'未读',en:'Unread',ja:'未読'})}/>:null}</span>
 </button>;
}
const sourceLabels:Record<string,{zh:string;en:string;ja:string}>={
 reminder_plan:{zh:'提醒设置',en:'Reminder',ja:'リマインダー'},task:{zh:'待办',en:'Task',ja:'タスク'},schedule:{zh:'日程',en:'Schedule',ja:'予定'},appointment:{zh:'会面',en:'Meeting',ja:'面談'},
 batch:{zh:'名片导入',en:'Card import',ja:'名刺の取り込み'},connection:{zh:'联系',en:'Connection',ja:'つながり'},note:{zh:'笔记',en:'Note',ja:'メモ'},message:{zh:'消息',en:'Message',ja:'メッセージ'},
 contact:{zh:'联系人',en:'Contact',ja:'連絡先'},goal:{zh:'目标',en:'Goal',ja:'目標'},read_cost_alert:{zh:'用量',en:'Usage',ja:'利用量'},event_contact_request:{zh:'活动联系请求',en:'Event contact request',ja:'イベントの連絡先リクエスト'},
 event_deadline:{zh:'报名截止',en:'Registration deadline',ja:'申込の期限'},event_prep:{zh:'活动准备',en:'Event prep',ja:'イベントの準備'},event_pick:{zh:'推荐活动',en:'Event pick',ja:'おすすめイベント'},mail_summary:{zh:'邮件',en:'Mail',ja:'メール'},event_host_notice:{zh:'主办方通知',en:'Host notice',ja:'主催者からのお知らせ'},
};
const sourceIcons:Record<string,IconName>={schedule:'calendar',appointment:'calendar',event_deadline:'ticket',event_prep:'ticket',event_pick:'ticket',event_host_notice:'ticket',event_contact_request:'users',task:'task',contact:'user',connection:'users',note:'note',message:'mail',mail_summary:'mail',goal:'target',batch:'layers',reminder_plan:'clock'};
const targetLabels:Record<string,{zh:string;en:string;ja:string}>={
 task:{zh:'打开待办',en:'Open task',ja:'タスクを開く'},schedule:{zh:'打开日程',en:'Open schedule',ja:'予定を開く'},appointment:{zh:'打开会面准备',en:'Open meeting prep',ja:'面談の準備を開く'},event:{zh:'打开活动',en:'Open event',ja:'イベントを開く'},
 conversation:{zh:'打开消息',en:'Open messages',ja:'メッセージを開く'},batch:{zh:'打开导入结果',en:'Open import',ja:'取り込みを開く'},source:{zh:'打开原始信息',en:'Open source',ja:'元の情報を開く'},
};
/** b5 D05 detail pane: what it is, why it came, where it came from, and its actions. */
function NotificationDetail({notification:n,now,timeZone,disabled,onAction}:{notification:NotificationRow;now:string;timeZone:string;disabled:boolean;onAction:(action:'accept'|'snooze'|'dismiss'|'handle')=>void}) {
 const {t,language}=useOrbitLanguage();
 const tile=notificationTile(n),href=notificationWebSourceHref(n);
 const dt=(at:string)=>new Intl.DateTimeFormat(language,{timeZone,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(at));
 const sameDay=notificationLocalDay(n.occurredAt,timeZone)===notificationLocalDay(now,timeZone);
 const when=sameDay?`${t(days.today)} ${notificationTime(n.occurredAt,now,timeZone,language)}`:dt(n.occurredAt);
 const open=n.disposition==='open',can=(action:'accept'|'snooze'|'dismiss'|'handle')=>open&&n.actions.includes(action);
 const act=(action:'accept'|'snooze'|'dismiss'|'handle',label:string,icon?:IconName,primary=false)=><button type="button" className={`btn ${ws.btn}${primary?' '+ws.primary:''}`} disabled={disabled} aria-label={`${label} ${n.title}`} onClick={()=>onAction(action)}>{icon?<Icon name={icon} size={16}/>:null}{label}</button>;
 return <article className={ws.detail} aria-label={n.title}>
  <div className={ws.detailTop}><MacTile emoji={tile.emoji} tone={tile.tone} size="sm"/><span className={ws.chip}>{t(kindLabel(n))}</span><span className={ws.lbl}>{when}</span></div>
  <h2>{n.title}</h2>
  {n.reason?<p className={ws.reason}>{n.reason}</p>:null}
  {n.dueAt?<div className={ws.due}><Icon name="clock" size={16}/>{t({zh:'截止',en:'Due',ja:'期限'})} · {dt(n.dueAt)}</div>:null}
  {n.sources.length?<div className={ws.sources}><div className={ws.sourcesHead}>{t({zh:'这条通知的来源',en:'Where this came from',ja:'この通知のもと'})}</div>
   {n.sources.map((source,index)=><div key={`${source.sourceKind}:${source.sourceId}`} className={ws.source}><Icon name={sourceIcons[source.sourceKind]??'bell'} size={16}/>
    <div><b>{t(sourceLabels[source.sourceKind]??{zh:'来源',en:'Source',ja:'もと'})}{index===0&&n.object?.name?` · ${n.object.name}`:''}</b><span className={ws.lbl}>{source.excerpt||dt(source.occurredAt)}</span></div></div>)}
  </div>:null}
  {open?<div className={ws.acts}>
   {href?<a className={`btn ${ws.btn} ${ws.primary}`} href={href}>{t(targetLabels[n.target.kind]??targetLabels.source!)}<Icon name="right" size={16}/></a>:null}
   {can('accept')?act('accept',t(actions.accept),'plus',!href):null}
   {can('accept')&&can('dismiss')?act('dismiss',t(actions.dismiss)):null}
   {can('snooze')?act('snooze',t(actions.snooze),'clock'):null}
   <span className={ws.spacer}/>
   {can('handle')?act('handle',t(actions.handle),'check'):null}
  </div>:null}
 </article>;
}
const WEEK_PAGES=4;
type RailAnswer={preferences:InboxDeliveryPreferencesDTO|null;usage:{used:number;cap:number}|null;week:WeekCounts|null;timeZone:string};
export function TypedNotificationsTab({actorId,onIdentityChanged}:{actorId:string;onIdentityChanged:()=>void}) {
 const {t,language}=useOrbitLanguage();
 // Back on the tab, the last list, chip counts and rail show at once while they are read again (orbit-last-answer);
 // the first time, the list card and the rail wait as skeletons and appear complete, not filled in piece by piece.
 const [remembered]=useState(()=>lastAnswer<RailAnswer>('inbox:rail:'+actorId));
 const [filter,setFilter]=useState<keyof typeof categories>('all'),[data,setData]=useState<NotificationList|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[timeZone,setTimeZone]=useState(remembered?.timeZone??'Asia/Tokyo');
 const [selected,setSelected]=useState<string|null>(null),[counts,setCounts]=useState<Partial<Record<keyof typeof categories,number>>|null>(()=>lastAnswer('inbox:chips:'+actorId)??null);
 const [preferences,setPreferences]=useState<InboxDeliveryPreferencesDTO|null>(remembered?.preferences??null),[usage,setUsage]=useState<{used:number;cap:number}|null>(remembered?.usage??null),[week,setWeek]=useState<WeekCounts|null>(remembered?.week??null),[statsVersion,setStatsVersion]=useState(0),[quietBusy,setQuietBusy]=useState(false);
 const [railReady,setRailReady]=useState(Boolean(remembered));
 // The list's day groups depend on the account's time zone: they wait for the preferences read (or its memory).
 const [zoneKnown,setZoneKnown]=useState(Boolean(remembered));
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('filter')==='secretary')setFilter('secretary');},[]);
 function selectFilter(next:keyof typeof categories){setFilter(next);const url=new URL(window.location.href);url.searchParams.set('filter',next);window.history.replaceState(window.history.state,'',url);}
 const scope=useRef<AbortController|null>(null),pending=useRef<{id:string;request:{action:keyof typeof actions;expectedRevision:number;idempotencyKey:string;scheduledFor?:string}}|null>(null),lock=useRef(false),query=`language=${language}${filter==='history'?'&history=true':filter==='all'||filter==='secretary'?'':'&kind='+filter}`;
 const changed=useRef(onIdentityChanged);changed.current=onIdentityChanged;
 const listKey='inbox:notifications:'+actorId+':'+query;
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
  const controller=new AbortController();scope.current=controller;setData(lastAnswer<NotificationList>(listKey)??null);let loading=false;
  async function refresh(){if(loading||document.visibilityState==='hidden')return;loading=true;try{
    const load=async(cursor?:string)=>notificationInboxView(await request('/api/inbox/notifications?'+query+(cursor?'&cursor='+encodeURIComponent(cursor):''),{},controller),actorId);
    const next=filter==='secretary'?await scanSecretaryNotificationPage(load):await load();
    if(!controller.signal.aborted){setData({...next,items:[...next.items]});setError('');rememberAnswer(listKey,next);}
  }catch{if(!controller.signal.aborted){invalidateInboxActorConfirmation();setData(null);setError(t({zh:'通知读取失败，请重试。',en:'Could not load notifications. Retry.',ja:'通知を読み込めません。再試行してください。'}));}}finally{loading=false;}}
  void refresh();const timer=setInterval(()=>void refresh(),15000);document.addEventListener('visibilitychange',refresh);return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actorId,query,filter,attempt]);
 // Chip counts come from a complete 'all' list only; a partial page would undercount, so then there are none.
 useEffect(()=>{
  if(filter!=='all'||!data)return;
  if(data.nextCursor){setCounts(null);return;}
  const open=data.items.filter(n=>n.disposition==='open');
  const next={all:data.items.length,secretary:data.items.filter(n=>secretaryKind(n)).length,reminder:open.filter(n=>n.kind==='reminder').length,suggestion:open.filter(n=>n.kind==='suggestion').length,update:open.filter(n=>n.kind==='update').length};
  setCounts(next);rememberAnswer('inbox:chips:'+actorId,next);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[filter,data]);
 // The rail (b5 #6 通知の状態): preferences, today's push quota and this week's breakdown. Each part is
 // optional — a missing source hides its card instead of showing an invented number.
 useEffect(()=>{
  const controller=new AbortController();
  const preferencesRead=request('/api/inbox/delivery/preferences',{},controller,true).then(raw=>{
    const parsed=inboxDeliveryPreferencesSchema.safeParse(raw);
    if(!controller.signal.aborted&&parsed.success&&parsed.data.actorId===actorId){setTimeZone(notificationDisplayZone(parsed.data.timeZone));setPreferences(parsed.data);}
  }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setZoneKnown(true);});
  const usageRead=request('/api/inbox/delivery/usage',{},controller,true).then(raw=>{
    const value=raw as {actorId?:unknown;used?:unknown;cap?:unknown};
    if(!controller.signal.aborted&&value?.actorId===actorId&&Number.isSafeInteger(value.used)&&Number.isSafeInteger(value.cap)&&(value.cap as number)>0)setUsage({used:value.used as number,cap:value.cap as number});
  }).catch(()=>{});
  const weekRead=(async()=>{
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
  // The rail shows once all three have answered (or failed), so its cards do not arrive one by one.
  void Promise.all([preferencesRead,usageRead,weekRead]).then(()=>{if(!controller.signal.aborted)setRailReady(true);});
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
 // b5 D05: choosing a row shows its detail and marks it read through the same action barrier.
 function select(record:NotificationRow){
  setSelected(record.id);
  if(!record.readAt&&record.disposition==='open'&&record.actions.includes('read'))void actFor(record,'read');
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
 const weekShown=week&&Object.values(week).some(value=>value>0)?week:null;
 // The chips' counts in the same render as the list they are counted from (the effect above only keeps them for the other filters).
 const chipCounts=useMemo(()=>filter!=='all'||!data?counts:data.nextCursor?null:(()=>{const open=data.items.filter(n=>n.disposition==='open');return {all:data.items.length,secretary:data.items.filter(n=>secretaryKind(n)).length,reminder:open.filter(n=>n.kind==='reminder').length,suggestion:open.filter(n=>n.kind==='suggestion').length,update:open.filter(n=>n.kind==='update').length};})(),[filter,data,counts]);
 useEffect(()=>{if(railReady)rememberAnswer<RailAnswer>('inbox:rail:'+actorId,{preferences,usage,week,timeZone});},[railReady,actorId,preferences,usage,week,timeZone]);
 // Until then no rail of its own: the shell keeps the page's rail skeleton in place (shellFrameFor).
 const rail=useMemo(()=>railReady?<NotificationStatusRail language={language} usage={usage} preferences={preferences} week={weekShown} quietBusy={quietBusy} onQuietChange={next=>void setQuiet(next)}/>:undefined,
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [railReady,language,usage,preferences,weekShown,quietBusy]);
 const now=data?.asOf??new Date().toISOString();
 const chosen=data?.items.find(n=>n.id===selected)??null;
 const unread=data?.unreadCount??0;
 const todayCount=data?.items.filter(n=>notificationDayGroup(n.occurredAt,now,timeZone)==='today').length??0;
 let previousGroup='';
 const kinds=[['⏰','apricot',{zh:'提醒',en:'Reminders',ja:'リマインダー'},{zh:'会面前 30 分钟 · 报名截止',en:'30 minutes before a meeting · registration deadlines',ja:'面談の30分前 · 申込の締切'}],
  ['✨','lav',{zh:'建议',en:'Suggestions',ja:'提案'},{zh:'iOrbit 找到的下一步，确认后才加入待办',en:'Next steps iOrbit found — tasks only when you approve',ja:'iOrbit が見つけた次の一手。承認したときだけタスクに'}],
  ['🔄','blue',{zh:'动态',en:'Updates',ja:'更新'},{zh:'名片导入完成 · 参加者名单公开',en:'Card imports done · attendee lists published',ja:'名刺の取り込み完了 · 参加者リストの公開'}]] as const;
 return <div>
  <ShellPage rightRail={rail}/>
  {error?<div role="alert" className={ws.alert}>{error} <button className="btn btn-ghost" type="button" onClick={()=>{pending.current=null;setAttempt(n=>n+1);}}>{t({zh:'刷新',en:'Refresh',ja:'更新'})}</button>{pending.current?<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void retryPending()}>{t({zh:'重试操作',en:'Retry action',ja:'操作を再試行'})}</button>:null}</div>:null}
  {(!data||!zoneKnown)&&!error?<ScopedPageSkeleton kind="inboxCard" label={t({zh:'正在读取通知…',en:'Loading notifications…',ja:'通知を読み込み中…'})}/>:
  <section className={`${ws.card}${chosen?' '+ws.open:''}`} aria-label={t({zh:'通知列表',en:'Notifications',ja:'通知一覧'})}>
   <div className={ws.list}>
    <div className={ws.tool}>
     <CategoryTabs label={t({zh:'通知类别',en:'Notification categories',ja:'通知の分類'})} value={filter} onChange={key=>{setSelected(null);selectFilter(key as keyof typeof categories);}} options={(Object.keys(categories) as (keyof typeof categories)[]).map(k=>({key:k,label:t(categories[k]),count:chipCounts?.[k]||undefined}))} />
     <div className={ws.toolBar}>
      <span className={ws.lbl}>{unread?t({zh:'未读 {n} 条',en:'{n} unread',ja:'未読 {n}件'}).replace('{n}',String(unread)):t({zh:'没有未读',en:'Nothing unread',ja:'未読はありません'})}</span>
      {data?.items.some(n=>!n.readAt&&n.actions.includes('read'))?<button type="button" className={`btn ${ws.btn} ${ws.sm}`} disabled={busy} onClick={()=>void markRead()}><Icon name="check" size={16}/>{t({zh:'全部已读',en:'Mark all read',ja:'すべて既読'})}</button>:null}
      <a className={ws.iconBtn} href="/app/settings/notifications" aria-label={t({zh:'通知设置',en:'Notification settings',ja:'通知の設定'})}><Icon name="settings" size={16}/></a>
     </div>
    </div>
    {!data?<p role="status" className={ws.listNote}>{error?'':t({zh:'正在读取通知…',en:'Loading notifications…',ja:'通知を読み込み中…'})}</p>
     :data.items.length?<div className={ws.rows}>
      {data.items.map(n=>{
       const group=notificationDayGroup(n.occurredAt,now,timeZone),heading=group!==previousGroup;previousGroup=group;
       return [heading?<div key={'g:'+group} className={ws.day}>{t(days[group])}</div>:null,
        <NotificationRecordCard key={n.id} notification={n} timeZone={timeZone} now={now} selected={n.id===selected} onSelect={()=>select(n)}/>];
      })}
      {data.nextCursor?<button type="button" className={`btn ${ws.btn} ${ws.sm} ${ws.more}`} disabled={busy} onClick={()=>void more()}>{t({zh:'加载更多',en:'Load more',ja:'さらに読み込む'})}</button>:null}
     </div>:<p className={ws.listNote}>{t({zh:'暂无通知',en:'No notifications',ja:'通知はありません'})}</p>}
   </div>
   <div className={ws.pane}>
    {chosen?<>
     <button type="button" className={`btn ${ws.btn} ${ws.sm} ${ws.back}`} style={{margin:'12px 16px 0',alignSelf:'flex-start'}} onClick={()=>setSelected(null)}><Icon name="left" size={16}/>{t({zh:'返回通知',en:'Back to notifications',ja:'通知に戻る'})}</button>
     <NotificationDetail notification={chosen} now={now} timeZone={timeZone} disabled={busy} onAction={action=>void actFor(chosen,action)}/>
    </>:data&&!data.items.length&&filter==='all'?<div className={ws.empty}>
     <span className={ws.emptyTile} style={{background:'var(--mac-lav)'}} aria-hidden>🔔</span>
     <h3>{t({zh:'还没有通知',en:'No notifications yet',ja:'通知はまだありません'})}</h3>
     <p>{t({zh:'只有错过会有影响的事才会出现在这里。',en:'Only things you should not miss arrive here.',ja:'見逃すと困ることだけ、ここに届きます。'})}</p>
     <div className={ws.kinds}>{kinds.map(([emoji,tone,title,line])=><div key={emoji} className={ws.kind}><MacTile emoji={emoji} tone={tone} size="sm"/><div><b>{t(title)}</b><span className={ws.lbl}>{t(line)}</span></div></div>)}</div>
     <a className={`btn ${ws.btn}`} href="/app/settings/notifications"><Icon name="settings" size={16}/>{t({zh:'通知设置',en:'Notification settings',ja:'通知の設定'})}</a>
    </div>:data?<div className={ws.hint}><span className={ws.hintIcon}><Icon name="bell" size={21}/></span><b>{t({zh:'选择一条通知，详情会显示在这里',en:'Choose a notification to see it here',ja:'通知を選ぶと、ここに詳細が出ます'})}</b>
     <span>{[todayCount?t({zh:'今天 {n} 条',en:'{n} today',ja:'今日 {n}件'}).replace('{n}',String(todayCount)):null,unread?t({zh:'未读 {n} 条',en:'{n} unread',ja:'未読 {n}件'}).replace('{n}',String(unread)):null].filter(Boolean).join(' · ')}</span></div>:null}
   </div>
  </section>}
 </div>;
}
export type {NotificationCategory};
