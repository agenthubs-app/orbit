import assert from "node:assert/strict";
import test from "node:test";
import { aiSendIntentOrigin, consumeAiSendIntent, registerAiSendIntent } from "../src/data/ai-send-intent";

const intent = {
  id: "click-1",
  actorId: "actor-1",
  baseUrl: "https://orbit.example",
  message: "准备交流会",
  origin: {
    entryClient: "app" as const,
    entryPointId: "home.event_preparation" as const,
    initialGroupId: null,
    kind: "structured" as const,
    template: { id: "home.event_preparation", version: 1 }
  }
};

test("AI send intent is available only once after the matching explicit click", () => {
  registerAiSendIntent(intent);
  assert.equal(consumeAiSendIntent(intent), true);
  assert.equal(consumeAiSendIntent(intent), false);
});
for (const patch of [{ actorId: "actor-2" }, { baseUrl: "https://other.example" }, { message: "另一个问题" }]) test("AI send intent invalidates a matching ID outside its exact scope " + JSON.stringify(patch), () => {
  registerAiSendIntent(intent);
  assert.equal(consumeAiSendIntent({ ...intent, ...patch }), false);
  assert.equal(consumeAiSendIntent(intent), false);
});
test("AI send intent rejects unknown IDs without consuming a different click", () => {
  registerAiSendIntent(intent);
  assert.equal(consumeAiSendIntent({ ...intent, id: "forged" }), false);
  assert.equal(consumeAiSendIntent(intent), true);
});
test("AI send intent retains only the latest click and copies its original input", () => {
  registerAiSendIntent(intent);
  const next = { ...intent, id: "click-2" };
  registerAiSendIntent(next);
  next.message = "mutated";
  next.origin.template.version = 99;
  assert.equal(consumeAiSendIntent(intent), false);
  assert.equal(consumeAiSendIntent({ ...intent, id: "click-2" }), true);
  assert.deepEqual(aiSendIntentOrigin("click-2")?.origin, {
    entryClient: "app",
    entryPointId: "home.event_preparation",
    initialGroupId: null,
    kind: "structured",
    template: { id: "home.event_preparation", version: 1 }
  });
});
for (const key of ["id", "actorId", "baseUrl", "message"] as const) test("AI send intent never accepts a missing " + key, () => {
  registerAiSendIntent(intent);
  const invalid = { ...intent, [key]: "  " };
  registerAiSendIntent(invalid);
  assert.equal(consumeAiSendIntent(invalid), false);
  assert.equal(consumeAiSendIntent(intent), false);
});
