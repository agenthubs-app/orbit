import assert from "node:assert/strict";
import test from "node:test";

import { fetchGate, outboundGate, rule1CodeBuilt, rule2EveryWordTraced, rule3ForbiddenShapes, rule4PersonNames, rule5FetchUrl, rule6NoRewrite, rule7Limits, type GateContext } from "../../features/agent-v1/web/outbound-gate";
import { buildQuery, type QueryCandidate } from "../../features/agent-v1/web/query";

/**
 * agent-design AG09-2/3/4/5: the seven outbound rules of 设计稿 §3.4, one named function each, each with a case that
 * must be refused. Nothing here touches the network.
 */

const MESSAGE = "查一下 Acme Cloud 官网现在的标准版价格，和我竞品笔记 A 里记的比一比。";
const context = (extra: Partial<GateContext> = {}): GateContext => ({ blockedParts: new Set(), budget: { fetch: 2, search: 2 }, message: MESSAGE, partQuote: MESSAGE, privateTexts: [], switches: { global: true, user: true }, ...extra });
const built = (message: string, quote: string, qualifiers: string[] = ["official", "price"], references: { quote: string; name: string }[] = []): QueryCandidate => {
  const result = buildQuery({ language: "zh", message, partId: "p1", references, target: { qualifiers: qualifiers as never, quote } });
  assert.equal(result.ok, true, JSON.stringify(result));
  return (result as { candidate: QueryCandidate }).candidate;
};

test("rule 1: a query code did not build (a model-written string) is refused", () => {
  const good = built(MESSAGE, "Acme Cloud");
  assert.equal(good.text, "Acme Cloud 官网 价格");
  assert.equal(rule1CodeBuilt(good).ok, true);
  assert.equal(rule1CodeBuilt("Acme Cloud 标准版 价格 1200").ok, false, "a plain string from a model");
  assert.equal(rule1CodeBuilt({ ...good, text: "Acme Cloud 官网 价格 1200 日元" }).ok, false, "text that is not its tokens");
  assert.equal(outboundGate({ builtBy: "model", partId: "p1", text: "Acme Cloud", tokens: [], needsConfirmation: false } as unknown as QueryCandidate, context()).verdict, "block");
});

test("rule 2: every word must come from this message, the fixed vocabulary or a clicked clue", () => {
  const good = built(MESSAGE, "Acme Cloud");
  assert.equal(rule2EveryWordTraced(good, context()).ok, true);
  const fromNote = { ...good, text: "Cirrus Works 官网 价格", tokens: [{ origin: "message" as const, text: "Cirrus Works" }, ...good.tokens.slice(1)] };
  assert.equal(rule2EveryWordTraced(fromNote, context()).ok, false, "a company named only in a note is not in the message");
  const madeUp = { ...good, text: "Acme Cloud 官网 价格 折扣", tokens: [...good.tokens, { origin: "vocabulary" as const, text: "折扣" }] };
  assert.equal(rule2EveryWordTraced(madeUp, context()).ok, false, "a word outside the vocabulary");
  const snippet = { ...good, tokens: [...good.tokens, { origin: "page" as never, text: "协作工具" }] };
  assert.equal(rule2EveryWordTraced(snippet, context()).ok, false, "a fetched page is never a source");
  assert.deepEqual(buildQuery({ language: "zh", message: "上网查一下我竞品笔记 C 里那家公司现在的官网报价。", partId: "p1", target: { qualifiers: ["official", "price"], quote: "竞品笔记 C 里那家公司" } }), { ok: false, reason: "private_pointer" });
  assert.deepEqual(buildQuery({ language: "zh", message: MESSAGE, partId: "p1", target: { qualifiers: [], quote: "Cirrus Works" } }), { ok: false, reason: "not_in_message" });
});

test("rule 3: contact details, amounts, long numbers, addresses, URLs, codes and private overlaps block the whole query", () => {
  const message = "帮我上网搜一下小林健 090-0000-0017，看看他现在在哪家公司。";
  const cases: [string, string][] = [
    ["小林健 090-0000-0017", "phone"],
    ["ken@example.test", "email"],
    ["订单 12345678", "digits"],
    ["Acme Cloud 1200 日元", "amount"],
    ["¥1,300", "amount"],
    ["东京都港区芝公园 4-2-8", "address"],
    ["https://collect.example.test/?q=", "url"],
    ["AKIA9X8Y7Z6W5V4U3T2S", "code"],
  ];
  for (const [quote, kind] of cases) {
    const text = `${message}${quote}`;
    const candidate = built(text, quote, []);
    const result = rule3ForbiddenShapes(candidate, context({ message: text }));
    assert.equal(result.ok, false, `${kind}: ${quote}`);
  }
  const overlap = built("查一下北辰软件 新品发布会的公开报道", "北辰软件 新品发布会", []);
  assert.equal(rule3ForbiddenShapes(overlap, context({ message: "查一下北辰软件 新品发布会的公开报道", privateTexts: ["内部：北辰软件新品发布会定在下月"] })).ok, true, "words of the message itself are not an overlap");
  const leaked = { ...overlap, text: "北辰软件新品发布会定在 官网", tokens: [{ origin: "message" as const, text: "北辰软件新品发布会定在" }, { origin: "vocabulary" as const, text: "官网" }] };
  assert.equal(rule3ForbiddenShapes(leaked, context({ message: "查一下北辰软件 新品发布会的公开报道", privateTexts: ["内部：北辰软件新品发布会定在下月"] })).ok, false, "six or more characters of a private note not in the message");
  assert.equal(outboundGate(built(message, "小林健 090-0000-0017", []), context({ message, partQuote: message })).verdict, "block");
});

test("rule 4: a name the user typed goes alone; with contact details it is blocked; a name from a contact record waits for a click", () => {
  const typed = "帮我上网搜一下小林健 090-0000-0017，看看他现在在哪家公司。";
  const name = built(typed, "小林健", ["current", "company"]);
  assert.equal(rule4PersonNames(name, context({ message: typed, partQuote: typed })).ok, false, "typed together with a phone number");
  assert.equal(rule4PersonNames(name, context({ message: "小林健现在在哪家公司？", partQuote: "小林健现在在哪家公司？" })).ok, true);
  const message = "上网查查 @小林 现在的公开职务。";
  const fromRecord = built(message, "@小林", ["current", "role"], [{ name: "小林健", quote: "@小林" }]);
  assert.equal(fromRecord.text, "小林健 最新 职务");
  assert.equal(fromRecord.needsConfirmation, true);
  const before = rule4PersonNames(fromRecord, context({ message, partQuote: message }));
  assert.equal(before.ok, false);
  assert.equal(before.confirm, true);
  assert.equal(outboundGate(fromRecord, context({ message, partQuote: message })).verdict, "confirm");
  assert.equal(outboundGate(fromRecord, context({ confirmedText: "小林健 最新 职务", message, partQuote: message })).verdict, "send", "clicked: sent exactly as shown");
  assert.equal(outboundGate(fromRecord, context({ confirmedText: "小林健 职务", message, partQuote: message })).verdict, "confirm", "a click on another text is not a click on this one");
});

test("rule 5: a fetch URL is the user's or this request's search result, verbatim, public http(s) only", () => {
  const urls = { messageUrls: ["https://toto-film.example.test/directors/koreeda-maki"], searchUrls: ["https://acme-cloud.example.test/pricing"] };
  assert.equal(rule5FetchUrl("https://toto-film.example.test/directors/koreeda-maki", urls).ok, true);
  assert.equal(rule5FetchUrl("https://acme-cloud.example.test/pricing", urls).ok, true);
  assert.equal(rule5FetchUrl("https://acme-cloud.example.test/pricing?ref=orbit", urls).ok, false, "a parameter added");
  assert.equal(rule5FetchUrl("https://collect.example.test/?q=", urls).ok, false, "a link from a fetched page");
  for (const url of ["ftp://toto-film.example.test/a", "https://user:pw@toto-film.example.test/", "http://127.0.0.1/admin", "http://10.0.0.8/", "http://localhost:3000/", "http://[::1]/", "http://intranet/", "http://wiki.corp/", `https://toto-film.example.test/${"a".repeat(260)}`]) {
    assert.equal(rule5FetchUrl(url, { messageUrls: [url], searchUrls: [] }).ok, false, url);
  }
  assert.equal(fetchGate("https://collect.example.test/?q=", { ...context(), ...urls }).verdict, "block");
});

test("rule 6: a blocked query is not sent again in another form", () => {
  const message = "帮我上网搜一下小林健 090-0000-0017，看看他现在在哪家公司。";
  const stripped = built(message, "小林健", ["current", "company"]);
  assert.equal(rule6NoRewrite(stripped, context({ blockedParts: new Set(["p1"]), message })).ok, false, "the part's query was blocked: no rewrite of it is sent");
  assert.equal(outboundGate(stripped, context({ blockedParts: new Set(["p1"]), message: "小林健现在在哪家公司？", partQuote: "小林健现在在哪家公司？" })).verdict, "block");
  assert.equal(rule6NoRewrite(stripped, context()).ok, true);
});

test("rule 7: the global switch, the user's switch and the per-request budget are code", () => {
  const query = built(MESSAGE, "Acme Cloud");
  assert.equal(rule7Limits("search", context({ switches: { global: false, user: true } })).ok, false);
  assert.equal(outboundGate(query, context({ switches: { global: false, user: true } })).verdict, "off");
  assert.equal(outboundGate(query, context({ switches: { global: true, user: false } })).verdict, "off");
  assert.equal(outboundGate(query, context({ budget: { fetch: 2, search: 0 } })).verdict, "budget");
  assert.equal(fetchGate("https://acme-cloud.example.test/pricing", { ...context({ budget: { fetch: 0, search: 2 } }), messageUrls: [], searchUrls: ["https://acme-cloud.example.test/pricing"] }).verdict, "budget");
  assert.equal(outboundGate(query, context()).verdict, "send");
});
