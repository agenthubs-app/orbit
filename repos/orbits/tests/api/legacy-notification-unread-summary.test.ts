import assert from 'node:assert/strict';
import test from 'node:test';
import type {z} from 'zod';
import type {ContractMatches} from '../../shared/contract-check';
import type {LegacyNotificationUnreadSummaryDTO} from '../../shared/contract/legacy-notification-unread-summary';
import {legacyNotificationUnreadSummarySchema} from '../../shared/api-schema/legacy-notification-unread-summary';
import {createLegacyUnreadSummaryGetHandler} from '../../app/api/notifications/unread-summary/handler';
const matches:ContractMatches<z.infer<typeof legacyNotificationUnreadSummarySchema>,LegacyNotificationUnreadSummaryDTO>=true;
test('legacy count is authenticated, actor-derived, non-cacheable and does not disclose database errors',async()=>{
  assert.equal(matches,true);
  assert.equal((await createLegacyUnreadSummaryGetHandler({resolveActor:async()=>null,read:async()=>{throw new Error('Must not query');}})()).status,401);
  const response=await createLegacyUnreadSummaryGetHandler({resolveActor:async()=>({id:'a',accountId:'a',userId:'raw',name:'Test',email:'a@example.test'}),read:async actor=>{assert.equal(actor,'a');throw new Error('Private DB error');}})();
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await response.text(),/Private DB error/);
});
