import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { settleDependencies } from "../../features/agent-v1/route/decide";
import { functionOf } from "../../features/agent-v1/graph/nodes/functions";
import { graphKit, recordAccessOf, captureTrace, deepseekStub, json, part, type ModelCall } from "./graph-kit";
import { choice } from "./judgment-kit";
import { fnWorld, NOW, runFn } from "./functions-kit";
import { contact, memo, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG20b (TRIAGE R9 second half, R17, R20, R22). This sprint's own data (the builders' fnWorld and smallWorld
 * plus records of its own), not the independent suite's.
 */

const M91 = { id: "note:m91", name: "王强通话", type: "memo" };
const owner = (byKey: Record<string, string>) => (id: string) => {
  const key = id.split("__")[1];
  return byKey[key] ? choice(byKey[key], 0.95) : undefined;
};

/* ── R17 ── */

test("R17 '用这篇笔记更新我和王强的往来' on a picked note is the extraction of the interaction (a card), not readings to choose from", async () => {
  const message = "@王强通话 用这篇笔记更新我和王强的往来";
  const run = await runFn(message, [{ clarity: "multiple_readings", dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@王强通话" }, { entity: "contact", text: "王强" }], readings: [{ capabilities: ["memo.read", "fn.summarize"], deliverable: "summary" }, { capabilities: ["memo.read", "fn.extractInteractions"], deliverable: "change" }, { capabilities: ["memo.read", "fn.extractFollowUps"], deliverable: "list" }], requiredCapabilities: ["memo.read"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", direction: "mutual", occurredOnText: "", participantClues: ["王强"], sentenceIds: [1] }] },
    judge: () => choice("yes", 0.95),
    references: [M91],
  });
  assert.ok(run.events.some((event) => event.type === "route.memo_updates_interactions"), run.result.text);
  assert.equal(run.result.clarifications.filter((set) => set.kind === "question").length, 0, "no question over three readings");
  assert.ok(run.events.some((event) => event.type === "fn.extractInteractions"), "the interactions are extracted");
});

test("R17 '下一篇笔记我只要我答应的事' is kept; the next '整理一下' of a note extracts the promises instead of a summary", async () => {
  const world = fnWorld();
  const session = graphKit(fetch, { now: NOW, records: recordAccessOf(world) });
  const goal = "下一篇笔记我只要我答应的事。";
  const first = await runFn(goal, [{ clarity: "clear", dataSources: ["orbit_records"], persistence: "until_satisfied", requiredCapabilities: ["memo.read", "fn.extractFollowUps"], sourceQuote: goal }], { session, world });
  assert.doesNotMatch(first.result.text, /定期留意/u, "not offered as a standing rule");
  assert.match(first.result.text, /下一篇笔记让我整理时，我只列你答应的事/u);
  assert.equal(first.result.clarifications.length, 0);
  const second = "@王强通话 帮我整理一下";
  const run = await runFn(second, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@王强通话" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: second }], {
    extract: { followUps: [{ aboutClue: "王强", action: "把合同草稿发给王强", dateText: "11 月 20 日", owner: "me", sentenceIds: [2] }] },
    judge: owner({ f1: "me" }),
    references: [M91],
    session,
    world,
  });
  assert.ok(run.events.some((event) => event.type === "functions.note_goal_applied"), run.result.text);
  assert.ok(run.events.some((event) => event.type === "fn.extractFollowUps"));
  assert.ok(!run.events.some((event) => event.type === "fn.summarize"));
  // Used up: a third "整理一下" is the summary again.
  const state = await session.sessionState.get("actor:a", "session:a");
  assert.equal(state?.noteGoal ?? null, null);
});

test("AE-EVT-009 (run-01): a note clue bound to the private event being deleted is no note to extract from", () => {
  const message = "参会自述一起删掉；笔记和待办留着，只解除它们和这场活动的关联。然后把活动删了。";
  const bound = { entity: "memo", quote: [message.indexOf("笔记"), message.indexOf("笔记") + 2] as [number, number], recordId: "private_event:p1" };
  const part = { asked: 0, capabilities: ["attendance.delete", "todo.update", "privateEvent.delete"], continues: null, dependsOn: [], localId: "p1", origin: null, plan: { clarity: "clear", dataOwner: "self", dataSources: ["orbit_records"], deliverable: "change", hypothesis: false, intentBasis: "selection", negation: false, persistence: "this_turn", readings: [] }, quote: [0, message.length], reading: null, reason: "proposing", refs: [bound], route: "propose_write", status: "unfinished", step: null, verdict: "accept", waitReason: null } as never;
  const scope = { input: { message }, run: { context: null, references: [{ accessible: true, id: "private_event:p1", name: "同学会", type: "event" }] } } as never;
  assert.equal(functionOf(scope, part), null);
});

/* ── R9 second half ── */

test("R9 'Beatrix-style' question guessed as a to-do also reads the person's notes holding the words", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  world.records.push(contact("actor:a", "contact:lena", "Lena Ostrova", { organization: "Polar Films" }));
  world.records.push(todo("actor:a", "task:lena-opt", "跟进 Lena 的 option", { relatedContactId: "contact:lena", relatedContactIds: ["contact:lena"] }));
  world.records.push(memo("actor:a", "note:lena-opt", "Lena 说片场的 option 保留到 12 月 4 日，过了就放给别人。", "2026-11-10T03:00:00.000Z", ["contact:lena"], { title: "Lena 档期" }));
  const message = "Lena 的 option 哪天到期？";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "Lena" }], readFilter: { status: "open", text: "option" }, requiredCapabilities: ["todo.read"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo "Lena 档期"/u.exec(call.user)?.[1];
    return json({ segments: [{ cites: handle ? [{ sentenceIds: [1], sourceRef: handle }] : [], partId: "p1", text: "option 保留到 12 月 4 日。" }] });
  });
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.match(materials, /12 月 4 日/u, "the note is among the materials");
    assert.ok(result.sourceRefs.includes("memo:note:lena-opt"), result.text);
    assert.ok(trace.events.some((event) => event.type === "resolve.notes_also_read"));
    // R24 does not widen these: only the notes holding the words, never the person's other notes (AE-AMB-012).
    assert.ok(!trace.events.some((event) => event.type === "resolve.current_newest"));
  } finally {
    trace.restore();
  }
});

/* ── R24 ── */

for (const quote of ["What is Mira Okafor's salary expectation?", "her current salary expectation"]) {
  test(`R24 '${quote}': words never hide the person's newer note — both notes are read, the newer one is cited`, async () => {
    const world = smallWorld();
    for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
    world.records.push(contact("actor:a", "contact:mira", "Mira Okafor", { organization: "Northwind Labs" }));
    world.records.push(memo("actor:a", "note:mira-old", "Mira said her salary expectation is around 8.2M yen.", "2025-03-10T03:00:00.000Z", ["contact:mira"], { title: "Mira first call" }));
    world.records.push(memo("actor:a", "note:mira-new", "Mira now asks for 9.5M yen after the competing offer.", "2026-11-05T03:00:00.000Z", ["contact:mira"], { title: "Mira follow-up" }));
    const message = quote.startsWith("her") ? `I'm meeting Mira Okafor tomorrow. ${quote}` : quote;
    let materials = "";
    const model = deepseekStub((call: ModelCall) => {
      if (call.node === "understand") {
        const parts = quote.startsWith("her")
          ? [part({ dataSources: [], deliverable: "answer", localId: "p1", objectClues: [{ entity: "contact", text: "Mira Okafor" }], requiredCapabilities: ["contact.read"], sourceQuote: "I'm meeting Mira Okafor tomorrow." }), part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "her" }, { entity: "memo", text: "salary expectation" }], readFilter: { order: "newest", text: "salary expectation" }, requiredCapabilities: ["memo.read"], sourceQuote: quote })]
          : [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "Mira Okafor" }], readFilter: { order: "newest", text: "salary expectation" }, requiredCapabilities: ["memo.read"], sourceQuote: quote })];
        return json({ language: "en", parts, plainChat: false });
      }
      materials = call.user;
      const handle = /(s\d+) — memo "Mira follow-up"/u.exec(call.user)?.[1];
      const partId = quote.startsWith("her") ? "p2" : "p1";
      return json({ segments: [{ cites: handle ? [{ sentenceIds: [1], sourceRef: handle }] : [], partId, text: "She now asks for 9.5M yen (before: about 8.2M)." }, ...(partId === "p2" ? [{ cites: [], partId: "p1", text: "Good luck with the meeting." }] : [])] });
    });
    const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) });
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    assert.match(materials, /9\.5M yen/u, "the newer note is read");
    assert.match(materials, /8\.2M yen/u, "the note holding the words too");
    assert.ok(result.sourceRefs.includes("memo:note:mira-new"), `${result.text} ${result.sourceRefs.join(", ")}`);
    const coverage = result.partResults.flatMap((item) => item.coverage ?? []).find((item) => item.kind === "memo");
    assert.equal(coverage?.total, 2, "the coverage counts all of her notes, not only those holding the words");
  });
}

/* ── R25 ── */

test("R25 'what does she do now' about a contact with a role and no notes: the profile is answered from and cited, never 'nothing found'", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  world.records.push(contact("actor:a", "contact:ines", "Inès Moreau", { organization: "Atelier Lune", role: "Head of Partnerships" }));
  const message = "@Inès Moreau 现在是什么职位？";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", referenceId: "r1", text: "@Inès Moreau" }], readFilter: { current: true }, requiredCapabilities: ["contact.read", "view.context"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — contact/u.exec(call.user)?.[1];
    return json({ profile: [], segments: [{ cites: handle ? [{ sentenceIds: [1], sourceRef: handle }] : [], partId: "p1", profile: [], text: "她现在是 Atelier Lune 的 Head of Partnerships。" }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world), references: [{ id: "contact:ines", name: "Inès Moreau", type: "contact" }] as never });
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: "contact:ines", type: "contact" }] as never }));
  assert.match(materials, /Head of Partnerships/u, "the profile is material");
  assert.ok(result.sourceRefs.includes("contact:contact:ines"), `${result.text} ${result.sourceRefs.join(", ")}`);
  assert.doesNotMatch(result.text, /没有找到相关的内容/u);
  assert.match(result.text, /没有关于Inès Moreau的笔记或待办/u, "the empty kinds are said as what they are");
  const p1 = result.partResults[0];
  assert.ok(!(p1.gaps ?? []).includes("no_record"), JSON.stringify(p1));
  assert.ok(p1.coverage?.some((item) => item.kind === "contact" && item.seen === 1), "the coverage shows the profile read");
  assert.ok(p1.coverage?.some((item) => item.kind === "memo" && item.seen === 0), "and the empty kind");
});

test("R25 mirror (AE-RD-004 shape): 'open to-dos for her' tagged contact.read + todo.read is still 'nothing found'", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  world.records.push(contact("actor:a", "contact:ines", "Inès Moreau", { organization: "Atelier Lune", role: "Head of Partnerships" }));
  const message = "Do I have any open to-dos for Inès Moreau?";
  const model = deepseekStub([json({ language: "en", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p1", objectClues: [{ entity: "contact", text: "Inès Moreau" }, { entity: "todo", text: "open to-dos for Inès Moreau" }], readFilter: { status: "open" }, requiredCapabilities: ["contact.read", "todo.read"], sourceQuote: message })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.deepEqual(result.partResults[0].gaps, ["no_record"], JSON.stringify(result.partResults));
  // Integration seam (2026-11-20): the nothing-found sentence is the hotfix's (part 1b item 4, live): who and what was looked
  // for, as in hotfix-counts-dates-person.test.ts — not the bare "I found nothing about this".
  assert.equal(result.text, "Open to-dos for Inès Moreau: none.");
});

/* ── R20 ── */

test("R20 a part that depends on a read whose record cannot be opened is not held back", () => {
  const parts = [
    { dependsOn: [], localId: "p1", reason: "reference_not_accessible", route: "read" as const, status: "unfinished" as const, waitReason: null },
    { dependsOn: ["p1"], localId: "p2", reason: null, route: "read" as const, status: "answered" as const, waitReason: null },
    { dependsOn: ["p3"], localId: "p4", reason: null, route: "read" as const, status: "answered" as const, waitReason: null },
    { dependsOn: [], localId: "p3", reason: "budget", route: "read" as const, status: "unfinished" as const, waitReason: null },
  ];
  settleDependencies(parts);
  assert.equal(parts[1].status, "answered", "p2 is answered from its own records");
  assert.equal(parts[2].status, "waiting_dependency", "any other unfinished prerequisite still holds its dependent back");
});

test("R20 '根据 @笔记（打不开），看看 @待办 的截止时间' split in two parts: the to-do part is answered", async () => {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  world.records.push(todo("actor:a", "task:due1", "寄回签好的样书合同", { dueAt: "2026-11-17T09:00:00.000Z" }));
  const message = "根据 @客户访谈，看看 @寄回签好的样书合同 的截止时间来不来得及。";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "memo", referenceId: "r1", text: "@客户访谈" }], requiredCapabilities: ["memo.read"], sourceQuote: "根据 @客户访谈" }),
      part({ dataSources: ["orbit_records"], dependsOn: ["p1"], localId: "p2", objectClues: [{ entity: "todo", referenceId: "r2", text: "@寄回签好的样书合同" }], requiredCapabilities: ["todo.read"], sourceQuote: "看看 @寄回签好的样书合同 的截止时间来不来得及" }),
    ], plainChat: false });
    const handle = /(s\d+) — to-do/u.exec(call.user)?.[1];
    return json({ segments: [{ cites: handle ? [{ sentenceIds: [1, 4], sourceRef: handle }] : [], partId: "p2", text: "这条待办的截止时间是 11 月 17 日 18:00。" }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world), references: [{ accessible: false, id: "note:m37", name: "客户访谈", type: "memo" }, { id: "task:due1", name: "寄回签好的样书合同", type: "todo" }] as never });
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: "note:m37", type: "memo" }, { id: "task:due1", type: "todo" }] as never }));
  const p2 = result.partResults.find((item) => item.partId === "p2");
  assert.equal(p2?.status, "answered", JSON.stringify(result.partResults));
  assert.ok(result.sourceRefs.includes("todo:task:due1"), result.text);
  assert.ok(!result.sourceRefs.includes("memo:note:m37"));
});

/* ── R22 ── */

test("R22 every part of a split message gets an answer or an explicit 'not done' line", async () => {
  const message = "小林最近怎么样？顺便说说周会的事。";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [
      part({ dataSources: [], localId: "p1", requiredCapabilities: [], sourceQuote: "小林最近怎么样？" }),
      part({ dataSources: [], localId: "p2", requiredCapabilities: [], sourceQuote: "顺便说说周会的事。" }),
    ], plainChat: false });
    // The second part's answer is only a sentence code does not deliver (an invented limit): nothing of it is left.
    return json({ segments: [{ partId: "p1", text: "我这边没有新的消息。" }, { partId: "p2", text: "这一步我没有访问你的日程数据。" }] });
  });
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: "2026-11-15T01:00:00.000Z" });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.match(result.text, /「顺便说说周会的事。」这次没有处理到/u, `the second part is not dropped: ${result.text}`);
    assert.ok(trace.events.some((event) => event.type === "deliver.part_not_done"));
  } finally {
    trace.restore();
  }
});
