import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyLegacyTarget, projectLegacyNotification, resolveLegacyReminderTarget} from '../../features/notifications/legacy-source-projection';
import {createMemoryLiveRecordStore, type LiveRecord} from '../../shared/storage/live-record-store';
import {createStorageReminderScheduleNotificationProvider} from '../../features/notifications/storage/reminder-notification-live-record-provider';
import {createLiveReminderScheduleNotificationService} from '../../features/notifications/live-service';
import {createNotificationsGetHandler} from '../../app/api/notifications/handler';
import type {ReminderPlanService} from '../../features/notifications/reminder-plan-service';
import type {ReminderPlanDTO} from '../../features/notifications/reminder-plan-contract';

const at='2026-09-16T10:00:00.000Z', actor='actor:test', workspace='workspace:test';
function taskRecord():LiveRecord<Record<string,unknown>> {
  return {workspaceId:workspace,collectionName:'tasks',recordId:'task:one',userId:actor,lifecycleState:'active',sourceType:'manual',sourceId:'task:one',sourceLabel:'test',evidenceIds:[],createdAt:at,updatedAt:at,payload:{version:1,activities:[],task:{id:'task:one',accountId:actor,ownerUserId:actor,title:'Current task',status:'open',category:'personal',priority:'normal',source:'manual',createdAt:at,updatedAt:at}}};
}
const notification={id:'notice:one',channel:'in_app' as const,title:'SECRET OLD TITLE',body:'SECRET OLD BODY',status:'pending' as const,source:{type:'manual' as const,id:'old',label:'SECRET OLD SOURCE'},evidenceIds:['old'] as [string],createdAt:at,actionHref:'/app/tasks/wrong'};

test('only an exact canonical active owned task proves navigation',()=>{
 const record=taskRecord();
 const target=verifyLegacyTarget({actorId:actor,workspaceId:workspace,kind:'task',id:record.recordId,record});
 assert.equal(target?.href,'/tasks/task%3Aone');
 assert.equal(target?.title,'Current task');
 for(const bad of [null,{...record,userId:'other'},{...record,lifecycleState:'deleted' as const},{...record,lifecycleState:'archived' as const},{...record,workspaceId:'other'},...['id','ownerUserId','accountId','status'].map(key=>({...record,payload:{...record.payload,task:{...(record.payload.task as object),[key]:'wrong'}}})),{...record,payload:{id:'task:one',title:'flat lacks formal owner'}}]) assert.equal(verifyLegacyTarget({actorId:actor,workspaceId:workspace,kind:'task',id:record.recordId,record:bad}),null);
});
test('missing source is visibly safe and an old href is never proof',()=>{
 const absent=projectLegacyNotification(notification,null);
 assert.equal(absent.actionHref,'');assert.equal(absent.title,'来源已不可用');assert.equal(absent.body,'');assert.deepEqual(absent.evidenceIds,[]);
 assert.equal(JSON.stringify(absent).includes('SECRET OLD'),false);
 const target=verifyLegacyTarget({actorId:actor,workspaceId:workspace,kind:'task',id:'task:one',record:taskRecord()});
 const valid=projectLegacyNotification(notification,target);
 assert.equal(valid.actionHref,'/tasks/task%3Aone');assert.equal(valid.title,'Current task');assert.equal(valid.body,'');
});
test('canonical reminder target lookup is exact, read-only and fail-closed',async()=>{
 const memory=createMemoryLiveRecordStore<Record<string,unknown>>();await memory.upsertRecord(taskRecord());
 const calls:unknown[]=[];
 const reader={async getRecord(input:Parameters<typeof memory.getRecord>[0]){calls.push(input);return memory.getRecord(input);}};
 assert.equal((await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'task',targetId:'task:one',store:reader}))?.href,'/tasks/task%3Aone');
 assert.deepEqual(calls,[{workspaceId:workspace,collectionName:'tasks',recordId:'task:one'}]);
 assert.equal(await resolveLegacyReminderTarget({actorId:'other',workspaceId:workspace,targetType:'task',targetId:'task:one',store:reader}),null);
 assert.equal(await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'task',targetId:'missing',store:reader}),null);
 await assert.rejects(()=>resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'task',targetId:'task:one',store:{async getRecord(){throw Error('offline');}}}),/offline/);
});
test('schedule uses its actual stored prefixed id and strict owner lifecycle',async()=>{
 const memory=createMemoryLiveRecordStore<Record<string,unknown>>();const base=taskRecord();
 const record={...base,collectionName:'personal_schedule_items',recordId:'schedule:personal:one',payload:{id:'schedule:personal:one',sourceId:'personal:one',accountId:actor,ownerUserId:actor,title:'Current schedule',category:'personal',kind:'personal',state:'upcoming',startsAt:'2099-09-16T10:00:00.000Z',createdAt:at,updatedAt:at,evidenceIds:[]}};
 await memory.upsertRecord(record);
 assert.equal((await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'schedule_item',targetId:record.recordId,store:memory}))?.href,'/schedule/personal/schedule%3Apersonal%3Aone');
 assert.equal(await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'schedule_item',targetId:'personal:one',store:memory}),null);
 await memory.upsertRecord({...record,payload:{...record.payload,ownerUserId:'other'}});
 assert.equal(await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'schedule_item',targetId:record.recordId,store:memory}),null);
 for(const status of ['ended','cancelled']) {
  await memory.upsertRecord({...record,payload:{...record.payload,state:status}});
  assert.equal(await resolveLegacyReminderTarget({actorId:actor,workspaceId:workspace,targetType:'schedule_item',targetId:record.recordId,store:memory}),null);
 }
});
test('a proven contact retains only its canonical detail action, never an unproven appointment query',()=>{
 const record={...taskRecord(),collectionName:'contacts',recordId:'contact:one',payload:{id:'contact:one',displayName:'Current contact'}};
 const target=verifyLegacyTarget({actorId:actor,workspaceId:workspace,kind:'contact',id:record.recordId,record});
 assert.equal(projectLegacyNotification({...notification,actionHref:'/app/contacts/contact%3Aone?appointmentId=stale'},target).actionHref,'/contacts/contact%3Aone');
 assert.equal(verifyLegacyTarget({actorId:actor,workspaceId:workspace,kind:'contact',id:record.recordId,record:{...record,userId:'other'}}),null);
});
test('actual provider and service do not guess tasks or leak stale visible associations',async()=>{
 const store=createMemoryLiveRecordStore<Record<string,unknown>>();const task=taskRecord();await store.upsertRecord(task);
 const notice:LiveRecord<Record<string,unknown>>={...task,collectionName:'notifications',recordId:notification.id,targetType:'task',targetId:task.recordId,payload:notification};
 await store.upsertRecord(notice);
 const provider=createStorageReminderScheduleNotificationProvider({store,workspaceId:workspace});
 const service=createLiveReminderScheduleNotificationService({provider});
 const list=async()=>{const result=await service.listNotifications({actorId:actor});assert.equal(result.success,true);if(!result.success)throw Error('unavailable');return result.data;};
 let data=await list();assert.equal(data.reminders[0]?.href,'/tasks/task%3Aone');assert.equal(data.reminders[0]?.followupTaskId,'task:one');assert.equal(data.reminders[0]?.title,'Current task');assert.equal(JSON.stringify(data).includes('SECRET OLD'),false);
 for(const bad of [{...notice,targetId:'missing'},{...notice,targetId:undefined},{...notice,userId:'other',payload:{...notification,accountId:actor}},{...notice,lifecycleState:'archived' as const},{...notice,payload:{...notification,id:'wrong'}}]) {
  await store.upsertRecord(bad);data=await list();const reminder=data.reminders[0];assert.ok(reminder);assert.equal(reminder.href,'');assert.equal(reminder.followupTaskId,'');assert.equal(reminder.contactName,'');assert.equal(reminder.organization,'');assert.equal(reminder.connectionId,'');assert.deepEqual(reminder.evidenceIds,[]);assert.deepEqual(data.notificationQueue[0]?.evidenceIds,[]);assert.equal(JSON.stringify(data).includes('SECRET OLD'),false);
 }
 await store.upsertRecord(notice);await store.upsertRecord({...task,userId:'other'});data=await list();assert.equal(data.reminders[0]?.href,'');
});
test('canonical GET uses exact source proof, not delivered status or an old deepLink',async()=>{
 const store=createMemoryLiveRecordStore<Record<string,unknown>>();await store.upsertRecord(taskRecord());
 const plan:ReminderPlanDTO={id:'plan:one',accountId:actor,ownerUserId:actor,targetType:'task',targetId:'task:one',fireAt:at,timeZone:'UTC',status:'delivered',channels:['in_app'],title:'SECRET OLD TITLE',body:'SECRET OLD BODY',deepLink:'/app/tasks/wrong',createdBy:'user',createdAt:at,updatedAt:at};
 const plans={async list(){return [plan];}} as unknown as ReminderPlanService;
 const handler=createNotificationsGetHandler(async()=>({id:actor,userId:actor}),null,plans,{store,workspaceId:workspace});
 const read=async()=>{const response=await handler(new Request('http://localhost/api/notifications'));assert.equal(response.status,200);const envelope=await response.json();return envelope.data.reminders.find((r:{reminderId:string})=>r.reminderId===plan.id);};
 let reminder=await read();assert.equal(reminder.href,'/tasks/task%3Aone');assert.equal(reminder.title,'Current task');assert.equal(reminder.followupTaskId,'task:one');
 await store.upsertRecord({...taskRecord(),lifecycleState:'deleted'});plan.status='failed';reminder=await read();assert.equal(reminder.href,'');assert.equal(reminder.title,'来源已不可用');assert.equal(reminder.followupTaskId,'');assert.equal(JSON.stringify(reminder).includes('SECRET OLD'),false);
 await store.upsertRecord(taskRecord());plan.ownerUserId='other';reminder=await read();assert.equal(reminder.href,'');
 const unavailable=createNotificationsGetHandler(async()=>({id:actor,userId:actor}),null,plans,null);const response=await unavailable(new Request('http://localhost/api/notifications'));assert.equal((await response.json()).data.reminders.find((r:{reminderId:string})=>r.reminderId===plan.id).href,'');
});
