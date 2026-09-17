import type { ReminderPlanDTO } from './reminder-plan-contract';
import type { AppointmentHistoryEntry } from '../appointments/contract';
import type { InboxNotificationUpsert } from './inbox-record-service';

export function reminderPlanNotification(plan:ReminderPlanDTO,now:string):InboxNotificationUpsert|null {
  if(plan.status==='cancelled'||plan.fireAt>now)return null;
  return {actorId:plan.ownerUserId,semanticKey:`reminder-plan:${plan.id}`,legacyId:plan.id,kind:'reminder',origin:'user',title:plan.title,reason:plan.body,scheduledFor:plan.fireAt,occurredAt:plan.fireAt,
    sources:[{sourceKind:'reminder_plan',sourceId:plan.id,sourceRevision:plan.updatedAt,occurredAt:plan.createdAt,readAt:now}],target:{kind:plan.targetType==='task'?'task':'schedule',id:plan.targetId,href:plan.deepLink.replace(/^\/app(?=\/)/,''),status:'available'},actions:['read','dismiss','handle','snooze']};
}
export function appointmentChangeNotification(input:{actorId:string;appointmentId:string;contactName:string;contactId:string;history:AppointmentHistoryEntry;time?:string;timeZone?:string}):InboxNotificationUpsert|null {
  const {history:h}=input;if(h.actorId===input.actorId)return null;
  const verbs:Partial<Record<AppointmentHistoryEntry['command'],readonly [string,string,string]>>={propose:['提出了约谈时间','proposed a meeting time','面談の日時を提案しました'],counter:['提议调整约谈时间','proposed a different meeting time','別の面談日時を提案しました'],accept:['确认了约谈时间','confirmed the meeting','面談日時を確定しました'],decline:['未接受这次约谈提议','declined the meeting proposal','面談の提案を辞退しました'],cancel:['取消了约谈','cancelled the meeting','面談をキャンセルしました']};
  const verb=verbs[h.command];if(!verb)return null;
  const time=(locale:string)=>input.time?new Intl.DateTimeFormat(locale,{timeZone:input.timeZone??'UTC',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(input.time)):null;
  const copy={zh:{title:`${input.contactName}${verb[0]}`,reason:input.time?`约谈时间：${time('zh')}`:'打开约谈查看对方的提议。'},en:{title:`${input.contactName} ${verb[1]}`,reason:input.time?`Meeting time: ${time('en')}`:'Open the meeting to review the proposal.'},ja:{title:`${input.contactName}さんが${verb[2]}`,reason:input.time?`面談日時：${time('ja')}`:'面談を開いて提案を確認してください。'}};
  return {actorId:input.actorId,semanticKey:`appointment:${input.appointmentId}:${h.version}`,kind:'update',origin:'business',...copy.zh,copy,object:{id:input.contactId,name:input.contactName},occurredAt:h.at,sources:[{sourceKind:'appointment',sourceId:input.appointmentId,sourceRevision:`event:${h.version}`,occurredAt:h.at,readAt:h.at,authorId:h.actorId}],target:{kind:'appointment',id:input.appointmentId,href:`/contacts/${encodeURIComponent(input.contactId)}?appointmentId=${encodeURIComponent(input.appointmentId)}`,status:'available'},actions:['read','dismiss','handle']};
}
export function batchResultNotification(input:{actorId:string;batchId:string;revision:string;occurredAt:string;count:number;status:string;pipeline:'v1'|'v2'}):InboxNotificationUpsert|null {
  if(!['ready_for_review','completed'].includes(input.status))return null;
  const ready=input.status==='ready_for_review';
  const copy={zh:{title:ready?'名片处理完成，请复核':'名片导入已完成',reason:ready?`这批 ${input.count} 张名片已处理，请确认识别结果。`:`这批 ${input.count} 张名片已完成处理。`},en:{title:ready?'Cards are ready for review':'Card import completed',reason:ready?`Review the results for ${input.count} cards in this batch.`:`Processing completed for ${input.count} cards.`},ja:{title:ready?'名刺の処理結果を確認してください':'名刺の取り込みが完了しました',reason:ready?`${input.count} 枚の名刺の読み取り結果を確認してください。`:`${input.count} 枚の名刺の処理が完了しました。`}};
  return {actorId:input.actorId,semanticKey:`batch:${input.pipeline}:${input.batchId}`,kind:'update',origin:'business',...copy.zh,copy,occurredAt:input.occurredAt,sources:[{sourceKind:'batch',sourceId:input.batchId,sourceRevision:input.revision,objectId:input.pipeline,occurredAt:input.occurredAt,readAt:input.occurredAt}],target:{kind:'batch',id:input.batchId,href:`/contacts/new/${input.pipeline==='v2'?'batch2':'batch'}/${encodeURIComponent(input.batchId)}`,status:'available'},actions:['read','dismiss','handle']};
}
