import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { rankDomainOf } from "../../features/agent-v1/graph/nodes/functions";
import { askJudgment, newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { basisTokens, CONVERSATION_CANDIDATE_LIMIT, funnel, needsUnderstanding, SCHEDULED_CANDIDATE_LIMIT, type FunnelCandidate } from "../../features/agent-v1/judgment/funnel";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { access, graded, judgeStub, score, TEST_THRESHOLDS } from "./judgment-kit";
import { contact, memo, platformEvent } from "./read-kit";

/**
 * agent-design AG08-1, AG08-2, AG08-4: 先过滤再判断 — hard conditions, rule ranking, the cut (50 / 30), one
 * judgment request for every candidate kept, the coverage; a field order makes no judgment call; a judgment that
 * is not there leaves the rule order, said as such. Model and judgment are stubs.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";
const INDUSTRIES = ["软件", "贸易", "摄影", "出版", "设计", "物流", "金融", "教育"];

function candidates(count: number): (FunnelCandidate & { day: string })[] {
  return Array.from({ length: count }, (_value, index) => ({ day: `2026-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`, id: `c${String(index).padStart(4, "0")}`, words: `联系人${index} 行业 ${INDUSTRIES[index % 8]} ${index % 5 === 0 ? "独立书店" : ""}` }));
}

test("AG08-1 2008 candidates: at most 50 go to one judgment request; the coverage says how many, after hard conditions, judged, cut", async () => {
  const list = candidates(2008);
  const sent: number[] = [];
  const result = await funnel({
    basis: "聊独立出版",
    candidates: list,
    count: 3,
    judge: async (kept) => {
      sent.push(kept.length);
      const stub = judgeStub(() => score(2, 0.9));
      return askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "zh", purpose: "rank" });
    },
    mode: "conversation",
  });
  assert.equal(CONVERSATION_CANDIDATE_LIMIT, 50);
  assert.deepEqual(sent, [50], "one judgment request, 50 candidates");
  assert.deepEqual(result.coverage, { afterHardConditions: 2008, judged: 50, total: 2008, truncated: 1958 });
  assert.equal(result.ordered.length, 3);
  assert.equal(result.matched, true);
  // Rule ranking first: the ones whose words share "出版" are the ones judged.
  assert.ok(result.ordered.every((item) => item.candidate.words.includes("出版")));
});

test("AG08-1 a scheduled period sends at most 30; hard conditions apply before the cut", async () => {
  assert.equal(SCHEDULED_CANDIDATE_LIMIT, 30);
  const sent: number[] = [];
  const result = await funnel({
    basis: "独立出版",
    candidates: candidates(400),
    count: 3,
    hard: (candidate) => candidate.words.includes("出版"),
    judge: async (kept) => {
      sent.push(kept.length);
      return askJudgment(access(judgeStub(() => score(1, 0.9)).fetchImplementation), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "zh", purpose: "rank" });
    },
    mode: "scheduled",
  });
  assert.deepEqual(sent, [30]);
  assert.deepEqual(result.coverage, { afterHardConditions: 50, judged: 30, total: 400, truncated: 20 });
});

test("AG08-2 ordering only by a date: no judgment at all; the field order is delivered", async () => {
  let judged = 0;
  const result = await funnel({
    basis: null,
    candidates: candidates(2008),
    count: 10,
    judge: async () => {
      judged += 1;
      throw new Error("no judgment for a date order");
    },
    mode: "conversation",
    order: { direction: "asc", value: (candidate) => candidate.day },
  });
  assert.equal(judged, 0);
  assert.equal(result.semantic, false);
  assert.deepEqual(result.ordered.map((item) => item.candidate.day), [...result.ordered.map((item) => item.candidate.day)].sort());
  assert.equal(result.ordered[0].candidate.day, "2026-01-01");
  // A basis of time words only is not a topic either.
  assert.equal(needsUnderstanding("最久没联系"), false);
  assert.equal(needsUnderstanding("the longest without talking, oldest first"), false);
  assert.equal(needsUnderstanding("開始時間が早い順"), false);
  assert.equal(needsUnderstanding("聊柴烧器物"), true);
  assert.deepEqual(basisTokens("聊柴烧器物").pieces, ["柴烧", "烧器", "器物"], "Chinese is read in two-character pieces, never one sentence-long token");
});

test("AG08-4 the judgment times out: the rule order is delivered, marked as not topic-matched", async () => {
  const stub = judgeStub(() => score(2, 0.9), { hang: true });
  const result = await funnel({
    basis: "认识独立创作者",
    candidates: [{ id: "e101", words: "东京街头摄影展 摄影" }, { id: "e105", words: "独立出版市集 出版" }, { id: "e104", words: "设计师之夜 设计" }],
    count: 2,
    judge: async (kept) => askJudgment(access(stub.fetchImplementation, { timeoutMs: 30 }), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "zh", purpose: "rank" }),
    mode: "conversation",
  });
  assert.equal(result.matched, false);
  assert.equal(result.unmatchedReason, "timeout");
  assert.equal(result.ordered[0].candidate.id, "e105", "rule order: the one sharing 独立 first");
  assert.equal(result.ordered.length, 2);
});

test("AG08-1 names the judgment returns that were not given are rejected and never listed", async () => {
  const stub = judgeStub(() => score(0, 0.9), { extra: { match_level__E999: score(2, 0.99) } });
  const result = await funnel({
    basis: "摄影",
    candidates: [{ id: "e101", words: "摄影展" }, { id: "e102", words: "街拍 摄影" }],
    count: 3,
    judge: async (kept) => askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "zh", purpose: "rank" }),
    mode: "conversation",
  });
  assert.deepEqual(result.ordered.map((item) => item.candidate.id).sort(), ["e101", "e102"]);
});

test("AG08-1 a graded answer split between partial and match is at least partial; within a level the model's expected level orders", async () => {
  // AE-SCL-014 dev run 1: "Process Integration Lead, Power Devices" was partial 0.46 / match 0.43 and fell to
  // insufficient when only the most likely level was read; an HR partner rated partial 0.63 came before it.
  // Rule order gives the keys: rajesh c1 (4 words shared), aaron c2 (3), daniel c3 (2).
  const answers: Record<string, ReturnType<typeof graded>> = { match_level__c1: graded(0.11, 0.46, 0.43), match_level__c2: graded(0.02, 0.15, 0.83), match_level__c3: graded(0.2, 0.63, 0.17) };
  const stub = judgeStub((id) => answers[id] ?? graded(0.9, 0.05, 0.05));
  const result = await funnel({
    basis: "a power-semiconductor packaging process lead role",
    candidates: [{ id: "aaron", words: "Packaging Process Manager semiconductor" }, { id: "rajesh", words: "Process Integration Lead, Power Devices semiconductor" }, { id: "daniel", words: "HR Business Partner power semiconductor" }],
    count: 2,
    judge: async (kept) => askJudgment(access(stub.fetchImplementation, { thresholds: { ...TEST_THRESHOLDS, cells: { "match.level": { en: 0.542 } } } }), newJudgmentBudget(), { input: ["x"], items: kept.map(({ key }) => ({ key, question: "match.level", subject: key })), language: "en", purpose: "rank" }),
    mode: "conversation",
  });
  assert.deepEqual(result.ordered.map((item) => [item.candidate.id, item.level]), [["aaron", "match"], ["rajesh", "partial"]]);
});

test("AG08-1 which parts the functions node ranks: contacts or events as a set, never a named person (stab2: 'my contacts based in Singapore')", () => {
  const message = "From my contacts based in Singapore, pick the three best fits for a power-semiconductor packaging process lead role. 帮我挑小林的三篇笔记。";
  const at = (words: string): [number, number] => [message.indexOf(words), message.indexOf(words) + words.length];
  const rankPart = (refs: { entity: string; quote: [number, number]; recordId: string | null }[], capabilities = ["contact.read", "fn.rank"]) => ({ capabilities, plan: {}, quote: [0, message.length], refs, route: "read" }) as never;
  assert.equal(rankDomainOf(rankPart([{ entity: "contact", quote: at("my contacts based in Singapore"), recordId: null }]), message), "contact");
  assert.equal(rankDomainOf(rankPart([{ entity: "contact", quote: at("小林"), recordId: null }]), message), null, "a named person is not a set to rank");
  assert.equal(rankDomainOf(rankPart([{ entity: "contact", quote: at("小林"), recordId: null }], ["memo.read", "fn.rank"]), message), null, "ranking notes is AG10's");
});

/* ── through the graph ─────────────────────────────────────────────── */

function contactsWorld(count: number) {
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const industry = INDUSTRIES[index % 8];
    records.push(contact(ACTOR, `contact:g${index}`, `生成联系人${index}`, { customTags: [`行业:${industry}`], location: ["东京", "大阪", "新加坡"][index % 3], organization: `${industry}公司${index}`, primaryEmail: `g${index}@secret.example.test`, primaryPhone: "+81-90-1234-5678", role: "经理" }));
    records.push(memo(ACTOR, `note:g${index}`, "通了电话。", `2026-0${(index % 9) + 1}-10T03:00:00.000Z`, [`contact:g${index}`], { interaction: { actualContactIds: [`contact:g${index}`], channel: "phone", direction: "outgoing", occurredOn: `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`, precision: "day" } }));
  }
  return { events: [], records };
}

const understandOf = (quote: string, extra: Record<string, unknown>) => json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "contact", text: "联系人" }], requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: quote, ...extra })], plainChat: false });

test("AG08-1 graph: 2008 contacts, one main model call and one judgment request of at most 50; the answer gives the coverage", async () => {
  const message = "从我的联系人里挑三个最适合聊独立出版的人。";
  const model = deepseekStub([understandOf(message, { rank: { basis: "聊独立出版", count: 3 } })]);
  const judge = judgeStub(() => score(1, 0.8));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(contactsWorld(2008)) });
  kit.deps.judgment = access(judge.fetchImplementation);
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.equal(model.calls.length, 1, "the main model is called once, whatever the number of candidates");
    assert.equal(judge.calls.length, 1, "one judgment request");
    assert.ok(Object.keys(judge.calls[0].body.questions).length <= 50);
    assert.doesNotMatch(JSON.stringify(judge.calls[0].body), /secret\.example|1234-5678/u, "no e-mail or phone goes to the judgment");
    assert.match(result.text, /细看了50位，还有\d+位没有细看/u);
    assert.match(result.text, /不代表全部联系人里最合适/u);
    assert.equal(result.sourceRefs.length, 3, "three listed, cited in order");
    const decided = trace.events.find((event) => event.type === "judgment.decided")!;
    assert.deepEqual(decided.coverage, { afterHardConditions: 2008, judged: 50, total: 2008, truncated: 1958 });
  } finally {
    trace.restore();
  }
});

test("AG08-1 graph: the place named outside the basis is a hard condition before the judgment", async () => {
  const message = "东京做零售的联系人里，挑三个最适合聊柴烧器物的人。";
  const world = contactsWorld(60);
  world.records.push(contact(ACTOR, "contact:rc13", "石川結衣", { customTags: ["行业:零售", "柴烧"], location: "东京", notes: "2026 年 4 月在店里办过柴烧器物展", organization: "器と暮らし" }));
  world.records.push(contact(ACTOR, "contact:rc01", "松本彩", { customTags: ["行业:陶艺", "柴烧"], location: "栃木", organization: "青岚窑" }));
  const model = deepseekStub([understandOf(message, { rank: { basis: "聊柴烧器物", count: 3, within: "东京做零售的" } })]);
  const judge = judgeStub(() => score(2, 0.9));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world) });
  kit.deps.judgment = access(judge.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(Object.keys(judge.calls[0].body.questions).length, 1, "only the one in Tokyo doing retail is judged");
  assert.deepEqual(result.sourceRefs, ["contact:contact:rc13"]);
  assert.match(result.text, /东京做零售的联系人里/u);
});

test("AG08-2 graph: events by start time — no judgment request, the order is the field's", async () => {
  const message = "公開されているイベントを、開始時間が早い順に並べてください。";
  const events = [platformEvent("event:e102", "街拍工作坊", "2026-11-22T00:30:00.000Z", "下北泽"), platformEvent("event:e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内"), platformEvent("event:e101", "东京街头摄影展", "2026-11-21T01:00:00.000Z", "涩谷"), platformEvent("event:draft", "草稿", "2026-11-20T01:00:00.000Z", "未定", { lifecycleState: "draft" as never })];
  const model = deepseekStub([json({ language: "ja", parts: [part({ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "event", text: "公開されているイベント" }], requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message, rank: { direction: "asc", orderBy: "startsAt" } })], plainChat: false })]);
  const judge = judgeStub(() => score(2, 0.9));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf({ events, records: [] }) });
  kit.deps.judgment = access(judge.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.equal(judge.calls.length, 0);
  assert.deepEqual(result.sourceRefs, ["event:event:e103", "event:event:e101", "event:event:e102"]);
  assert.match(result.text, /開始時間の早い順/u);
});

test("AG08-4 graph: the judgment does not answer — rule order, and the answer says no topic matching was done", async () => {
  const message = "11 月 21 日和 22 日的活动里，挑两场最适合认识独立创作者的。";
  const events = [platformEvent("event:e101", "东京街头摄影展", "2026-11-21T01:00:00.000Z", "涩谷", { description: "主题：摄影" }), platformEvent("event:e105", "独立出版市集", "2026-11-22T01:00:00.000Z", "神保町", { description: "主题：出版" }), platformEvent("event:e103", "SaaS 定价研讨会", "2026-11-19T10:00:00.000Z", "丸之内")];
  const model = deepseekStub([json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "event", text: "活动" }], readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message, rank: { basis: "认识独立创作者", count: 2 } })], plainChat: false })]);
  const judge = judgeStub(() => score(2, 0.9), { hang: true });
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf({ events, records: [] }) });
  kit.deps.judgment = access(judge.fetchImplementation, { timeoutMs: 30 });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(result.status, "completed");
  assert.deepEqual(result.sourceRefs, ["event:event:e105", "event:event:e101"], "inside the dates, rule order");
  assert.match(result.text, /这次没有做主题匹配/u);
  assert.match(result.text, /这不代表没有合适的/u);
});
