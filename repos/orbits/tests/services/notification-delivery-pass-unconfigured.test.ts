// The maintenance pass treats an intentionally absent subsystem as `skipped`; push without its token key is one.
import assert from "node:assert/strict";
import test from "node:test";

import { NotificationDeliveryUnconfigured, runNotificationDeliveryPass } from "../../features/notifications/delivery-pass";

test("without ORBIT_PUSH_TOKEN_KEY the delivery pass reports push as unconfigured before touching any actor", async () => {
  let listed = 0;
  const actors = { listOptedInActorIds: async () => { listed += 1; return ["actor:a"]; } };
  const eventRuntime = { client: {}, workspaceId: "workspace:test" } as never;
  for (const env of [{}, { ORBIT_PUSH_TOKEN_KEY: "  " }]) {
    await assert.rejects(
      runNotificationDeliveryPass({ actors, eventRuntime, push: null, env: env as NodeJS.ProcessEnv, workerId: "test" }),
      (error: unknown) => error instanceof NotificationDeliveryUnconfigured && error.reason === "push_token_key",
    );
  }
  assert.equal(listed, 0);
});

test("with the key present the pass proceeds to the actors (none here)", async () => {
  const result = await runNotificationDeliveryPass({
    actors: { listOptedInActorIds: async () => [] },
    eventRuntime: { client: {}, workspaceId: "workspace:test" } as never,
    push: null,
    env: { ORBIT_PUSH_TOKEN_KEY: "configured" } as unknown as NodeJS.ProcessEnv,
    workerId: "test",
  });
  assert.deepEqual([result.actorCount, result.result.sent], [0, 0]);
});
