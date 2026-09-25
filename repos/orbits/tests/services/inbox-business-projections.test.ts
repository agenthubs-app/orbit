import assert from 'node:assert/strict';import test from 'node:test';
import { reminderPlanNotification, appointmentChangeNotification, batchResultNotification, integrationExpiryNotification } from '../../features/notifications/inbox-business-projections';
const at='2026-09-16T02:00:00.000Z';
test('explicit reminders retain original title, time and stable legacy identity',()=>{
 const n=reminderPlanNotification({id:'r',accountId:'a',ownerUserId:'a',targetType:'task',targetId:'t',fireAt:at,timeZone:'Asia/Tokyo',status:'scheduled',channels:['in_app'],title:'原文标题',body:'原文原因',deepLink:'/tasks/t',createdBy:'user',createdAt:at,updatedAt:at},at);
 assert.equal(n?.kind,'reminder');assert.equal(n?.title,'原文标题');assert.equal(n?.legacyId,'r');assert.equal(n?.dueAt,undefined);assert.equal(n?.scheduledFor,at);
});
test('appointment changes identify concrete counterpart and proposed time; own saves are suppressed',()=>{
 const e={actorId:'b',at,command:'propose',detail:'proposal',proposalRevision:1,version:2} as const;
 const n=appointmentChangeNotification({actorId:'a',appointmentId:'ap',contactName:'佐藤健一',contactId:'sato',history:e,time:'2026-09-17T01:00:00.000Z'});
 assert.equal(n?.kind,'update');assert.match(n!.copy!.zh.title,/佐藤健一/);assert.match(n!.copy!.zh.reason,/2026/);
 assert.equal(appointmentChangeNotification({actorId:'b',appointmentId:'ap',contactName:'A',contactId:'a',history:e}),null);
 assert.equal(appointmentChangeNotification({actorId:'a',appointmentId:'ap',contactName:'B',contactId:'b',history:{...e,command:'details_updated'}}),null);
});
test('card results aggregate once per batch and ignore per-item processing',()=>{
 const args={actorId:'a',batchId:'batch',revision:'3',occurredAt:at,count:12,pipeline:'v1' as const};
 assert.equal(batchResultNotification({...args,status:'processing'}),null);
 const n=batchResultNotification({...args,status:'ready_for_review'});assert.equal(n?.semanticKey,'batch:v1:batch');assert.match(n!.copy!.zh.reason,/12/);
});
test('appointment time is readable in the proposal timezone and not a raw UTC string',()=>{
 const n=appointmentChangeNotification({actorId:'a',appointmentId:'ap',contactName:'佐藤健一',contactId:'sato',history:{actorId:'b',at,command:'accept',detail:'accepted',proposalRevision:1,version:3},time:'2026-09-17T01:00:00.000Z',timeZone:'Asia/Tokyo'});
 assert.match(n!.copy!.zh.reason,/10:00/);assert.doesNotMatch(n!.copy!.zh.reason,/T01:00/);
});
test('integration expiry is projected once at the expiry boundary only when reconnect is required',()=>{
 const ignored=integrationExpiryNotification({actorId:'account',principalId:'user',provider:'gmail',expiresAt:at,requiresReconnect:false});
 assert.equal(ignored,null);
 const n=integrationExpiryNotification({actorId:'account',principalId:'user',provider:'gmail',expiresAt:at,requiresReconnect:true});
 assert.equal(n?.semanticKey,`connection:gmail:${at}`);assert.equal(n?.occurredAt,at);assert.equal(n?.sources[0]?.authorId,'user');assert.equal(n?.target.href,'/settings');
});
