import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDeliveryPreferences,evaluateDeliveryPolicy,deliveryDigestAt,deliveryLocalDay,deliveryQuotaUsage} from '../../features/notifications/delivery-policy';
const p=defaultDeliveryPreferences('a'),base={channel:'reminder' as const,origin:'automation' as const,scheduledFor:'2026-09-16T00:00:00.000Z',expiresAt:'2026-09-18T00:00:00.000Z',read:false,active:true,explicitNight:false};
test('R14 delivery defaults expose editable quiet hours, one shared cap, and available secretary sources',()=>{
 assert.deepEqual({quietStart:p.quietStart,quietEnd:p.quietEnd,dailyCap:p.dailyCap,meetingException:p.meetingException,secretaryMail:p.secretaryMail,secretaryDeadline:p.secretaryDeadline,secretaryPick:p.secretaryPick},{quietStart:'22:00',quietEnd:'07:30',dailyCap:3,meetingException:true,secretaryMail:false,secretaryDeadline:true,secretaryPick:true});
});
test('messages bypass AI eligibility while categories and conversation mute are independent',()=>{const prefs={...p,reminderEnabled:false,suggestionEnabled:false,updateEnabled:false};assert.equal(evaluateDeliveryPolicy({...base,channel:'message',conversationId:'c'},prefs,'2026-09-16T01:00:00Z').action,'send');assert.equal(evaluateDeliveryPolicy(base,prefs,'2026-09-16T01:00:00Z').action,'suppress');assert.equal(evaluateDeliveryPolicy({...base,channel:'message',conversationId:'c'},{...prefs,mutedConversationIds:['c']},'2026-09-16T01:00:00Z').action,'suppress');});
test('ordinary suggestions are silent; only source-proven time windows permit push',()=>{assert.equal(evaluateDeliveryPolicy({...base,channel:'suggestion'},p,'2026-09-16T01:00:00Z').action,'suppress');assert.equal(evaluateDeliveryPolicy({...base,channel:'suggestion',hasFactualWindow:true},p,'2026-09-16T01:00:00Z').action,'send');});
test('22–07:30 defers while explicit user-selected night reminders bypass app quiet hours',()=>{const now='2026-09-16T14:00:00Z';assert.deepEqual(evaluateDeliveryPolicy(base,p,now),{action:'defer',availableAt:'2026-09-16T22:50:00.000Z',reason:'quiet_hours'});assert.equal(evaluateDeliveryPolicy({...base,origin:'user',explicitNight:true},p,now).action,'send');for(const patch of [{active:false},{read:true},{expiresAt:now}])assert.equal(evaluateDeliveryPolicy({...base,...patch},p,now).action,'suppress');});
test('quiet candidates wait for the later of the configured end and 07:50',()=>{
 const at='2026-09-16T22:45:00Z',morning='2026-09-16T22:40:00Z';
 assert.deepEqual(evaluateDeliveryPolicy(base,p,at),{action:'defer',availableAt:'2026-09-16T22:50:00.000Z',reason:'digest_window'});
 assert.deepEqual(evaluateDeliveryPolicy({...base,scheduledFor:morning},p,'2026-09-16T22:40:00Z'),{action:'defer',availableAt:'2026-09-16T22:50:00.000Z',reason:'digest_window'});
 assert.deepEqual(evaluateDeliveryPolicy(base,{...p,quietEnd:'08:30'},'2026-09-16T22:45:00Z'),{action:'defer',availableAt:'2026-09-16T23:30:00.000Z',reason:'quiet_hours'});
 assert.deepEqual(evaluateDeliveryPolicy(base,{...p,quietEnd:'07:00'},'2026-09-16T22:40:00Z'),{action:'defer',availableAt:'2026-09-16T22:50:00.000Z',reason:'digest_window'});
});
test('digest target is stable for quiet and morning candidates, while explicit night reminders stay separate',()=>{
 assert.equal(deliveryDigestAt({...base,scheduledFor:'2026-09-16T14:10:00Z'},p),'2026-09-16T22:50:00.000Z');
 assert.equal(deliveryDigestAt({...base,scheduledFor:'2026-09-16T22:40:00Z'},p),'2026-09-16T22:50:00.000Z');
 assert.equal(deliveryDigestAt({...base,origin:'user',explicitNight:true,scheduledFor:'2026-09-16T14:10:00Z'},p),null);
});
test('a verified 30-minute meeting reminder may bypass quiet hours but still uses the shared cap',()=>{
 const at='2026-09-16T14:00:00Z',meeting={...base,channel:'reminder' as const,meeting30m:true};
 assert.equal(evaluateDeliveryPolicy(meeting,p,at).action,'send');
 assert.equal(evaluateDeliveryPolicy(meeting,{...p,meetingException:false},at).action,'defer');
 assert.equal(evaluateDeliveryPolicy({...meeting,meeting30m:false},p,at).action,'defer');
});
test('DST and day boundaries use account time zone',()=>{assert.equal(deliveryLocalDay('2026-03-08T07:30:00Z','America/New_York'),'2026-03-08');assert.deepEqual(evaluateDeliveryPolicy({...base,expiresAt:'2026-03-10T00:00:00Z',scheduledFor:'2026-03-08T00:00:00Z'},{...p,timeZone:'America/New_York'},'2026-03-08T06:30:00Z'),{action:'defer',availableAt:'2026-03-08T11:50:00.000Z',reason:'quiet_hours'});});
test('devices share one account quota reservation; timezone switching cannot reset usage',()=>{const rows=[{eventKey:'one',at:'2026-09-16T10:00:00Z',timeZone:'Asia/Tokyo',suggestion:true},{eventKey:'two',at:'2026-09-16T11:00:00Z',timeZone:'Asia/Tokyo',suggestion:false},{eventKey:'one',at:'2026-09-16T10:00:01Z',timeZone:'Asia/Tokyo',suggestion:true}];assert.deepEqual(deliveryQuotaUsage(rows,'2026-09-16T15:00:00Z','America/Los_Angeles'),{total:2,suggestions:1});assert.deepEqual(deliveryQuotaUsage(rows,'2026-09-17T11:00:01Z','America/Los_Angeles'),{total:0,suggestions:0});});
