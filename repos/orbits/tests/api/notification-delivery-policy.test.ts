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
