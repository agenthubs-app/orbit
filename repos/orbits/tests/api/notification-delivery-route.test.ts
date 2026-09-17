import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationDeliveryRouteHandler } from "../../app/api/notifications/deliveries/[id]/handler";

test("authenticated delivery detail exposes an inbox target without device or push payload data", async () => {
  const handler = createNotificationDeliveryRouteHandler({
    resolveActor: async () => ({ id: "actor:a" }),
    serviceForActor: () => ({
      async get() {
        return {
          actorId: "actor:a",
          availableAt: "2026-08-20T00:00:00.000Z",
          body: "查看 Orbit 中的提醒。",
          channel: "push" as const,
          createdAt: "2026-08-19T00:00:00.000Z",
          data: { deliveryId: "delivery:a", signalId: "must-not-leak" },
          deliveredAt: undefined,
          deliveryId: "delivery:a",
          deviceId: "device:a",
          maxAttempts: 5,
          phase: "commitment" as const,
          scheduledFor: "2026-08-20T00:00:00.000Z",
          signalId: "signal:a",
          signalRevision: "v1",
          status: "scheduled" as const,
          title: "Orbit 提醒",
          attempt: 0,
          updatedAt: "2026-08-19T00:00:00.000Z",
        };
      },
    } as never),
  });
  const response = await handler(new Request("http://localhost"), {
    params: Promise.resolve({ id: "delivery:a" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.deepEqual(body.data.data, { deliveryId: "delivery:a" });
  assert.deepEqual(body.data.target, { deliveryId: "delivery:a", kind: "inbox" });
  assert.equal("deviceId" in body.data, false);
});
test('delivery lookup rejects foreign actor even when a service returns that record',async()=>{
 const handler=createNotificationDeliveryRouteHandler({resolveActor:async()=>({id:'a'}),serviceForActor:()=>({get:async()=>({actorId:'b',deliveryId:'d'})}) as never});
 assert.equal((await handler(new Request('http://localhost'),{params:Promise.resolve({id:'d'})})).status,404);
});
test('typed delivery resolves navigation from current authorized source, not persisted push data',async()=>{
 const record={actorId:'a',deliveryId:'d',policySource:{kind:'message',id:'m',eventKey:'m'},title:'stale secret',body:'old text',data:{deliveryId:'d'}};
 let available=true;const handler=createNotificationDeliveryRouteHandler({resolveActor:async()=>({id:'a'}),serviceForActor:()=>({get:async()=>record}) as never,resolveTyped:async()=>available?{href:'/inbox/c',title:'佐藤健一',body:'新消息',subject:{channel:'message'}}:null} as never);
 const read=async()=>await(await handler(new Request('http://localhost'),{params:Promise.resolve({id:'d'})})).json();
 assert.equal((await read()).data.target.href,'/inbox/c');available=false;const revoked=await read();assert.equal(revoked.data.target.status,'unavailable');assert.equal(revoked.data.target.href,undefined);assert.equal(revoked.data.body,'');assert.equal(revoked.data.policySource,undefined);
});
