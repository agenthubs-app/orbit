import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { askJudgment, newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, judgeStub } from "./judgment-kit";
import { contact, memo, platformEvent, smallWorld } from "./read-kit";

/**
 * agent-design AG08 run-02 (coordinator decision 4): every JDG gate case's judgment path, and AE-SCL-013/014's, with
 * the judgment forced unavailable (a request that never answers, cut at the timeout). The deterministic fallback has
 * to give the case's hard-checked outcome by itself, so a slow Gemini answer can never flip a gate case. The first
 * layer and the second layer are stubs with the outputs the gate runs recorded; no real host is called.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";
const unavailable = () => {
  const stub = judgeStub(() => undefined, { hang: true });
  return { access: access(stub.fetchImplementation, { timeoutMs: 30 }), stub };
};
const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};
const rankPart = (quote: string, capabilities: string[], extra: Record<string, unknown>) => part({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: [...capabilities, "fn.rank"], sourceQuote: quote, ...extra });

async function run(message: string, understood: Record<string, unknown>, options: { records?: ReturnType<typeof recordAccessOf>; locale?: string; language?: string; references?: { id: string; name: string; type: string }[]; settings?: Record<string, unknown>; propose?: () => string; cards?: AgentCardAccess } = {}) {
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p1", text: "好的。" }] }),
    ...(options.propose ? { propose: options.propose } : {}),
    understand: () => json({ language: options.language ?? "zh", parts: [understood], plainChat: false }),
  }));
  const judgment = unavailable();
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: options.records ?? recordAccessOf({ events: [], records: [] }), ...(options.references ? { references: options.references } : {}) });
  kit.deps.judgment = judgment.access;
  if (options.cards) kit.deps.cards = options.cards;
  const trace = captureTrace();
  Object.assign(trace.settings, options.settings ?? {});
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: options.locale ?? "zh", ...(options.references ? { references: options.references.map((item) => ({ id: item.id, type: item.type as never })) } : {}) }));
    const decided = trace.events.filter((event) => event.type === "judgment.decided");
    return { decided, judgeCalls: judgment.stub.calls, modelCalls: model.calls, result };
  } finally {
    trace.restore();
  }
}

const sentCount = (decided: Record<string, unknown>[], id: string) => decided.filter((event) => event.sent === true && (event.sentQuestionIds as string[]).includes(id)).length;
const fallbacks = (decided: Record<string, unknown>[], id: string) => decided.reduce((sum, event) => sum + Number((event.fallbacks as Record<string, number>)[id] ?? 0), 0);
const own = (records: ReturnType<typeof smallWorld>) => {
  for (const record of records.records) if (record.userId === "user:a") record.userId = ACTOR;
  return records;
};

test("low_confidence answers (confidence 0, as the eval preload simulates them) fall to the conservative result for every question type", async () => {
  const stub = judgeStub((id) => (id.startsWith("intent") ? { confidence: 0, noul: 0.5, type: "noul" } : id.startsWith("duplicate") ? { choice: "different", confidence: 0, probabilities: { different: 0, same: 0, unsure: 0 }, type: "choice" } : { confidence: 0, probabilities: { "0": 0, "1": 0, "2": 0.000001 }, score: 2, type: "score" }));
  const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [{ key: "m", question: "intent.explicitWrite", subject: "m" }, { key: "d1", question: "duplicate.same", subject: "d1" }, { key: "c1", question: "match.level", subject: "c1" }], language: "zh", purpose: "rank" });
  for (const key of ["m", "d1", "c1"]) assert.deepEqual({ fallback: outcome.verdicts.get(key)!.fallback, reason: outcome.verdicts.get(key)!.reason }, { fallback: true, reason: "below_threshold" }, key);
});

test("AE-JDG-001, judgment unavailable: one main model call, one request of at most 50 candidates, three listed, the coverage said", async () => {
  const world = own(smallWorld());
  for (let index = 0; index < 120; index += 1) world.records.push(contact(ACTOR, `contact:g${index}`, `生成${index}`, { customTags: [`行业:${["出版", "软件", "物流"][index % 3]}`], location: "东京", organization: `${["远山书房", "北辰软件", "远帆物流"][index % 3]}${index}`, role: "编辑" }));
  const message = "从我的联系人里挑三个最适合聊独立出版的人。";
  const { decided, modelCalls, result } = await run(message, rankPart(message, ["contact.read"], { objectClues: [{ entity: "contact", text: "我的联系人" }], rank: { basis: "聊独立出版", count: 3 } }), { records: recordAccessOf(world) });
  assert.equal(modelCalls.length, 1);
  assert.equal(sentCount(decided, "match.level"), 1, "asked once (it timed out)");
  assert.ok(decided.every((event) => Number(event.candidates) <= 50));
  assert.equal(result.sourceRefs.length, 3);
  assert.equal(result.status, "completed");
  assert.match(result.text, /共122位/u, "how many there were");
  assert.match(result.text, /122位都没有细看/u, "how many were not looked at closely");
  // AG10 opening item (AG08 交接 1): what was asked for is said, never "picked by the topic" when no match was done.
  assert.match(result.text, /你要的是和「聊独立出版」相关的，但这次没有做主题匹配/u);
  assert.match(result.text, /这次没有做主题匹配/u);
});

test("AE-JDG-002 and AE-JDG-003, judgment unavailable: a field order never asks", async () => {
  const world = own(smallWorld());
  world.records.push(memo(ACTOR, "note:i1", "通了电话。", "2026-03-01T03:00:00.000Z", ["contact:c30"], { interaction: { actualContactIds: ["contact:c30"], channel: "phone", direction: "outgoing", occurredOn: "2026-03-01", precision: "day" } }));
  const message = "Of the contacts I have at least one recorded interaction with, list the ten I have gone the longest without talking to, oldest first.";
  const contacts = await run(message, rankPart(message, ["contact.read"], { deliverable: "list", objectClues: [{ entity: "contact", text: "the contacts" }], rank: { count: 10, direction: "asc", orderBy: "lastInteraction" } }), { language: "en", locale: "en", records: recordAccessOf(world) });
  assert.equal(contacts.judgeCalls.length, 0);
  assert.deepEqual(contacts.result.sourceRefs, ["contact:contact:c30"], "only contacts with a recorded interaction");
  const events = [platformEvent("event:e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内"), platformEvent("event:e101", "东京街头摄影展", "2026-11-21T01:00:00.000Z", "涩谷")];
  const ja = "公開されているイベントを、開始時間が早い順に並べてください。";
  const byStart = await run(ja, rankPart(ja, ["event.read"], { objectClues: [{ entity: "event", text: "公開されているイベント" }], rank: { direction: "asc", orderBy: "startsAt" } }), { language: "ja", locale: "ja", records: recordAccessOf({ events, records: [] }) });
  assert.equal(byStart.judgeCalls.length, 0);
  assert.deepEqual(byStart.result.sourceRefs, ["event:event:e103", "event:event:e101"]);
});

const BASE_EVENTS = [
  platformEvent("event:e101", "东京街头摄影展", "2026-11-21T01:00:00.000Z", "涩谷", { description: "主题：摄影" }),
  platformEvent("event:e102", "街拍工作坊", "2026-11-22T00:30:00.000Z", "下北泽", { description: "主题：摄影、街拍" }),
  platformEvent("event:e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内", { description: "主题：定价、SaaS" }),
  platformEvent("event:e104", "设计师之夜", "2026-11-21T10:00:00.000Z", "中目黑", { description: "主题：设计" }),
  platformEvent("event:e105", "独立出版市集", "2026-11-22T01:00:00.000Z", "神保町", { description: "主题：出版" }),
  platformEvent("event:e107", "东京摄影展·冬季场", "2026-11-29T01:00:00.000Z", "上野", { description: "主题：摄影" }),
];

test("AE-JDG-004, judgment unavailable: two events inside the dates, rule order, completed, said to be without topic matching", async () => {
  const message = "11 月 21 日和 22 日的活动里，挑两场最适合认识独立创作者的。";
  const { decided, result } = await run(message, rankPart(message, ["event.read"], { objectClues: [{ entity: "event", text: "活动" }], readFilter: { from: "2026-11-21", to: "2026-11-22" }, rank: { basis: "认识独立创作者", count: 2 } }), { records: recordAccessOf({ events: BASE_EVENTS, records: [] }) });
  assert.equal(sentCount(decided, "match.level"), 1);
  assert.ok(fallbacks(decided, "match.level") >= 1);
  assert.equal(result.status, "completed");
  assert.equal(result.sourceRefs.length, 2);
  for (const ref of result.sourceRefs) assert.ok(["event:event:e101", "event:event:e102", "event:event:e104", "event:event:e105"].includes(ref), ref);
  assert.match(result.text, /这次没有做主题匹配/u);
});

test("AE-JDG-005, match.level not calibrated: not asked; three events by the note's words; the note named first", async () => {
  const world = own(smallWorld());
  world.records.push(memo(ACTOR, "note:m36", "最近想多看摄影展和街拍活动，也想认识做独立出版的人。", "2026-11-01T12:00:00.000Z", [], { title: "兴趣笔记" }));
  const message = "11 月 30 日之前的活动里挑三场，最好跟 @兴趣笔记 的主题有关。";
  const { decided, result } = await run(message, rankPart(message, ["event.read", "memo.read"], { objectClues: [{ entity: "event", text: "活动" }, { entity: "memo", referenceId: "r1", text: "兴趣笔记" }], readFilter: { to: "2026-11-30" }, rank: { basis: "跟 @兴趣笔记 的主题有关", count: 3 } }), {
    records: recordAccessOf({ events: BASE_EVENTS, records: world.records }),
    references: [{ id: "note:m36", name: "兴趣笔记", type: "memo" }],
    settings: { judgment_uncalibrated: ["match.level"] },
  });
  assert.equal(sentCount(decided, "match.level"), 0);
  // AG20b (TRIAGE R19): the note the ranking went by is among the openable sources, beside the three events.
  assert.equal(result.sourceRefs.length, 4);
  assert.ok(result.sourceRefs.includes("memo:note:m36"));
  for (const ref of result.sourceRefs.filter((item) => item.startsWith("event:"))) assert.ok(["event:event:e101", "event:event:e102", "event:event:e105", "event:event:e107"].includes(ref), ref);
  assert.match(result.text, /^依据是你的笔记「兴趣笔记」的主题/u);
});

test("AE-JDG-006 and AE-JDG-007, judgment unavailable: asked, conservative, no card, one registered entry", async () => {
  const frozen: unknown[] = [];
  const cards: AgentCardAccess = { async freeze(input) { frozen.push(input); return null; } };
  const call = await run("小林今天来电话了。", part({ deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "小林今天来电话了。" }), { cards, records: recordAccessOf(own(smallWorld())) });
  const hypothesis = "要是把给小林发修订报价那条待办改到周五，会不会来不及？";
  const moved = await run(hypothesis, part({ constraints: ["要是"], deliverable: "change", objectClues: [{ entity: "todo", text: "给小林发修订报价那条待办" }], requiredCapabilities: ["memo.create"], sourceQuote: hypothesis }), { cards, records: recordAccessOf(own(smallWorld())) });
  for (const [name, item] of [["JDG-006", call], ["JDG-007", moved]] as const) {
    assert.equal(sentCount(item.decided, "intent.explicitWrite"), 1, `${name} asked`);
    assert.equal(fallbacks(item.decided, "intent.explicitWrite"), 1, `${name} conservative`);
    assert.equal(item.result.actionPreview, null);
    assert.equal(item.result.status, "completed");
    const entries = item.result.clarifications.filter((set) => set.kind === "entry");
    assert.equal(entries.length, 1, name);
    assert.equal(entries[0].options.length, 1, name);
  }
  assert.equal(frozen.length, 0);
  assert.match(call.result.clarifications[0].options[0].label, /记到小林的往来里/u);
  assert.match(moved.result.clarifications[0].options[0].label, /改到周五/u);
});

test("AE-JDG-008, judgment unavailable: asked, conservative, one question with 'not the same, add it anyway', no card", async () => {
  const world = own(smallWorld());
  world.records.push(memo(ACTOR, "note:m41", "早上和小林在车站碰到，约了下周对报价。", "2026-11-15T00:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-15", precision: "day" } }));
  const frozen: unknown[] = [];
  const message = "记一下：今天早上在车站碰到了小林。";
  const { decided, result } = await run(message, part({ deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: message }), {
    cards: { async freeze(input) { frozen.push(input); return null; } },
    propose: () => json({ operations: [{ channel: "meeting", dateText: "今天", dependsOn: [], direction: "mutual", entity: "memo", fields: [{ name: "body", valueText: "今天早上在车站碰到了小林" }], localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
    records: recordAccessOf(world),
  });
  assert.equal(sentCount(decided, "duplicate.same"), 1);
  assert.equal(fallbacks(decided, "duplicate.same"), 1);
  assert.equal(frozen.length, 0);
  assert.equal(result.status, "waiting_user");
  assert.equal(result.partResults[0].status, "awaiting_clarification");
  assert.equal(result.clarifications.filter((set) => set.kind === "question").length, 1);
  assert.ok(result.clarifications[0].options.some((option) => option.label === "不是同一次，仍然新增"));
});

test("AE-SCL-013, judgment unavailable: Tokyo retail only (22 at most sent), the three kiln-ware shops by the rule order", async () => {
  const records = [];
  for (let index = 0; index < 19; index += 1) records.push(contact(ACTOR, `contact:r${index}`, `零售${index}`, { customTags: ["行业:零售"], location: "东京", organization: `星野商事${index}`, role: "采购" }));
  for (let index = 0; index < 40; index += 1) records.push(contact(ACTOR, `contact:o${index}`, `其他${index}`, { customTags: ["行业:软件"], location: "大阪", organization: `北辰${index}`, role: "工程师" }));
  records.push(contact(ACTOR, "contact:rc13", "石川結衣", { customTags: ["行业:零售", "柴烧", "器物店"], location: "东京", notes: "2026 年 4 月在店里办过柴烧器物展", organization: "器と暮らし 谷中店", role: "店主" }));
  records.push(contact(ACTOR, "contact:rc14", "大野誠", { customTags: ["行业:零售", "柴烧"], location: "东京", notes: "去年进过青岚窑的柴烧杯，卖得不错", organization: "日々の器 吉祥寺", role: "买手" }));
  records.push(contact(ACTOR, "contact:rc15", "西村美帆", { customTags: ["行业:零售", "柴烧", "茶道具"], location: "东京", notes: "店里常设柴烧茶道具专柜", organization: "茶と器 つむぎ", role: "店长" }));
  records.push(contact(ACTOR, "contact:rc01", "松本彩", { customTags: ["行业:陶艺", "柴烧", "供应方"], location: "栃木", notes: "益子的柴窑", organization: "青岚窑", role: "窑主" }));
  const message = "东京做零售的联系人里，挑三个最适合聊柴烧器物的人。";
  const { decided, result } = await run(message, rankPart(message, ["contact.read"], { objectClues: [{ entity: "contact", text: "东京做零售的联系人" }], rank: { basis: "聊柴烧器物", count: 3, within: "东京做零售的" } }), { records: recordAccessOf({ events: [], records }) });
  assert.ok(decided.every((event) => Number(event.candidates) <= 22));
  assert.deepEqual([...result.sourceRefs].sort(), ["contact:contact:rc13", "contact:contact:rc14", "contact:contact:rc15"]);
  assert.match(result.text, /东京做零售的联系人里/u);
});

test("AE-SCL-014, judgment unavailable (the run-01 gate case): the HR partner whose company is 'Meridian Power Devices' is not in the three", async () => {
  const sg = (id: string, name: string, org: string, role: string, industry: string) => contact(ACTOR, `contact:${id}`, name, { customTags: [`行业:${industry}`], location: "新加坡", organization: org, region: { city: "Singapore", countryCode: "SG" }, role });
  const records = [
    sg("lc17", "Aaron Tan", "Meridian Power Devices", "Packaging Process Manager", "半导体"),
    sg("lc18", "Mei Ling Goh", "Straits Silicon", "Senior Packaging Engineer, SiC Modules", "半导体"),
    sg("lc19", "Rajesh Iyer", "Meridian Power Devices", "Process Integration Lead, Power Devices", "半导体"),
    sg("lc20", "Aaron Tang", "Lioncity Freight", "Sales Director", "物流"),
    sg("lc21", "Grace Lim", "Straits Silicon", "Regional Sales Director", "半导体"),
    sg("aa22", "Daniel Wee", "Meridian Power Devices", "HR Business Partner", "半导体"),
    ...Array.from({ length: 60 }, (_value, index) => sg(`g${index}`, `Person ${index}`, `Lion Gate ${index}`, "Account Manager", "贸易")),
    contact(ACTOR, "contact:watanabe", "渡辺修", { customTags: ["行业:半导体"], location: "茨城", organization: "常陸パワー", role: "パワー半導体パッケージ工程リーダー" }),
  ];
  const message = "From my contacts based in Singapore, pick the three best fits for a power-semiconductor packaging process lead role.";
  const { decided, result } = await run(message, rankPart(message, ["contact.read"], { objectClues: [{ entity: "contact", text: "my contacts based in Singapore" }], rank: { basis: "a power-semiconductor packaging process lead role", count: 3, within: "based in Singapore" } }), { language: "en", locale: "en", records: recordAccessOf({ events: [], records }) });
  assert.equal(sentCount(decided, "match.level"), 1, "asked once, and it timed out");
  assert.ok(decided.every((event) => Number(event.candidates) <= 50));
  assert.deepEqual([...result.sourceRefs].sort(), ["contact:contact:lc17", "contact:contact:lc18", "contact:contact:lc19"]);
  assert.match(result.text, /Meridian Power Devices/u, "Aaron Tan is told apart by his company");
  assert.match(result.text, /none of the 66 contacts was looked at closely/u);
});
