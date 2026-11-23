import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG05: the check words its gate uses first (CONVENTIONS §7) — gaps (RD.yaml),
 * recent_interaction (RD.yaml), listed (SCL-008; FN/JDG extend it in AG10).
 */

const ids: Record<string, string> = { C17: "contact:c17", LT01: "task:lt01", LT02: "task:lt02", LT04: "task:lt04", M31: "note:m31", M41: "note:m41" };
const reverse = new Map(Object.entries(ids).map(([fixture, product]) => [product, fixture]));
const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };

function obs(extra: Partial<Observation> = {}): Observation {
  return {
    account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-T-005", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
    fixtureIdOf: (id) => (id ? reverse.get(id) ?? null : null), idMap: ids, reads: [], requests: [], unsupported: [], ...extra,
  };
}

function withParts(parts: Record<string, unknown>[]): Observation {
  return obs({ firstLayer: [{ contextMessages: 0, contextSeq: 1, handoff: null, message: "m", partResults: parts as never, receivedSeq: 1, requestId: "r1", understandPrompts: [] }] });
}

const run = (name: string, args: unknown, observation: Observation) => CHECKS[name](args, observation, context);

test("the AG05 words are implemented, no longer 'not yet'", () => {
  for (const word of ["gaps", "recent_interaction", "listed"]) {
    assert.ok(CHECKS[word], word);
    assert.equal(NOT_YET[word], undefined, word);
  }
});

test("gaps: the part holding the words carries the reason", () => {
  const o = withParts([{ gaps: ["unreadable"], partId: "p1", sourceQuote: "总结一下 @客户笔记", status: "unfinished" }, { partId: "p2", sourceQuote: "@给小林发修订报价 计划哪天做", status: "answered" }]);
  assert.equal(run("gaps", [{ quote: "总结一下 @客户笔记", reason: "unreadable" }], o).status, "pass");
  assert.equal(run("gaps", [{ quote: "总结一下 @客户笔记", reason: "no_record" }], o).status, "fail");
  assert.match(run("gaps", [{ quote: "计划哪天做", reason: "partial" }], o).detail, /no gap/u);
  assert.match(run("gaps", [{ quote: "别的话", reason: "partial" }], o).detail, /no part/u);
});

test("recent_interaction: the view after the run names the day and the source record", () => {
  const o = obs({ recentInteractions: { C17: { after: { occurredOn: "2026-11-15", productId: "note:m41", source: "M41" }, before: { occurredOn: "2026-11-15", productId: "note:m41", source: "M41" } } } });
  assert.equal(run("recent_interaction", [{ contact: "C17", occurredOn: "2026-11-15", source: "M41" }], o).status, "pass");
  assert.equal(run("recent_interaction", [{ contact: "C17", occurredOn: "2026-11-12", source: "M31" }], o).status, "fail");
  assert.equal(run("recent_interaction", [{ contact: "C17", unchanged: true }], o).status, "pass");
  const created = obs({ diff: { records: [{ after: {}, before: null, collection: "notes", fields: [], id: "note:new", kind: "created", owner: "user_a", workspace: "w" }], tables: [] }, recentInteractions: { C17: { after: { occurredOn: "2026-11-15", productId: "note:new", source: null }, before: null } } });
  assert.equal(run("recent_interaction", [{ contact: "C17", occurredOn: "2026-11-15", source: "created" }], created).status, "pass");
  assert.equal(run("recent_interaction", [{ contact: "C17", unchanged: true }], created).status, "fail");
  assert.equal(run("recent_interaction", [{ contact: "C17", occurredOn: "2026-11-15", source: "M41" }], obs()).status, "fail", "the view was not read");
});

test("listed: the last answer's records in the order they are cited (includes, excludes, exact, count)", () => {
  const o = obs({ answers: [{ citations: ["LT01", "LT02"], seq: 3, text: "期限切れは 2 件" }] });
  assert.equal(run("listed", { excludes: ["LT04"], includes: ["LT01", "LT02"] }, o).status, "pass");
  assert.equal(run("listed", { includes: ["LT04"] }, o).status, "fail");
  assert.equal(run("listed", { exact: ["LT01", "LT02"] }, o).status, "pass");
  assert.equal(run("listed", { count: 3 }, o).status, "fail");
  assert.equal(run("listed", { within: ["LT01", "LT02", "LT04"] }, o).status, "pass");
  assert.equal(run("listed", { sequence: ["LT02", "LT01"] }, o).status, "fail");
});
