'use client';
/**
 * agent-design AG15 (approved visual draft 15-5, 15-6; D15-4, D15-6): the three kinds of inbox entry Orbit's own agent
 * writes — a scheduled task's result, a card waiting for a click, and a change another tool proposes (AG17 writes
 * those; here only its row). No new filter: cards still waiting form their own group on top of the list; results sit
 * with the other notifications, each with a small tag. Opening a result shows the picked records as AG19's record
 * cards and 「管理这条任务」; opening a card shows the same confirmation card as the conversation, confirmed right here.
 */
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';

import {agentActionPreviewSchema} from '../../../../shared/api-schema/agent-v1';
import type {AgentActionPreviewContract,AgentScheduledTaskHistoryContract} from '../../../../shared/contract/agent-v1';
import type {OrbitLanguage} from '../../../../shared/contract/language';
import {useOrbitLanguage} from '../orbit-language-context';
import {AnswerBlocks} from '../orbit-2026/iorbit/answer-blocks';
import {ConfirmationCard} from '../orbit-2026/iorbit/confirmation-card';
import {decideAgentCard,regenerateAgentCard} from '../orbit-2026/iorbit/action-preview-client';
import {readScheduledTask} from '../orbit-2026/account/scheduled-tasks-client';
import {taskHref} from '../orbit-2026/account/ScheduledTasks';
import {MacTile} from '../orbit-2026/ui';
import {useRouter} from 'next/navigation';
import type {NotificationRow} from './notification-inbox-view-model';
import ws from './inbox-workspace.module.css';

export type AgentEntryKind='result'|'card'|'proposal';
const WAITING=new Set(['awaiting_confirmation','deferred']);

export function agentEntryKind(n:Pick<NotificationRow,'sources'>):AgentEntryKind|null{
 const kind=n.sources[0]?.sourceKind;
 return kind==='automation_result'?'result':kind==='agent_card'?'card':kind==='external_proposal'?'proposal':null;
}

const words={
 task:{zh:'定时任务',en:'Scheduled task',ja:'定期タスク'},
 waiting:{zh:'等你确认',en:'Waiting for you',ja:'確認待ち'},
 group:{zh:'等你确认 · {n}',en:'Waiting for you · {n}',ja:'確認待ち · {n}'},
 taskName:{zh:'定时任务「{name}」',en:'Scheduled task "{name}"',ja:'定期タスク「{name}」'},
 period:{zh:'{when} 那一期',en:'the {when} run',ja:'{when} の回'},
 proposedBy:{zh:'{name} 提的修改',en:'Proposed by {name}',ja:'{name} からの変更案'},
 hoursLeft:{zh:'还有 {n} 小时有效',en:'{n} h left',ja:'あと{n}時間有効'},
 manage:{zh:'管理这条任务',en:'Manage this task',ja:'このタスクを管理'},
 hereNote:{zh:'在这里确认就行，不用回到对话。这张卡 7 天后失效；下一期出了新卡，这张也会失效。',en:'Confirm it here; no need to go back to a conversation. The card expires after 7 days, or when the next run makes a new one.',ja:'ここで確定できます。会話に戻る必要はありません。このカードは7日後、または次の回で新しいカードが出ると無効になります。'},
 loading:{zh:'正在读取…',en:'Loading…',ja:'読み込み中…'},
 gone:{zh:'这条任务已经不在了。',en:'This task is no longer here.',ja:'このタスクはもうありません。'},
 cardGone:{zh:'这张卡已经不在了。',en:'This card is no longer here.',ja:'このカードはもうありません。'},
};
type Words=typeof words;
const say=(language:OrbitLanguage,key:keyof Words,values:Record<string,string|number>={})=>words[key][language].replace(/\{(\w+)\}/gu,(match,name:string)=>name in values?String(values[name]):match);

/** The row's tile: from the words the server wrote in the title (events, people, a change to to-dos, another tool). */
export function agentEntryTile(n:NotificationRow):{emoji:string;tone:'pink'|'apricot'|'blue'|'lav'}{
 const kind=agentEntryKind(n);
 if(kind==='proposal')return {emoji:'🤖',tone:'lav'};
 if(kind==='card')return {emoji:'🗓️',tone:'blue'};
 if(/^(需要你处理|対応が必要です|Needs you)/u.test(n.title))return {emoji:'⚠️',tone:'apricot'};
 if(/联系|連絡|contact/iu.test(n.title))return {emoji:'🤝',tone:'apricot'};
 return {emoji:'🎟️',tone:'pink'};
}

/** The second line of an agent row (15-5): a small tag, then the task's name — or who proposed it and how long it waits. */
export function AgentEntryLine({n,now,waiting}:{n:NotificationRow;now:string;waiting:boolean}){
 const {language}=useOrbitLanguage();
 const kind=agentEntryKind(n);
 // 「等你确认」 only while the card waits; a card done, expired or replaced carries the task tag like a result.
 const tag=waiting?say(language,'waiting'):say(language,'task');
 const hours=n.expiresAt?Math.max(0,Math.round((Date.parse(n.expiresAt)-Date.parse(now))/3_600_000)):null;
 const rest=kind==='proposal'?[n.object?.name?say(language,'proposedBy',{name:n.object.name}):n.sources[0]?.excerpt,hours!==null?say(language,'hoursLeft',{n:hours}):null].filter(Boolean).join(' · '):n.object?.name??'';
 return <span className={`${ws.lbl} ${ws.rowSub}`}><span className={waiting?ws.agentTagWait:ws.agentTagTask}>{tag}</span>{rest}</span>;
}

async function readCard(actionId:string,signal?:AbortSignal):Promise<AgentActionPreviewContract|null>{
 const response=await fetch(`/api/agent/ledger/${encodeURIComponent(actionId)}`,{cache:'no-store',credentials:'same-origin',signal});
 if(response.status===404)return null;
 const body=(await response.json().catch(()=>null)) as {data?:{card?:unknown}}|null;
 const parsed=agentActionPreviewSchema.safeParse(body?.data?.card);
 if(!response.ok||!parsed.success)throw new Error('CARD_UNREADABLE');
 return parsed.data;
}

/**
 * The cards behind the open card entries, read once per list: which still wait (the top group, D15-4). Null until every
 * one has answered, so the group never fills in row by row; a card that cannot be read counts as waiting.
 */
export function useAgentCardStates(items:readonly NotificationRow[]|null|undefined):ReadonlyMap<string,AgentActionPreviewContract|null>|null{
 const ids=useMemo(()=>(items??[]).filter(n=>{const kind=agentEntryKind(n);return (kind==='card'||kind==='proposal')&&n.disposition==='open';}).map(n=>n.target.id).sort().join('\n'),[items]);
 const [states,setStates]=useState<{key:string;map:ReadonlyMap<string,AgentActionPreviewContract|null>}|null>(null);
 useEffect(()=>{
  if(!items)return;
  const list=ids?ids.split('\n'):[];
  if(!list.length){setStates({key:ids,map:new Map()});return;}
  const controller=new AbortController();
  void Promise.all(list.map(async id=>[id,await readCard(id,controller.signal).catch(()=>undefined)] as const)).then(found=>{
   if(controller.signal.aborted)return;
   const map=new Map<string,AgentActionPreviewContract|null>();
   for(const [id,card] of found)if(card!==undefined)map.set(id,card);
   setStates({key:ids,map});
  });
  return()=>controller.abort();
 },[ids,items]);
 if(!items)return null;
 return states?.key===ids?states.map:states?.map??null;
}

/** Whether an entry belongs to the 「等你确认」 group: an open card entry whose card still waits. */
export function waitsForClick(n:NotificationRow,cards:ReadonlyMap<string,AgentActionPreviewContract|null>):boolean{
 const kind=agentEntryKind(n);
 if((kind!=='card'&&kind!=='proposal')||n.disposition!=='open')return false;
 const card=cards.get(n.target.id);
 return card===undefined?true:card!==null&&WAITING.has(card.status);
}

function whenOf(at:string,now:string,timeZone:string,language:OrbitLanguage){
 const day=(value:string)=>new Intl.DateTimeFormat('en-CA',{day:'2-digit',month:'2-digit',timeZone,year:'numeric'}).format(new Date(value));
 const time=new Intl.DateTimeFormat(language,{hour:'numeric',minute:'2-digit',timeZone}).format(new Date(at));
 if(day(at)===day(now))return `${{zh:'今天',en:'today',ja:'今日'}[language]} ${time}`;
 return new Intl.DateTimeFormat(language,{day:'numeric',month:'numeric',timeZone}).format(new Date(at));
}

/** The detail pane of an agent entry (15-5 ④, 15-6). */
export function AgentEntryDetail({n,now,timeZone,onSelectCard,onChanged}:{n:NotificationRow;now:string;timeZone:string;onSelectCard(actionId:string):void;onChanged():void}){
 const {language}=useOrbitLanguage();
 const kind=agentEntryKind(n)!;
 const tile=agentEntryTile(n);
 const when=whenOf(n.occurredAt,now,timeZone,language);
 const taskName=n.object?.name;
 const subtitle=kind==='proposal'?[n.object?.name?say(language,'proposedBy',{name:n.object.name}):null,when].filter(Boolean).join(' · '):[taskName?say(language,'taskName',{name:taskName}):null,kind==='card'?say(language,'period',{when}):when].filter(Boolean).join(' · ');
 return <article className={ws.detail} aria-label={n.title} data-orbit-agent-entry={kind}>
  <div className={ws.agentHead}><MacTile emoji={tile.emoji} tone={tile.tone} size="sm"/><div><h2>{n.title}</h2><span className={ws.lbl}>{subtitle}</span></div></div>
  {kind==='result'?<AgentResult n={n}/>:<AgentCard n={n} language={language} onSelectCard={onSelectCard} onChanged={onChanged}/>}
 </article>;
}

function AgentResult({n}:{n:NotificationRow}){
 const {language}=useOrbitLanguage();
 const router=useRouter();
 const taskId=n.target.id;
 const runId=n.sources[0]?.sourceId;
 const [history,setHistory]=useState<AgentScheduledTaskHistoryContract|null|undefined>(undefined);
 useEffect(()=>{
  const controller=new AbortController();
  setHistory(undefined);
  readScheduledTask(taskId,language,controller.signal).then(next=>{if(!controller.signal.aborted)setHistory(next);}).catch(()=>{if(!controller.signal.aborted)setHistory(null);});
  return()=>controller.abort();
 },[taskId,language]);
 if(history===undefined)return <p role="status" className={ws.lbl}>{say(language,'loading')}</p>;
 const run=history?.runs.find(item=>item.runId===runId)??null;
 const cards=(run?.items??[]).flatMap(item=>item.card?[item.card]:[]);
 const navigate=(href:string)=>router.push(href);
 return <>
  {run?.detail?.basis&&cards.length?<span className={ws.agentBasis}>{run.detail.basis}</span>:null}
  {cards.length&&run?.detail?.source?<AnswerBlocks blocks={[{caption:run.detail.source.caption,items:[run.detail.source.card],shown:1,size:'mini',type:'records'}]} gone={new Set()} language={language} navigate={navigate}/>:null}
  {cards.length?<AnswerBlocks blocks={[{items:cards,shown:cards.length,size:'full',type:'records'}]} gone={new Set()} language={language} navigate={navigate}/>:<p className={ws.reason}>{run?.display?.text??n.reason}</p>}
  {run?.detail?.notes.length?<div className={ws.agentNotes}>{run.detail.notes.map(note=><p key={note}>{note}</p>)}</div>:null}
  {history?<div><Link prefetch className={`btn ${ws.btn}`} href={taskHref(taskId)} data-orbit-agent-manage>{say(language,'manage')}</Link></div>:<p className={ws.lbl}>{say(language,'gone')}</p>}
 </>;
}

function AgentCard({n,language,onSelectCard,onChanged}:{n:NotificationRow;language:OrbitLanguage;onSelectCard(actionId:string):void;onChanged():void}){
 const [card,setCard]=useState<AgentActionPreviewContract|null|undefined>(undefined);
 useEffect(()=>{
  const controller=new AbortController();
  setCard(undefined);
  readCard(n.target.id,controller.signal).then(next=>{if(!controller.signal.aborted)setCard(next);}).catch(()=>{if(!controller.signal.aborted)setCard(null);});
  return()=>controller.abort();
 },[n.target.id]);
 if(card===undefined)return <p role="status" className={ws.lbl}>{say(language,'loading')}</p>;
 if(card===null)return <p className={ws.reason}>{say(language,'cardGone')}</p>;
 const note=(next:AgentActionPreviewContract|null)=>{if(next){setCard(next);onChanged();}};
 return <>
  <ConfirmationCard card={card} language={language} online
   onDecide={async(decision,operationId)=>{const result=await decideAgentCard(card,decision,operationId);note(result.card);return result.ok;}}
   onRegenerate={async()=>{const result=await regenerateAgentCard(card);note(result.card);return result.ok;}}
   onOpenCard={onSelectCard}/>
  {WAITING.has(card.status)?<p className={ws.lbl}>{say(language,'hereNote')}</p>:null}
 </>;
}

export const agentGroupLabel=(language:OrbitLanguage,count:number)=>say(language,'group',{n:count});
