import test from 'node:test';import assert from 'node:assert/strict';
import {createDeliveryPolicyHandler} from '../../app/api/inbox/delivery/preferences/handler';
import {inboxDeliveryPreferencesInputSchema,inboxDeliveryOwnerInputSchema} from '../../shared/api-schema/notification-delivery-policy';
test('delivery policy rejects client identity, unknown fields and non-acknowledged ownership',async()=>{
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,actorId:'other'}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,messageAnalysisEnabled:false}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,muteConversation:{conversationId:'c',muted:true}}).success,true);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,quietStart:'23:00',quietEnd:'23:00'}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,quietStart:'23:00',quietEnd:'07:30',dailyCap:1}).success,true);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,secretaryMail:true}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,secretaryMail:false}).success,true);
 assert.equal(inboxDeliveryOwnerInputSchema.safeParse({deviceId:'d',generation:1,localCancelled:false}).success,false);
 const handler=createDeliveryPolicyHandler({resolveActor:async()=>null});assert.equal((await handler(new Request('http://localhost/api/inbox/delivery/preferences'))).status,401);
});
test('delivery policy refuses mail-summary activation before repository writes',async()=>{
 let writes=0;
 const handler=createDeliveryPolicyHandler({resolveActor:async()=>({id:'a'}) as never,enabled:()=>true,runtime:()=>({repository:{updatePreferences:async()=>{writes++;return {};}}}) as never});
 const response=await handler(new Request('http://localhost/api/inbox/delivery/preferences',{method:'PUT',body:JSON.stringify({expectedRevision:0,secretaryMail:true})}));
 assert.equal(response.status,400);assert.equal(writes,0);
});
test('delivery usage (b5 #6 rail) answers today\'s automatic pushes against the cap, signed-in and typed-inbox only',async()=>{
 const {createDeliveryUsageHandler}=await import('../../app/api/inbox/delivery/usage/handler');
 const {readDeliveryQuotaToday}=await import('../../features/notifications/delivery-quota-read');
 assert.equal((await createDeliveryUsageHandler({resolveActor:async()=>null})()).status,401);
 assert.equal((await createDeliveryUsageHandler({resolveActor:async()=>({id:'a'}) as never,enabled:()=>false})()).status,404);
 const rows=[{eventKey:'one',at:'2026-09-16T01:00:00Z',timeZone:'Asia/Tokyo',suggestion:true},{eventKey:'two',at:'2026-09-16T02:00:00Z',timeZone:'Asia/Tokyo',suggestion:false},{eventKey:'old',at:'2026-09-15T01:00:00Z',timeZone:'Asia/Tokyo',suggestion:false}];
 const client={query:async()=>({rows:rows.map(payload=>({payload}))})} as never;
 assert.deepEqual(await readDeliveryQuotaToday({client,workspaceId:'w',now:()=>'2026-09-16T05:00:00Z'},'a',{timeZone:'Asia/Tokyo',dailyCap:3}),{used:2,cap:3});
 assert.deepEqual(await readDeliveryQuotaToday({client,workspaceId:'w',now:()=>'2026-09-16T05:00:00Z'},'a',{timeZone:'Asia/Tokyo',dailyCap:1}),{used:1,cap:1});
 const handler=createDeliveryUsageHandler({resolveActor:async()=>({id:'a'}) as never,enabled:()=>true,runtime:()=>({repository:{preferences:async()=>({timeZone:'Asia/Tokyo',dailyCap:2})}}) as never,read:async()=>({used:1,cap:2})});
 const body=await (await handler()).json();assert.deepEqual(body.data,{actorId:'a',used:1,cap:2});
 const broken=createDeliveryUsageHandler({resolveActor:async()=>({id:'a'}) as never,enabled:()=>true,runtime:()=>null});assert.equal((await broken()).status,503);
});
