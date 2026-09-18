import test from 'node:test';import assert from 'node:assert/strict';
import {createDeliveryPolicyHandler} from '../../app/api/inbox/delivery/preferences/handler';
import {inboxDeliveryPreferencesInputSchema,inboxDeliveryOwnerInputSchema} from '../../shared/api-schema/notification-delivery-policy';
test('delivery policy rejects client identity, unknown fields and non-acknowledged ownership',async()=>{
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,actorId:'other'}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,messageAnalysisEnabled:false}).success,false);
 assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({expectedRevision:0,muteConversation:{conversationId:'c',muted:true}}).success,true);
 assert.equal(inboxDeliveryOwnerInputSchema.safeParse({deviceId:'d',generation:1,localCancelled:false}).success,false);
 const handler=createDeliveryPolicyHandler({resolveActor:async()=>null});assert.equal((await handler(new Request('http://localhost/api/inbox/delivery/preferences'))).status,401);
});
