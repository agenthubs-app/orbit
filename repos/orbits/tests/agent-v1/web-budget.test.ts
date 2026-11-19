import assert from "node:assert/strict";
import test from "node:test";

import { resumeAgentGraph, runAgentGraph } from "../../features/agent-v1/graph/build";
import { budgetLeft, callKeyOf } from "../../features/agent-v1/web/evidence";
import { openRequestWeb } from "../../features/agent-v1/web/service";
import { deepseekStub, graphKit, json, part, type ModelCall } from "./graph-kit";
import { judgmentAccess, outboundJudge, toolsStub, webAccess } from "./web-kit";

/**
 * agent-design AG09-5: one budget per request — 2 searches, 2 fetches — reserved before the HTTP goes out, shared by
 * every part, a resume and a re-run; the same call is reused by its key, never sent twice; a timeout is not retried.
 */

test("the call is reserved in the request's web record before it is sent, under agent-web:<requestId>#search-<n>", async () => {
  let web: Awaited<ReturnType<typeof openRequestWeb>> | null = null;
  const tools = toolsStub({ reservedCount: () => web?.ledger().calls.length ?? -1 });
  const access = webAccess(tools);
  web = await openRequestWeb(access, "actor:a", "agreq_1", () => "2026-11-15T01:00:00.000Z");
  const first = await web.search("p1", "Acme Cloud 官网 价格");
  assert.equal(tools.calls[0].reservedBefore, 1, "reserved first");
  assert.equal(first?.call.key, callKeyOf("agreq_1", "search", 1));
  assert.equal((await access.store.get("actor:a", "agreq_1"))?.calls[0].status, "ok");
  const again = await web.search("p2", "Acme Cloud 官网 价格");
  assert.equal(again?.owner, false, "the same query in the same request is answered from the call made");
  assert.equal(tools.calls.length, 1);
  await web.search("p3", "是枝 现任 职务");
  assert.equal(await web.search("p4", "Borealis 价格"), null, "a third search is over the budget");
  assert.deepEqual(budgetLeft(web.ledger()), { fetch: 2, search: 0 });
  const reopened = await openRequestWeb(access, "actor:a", "agreq_1", () => "2026-11-15T01:00:00.000Z");
  assert.deepEqual(reopened.left(), { fetch: 2, search: 0 }, "a resume reads the same budget");
});

test("a timeout is final for that call: no retry, and it still counts", async () => {
  const tools = toolsStub({ fetch: () => "timeout" });
  const access = { ...webAccess(tools), timeoutMs: 30 };
  const web = await openRequestWeb(access, "actor:a", "agreq_2", () => "2026-11-15T01:00:00.000Z");
  const outcome = await web.fetch("p1", "https://slow.example.test/page");
  assert.equal(outcome?.call.status, "timeout");
  assert.equal(tools.calls.length, 1);
  assert.equal((await web.fetch("p1", "https://slow.example.test/page"))?.owner, false, "not sent again");
  assert.deepEqual(web.left(), { fetch: 1, search: 2 });
});

test("WEB-011: three parts share 2 searches and 2 fetches; after the click the budget is not reset and the page is not opened", async () => {
  const message = "帮我查三件事：Acme Cloud 官网现在的价格；这篇评测怎么说 https://review.example.test/acme-cloud ；还有是枝真纪现在的职务。";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: (call) => {
      const pages = [...call.user.matchAll(/(w\d+) — public web page "([^"]+)"/gu)];
      const price = pages.find((item) => item[2].includes("价格"))![1];
      const review = pages.find((item) => item[2].includes("评测"))![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: price }], partId: "p1", text: "标准版每席每月 1,300 日元。" }, { cites: [{ sentenceIds: [1], sourceRef: review }], partId: "p2", text: "评测说 Acme Cloud 是一款协作工具。" }] });
    },
    probe: () => json({ picks: [{ open: [1], partId: "p1", sameName: [] }, { open: [1], partId: "p3", sameName: [1, 2] }] }),
    understand: () => json({ parts: [
      part({ dataSources: ["public_web"], localId: "p1", requiredCapabilities: ["web.search"], sourceQuote: "Acme Cloud 官网现在的价格", webTarget: { qualifiers: ["official", "price"], quote: "Acme Cloud" } }),
      part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.fetch"], sourceQuote: "这篇评测怎么说 https://review.example.test/acme-cloud" }),
      part({ dataSources: ["public_web"], localId: "p3", requiredCapabilities: ["web.search"], sourceQuote: "还有是枝真纪现在的职务", webTarget: { qualifiers: ["current", "role"], quote: "是枝真纪" } }),
    ], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const tools = toolsStub();
  const kit = graphKit(model.fetchImplementation);
  kit.deps.web = webAccess(tools);
  kit.deps.judgment = judgmentAccess(outboundJudge(0.03).fetchImplementation);
  const input = kit.input(message);
  const first = await runAgentGraph(kit.deps, input);
  assert.deepEqual(tools.calls.map((call) => call.kind).sort(), ["fetch", "fetch", "search", "search"]);
  assert.equal(first.status, "waiting_user");
  assert.match(first.text, /1,300/u);
  assert.match(first.text, /哪一个/u);
  const set = first.clarifications.find((item) => item.state === "open")!;
  assert.deepEqual(set.options.map((option) => option.optionId), ["1", "2"], "in the order of the search");
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: set.clarificationId, kind: "select", optionId: "1" });
  assert.equal(tools.calls.length, 4, "no third fetch and no new search after the click");
  assert.match(resumed.text, /次数已经用完/u);
  assert.match(resumed.text, /搜索摘要不算核实过的内容/u);
  assert.doesNotMatch(resumed.text, /创作总监/u, "the snippet is not taken as the role");
});

test("WEB-008: same-named results — ask first, then open the picked page without searching again", async () => {
  const message = "是枝真紀さんの代表作と現在の役職を調べてください。";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [2, 3], sourceRef: /(w\d+) — public web page/u.exec(call.user)![1] }], partId: "p1", text: "代表作は『夏之庭』（2019）と『北行列車』（2023）で、現在は東都映画のクリエイティブディレクターです。" }] }),
    probe: () => json({ picks: [{ open: [1], partId: "p1", sameName: [1, 2] }] }),
    understand: () => json({ language: "ja", parts: [part({ dataSources: ["public_web"], requiredCapabilities: ["web.search"], sourceQuote: message, webTarget: { qualifiers: ["works", "current", "role"], quote: "是枝真紀さん" } })], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const tools = toolsStub();
  const kit = graphKit(model.fetchImplementation);
  kit.deps.web = webAccess(tools);
  kit.deps.judgment = judgmentAccess(outboundJudge(0.03).fetchImplementation);
  const input = kit.input(message, { locale: "ja" });
  const first = await runAgentGraph(kit.deps, input);
  assert.deepEqual(tools.calls.map((call) => call.kind), ["search"]);
  assert.equal(tools.calls[0].body.query, "是枝真紀 代表作 現在");
  assert.match(first.text, /どちらのことですか/u);
  assert.match(first.text, /建筑师/u);
  const set = first.clarifications[0];
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: set.clarificationId, kind: "select", optionId: "1" });
  assert.deepEqual(tools.calls.map((call) => call.kind), ["search", "fetch"]);
  assert.equal(tools.calls[1].body.url, "https://toto-film.example.test/directors/koreeda-maki");
  assert.match(resumed.text, /北行列車/u);
  assert.equal(model.calls.filter((call) => call.node === "probe").length, 1, "the choice is not asked again on resume");
});

test("WEB-008 split in two parts: the same name is searched once, asked once, and the click answers both", async () => {
  const message = "是枝真紀さんの代表作と現在の役職を調べてください。";
  const replies: Record<string, (call: ModelCall) => string> = {
    answer: (call) => {
      const pages = [...call.user.matchAll(/(w\d+) — public web page/gu)].map((match) => match[1]);
      return json({ segments: [{ cites: [{ sentenceIds: [2], sourceRef: pages[0] }], partId: "p1", text: "代表作は『夏之庭』と『北行列車』です。" }, { cites: [{ sentenceIds: [3], sourceRef: pages[pages.length - 1] }], partId: "p2", text: "現在は東都映画のクリエイティブディレクターです。" }] });
    },
    probe: () => json({ picks: [{ open: [1], partId: "p1", sameName: [1, 2] }] }),
    understand: () => json({ language: "ja", parts: [
      part({ dataSources: ["public_web"], localId: "p1", requiredCapabilities: ["web.search"], sourceQuote: "是枝真紀さんの代表作", webTarget: { qualifiers: ["works"], quote: "是枝真紀" } }),
      part({ dataSources: ["public_web"], localId: "p2", requiredCapabilities: ["web.search"], sourceQuote: "現在の役職を調べてください", webTarget: { qualifiers: ["current", "role"], quote: "是枝真紀さん" } }),
    ], plainChat: false }),
  };
  const model = deepseekStub((call) => replies[call.node ?? ""](call));
  const tools = toolsStub();
  const kit = graphKit(model.fetchImplementation);
  kit.deps.web = webAccess(tools);
  kit.deps.judgment = judgmentAccess(outboundJudge(0.03).fetchImplementation);
  const input = kit.input(message, { locale: "ja" });
  const first = await runAgentGraph(kit.deps, input);
  assert.deepEqual(tools.calls.map((call) => `${call.kind} ${call.body.query ?? call.body.url}`), ["search 是枝真紀 代表作 現在"], "one query for both parts (at most two qualifiers)");
  assert.equal(first.clarifications.length, 1, "one question");
  assert.equal((first.text.match(/どちらのことですか/gu) ?? []).length, 1);
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: "1" });
  assert.deepEqual(tools.calls.map((call) => call.kind), ["search", "fetch"], "the page is fetched once for both");
  assert.match(resumed.text, /北行列車/u);
  assert.match(resumed.text, /クリエイティブディレクター/u);
  assert.deepEqual(resumed.partResults.map((item) => item.status), ["answered", "answered"]);
});
