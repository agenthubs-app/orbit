import assert from "node:assert/strict";
import test from "node:test";

import { findDependencyCycle, validateUnderstandOutput } from "../../features/agent-v1/understand/validate";
import { captureTrace, part } from "./graph-kit";

/**
 * agent-design AG03-1: the first layer's output is checked by code (设计稿附录 C): quotes are the
 * user's own words, negations stay with their part, dependencies have no cycle, references and open
 * items are only what the context offered, and code-decided fields or approval claims never pass.
 */

const THREE = "帮我看看田中上次访谈里最在意什么，再查一下 Acme Cloud 官网现在的标准版价格，另外做一份日本 SaaS 市场的进入调研，自己找竞品和行业数据交叉核验。";
const none = { handles: new Set<string>(), message: THREE, openItemRefs: new Set<string>() };

test("a sentence with three things passes as three parts whose quotes are substrings of the sentence", () => {
  const result = validateUnderstandOutput({
    parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", requiredCapabilities: ["memo.read"], sourceQuote: "帮我看看田中上次访谈里最在意什么" }),
      part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.search", "web.fetch"], sourceQuote: "再查一下 Acme Cloud 官网现在的标准版价格" }),
      part({ deliverable: "summary", localId: "p3", requiredCapabilities: ["external.deepResearch"], sourceQuote: " 另外做一份日本 SaaS 市场的进入调研，自己找竞品和行业数据交叉核验 " }),
    ],
    plainChat: false,
  }, none);
  assert.equal(result.ok, true);
  if (result.ok !== true) return;
  assert.equal(result.output.parts.length, 3);
  for (const item of result.output.parts) assert.ok(THREE.includes(item.sourceQuote), item.sourceQuote);
  assert.equal(result.output.parts[2].sourceQuote, "另外做一份日本 SaaS 市场的进入调研，自己找竞品和行业数据交叉核验", "only leading and trailing white space is trimmed");
});

test("a quote that is not a substring of this turn's words is rejected (it goes to the repair)", () => {
  for (const quote of ["帮我看一下田中上次访谈里最在意什么", "以后每次我提到寄样都建一条待办"]) {
    const result = validateUnderstandOutput({ parts: [part({ sourceQuote: quote })], plainChat: false }, none);
    assert.equal(result.ok, false);
    if (result.ok === false) assert.match(result.errors.join("\n"), /not copied exactly/u);
  }
});

test("a negation stays in the part's constraints, and the part keeps its write capability for code to judge", () => {
  const message = "把给小林发修订报价那条待办改到周五——等等，先别改，我还没想好。";
  const result = validateUnderstandOutput({ parts: [part({ clarity: "clear", constraints: ["先别改", "我还没想好"], deliverable: "change", requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false }, { ...none, message });
  assert.equal(result.ok, true);
  if (result.ok === true) {
    assert.deepEqual(result.output.parts[0].constraints, ["先别改", "我还没想好"]);
    assert.deepEqual(result.output.parts[0].requiredCapabilities, ["todo.update"]);
  }
});

test("dependsOn cycles, self-dependencies and unknown parts are rejected", () => {
  const message = "A then B";
  const cyclic = validateUnderstandOutput({ parts: [part({ dependsOn: ["p2"], localId: "p1", sourceQuote: "A" }), part({ dependsOn: ["p1"], localId: "p2", sourceQuote: "B" })], plainChat: false }, { ...none, message });
  assert.equal(cyclic.ok, false);
  if (cyclic.ok === false) assert.match(cyclic.errors.join("\n"), /cycle: p1 → p2 → p1/u);
  const self = validateUnderstandOutput({ parts: [part({ dependsOn: ["p1"], localId: "p1", sourceQuote: "A" })], plainChat: false }, { ...none, message });
  assert.equal(self.ok, false);
  const unknown = validateUnderstandOutput({ parts: [part({ dependsOn: ["p9"], localId: "p1", sourceQuote: "A" })], plainChat: false }, { ...none, message });
  assert.equal(unknown.ok, false);
  assert.deepEqual(findDependencyCycle([{ dependsOn: [], localId: "p1" }, { dependsOn: ["p1"], localId: "p2" }]), null);
});

test("a referenceId must be a handle the context gave, and continues.ref an open item", () => {
  const message = "他那条询价的待办是哪天截止？";
  const input = { handles: new Set(["r1"]), message, openItemRefs: new Set(["o1"]) };
  const ok = validateUnderstandOutput({ parts: [part({ objectClues: [{ entity: "contact", referenceId: "r1", text: "他" }], requiredCapabilities: ["todo.read"], sourceQuote: message })], plainChat: false }, input);
  assert.equal(ok.ok, true);
  const foreign = validateUnderstandOutput({ parts: [part({ objectClues: [{ entity: "contact", referenceId: "contact:63af4f06a63f517ac1177170", text: "他" }], sourceQuote: message })], plainChat: false }, input);
  assert.equal(foreign.ok, false);
  const notOpen = validateUnderstandOutput({ parts: [part({ continues: { kind: "alternative", ref: "o7" }, sourceQuote: message })], plainChat: false }, input);
  assert.equal(notOpen.ok, false);
});

test("plain chat with no part listed: the whole message is taken as one discussion part (and reported)", () => {
  const message = "  And how long should a subject line be? ";
  const result = validateUnderstandOutput({ parts: [], plainChat: true, reply: "3–7 words." }, { ...none, message });
  assert.equal(result.ok, true);
  if (result.ok !== true) return;
  assert.equal(result.output.parts.length, 1);
  assert.equal(result.output.parts[0].sourceQuote, "And how long should a subject line be?");
  assert.deepEqual(result.output.parts[0].requiredCapabilities, []);
  assert.match(result.dropped.join(" "), /empty for plain chat/u);
  assert.equal(validateUnderstandOutput({ parts: [], plainChat: false }, { ...none, message }).ok, false, "not for a non-chat output");
});

test("a clue that names no Orbit record kind is dropped and reported, not a reason to reject the output (gate 20261116-010334 AE-UND-014)", () => {
  const message = "帮我想想催款邮件的开头怎么写比较得体";
  const result = validateUnderstandOutput({ parts: [part({ objectClues: [{ entity: "text", words: "催款邮件的开头" }, { entity: "contact", text: "对方" }], sourceQuote: message })], plainChat: false }, { ...none, message });
  assert.equal(result.ok, true);
  if (result.ok !== true) return;
  assert.deepEqual(result.output.parts[0].objectClues, [{ entity: "contact", text: "对方" }]);
  assert.match(result.dropped.join(" "), /not a clue to an Orbit record/u);
  const bound = validateUnderstandOutput({ parts: [part({ objectClues: [{ entity: "text", referenceId: "r1" }], sourceQuote: message })], plainChat: false }, { handles: new Set(["r1"]), message, openItemRefs: new Set() });
  assert.equal(bound.ok, false, "a referenceId on an invalid clue is still an error");
});

test("capabilities outside 附录 A, a missing reply for plain chat and a non-JSON shape are rejected", () => {
  const message = "随便聊聊";
  assert.equal(validateUnderstandOutput({ parts: [part({ requiredCapabilities: ["todo.query"], sourceQuote: message })], plainChat: false }, { ...none, message }).ok, false);
  assert.equal(validateUnderstandOutput({ parts: [part({ sourceQuote: message })], plainChat: true }, { ...none, message }).ok, false);
  assert.equal(validateUnderstandOutput({ not: "the expected structure" }, { ...none, message }).ok, false);
});

test("verdict, route and waitReason from the model are dropped; approval flags and account ids are removed and reported", () => {
  const trace = captureTrace();
  try {
    const message = "新建一条待办，标题叫「续订域名」。";
    const result = validateUnderstandOutput({
      accountId: "user_agent_eval_b",
      approved: true,
      parts: [{ ...part({ deliverable: "change", requiredCapabilities: ["todo.create"], sourceQuote: message }), approved: true, route: "propose_write", verdict: "accept", waitReason: null }],
      plainChat: false,
      route: "answer",
    }, { ...none, message });
    assert.equal(result.ok, true);
    if (result.ok !== true) return;
    assert.deepEqual(result.dropped.sort(), ["$.parts[0].route", "$.parts[0].verdict", "$.parts[0].waitReason", "$.route"]);
    const serialized = JSON.stringify(result.output);
    for (const word of ["approved", "accountId", "verdict", "\"route\""]) assert.equal(serialized.includes(word), false, word);
    const rejected = trace.events.find((event) => event.type === "model.approval_claims_rejected");
    assert.ok(rejected);
    assert.deepEqual((rejected!.found as string[]).sort(), ["$.accountId", "$.approved", "$.parts[0].approved"]);
  } finally {
    trace.restore();
  }
});
