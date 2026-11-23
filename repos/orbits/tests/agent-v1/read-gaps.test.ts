import assert from "node:assert/strict";
import test from "node:test";

import { gapWords } from "../../features/agent-v1/answer/gap-copy";
import { gapOfReadError } from "../../features/agent-v1/domains/registry";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG05-4 (PLANNER 易错边界 5): three different things, three different sentences — nothing
 * found (no_record; the part is still answered), a part that cannot be read (partial; what can be read
 * is delivered and the rest is said), a failed read (service_error; "try again later", never "no
 * record"). An @ reference that cannot be opened is `unreadable`: choose again; the rest goes on.
 */

const ACTOR = "actor:a";

function worldOfActor() {
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = ACTOR;
  for (const record of world.records) if (record.collection === "notes") (record.payload.note as Record<string, unknown>).accountId = record.userId;
  world.records.push(contact(ACTOR, "contact:c40", "Emily Carter", { organization: "Harbor Analytics" }));
  return world;
}

function withFaults(where: string[]) {
  const holder = globalThis as { __orbitAgentEval?: unknown };
  const previous = holder.__orbitAgentEval;
  const events: Record<string, unknown>[] = [];
  holder.__orbitAgentEval = { emit: (event: Record<string, unknown>) => events.push(event), setting: () => null, takeFault: (point: string) => (where.includes(point) ? { kind: "fail_always", where: point } : null) };
  return { events, restore: () => { holder.__orbitAgentEval = previous; } };
}

test("executeAiRead's failures map to what they mean; a failure is never 'no record'", () => {
  assert.equal(gapOfReadError(new Error("READ_NOT_FOUND"), { byId: false }), "no_record");
  assert.equal(gapOfReadError(new Error("READ_NOT_FOUND"), { byId: true }), "unreadable");
  assert.equal(gapOfReadError(new Error("SOURCE_UNAVAILABLE"), { byId: false }), "service_error");
  assert.equal(gapOfReadError(new Error("AI_NOT_AUTHORIZED"), { byId: false }), "unreadable");
  assert.equal(gapOfReadError(new Error("CANONICAL_RECORD_UNAVAILABLE"), { byId: false }), "partial");
  assert.equal(gapOfReadError(new Error("connect ECONNREFUSED"), { byId: false }), "service_error");
});

test("the three sentences differ in every language, and a failure never says there is nothing", () => {
  for (const language of ["zh", "ja", "en"] as const) {
    const words = gapWords(language);
    const lines = [words.noRecord("x"), words.partial(), words.serviceError("x"), words.unreadableReference("x")];
    assert.equal(new Set(lines).size, 4, language);
    assert.doesNotMatch(words.serviceError("x"), language === "zh" ? /没有找到/u : language === "ja" ? /見つかりませんでした/u : /found nothing/u);
  }
});

test("nothing found: answered, no_record, said by code without a second model call", async () => {
  const message = "Do I have any open to-dos for Emily Carter?";
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "Emily Carter" }], readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: "open to-dos for Emily Carter" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(worldOfActor()) });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.equal(model.calls.length, 1);
  assert.deepEqual(result.partResults.map((item) => [item.status, item.gaps]), [["answered", ["no_record"]]]);
  // Hotfix 2026-11-20 part 1b item 4 (AE-RD-004): code's sentence says who and what was looked for, not the bare one.
  assert.equal(result.text, "Open to-dos for Emily Carter: none.");
  assert.doesNotMatch(result.text, /couldn't read|problem/u);
});

test("partly readable: the readable note is delivered, the rest is said; the withdrawn note is never read", async () => {
  const message = "我和小林这个月都聊过什么？";
  const records = recordAccessOf(worldOfActor(), { denied: new Set(["note:m31"]) });
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], readFilter: { from: "2026-11-01", to: "2026-11-30" }, requiredCapabilities: ["memo.read"], sourceQuote: "我和小林这个月都聊过什么" })], plainChat: false }),
    (call) => {
      assert.doesNotMatch(call.user, /实施费单列/u, "the withdrawn note's words never reach the model");
      assert.match(call.user, /cannot be read now/u);
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "11 月 10 日小林来电说小陈在审核，你答应 13 日发报价。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.partResults.map((item) => [item.status, item.gaps]), [["answered", ["partial"]]]);
  assert.match(result.text, /还有一部分相关记录这次读不到/u);
  assert.deepEqual(result.sourceRefs, ["memo:note:m32"]);
  assert.equal(records.source.reads.includes("note:m31"), false);
});

test("the read fails: service_error, 'try again later', not 'no record'; nothing of the note is said", async () => {
  const message = "田中上次跟我说了什么？";
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "田中" }], requiredCapabilities: ["view.recentInteraction", "memo.read"], sourceQuote: "田中上次跟我说了什么" })], plainChat: false })]);
  const faults = withFaults(["memo.read"]);
  try {
    const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(worldOfActor()) });
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.equal(model.calls.length, 1, "nothing to answer from: no answer call");
    assert.deepEqual(result.partResults.map((item) => [item.status, item.gaps]), [["unfinished", ["service_error"]]]);
    assert.match(result.text, /这次没读到/u);
    assert.match(result.text, /并不代表没有记录/u);
    assert.doesNotMatch(result.text, /交付周期/u);
    assert.deepEqual(result.sourceRefs, []);
    assert.ok(faults.events.some((event) => event.type === "read.fault" && event.where === "memo.read"));
  } finally {
    faults.restore();
  }
});

test("an @ note of another account: choose again; the other question of the turn is answered", async () => {
  const message = "总结一下 @客户笔记，再告诉我 @给小林发修订报价 计划哪天做。";
  const world = worldOfActor();
  const records = recordAccessOf(world);
  const model = deepseekStub([
    (call) => {
      assert.match(call.user, /(r\d) memo \(cannot be opened now\)/u);
      const closed = /(r\d) memo \(cannot be opened now\)/u.exec(call.user)![1];
      const todoHandle = /(r\d) todo 给小林发修订报价/u.exec(call.user)![1];
      return json({ parts: [
        part({ dataSources: ["orbit_records"], deliverable: "summary", localId: "p1", objectClues: [{ entity: "memo", referenceId: closed, text: "@客户笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: "总结一下 @客户笔记" }),
        part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "todo", referenceId: todoHandle, text: "@给小林发修订报价" }], requiredCapabilities: ["todo.read"], sourceQuote: "@给小林发修订报价 计划哪天做" }),
      ], plainChat: false });
    },
    (call) => {
      assert.doesNotMatch(call.user, /降价/u);
      const handle = /(s\d+) — to-do/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [3], sourceRef: handle }], partId: "p2", text: "计划在 11 月 18 日（周三）。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  kit.deps.authorizeReferences = async (actorId, references) => {
    const { authorizeReferences } = await import("../../features/agent-v1/references/authorize");
    const authorized = await authorizeReferences(records.reader, records.scope(actorId), references);
    return authorized.map((item) => ({ id: item.id, name: item.name ?? "", type: item.type, ...(item.accessible ? {} : { accessible: false }) }));
  };
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: "note:mb1", type: "memo" }, { id: "task:t42", type: "todo" }] }));
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.status, item.gaps]), [["p1", "unfinished", ["unreadable"]], ["p2", "answered", undefined]]);
  assert.match(result.text, /「@客户笔记」打不开/u);
  assert.match(result.text, /请重新选择/u);
  assert.match(result.text, /11 月 18 日/u);
  assert.deepEqual(result.sourceRefs, ["todo:task:t42"]);
  assert.equal(records.source.reads.includes("note:mb1"), false, "the other account's note is never read");
});

test("a person who exists only in another account: not found here, nothing of the other account is read", async () => {
  const records = recordAccessOf(worldOfActor());
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林诚" }], requiredCapabilities: ["memo.read"], sourceQuote: "小林诚上次跟我提的降价要求是什么" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input("小林诚上次跟我提的降价要求是什么？"));
  assert.match(result.text, /我不确定你说的是哪一位联系人/u, "AG06 repair 1 (AE-XL-010): which person is not known; never that they do not exist");
  assert.doesNotMatch(result.text, /小林诚/u, "the name is not said back (it may be another account's)");
  assert.equal(model.calls.length, 1);
  for (const id of ["contact:cb1", "note:mb1"]) assert.equal(records.source.reads.includes(id), false, id);
  assert.doesNotMatch(result.text, /15%|年底/u);
  void todo;
});
