import assert from "node:assert/strict";
import test from "node:test";

import { topicBasisClaimsIn, withoutTopicBasisClaims } from "../../features/agent-v1/answer/claims";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, judgeStub } from "./judgment-kit";
import { contact, smallWorld } from "./read-kit";

/**
 * agent-design AG10 opening item, a code rule:
 *   1. AG08 交接 1: with the ranking judgment unavailable, the answer said it picked "按「…」这个主题" and then that no
 *      topic matching was done. Code owns the ranking-basis sentence; a model sentence claiming a topic ranking that
 *      this turn's ranking record contradicts is not delivered (zh, ja, en).
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";
const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

test("topic-ranking claims are found in zh, ja and en; a sentence saying no topic matching was done is not one", () => {
  assert.equal(topicBasisClaimsIn("我已经按主题帮你排了序。下面是三位。").length, 1);
  assert.equal(topicBasisClaimsIn("按照和独立出版的相关程度，我挑了这三位。").length, 1);
  assert.equal(topicBasisClaimsIn("テーマに沿って並べました。").length, 1);
  assert.equal(topicBasisClaimsIn("関連度の高い順に選びました。").length, 1);
  assert.equal(topicBasisClaimsIn("I ranked them by topic.").length, 1);
  assert.equal(topicBasisClaimsIn("These are sorted by relevance to your note.").length, 1);
  assert.equal(topicBasisClaimsIn("这次没有做主题匹配，下面的顺序只按记录里的字段排。").length, 0);
  assert.equal(topicBasisClaimsIn("No topic matching was done this time; the order is by start time.").length, 0);
  assert.equal(topicBasisClaimsIn("小林说下周再对一次报价。").length, 0);
  const { dropped, text } = withoutTopicBasisClaims("我已经按主题帮你排了序。第一位是小林。", false);
  assert.equal(dropped.length, 1);
  assert.equal(text, "第一位是小林。");
  assert.equal(withoutTopicBasisClaims("我已经按主题帮你排了序。第一位是小林。", true).text, "我已经按主题帮你排了序。第一位是小林。", "a topic match that was done may be said");
});

test("judgment unavailable: code's ranking lead does not claim a topic ranking, and says no topic matching was done (zh, ja, en)", async () => {
  for (const [language, message, basis, noMatching] of [
    ["zh", "从我的联系人里挑三个最适合聊独立出版的人。", "聊独立出版", /这次没有做主题匹配/u],
    ["ja", "連絡先から独立出版の話ができる人を3人選んで。", "独立出版の話ができる", /テーマとの照合をしていません/u],
    ["en", "Pick three of my contacts who are best for talking about indie publishing.", "talking about indie publishing", /no topic matching was done/u],
  ] as const) {
    const world = smallWorld();
    for (const record of world.records) if (record.userId === "user:a") record.userId = ACTOR;
    for (let index = 0; index < 12; index += 1) world.records.push(contact(ACTOR, `contact:g${index}`, `生成${index}`, { customTags: ["行业:出版"], organization: `远山书房${index}`, role: "编辑" }));
    const model = deepseekStub(byNode({ understand: () => json({ language, parts: [part({ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [{ entity: "contact", text: language === "en" ? "my contacts" : language === "ja" ? "連絡先" : "我的联系人" }], rank: { basis, count: 3 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message })], plainChat: false }) }));
    const judge = judgeStub(() => undefined, { hang: true });
    const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world) });
    kit.deps.judgment = access(judge.fetchImplementation, { timeoutMs: 30 });
    const trace = captureTrace();
    try {
      const result = await runAgentGraph(kit.deps, kit.input(message, { locale: language }));
      assert.deepEqual(topicBasisClaimsIn(result.text), [], `${language}: ${result.text}`);
      assert.match(result.text, noMatching, language);
    } finally {
      trace.restore();
    }
  }
});

test("a model sentence claiming a topic ranking this turn did not do is not delivered", async () => {
  const message = "帮我想想下周见客户前要准备什么。";
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p1", text: "我已经按主题帮你排了序。先准备报价，再准备案例。" }] }),
    understand: () => json({ language: "zh", parts: [part({ sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input(message));
    assert.doesNotMatch(result.text, /按主题帮你排了序/u);
    assert.match(result.text, /先准备报价/u);
    assert.ok(trace.events.some((event) => event.type === "answer.basis_claims_dropped"));
  } finally {
    trace.restore();
  }
});
