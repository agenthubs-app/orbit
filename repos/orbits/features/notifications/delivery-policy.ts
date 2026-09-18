import type {InboxDeliveryPreferencesDTO} from '../../shared/contract/notification-delivery-policy';
export function defaultDeliveryPreferences(actorId:string):InboxDeliveryPreferencesDTO {
 return {actorId,revision:0,messageEnabled:true,reminderEnabled:true,suggestionEnabled:true,updateEnabled:true,lockScreenContent:'private',quietHoursEnabled:true,timeZone:'Asia/Tokyo',mutedConversationIds:[]};
}
export interface DeliveryPolicySubject {
 channel:'message'|'reminder'|'suggestion'|'update';
 origin:'user'|'automation'|'business';
 scheduledFor:string;
 expiresAt?:string;
 conversationId?:string;
 hasFactualWindow?:boolean;
 explicitNight:boolean;
 active:boolean;
 read:boolean;
}
export type DeliveryPolicyDecision={action:'send'}|{action:'defer';availableAt:string;reason:string}|{action:'suppress';reason:string};
function parts(instant:string,timeZone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));const get=(k:string)=>p.find(x=>x.type===k)!.value;return {day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour')),minute:Number(get('minute'))};}
export function deliveryLocalDay(instant:string,timeZone:string){return parts(instant,timeZone).day;}
function atLocalHour(day:string,hour:number,timeZone:string):string {
 const wall=Date.parse(`${day}T${String(hour).padStart(2,'0')}:00:00Z`);let guess=wall;
 for(let i=0;i<5;i++){const observed=parts(new Date(guess).toISOString(),timeZone),value=Date.parse(`${observed.day}T${String(observed.hour).padStart(2,'0')}:${String(observed.minute).padStart(2,'0')}:00Z`);if(value===wall)return new Date(guess).toISOString();guess+=wall-value;}
 throw Error('Unresolvable local time');
}
export function evaluateDeliveryPolicy(s:DeliveryPolicySubject,p:InboxDeliveryPreferencesDTO,now:string):DeliveryPolicyDecision {
 if(!s.active||s.read)return {action:'suppress',reason:'source_inactive_or_read'};
 if(s.expiresAt&&Date.parse(s.expiresAt)<=Date.parse(now))return {action:'suppress',reason:'expired'};
 if(!p[`${s.channel}Enabled`])return {action:'suppress',reason:'preference_disabled'};
 if(s.channel==='message'&&s.conversationId&&p.mutedConversationIds.includes(s.conversationId))return {action:'suppress',reason:'conversation_muted'};
 if(s.channel==='suggestion'&&!s.hasFactualWindow)return {action:'suppress',reason:'ordinary_suggestion_silent'};
 if(Date.parse(s.scheduledFor)>Date.parse(now))return {action:'defer',availableAt:s.scheduledFor,reason:'not_due'};
 if(p.quietHoursEnabled&&!(s.origin==='user'&&s.explicitNight)){
  const local=parts(now,p.timeZone);
  if(local.hour>=22||local.hour<8){const day=local.hour>=22?new Date(Date.parse(local.day+'T12:00:00Z')+86400000).toISOString().slice(0,10):local.day;const availableAt=atLocalHour(day,8,p.timeZone);return s.expiresAt&&Date.parse(s.expiresAt)<=Date.parse(availableAt)?{action:'suppress',reason:'expires_during_quiet_hours'}:{action:'defer',availableAt,reason:'quiet_hours'};}
 }
 return {action:'send'};
}
export interface DeliveryQuotaReservation {eventKey:string;at:string;timeZone:string;suggestion:boolean;}
export function deliveryQuotaUsage(rows:readonly DeliveryQuotaReservation[],now:string,timeZone:string) {
 const today=deliveryLocalDay(now,timeZone),unique=new Map<string,DeliveryQuotaReservation>();
 for(const row of rows)if(deliveryLocalDay(row.at,timeZone)===today||(row.timeZone!==timeZone&&Date.parse(now)-Date.parse(row.at)<86400000))unique.set(row.eventKey,row);
 return {automatic:unique.size,suggestions:[...unique.values()].filter(r=>r.suggestion).length};
}
