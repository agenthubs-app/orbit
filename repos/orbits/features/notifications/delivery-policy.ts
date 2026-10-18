import type {InboxDeliveryPreferencesDTO} from '../../shared/contract/notification-delivery-policy';
export function defaultDeliveryPreferences(actorId:string):InboxDeliveryPreferencesDTO {
 return {actorId,revision:0,messageEnabled:true,reminderEnabled:true,suggestionEnabled:true,updateEnabled:true,lockScreenContent:'private',quietHoursEnabled:true,quietStart:'22:00',quietEnd:'07:30',dailyCap:3,secretaryMail:false,secretaryDeadline:true,secretaryPick:true,meetingException:true,timeZone:'Asia/Tokyo',mutedConversationIds:[]};
}
export interface DeliveryPolicySubject {
 channel:'message'|'reminder'|'suggestion'|'update';
 origin:'user'|'automation'|'business';
 scheduledFor:string;
 expiresAt?:string;
 conversationId?:string;
 hasFactualWindow?:boolean;
 /** Set only after the current appointment aggregate is verified at dispatch. */
 meeting30m?:boolean;
 explicitNight:boolean;
 active:boolean;
 read:boolean;
}
export type DeliveryPolicyDecision={action:'send'}|{action:'defer';availableAt:string;reason:string}|{action:'suppress';reason:string};
function parts(instant:string,timeZone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));const get=(k:string)=>p.find(x=>x.type===k)!.value;return {day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour')),minute:Number(get('minute'))};}
export function deliveryLocalDay(instant:string,timeZone:string){return parts(instant,timeZone).day;}
function atLocalMinute(day:string,minute:number,timeZone:string):string {
 const wall=Date.parse(`${day}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:00Z`);let guess=wall;
 for(let i=0;i<5;i++){const observed=parts(new Date(guess).toISOString(),timeZone),value=Date.parse(`${observed.day}T${String(observed.hour).padStart(2,'0')}:${String(observed.minute).padStart(2,'0')}:00Z`);if(value===wall)return new Date(guess).toISOString();guess+=wall-value;}
 throw Error('Unresolvable local time');
}
const minutes=(value:string)=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute;};
const nextDay=(day:string)=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export function evaluateDeliveryPolicy(s:DeliveryPolicySubject,p:InboxDeliveryPreferencesDTO,now:string):DeliveryPolicyDecision {
 if(!s.active||s.read)return {action:'suppress',reason:'source_inactive_or_read'};
 if(s.expiresAt&&Date.parse(s.expiresAt)<=Date.parse(now))return {action:'suppress',reason:'expired'};
 if(!p[`${s.channel}Enabled`])return {action:'suppress',reason:'preference_disabled'};
 if(s.channel==='message'&&s.conversationId&&p.mutedConversationIds.includes(s.conversationId))return {action:'suppress',reason:'conversation_muted'};
 if(s.channel==='suggestion'&&!s.hasFactualWindow)return {action:'suppress',reason:'ordinary_suggestion_silent'};
 if(Date.parse(s.scheduledFor)>Date.parse(now))return {action:'defer',availableAt:s.scheduledFor,reason:'not_due'};
 if(p.quietHoursEnabled&&!(s.origin==='user'&&s.explicitNight)&&!(s.channel==='reminder'&&s.origin==='automation'&&s.meeting30m&&p.meetingException)){
  const local=parts(now,p.timeZone),wall=local.hour*60+local.minute,start=minutes(p.quietStart??'22:00'),end=minutes(p.quietEnd??'07:30'),digestEnd=Math.max(end,7*60+50);
  const overnight=start>end,inQuiet=overnight?(wall>=start||wall<end):(wall>=start&&wall<end);
  if(inQuiet||end<digestEnd&&wall>=end&&wall<digestEnd){
   const day=inQuiet&&overnight&&wall>=start?nextDay(local.day):local.day;
   const availableAt=atLocalMinute(day,digestEnd,p.timeZone);
   return s.expiresAt&&Date.parse(s.expiresAt)<=Date.parse(availableAt)?{action:'suppress',reason:'expires_during_quiet_hours'}:{action:'defer',availableAt,reason:inQuiet?'quiet_hours':'digest_window'};
  }
 }
 return {action:'send'};
}
/** The candidate's original due time determines its stable morning batch. */
export function deliveryDigestAt(s:DeliveryPolicySubject,p:InboxDeliveryPreferencesDTO):string|null {
 const decision=evaluateDeliveryPolicy(s,p,s.scheduledFor);
 return decision.action==='defer'&&['quiet_hours','digest_window'].includes(decision.reason)?decision.availableAt:null;
}
export interface DeliveryQuotaReservation {eventKey:string;at:string;timeZone:string;suggestion:boolean;}
export function deliveryQuotaUsage(rows:readonly DeliveryQuotaReservation[],now:string,timeZone:string) {
 const today=deliveryLocalDay(now,timeZone),unique=new Map<string,DeliveryQuotaReservation>();
 for(const row of rows)if(deliveryLocalDay(row.at,timeZone)===today||(row.timeZone!==timeZone&&Date.parse(now)-Date.parse(row.at)<86400000))unique.set(row.eventKey,row);
 return {total:unique.size};
}
