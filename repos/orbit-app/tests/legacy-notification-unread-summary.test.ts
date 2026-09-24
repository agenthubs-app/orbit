import assert from 'node:assert/strict';
import test from 'node:test';
import type {OrbitApiClient} from '../src/api/client';
import {readLegacyNotificationUnreadCount,type LegacyUnreadCapability} from '../src/api/legacy-notification-unread-summary';

test('legacy badge uses an actor-validated summary and does not fall back on errors',async()=>{
  for(const [status,data,expected] of [
    [200,{actorId:'a',unreadTotal:3,refreshedAt:'2026-09-25T00:00:00Z'},3],
    [200,{actorId:'other',unreadTotal:3,refreshedAt:'2026-09-25T00:00:00Z'},undefined],
    [503,{},undefined],[403,{},undefined],
  ] as const) {
    const calls:string[]=[];
    const client={get:async(path:string)=>{calls.push(path);return {status,success:status===200,data};}} as unknown as OrbitApiClient;
    assert.equal(await readLegacyNotificationUnreadCount({client,actorId:'a',signal:new AbortController().signal,capability:{}}),expected);
    assert.deepEqual(calls,['/api/notifications/unread-summary']);
  }
});
test('old server fallback retains read/ignored semantics and caches only endpoint absence per scope',async()=>{
  const calls:string[]=[],capability:LegacyUnreadCapability={};
  const client={get:async(path:string)=>{calls.push(path);return path.endsWith('unread-summary')?{status:404,success:false}:{status:200,success:true,data:{state:'success',reminders:['a','b','c'].map(reminderId=>({reminderId,title:'Title'})),notificationInteractions:{b:'read',c:'ignored'}}};}} as unknown as OrbitApiClient;
  const input={client,actorId:'a',signal:new AbortController().signal,capability};
  assert.equal(await readLegacyNotificationUnreadCount(input),1);assert.equal(await readLegacyNotificationUnreadCount(input),1);
  assert.deepEqual(calls,['/api/notifications/unread-summary','/api/notifications','/api/notifications']);
});
