import {criteriaForNeed} from '../../contact-needs/scoring';
import type { DiscoveryCandidate, DiscoveryEvidence, DiscoveryQualification } from './contract';

const unsafe = /忽略.{0,8}(指令|规则)|系统提示|调用工具|ignore.{0,25}instructions|system prompt|以前の指示を無視/i;
const negative = /不需要|不要|无需|不再|取消|已完成|已经发送|已发送|不会|do not|don't|no longer|already sent|cancelled|必要.{0,2}ない|送信済|キャンセル/i;
const hearsay = /(?:说|表示|提到)[：:“"「]|said|says|と言|とのこと/i;
const unsupported = /未回复|没有回复|没回复|has not replied|haven't replied|no reply|返信がない|参加过|attended|参加済/i;
const selfCommitment = /我.{0,15}(答应|承诺|会|发送|提供|准备)|(?:I|we)\s+(?:will|promise|agreed|need)|私.{0,15}(送|約束|提出)|(?:送付|送信|提出)します/i;

export function localDiscoveryDay(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function localInstant(day: string, time: string, timeZone: string): string | null {
  const expected = `${day}T${time}:00`, wall = Date.parse(expected + 'Z');
  if (!Number.isFinite(wall)) return null;
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(new Date(guess));
    const get = (t:string) => p.find(x => x.type===t)!.value;
    const actual = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    if (actual === expected) return new Date(guess).toISOString();
    guess += wall - Date.parse(actual + 'Z');
  }
  return null; // A nonexistent DST wall time is not a trustworthy deadline.
}
function trustworthyTime(quote: string, occurredAt: string, timeZone: string): { dueAt: string; dateOnly: boolean; expiresAt: string } | null {
  const explicit = quote.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T、 ]*(\d{1,2})[:時:点](\d{2})分?)?$/);
  const relative = quote.match(/^(今天|明天|today|tomorrow|今日|明日)(?:[ 、]*(\d{1,2})[:時点](\d{2})分?)?$/i);
  let day: string, hour: string|undefined, minute: string|undefined;
  if (explicit) { day=`${explicit[1]}-${explicit[2].padStart(2,'0')}-${explicit[3].padStart(2,'0')}`; hour=explicit[4]; minute=explicit[5]; }
  else if (relative) {
    const localDay=localDiscoveryDay(occurredAt,timeZone);
    day=new Date(Date.parse(localDay+'T12:00:00Z')+(/明天|tomorrow|明日/i.test(relative[1])?86400000:0)).toISOString().slice(0,10);
    hour=relative[2]; minute=relative[3];
  } else return null;
  const dateOnly=hour===undefined;
  const dueAt=localInstant(day,dateOnly?'09:00':`${hour!.padStart(2,'0')}:${minute}`,timeZone);
  const nextDay=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const end=localInstant(nextDay,'00:00',timeZone);
  return dueAt&&end?{dueAt,dateOnly,expiresAt:dateOnly?new Date(Date.parse(end)-1).toISOString():dueAt}:null;
}
export function qualifyDiscoveryCandidate(input: { actorId:string; candidate:DiscoveryCandidate; evidence:DiscoveryEvidence[]; now:string; timeZone:string }): DiscoveryQualification {
  const c=input.candidate, reject=(reason:string):DiscoveryQualification=>({eligible:false,reason});
  const evidence=c.sourceKeys.map(key=>input.evidence.find(s=>s.key===key));
  if (!evidence.length||evidence.some(s=>!s||s.actorId!==input.actorId||s.status!=='active'))return reject('source_unavailable');
  const sources=evidence as DiscoveryEvidence[];
  const primary=sources.find(s=>s.text.includes(c.factQuote)&&s.text.includes(c.actionQuote));
  if(!primary||primary.key!==c.sourceKeys[0]||c.factQuote.trim().length<6||c.actionQuote.trim().length<2||(c.mode==='commitment'&&c.action.trim()!==c.actionQuote.trim()))return reject('ungrounded_action');
  if(unsafe.test(primary.text)||negative.test(c.factQuote)||hearsay.test(c.factQuote)||unsupported.test(c.inference+' '+c.factQuote))return reject('unsafe_or_unsupported_fact');
  const objects=sources.flatMap(s=>s.objects).filter(o=>o.id===c.objectId);
  if(!objects.length||new Set(objects.map(o=>o.name)).size!==1)return reject('ambiguous_object');
  if(c.action.length>160||c.inference.length>500)return reject('unbounded_copy');
  let dueAt:string|undefined, scheduledFor:string|undefined, promiseExpiry:string|undefined, windowExpiry:string|undefined;
  if(c.mode==='commitment') {
    const canonicalTask=primary.source.sourceKind==='task'&&!!(primary.explicitDueAt||primary.plannedDate);
    if(primary.authorId!==input.actorId||c.responsibleActorId!==input.actorId||(!canonicalTask&&!selfCommitment.test(c.factQuote)))return reject('responsibility_unproven');
    if(!canonicalTask&&(!c.timeQuote||!c.factQuote.includes(c.timeQuote)))return reject('time_unproven');
    const time=canonicalTask&&primary.explicitDueAt?{dueAt:primary.explicitDueAt,dateOnly:false,expiresAt:primary.explicitDueAt}:trustworthyTime(canonicalTask?primary.plannedDate!:c.timeQuote!,primary.source.occurredAt,input.timeZone);
    if(!time)return reject('time_unproven');
    promiseExpiry=time.expiresAt;
    if(Date.parse(promiseExpiry)<=Date.parse(input.now))return reject('expired');
    dueAt=time.dateOnly?undefined:time.dueAt;
    scheduledFor=new Date(Math.max(Date.parse(input.now),Date.parse(time.dueAt)-(time.dateOnly?0:7200000))).toISOString();
  } else {
    const goal=input.evidence.find(s=>s.key===c.goalKey&&s.source.sourceKind==='goal'&&s.actorId===input.actorId&&s.status==='active');
    if(!goal||!c.goalQuote||c.goalQuote.length<2||!goal.text.includes(c.goalQuote))return reject('relevance_unproven');
    // A literal shared subject is a conservative minimum in addition to the model's explanation.
    const subject:string[]=c.goalQuote.match(/[\p{L}\p{N}]{2,}/gu)??[];
    if(!subject.some(term=>primary.text.includes(term)||[...term].some((_,i)=>i+2<=term.length&&primary.text.includes(term.slice(i,i+2)))))return reject('relevance_unproven');
    if(!sources.some(s=>s.key===goal.key))sources.push(goal);
    if(c.timeQuote) {
      if(!primary.text.includes(c.timeQuote))return reject('time_unproven');
      const time=trustworthyTime(c.timeQuote,primary.source.occurredAt,input.timeZone);
      if(!time||Date.parse(time.expiresAt)<=Date.parse(input.now))return reject('expired_or_ambiguous_window');
      dueAt=time.dateOnly?undefined:time.dueAt;
      windowExpiry=time.expiresAt;
    }
  }
  return {eligible:true,kind:c.mode==='commitment'?'reminder':'suggestion',action:c.action,object:objects[0],facts:c.factQuote,inference:c.inference,evidence:sources,...(dueAt?{dueAt}:{}),...(scheduledFor?{scheduledFor}:{}),expiresAt:c.mode==='commitment'?promiseExpiry!:new Date(Math.min(Date.parse(input.now)+7*86400000,windowExpiry?Date.parse(windowExpiry):Infinity)).toISOString()};
}

/** Exclude ungrounded contact matching before sending any evidence to a model. */
export function discoveryPrefilter(primary:DiscoveryEvidence,context:DiscoveryEvidence[]):boolean {
  if(primary.status!=='active'||!primary.objects.length||unsafe.test(primary.text))return false;
  if(primary.source.sourceKind==='goal')return false;
  if(primary.source.sourceKind!=='contact')return true;
  const goal=context.find(s=>s.source.sourceKind==='goal'&&s.status==='active');
  if(!goal)return false;
  const terms=criteriaForNeed(goal.text);
  return terms.length>0&&terms.some(term=>term.aliases.some(alias=>primary.text.normalize('NFKC').toLowerCase().includes(alias.normalize('NFKC').toLowerCase())));
}
