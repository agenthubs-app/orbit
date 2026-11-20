/**
 * AG21a R37 (independent suite, final run): a scheduled task the user describes instead of naming ("周一挑人的那个") was looked
 * up by the model only when the account had more than one task; with exactly one, words that do not hold its title ended in
 * 「没认出说的是哪条定时任务」. The description check runs with one task as well; the change still goes on a card.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { RULE_PAUSE, type RuleSnapshot } from "../../features/agent-v1/domains/rule/ops";
import { FRIDAY_9, ruleSpec } from "../capabilities/agent-automation-kit";
import { fnWorld, json, NOW, runFn } from "./functions-kit";
import { graphKit, recordAccessOf, type ModelCall } from "./graph-kit";

const ONLY: RuleSnapshot = { automationId: "rule:monday", rule: ruleSpec({ rankingBasis: "过期的跟进优先", scope: { domain: "contact" } as never, scopeText: "要跟进的人" }), schedule: { ...FRIDAY_9, daysOfWeek: [1], time: "08:00" }, status: "active", title: "每周一早上挑三条要跟进的人", version: 3 };

function sessionWith(rules: readonly RuleSnapshot[]) {
  const session = graphKit((async () => { throw new Error("replaced per turn"); }) as typeof fetch, { now: NOW, records: recordAccessOf(fnWorld()) });
  session.deps.rules = { list: async () => rules };
  return session;
}

const choiceSystem = (call: ModelCall) => /say which task they mean/u.test(call.system);

test("the only task, described without its title: the model is asked which one it is, and the pause goes on a card", async () => {
  const message = "把周一挑人的那个先停了";
  const asked: string[] = [];
  const run = await runFn(message, [{ deliverable: "change", requiredCapabilities: [RULE_PAUSE], sourceQuote: message }], {
    extractReply: (call) => {
      if (choiceSystem(call)) {
        asked.push(call.user);
        return json({ task: 1 });
      }
      return json({ basisText: null, count: null, domain: null, schedule: null, scheduleText: null, scopeText: null, target: "周一挑人的那个", until: null, untilText: null, verb: "pause" });
    },
    session: sessionWith([ONLY]),
  });
  assert.equal(asked.length, 1, "the description is checked against the one task");
  assert.match(asked[0], /每周一早上挑三条要跟进的人/u);
  assert.doesNotMatch(run.result.text, /没认出说的是哪条定时任务/u, run.result.text);
  const intents = run.frozen.flatMap((card) => card.intents);
  assert.deepEqual(intents.map((intent) => [intent.capability, (intent as { targetId?: string }).targetId]), [[RULE_PAUSE, "rule:monday"]]);
});

test("the only task, and words that do not fit it: the model answers null and nothing is guessed", async () => {
  const message = "把提醒我喝水的那个先停了";
  const run = await runFn(message, [{ deliverable: "change", requiredCapabilities: [RULE_PAUSE], sourceQuote: message }], {
    extractReply: (call) => (choiceSystem(call) ? json({ task: null }) : json({ basisText: null, count: null, domain: null, schedule: null, scheduleText: null, scopeText: null, target: "提醒我喝水的那个", until: null, untilText: null, verb: "pause" })),
    session: sessionWith([ONLY]),
  });
  assert.match(run.result.text, /没认出说的是哪条定时任务/u, run.result.text);
  assert.equal(run.frozen.length, 0);
});
