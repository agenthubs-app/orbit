import assert from "node:assert/strict";
import test from "node:test";

import { withCardExpiryTimers } from "../../features/agent/automations/card-expiry";
import { dispatchDueAutomations, type AutomationDispatchDeps } from "../../features/agent/automations/dispatcher";
import { createMemoryAutomationStorage } from "../../features/agent/automations/due-index";
import { cancelAgentTimer, cardExpiryTimerKey, fireAgentTimer, scheduleAgentTimer } from "../../features/agent/automations/timers";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { AGENT_CARD_TTL_MS } from "../../features/agent/runtime/decision";
import { ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";
import { WORKSPACE } from "./agent-automation-kit";

/**
 * agent-design AG15-5 (设计稿 §5.2, §5.3; PLANNER 易错边界 9): one-off timers live in the same store as the rules; a
 * card left waiting for 7 days is marked expired by its timer — a click on it writes nothing and is refused with
 * CARD_EXPIRED, regenerating gives a new revision that still needs a click — and a timer never calls a model.
 */

const DAY = 86_400_000;

function setup() {
  const kit = createCardKit({ start: "2026-11-15T01:00:00.000Z" });
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const runtime = withCardExpiryTimers(kit.runtime, { now: kit.now, ownerId: ACTOR, storage });
  let computed = 0;
  const deps: AutomationDispatchDeps = {
    delivery: { inbox: null, now: kit.now, storage },
    now: kit.now,
    runPeriod: async () => {
      computed += 1;
      return { items: [], outcome: "no_match", text: "" };
    },
    storage,
    timers: {
      async expireCard(_ownerId, actionId) {
        const result = await kit.runtime.expireCard!({ actionId, reason: "timer" });
        return !result ? "missing" : result.outcome;
      },
    },
  };
  return { computed: () => computed, deps, kit: { ...kit, runtime }, storage };
}

test("a card that starts waiting gets a one-off timer at its expiry, in the same index as the rules", async () => {
  const { kit, storage } = setup();
  const todo = await kit.todo("约山本吃饭");
  const card = await freeze(kit as never, [{ capability: "todo.update", set: { plannedDate: "2026-11-30" }, targetId: todo.id }]);
  const timers = await storage.listOwned(ACTOR, "timer");
  assert.equal(timers.length, 1);
  assert.equal(timers[0].key, cardExpiryTimerKey(card.actionId));
  assert.equal(timers[0].nextRunAt, card.expiresAt, "it fires when the card expires");
  assert.equal(Date.parse(card.expiresAt!) - Date.parse(card.createdAt), AGENT_CARD_TTL_MS, "7 days after it was made");
  assert.deepEqual(timers[0].definition, { actionId: card.actionId, type: "card_expiry" });
});

test("after 7 days the timer marks the card expired; a click writes nothing and is refused; regenerating still needs a click", async () => {
  const { computed, deps, kit, storage } = setup();
  const todo = await kit.todo("约山本吃饭");
  const card = await freeze(kit as never, [{ capability: "todo.update", set: { plannedDate: "2026-11-30" }, targetId: todo.id }]);

  // Before the expiry the timer is not due: a pass changes nothing.
  kit.advance(6 * DAY);
  assert.equal((await dispatchDueAutomations(deps)).timersFired, 0);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");

  kit.advance(DAY + 20 * 60_000);
  const summary = await dispatchDueAutomations(deps);
  assert.equal(summary.timersFired, 1);
  assert.equal(computed(), 0, "a timer computes nothing and calls no model");
  const expired = await kit.runtime.getAction(card.actionId);
  assert.equal(expired?.status, "expired");
  assert.equal((await storage.listOwned(ACTOR, "timer")).length, 0, "fired once, then gone");

  const refused = await decide(kit as never, card, "confirm", "decision:after-expiry");
  assert.equal(refused?.accepted, false);
  assert.equal(refused?.reason, "CARD_EXPIRED");
  assert.equal(refused?.message, "这张卡放太久了，要重新生成一张吗？");
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))?.plannedDate ?? null, null, "the to-do is unchanged");

  const regenerated = await kit.runtime.regenerateCard!({ actionId: card.actionId });
  assert.equal(regenerated?.outcome, "regenerated");
  const fresh = (await kit.runtime.getAction(card.actionId))!;
  assert.equal(fresh.revision, 2);
  assert.equal(fresh.status, "awaiting_confirmation", "a new revision still waits for a click");
  assert.equal(kit.executorCalls.length, 0);
  const moved = await storage.listOwned(ACTOR, "timer");
  assert.equal(moved.length, 1, "the regenerated card has its own expiry timer");
  assert.equal(moved[0].nextRunAt, fresh.expiresAt);
});

test("a card decided before its expiry is left alone by the timer", async () => {
  const { deps, kit } = setup();
  const todo = await kit.todo("给李薇寄样片", "2026-11-10");
  const card = await freeze(kit as never, [{ capability: "todo.update", set: { plannedDate: "2026-11-16" }, targetId: todo.id }]);
  const decided = await decide(kit as never, card, "reject", "decision:reject");
  assert.equal(decided?.accepted, true);
  kit.advance(8 * DAY);
  assert.equal((await dispatchDueAutomations(deps)).timersFired, 1);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected", "a closed card stays as it was closed");
});

test("the next period's card takes the place of the one before: the earlier card is closed without a click", async () => {
  const { kit } = setup();
  const todo = await kit.todo("给李薇寄样片", "2026-11-10");
  const first = await freeze(kit as never, [{ capability: "todo.update", set: { plannedDate: "2026-11-16" }, targetId: todo.id }]);
  // Well before its own 7 days, the following Monday's run supersedes it.
  kit.advance(2 * DAY);
  assert.deepEqual(await kit.runtime.expireCard!({ actionId: first.actionId, reason: "superseded" }), { outcome: "expired", revision: 1 });
  assert.equal((await kit.runtime.getAction(first.actionId))?.status, "expired");
  const refused = await decide(kit as never, first, "confirm", "decision:old-card");
  assert.equal(refused?.reason, "CARD_EXPIRED");
  assert.equal(refused?.message, "同一条定时任务的下一期出了新卡，这张已经被取代。请用新的那张。", "the card says why it can no longer be used");
  const closed = (await kit.runtime.getAction(first.actionId))!;
  assert.equal(closed.expiredReason, "superseded");
  assert.equal(agentCardPreview(closed, null, kit.now()).expiredReason, "superseded", "both clients can tell a superseded card from one left too long");
  // The timer of the closed card finds nothing to do, and a card that is not waiting is not touched by "timer" either.
  assert.deepEqual(await kit.runtime.expireCard!({ actionId: first.actionId, reason: "timer" }), { outcome: "unchanged", revision: 1 });
  assert.equal(await kit.runtime.expireCard!({ actionId: "action:none", reason: "timer" }), null);
});

test("a timer is one row per owner and key: setting it again moves it, cancelling removes it, firing writes through its handler only", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const now = "2026-11-15T01:00:00.000Z";
  await scheduleAgentTimer(storage.direct.due, { fireAt: "2026-11-22T01:00:00.000Z", key: "wake:1", ownerId: "user:a", payload: { entry: "external-proposal:1", type: "wake" } }, now);
  await scheduleAgentTimer(storage.direct.due, { fireAt: "2026-11-23T01:00:00.000Z", key: "wake:1", ownerId: "user:a", payload: { entry: "external-proposal:1", type: "wake" } }, now);
  const [timer] = await storage.listOwned("user:a", "timer");
  assert.equal((await storage.listOwned("user:a", "timer")).length, 1);
  assert.equal(timer.nextRunAt, "2026-11-23T01:00:00.000Z");
  assert.deepEqual(await storage.listOwned("user:b", "timer"), [], "another owner sees none of it");
  const woke: string[] = [];
  const outcome = await fireAgentTimer(timer, { expireCard: async () => "unchanged", wake: async (ownerId, entry) => { woke.push(`${ownerId}:${entry}`); } });
  assert.equal(outcome, "woke");
  assert.deepEqual(woke, ["user:a:external-proposal:1"]);
  assert.equal(await fireAgentTimer({ ...timer, definition: { type: "something-else" } }, { expireCard: async () => "unchanged" }), "unknown");
  await cancelAgentTimer(storage.direct.due, "user:a", "wake:1");
  assert.deepEqual(await storage.listOwned("user:a", "timer"), []);
  await assert.rejects(() => scheduleAgentTimer(storage.direct.due, { fireAt: "not a time", key: "k", ownerId: "user:a", payload: { entry: "e", type: "wake" } }, now), /valid time/u);
});
