import assert from "node:assert/strict";
import { test } from "node:test";

import { deviceTimeZone, sendAgentV1 } from "../src/api/agent-v1-client";

/** AG20a (decision 8, 设计稿 §3.1): the App sends the device's time zone with each message; the server checks it. */
test("the message carries the device's zone", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = { post: async (_endpoint: string, options: { body: Record<string, unknown> }) => { bodies.push(options.body); return { data: {}, success: true }; } } as never;
  await sendAgentV1(client, { clientMessageId: "m1", locale: "zh", message: "今天做", sessionId: "s1" });
  const zone = deviceTimeZone();
  assert.ok(zone, "the test runtime has a zone");
  assert.equal(bodies[0]?.timeZone, zone);
  assert.equal(bodies[0]?.protocolVersion, 3);
});
