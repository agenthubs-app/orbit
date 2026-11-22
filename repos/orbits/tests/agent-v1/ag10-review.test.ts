import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, memo, todo } from "./read-kit";

test("dev run 2 (one part for the whole review): 'her current salary expectation' reads the newest notes; a note's 'still need to send the JD' is left out once that to-do is done", async () => {
  const records = [
    contact(ACTOR, "contact:priya", "Priya Raman", { organization: "Corvid Robotics" }),
    memo(ACTOR, "note:lm12", "First call with Priya Raman. Salary expectation: JPY 18M base.", "2025-03-14T09:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm14", "Priya updated her expectation: JPY 24M base plus equity. Earlier figures are out of date.", "2026-10-30T03:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm15", "Still need to send Priya the JD for the Aster Motion role.", "2026-10-28T00:00:00.000Z", ["contact:priya"]),
    todo(ACTOR, "task:lt08", "Send interview panel list to Priya", { dueAt: "2026-11-18T09:00:00.000Z", relatedContactId: "contact:priya" }),
    todo(ACTOR, "task:lt10", "Send Priya the JD", { completedAt: "2026-11-03T02:00:00.000Z", relatedContactId: "contact:priya", status: "completed" }),
  ];
  const message = "I'm meeting Priya Raman tomorrow. Give me a quick review: when we last actually talked, what's still open with her, and her current salary expectation.";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "contact", text: "Priya Raman" }], readFilter: { order: "newest", text: "salary expectation" }, requiredCapabilities: ["view.recentInteraction", "view.timeline", "todo.read", "memo.read", "fn.summarize"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo[^\n]*\n\s+1\. Priya updated/u.exec(call.user)?.[1] ?? "s1";
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", profile: [], text: "Her expectation is now JPY 24M base plus equity." }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records }) });
  const trace = captureTrace();
  try {
    await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /Priya updated her expectation/u);
    assert.doesNotMatch(materials, /Still need to send Priya the JD/u);
    assert.ok(trace.events.some((event) => event.type === "resolve.pending_note_done"));
  } finally {
    trace.restore();
  }
});

test("stability run: 'when we last actually talked' — 'we' is the person named before it (Priya), never a contact called Wee", async () => {
  const records = [
    contact(ACTOR, "contact:priya", "Priya Raman", { organization: "Corvid Robotics" }),
    contact(ACTOR, "contact:wee", "Daniel Wee", { organization: "Meridian Power Devices" }),
    memo(ACTOR, "note:lm16", "Called Priya. She can do the on-site on November 24 or November 25.", "2026-11-10T08:00:00.000Z", ["contact:priya"], { interaction: { actualContactIds: ["contact:priya"], channel: "phone", direction: "outgoing", occurredOn: "2026-11-10", precision: "day" } }),
    memo(ACTOR, "note:wee1", "Brief call with Daniel Wee.", "2026-09-28T08:00:00.000Z", ["contact:wee"], { interaction: { actualContactIds: ["contact:wee"], channel: "phone", direction: "outgoing", occurredOn: "2026-09-28", precision: "day" } }),
  ];
  const message = "I'm meeting Priya Raman tomorrow. Give me a quick review: when we last actually talked";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ clarity: "statement", localId: "p1", objectClues: [{ entity: "contact", text: "Priya Raman" }], sourceQuote: "I'm meeting Priya Raman tomorrow" }), part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "we" }], readFilter: { order: "newest" }, requiredCapabilities: ["view.recentInteraction", "contact.read"], sourceQuote: "Give me a quick review: when we last actually talked" })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo/u.exec(call.user)?.[1] ?? "s1";
    return json({ segments: [{ partId: "p1", text: "OK." }, { cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p2", profile: [], text: "Nov 10, a phone call." }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records }) });
  const trace = captureTrace();
  try {
    await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /Called Priya/u);
    assert.doesNotMatch(materials, /Daniel Wee/u);
  } finally {
    trace.restore();
  }
});

test("'what's still open with her' reads the open to-dos, not a note that once said something still needed doing (AE-SCL-020)", async () => {
  const records = [
    contact(ACTOR, "contact:priya", "Priya Raman", { organization: "Corvid Robotics" }),
    memo(ACTOR, "note:lm15", "Still need to send Priya the JD for the Aster Motion role.", "2026-10-28T00:00:00.000Z", ["contact:priya"]),
    todo(ACTOR, "task:lt08", "Send interview panel list to Priya", { dueAt: "2026-11-18T09:00:00.000Z", relatedContactId: "contact:priya" }),
    todo(ACTOR, "task:lt10", "Send Priya the JD", { completedAt: "2026-11-03T02:00:00.000Z", relatedContactId: "contact:priya", status: "completed" }),
  ];
  const message = "I'm meeting Priya Raman tomorrow. What's still open with her?";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "Priya Raman" }], readFilter: { status: "open" }, requiredCapabilities: ["todo.read", "memo.read"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — to-do/u.exec(call.user)?.[1] ?? "s1";
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "Send her the interview panel list." }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records }) });
  const trace = captureTrace();
  try {
    await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /Send interview panel list to Priya/u);
    assert.doesNotMatch(materials, /Still need to send Priya the JD/u, "the stale note is not an open item");
    assert.ok(trace.events.some((event) => event.type === "resolve.open_items_from_todos"));
  } finally {
    trace.restore();
  }
});

/**
 * agent-design AG10 (AE-SCL-020, 会前回顾): "her current salary expectation" reads the person's newest notes as well as the
 * ones holding the words — the newest note says "updated her expectation" without the word "salary", and it is the one
 * that holds now (设计稿 §4 新的为准).
 */

const ACTOR = "actor:a";

test("a 'current' read with words also reads the person's newest notes, so a newer note that words it differently is there", async () => {
  const records = [
    contact(ACTOR, "contact:priya", "Priya Raman", { notes: "Salary expectation: JPY 21M base (noted Feb 2026)", organization: "Corvid Robotics" }),
    memo(ACTOR, "note:lm12", "First call with Priya Raman. Salary expectation: JPY 18M base.", "2025-03-14T09:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm13", "Priya was promoted to VP of Engineering. Her expectation is now JPY 21M base.", "2026-02-20T06:00:00.000Z", ["contact:priya"]),
    memo(ACTOR, "note:lm14", "Priya updated her expectation: JPY 24M base plus equity. Earlier figures are out of date.", "2026-10-30T03:00:00.000Z", ["contact:priya"]),
  ];
  const message = "I'm meeting Priya Raman tomorrow. What is her current salary expectation?";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "Priya Raman" }], readFilter: { current: true, text: "salary expectation" }, requiredCapabilities: ["memo.read", "profile.read"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo[^\n]*\n\s+1\. Priya updated/u.exec(call.user)?.[1] ?? "s1";
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", profile: [], text: "Her expectation is now JPY 24M base plus equity." }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf({ events: [], records }) });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /Priya updated her expectation: JPY 24M base plus equity/u, "the newest note is among the materials");
    assert.ok(trace.events.some((event) => event.type === "resolve.current_newest"));
    assert.ok(result.sourceRefs.includes("memo:note:lm14"));
  } finally {
    trace.restore();
  }
});
