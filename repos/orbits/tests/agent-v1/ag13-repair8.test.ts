import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { rankDomainOf } from "../../features/agent-v1/graph/nodes/functions";
import { routeInputOf } from "../../features/agent-v1/graph/nodes/route";
import { decideRoute } from "../../features/agent-v1/route/decide";
import { runFn } from "./functions-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { memo, smallWorld } from "./read-kit";
import { judgmentAccess, outboundJudge, toolsStub, webAccess } from "./web-kit";

/**
 * agent-design AG13 repair round 8 (run-08):
 * - AE-FN-008: "@笔记 帮我整理一下" is a summary even when the first layer adds fn.extractFollowUps (the words ask for none).
 * - AE-SCL-016 / AE-WEB-009: a link the user hands over is read — the part's own words now reach the AG12 routing rule, and
 *   a URL held by a part the probe does not read is read by the web part of the message.
 * - AE-SCL-013: "…的联系人里，挑三个…" is a contact ranking even with a note read the first layer added.
 * Each with the earlier behaviour as a control.
 */

const SUMMARY = (call: ModelCall) => {
  const handle = /(s\d+) — memo/u.exec(call.user)![1];
  return JSON.stringify({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "11 月 10 日小林来电，说小陈在审核；你答应 11 月 13 日给小林发报价。" }] });
};
const M32 = [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }];

test("AE-FN-008: '帮我整理一下' with an extraction the words do not ask for is still only a summary (zh, ja)", async () => {
  for (const [message, clue] of [["@11 月 10 日笔记 帮我整理一下。", "@11 月 10 日笔记"], ["@11 月 10 日笔记 を整理して。", "@11 月 10 日笔记"]] as const) {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: clue }], requiredCapabilities: ["memo.read", "fn.summarize", "fn.extractFollowUps"], sourceQuote: message }], { answer: SUMMARY, language: message.includes("を") ? "ja" : "zh", references: M32 });
    assert.ok(run.events.some((event) => event.type === "route.organize_is_summary"), message);
    assert.ok(!run.events.some((event) => ["fn.extractInteractions", "fn.extractFollowUps"].includes(String(event.type))), `${message}: no extraction runs`);
  }
});

test("AE-FN-008 control: words that ask for the promises still extract them", async () => {
  const message = "@11 月 10 日笔记 里我答应的事，帮我整理一下。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps"], sourceQuote: message }], { extract: { followUps: [{ action: "给小林发报价", owner: "me", plannedDateText: "11 月 13 日", sentenceIds: [2] }] }, references: M32 });
  assert.ok(!run.events.some((event) => event.type === "route.organize_is_summary"));
  assert.ok(run.events.some((event) => event.type === "fn.extractFollowUps"));
});

function webSetup(replies: Record<string, (call: ModelCall) => string>) {
  const model = deepseekStub((call) => {
    const reply = replies[call.node ?? ""];
    if (!reply) throw new Error(`unexpected model call in ${call.node}`);
    return reply(call);
  });
  const tools = toolsStub({ fetch: (url) => (url.includes("lumen-ats") ? { content: "Team: JPY 2,400 per seat per month, billed annually (effective October 1, 2026).", title: "Lumen ATS pricing" } : 404) });
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  world.records.push(memo("actor:a", "note:m51", "Lumen ATS quote: Team plan JPY 2,050 per seat per month, 20 seats.", "2026-11-02T01:00:00.000Z"));
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world) });
  kit.deps.web = webAccess(tools);
  kit.deps.judgment = judgmentAccess(outboundJudge(0.03).fetchImplementation);
  return { kit, tools };
}

test("AE-SCL-016: 'Here is their pricing page: <url>.' answered as a statement — the page is still opened (en, zh)", async () => {
  const cases = [
    { first: "Here is Lumen ATS's pricing page: https://lumen-ats.example.test/pricing.", locale: "en" as const, second: "How does the Team plan price compare with the latest quote they gave me?" },
    { first: "这是 Lumen ATS 的价格页：https://lumen-ats.example.test/pricing 。", locale: "zh" as const, second: "Team 版的价格和他们最近给我的报价比怎么样？" },
  ];
  for (const { first, locale, second } of cases) {
    const message = `${first} ${second}`;
    const { kit, tools } = webSetup({
      answer: () => json({ segments: [] }),
      understand: () => json({ language: locale, parts: [
        part({ clarity: "statement", dataSources: ["public_web"], localId: "p1", requiredCapabilities: ["web.fetch"], sourceQuote: first }),
        part({ dataSources: ["orbit_records", "public_web"], dependsOn: ["p1"], localId: "p2", requiredCapabilities: ["memo.read", "fn.compare"], sourceQuote: second }),
      ], plainChat: false }),
    });
    await runAgentGraph(kit.deps, kit.input(message, { locale }));
    assert.deepEqual(tools.calls.map((call) => `${call.kind} ${call.body.url}`), ["fetch https://lumen-ats.example.test/pricing"], locale);
  }
});

test("AE-SCL-016 control: the part's own words reach routing; a link in a part that also reads records keeps its route", () => {
  const message = "Here is Lumen ATS's pricing page: https://lumen-ats.example.test/pricing.";
  const graphPart = { capabilities: ["web.fetch"], plan: { clarity: "statement", dataOwner: "self", dataSources: ["public_web"], intentBasis: "instruction", persistence: "this_turn" }, quote: [0, message.length], refs: [] } as never;
  assert.equal(routeInputOf(graphPart, message).sourceQuote, message);
  assert.equal(decideRoute(routeInputOf(graphPart, message)).route, "web_lookup");
  assert.equal(routeInputOf(graphPart).sourceQuote, undefined, "no message, no words (as before)");
  const mixed = { ...(graphPart as object), capabilities: ["web.fetch", "memo.read"], plan: { clarity: "statement", dataOwner: "self", dataSources: ["orbit_records", "public_web"], intentBasis: "instruction", persistence: "this_turn" } } as never;
  assert.equal(decideRoute(routeInputOf(mixed, message)).route, "answer");
});

test("AE-SCL-013: contacts named as the set to pick from are a contact ranking even with a note read added (zh, en, ja)", () => {
  const rank = (message: string, capabilities = ["contact.read", "memo.read", "fn.rank"], refs: unknown[] = []) => rankDomainOf({ capabilities, plan: { rank: { count: 3 } }, quote: [0, message.length], refs, route: "read" } as never, message);
  assert.equal(rank("东京做零售的联系人里，挑三个最适合聊柴烧器物的人。"), "contact");
  assert.equal(rank("From my contacts in retail in Tokyo, pick the three best people to talk to about wood-fired ceramics."), "contact");
  assert.equal(rank("東京で小売をしている連絡先から、薪窯の器の話に合う3人を選んで。"), "contact");
  // Controls: as before.
  assert.equal(rank("挑三篇和柴烧器物最相关的笔记。"), null, "notes ranked are not a contact ranking");
  const message = "从联系人里挑小林的三篇笔记。";
  const at = (words: string) => [message.indexOf(words), message.indexOf(words) + words.length];
  assert.equal(rank(message, ["contact.read", "memo.read", "fn.rank"], [{ entity: "contact", quote: at("小林"), recordId: null }]), null, "a named person is not a set");
  assert.equal(rank("东京做零售的联系人里，挑三个最适合聊柴烧器物的人。", ["contact.read", "fn.rank"]), "contact", "without the note read, as before");
});
