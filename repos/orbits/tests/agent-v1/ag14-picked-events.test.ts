/**
 * agent-design AG14 (AG11 交接, AE-REF-005): to find the event a change is about, the events the user picked with @ are
 * looked at first — when the words name one of them, the whole directory is not listed. A platform event's time is
 * still the organizer's: code says so and nothing is proposed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPart } from "../../features/agent-v1/graph/state";
import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { fnWorld } from "./functions-kit";
import { recordAccessOf } from "./graph-kit";

function setup(message: string, clue: string, capability: StoredIntent["capability"], picked: string[]) {
  const world = fnWorld();
  const access = recordAccessOf(world);
  const calls = { byIds: 0, list: 0 };
  const records = {
    ...access,
    eventsByIds: async (ids: readonly string[]) => {
      calls.byIds += 1;
      return world.events.filter((event) => ids.includes(event.eventId));
    },
    listEvents: async () => {
      calls.list += 1;
      return world.events;
    },
  };
  const at = message.indexOf(clue);
  const part = { capabilities: [capability], localId: "p1", quote: [0, message.length], refs: [] } as unknown as GraphPart;
  const intent = { capability, localId: "w1", relations: [], selector: [[at, at + clue.length]] } as unknown as StoredIntent;
  const ctx = { asOf: "2026-11-15T01:00:00.000Z", asked: new Map(), context: null, language: "zh" as const, message, nameOf: () => null, people: [], pickedEvents: picked, records, scope: access.scope("actor:a"), timeZone: "Asia/Tokyo" };
  return { calls, ctx, intent, part };
}

test("a picked platform event named in the words: only that event is read, and its time is the organizer's", async () => {
  const message = "把 @SaaS 定价研讨会 的开始时间改成晚上八点。";
  const { calls, ctx, intent, part } = setup(message, "@SaaS 定价研讨会", "privateEvent.update", ["event:e103"]);
  const outcome = await resolveEventIntent(ctx as never, part, { intents: [intent], picks: {} }, intent);
  assert.equal(outcome.kind, "stop");
  assert.equal((outcome as { reason: string }).reason, "platform_event");
  assert.match((outcome as { line: string }).line, /SaaS 定价研讨会/u);
  assert.deepEqual(calls, { byIds: 1, list: 0 });
});

test("the same as a schedule change: the picked event is found without listing the directory", async () => {
  const message = "把 @SaaS 定价研讨会 的开始时间改成晚上八点。";
  const { calls, ctx, intent, part } = setup(message, "@SaaS 定价研讨会", "schedule.update", ["event:e103"]);
  const outcome = await resolveEventIntent(ctx as never, part, { intents: [intent], picks: {} }, intent);
  assert.equal(outcome.kind, "stop");
  assert.equal(calls.list, 0);
});

test("nothing picked, or the words name another event than the picked one: the directory is listed as before", async () => {
  const message = "把 SaaS 定价研讨会 的开始时间改成晚上八点。";
  const none = setup(message, "SaaS 定价研讨会", "privateEvent.update", []);
  assert.equal((await resolveEventIntent(none.ctx as never, none.part, { intents: [none.intent], picks: {} }, none.intent) as { reason: string }).reason, "platform_event");
  assert.deepEqual(none.calls, { byIds: 0, list: 1 });
  const other = setup(message, "SaaS 定价研讨会", "privateEvent.update", ["event:e101"]);
  assert.equal((await resolveEventIntent(other.ctx as never, other.part, { intents: [other.intent], picks: {} }, other.intent) as { reason: string }).reason, "platform_event");
  assert.deepEqual(other.calls, { byIds: 1, list: 1 });
});
