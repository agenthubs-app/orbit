import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { globalSearchQueryObject, globalSearchResponseSchema } from "../../shared/api-schema/global-search";
import { highlightRanges, highlightsFor, splitByHighlights } from "../../shared/compute/search-highlight";
import { matchesAllTerms, normalizeSearchText, splitSearchTerms } from "../../shared/compute/search-normalize";
import { comparePeople, personRank } from "../../shared/compute/search-rank";
import { liteCanExpand, liteMatch } from "../../shared/compute/search-synonyms";
import type { EventSearchResponse } from "../../shared/contract/event-search";
import { demoGlobalSearch } from "../../shared/mock/demo-world/global-search";
import { buildGlobalSearch, industriesForTerms, suggestionsFor, type GlobalSearchCoreInput } from "../../features/search/global/core";
import { createGlobalSearchHandlers, createRateWindow, GLOBAL_SEARCH_KEYWORD_PER_MINUTE, searchLive } from "../../features/search/global/handlers";
import { intersectById, type GlobalSearchLivePorts } from "../../features/search/global/live";

// R30 (search/DESIGN.md §3–§6; PLANNER SC-R30-01…07): one service behind the Web ⌘K panel and the App search page.

const NOW = new Date("2026-10-16T09:00:00+09:00");

test("folding: NFKC, case, full / half width and spacing never decide a hit; terms are AND-ed", () => {
  assert.equal(normalizeSearchText("ＣＦＯ Ｎｉｇｈｔ"), "cfonight");
  assert.deepEqual(splitSearchTerms(" 半導体　商社 半導体"), ["半導体", "商社"]);
  assert.equal(matchesAllTerms(["半導体商社 東京", null], ["半導体", "商社"]), true);
  assert.equal(matchesAllTerms(["半導体メーカー", "東京"], ["半導体", "商社"]), false, "every term must hit somewhere");
  assert.equal(matchesAllTerms(["x"], []), false);
});

test("highlights map folded hits back onto the original text (code points) and merge touching ranges", () => {
  assert.deepEqual(highlightRanges("高橋 美咲", ["高橋"]), [{ start: 0, end: 2 }]);
  assert.deepEqual(highlightRanges("Ｊａｐａｎ SaaS Summit", ["japan"]), [{ start: 0, end: 5 }], "full-width letters fold to the ASCII term");
  assert.deepEqual(highlightRanges("半導体 商社", ["半導体", "商社"]), [{ start: 0, end: 3 }, { start: 4, end: 6 }]);
  assert.deepEqual(highlightRanges("CFO Night CFO", ["cfo"]), [{ start: 0, end: 3 }, { start: 10, end: 13 }]);
  assert.deepEqual(highlightsFor("高橋 美咲", "青葉ベンチャーズ · パートナー", ["高橋", "青葉"]), [{ field: "title", start: 0, end: 2 }, { field: "subtitle", start: 0, end: 2 }]);
  assert.deepEqual(splitByHighlights("高橋 美咲", [{ start: 0, end: 2 }]), [{ marked: true, text: "高橋" }, { marked: false, text: " 美咲" }]);
  assert.deepEqual(highlightRanges("", ["a"]), []);
});

test("rank: name prefix → name → org / role → other fields; ties by last contact then name", () => {
  const terms = ["高橋"];
  assert.equal(personRank({ name: "高橋 美咲" }, terms), 0);
  assert.equal(personRank({ name: "佐藤 高橋" }, terms), 1);
  assert.equal(personRank({ name: "佐藤 健", org: "高橋製作所" }, terms), 2);
  assert.equal(personRank({ name: "佐藤 健", other: ["高橋さんの紹介"] }, terms), 3);
  assert.equal(personRank({ name: "佐藤 健" }, terms), 4);
  const sorted = [
    { lastInteractionAt: "2026-10-01T00:00:00Z", name: "高橋 亮" },
    { lastInteractionAt: "2026-10-10T00:00:00Z", name: "高橋 美咲" },
    { lastInteractionAt: null, name: "青木 高橋" },
  ].sort(comparePeople(terms)).map((person) => person.name);
  assert.deepEqual(sorted, ["高橋 美咲", "高橋 亮", "青木 高橋"]);
});

const events = (hits: EventSearchResponse["events"]): EventSearchResponse => ({ events: hits, eventsTotal: hits.length, organizers: [], people: [], query: "q" });
const core = (over: Partial<GlobalSearchCoreInput>): GlobalSearchCoreInput => ({
  conversations: null, events: null, examples: ["投資家"], industryCounts: [], language: "ja", limit: 6, now: NOW,
  people: [], planLinked: null, platform: "web", query: "高橋", searchedPeople: 286, semanticAvailable: false, terms: ["高橋"], types: ["people", "events"], ...over,
});

test("core: groups in order, 6 per group under すべて, totals are group totals, empty groups stay empty, status chip only with a plan", () => {
  const people = Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, lastInteractionAt: `2026-10-0${(index % 9) + 1}T00:00:00Z`, name: `高橋 ${index}`, org: "青葉", other: [], role: "VC" }));
  const out = buildGlobalSearch(core({ people, planLinked: new Set(["c3"]), events: events([{ emoji: "🎤", eventId: "e1", href: "/app/events/e1", startsAt: "2026-10-16T19:00:00+09:00", title: "高橋 Night", venue: "渋谷", myStatus: "registered" }]) }));
  assert.equal(out.people.items.length, 6);
  assert.equal(out.people.total, 8);
  assert.equal(out.people.items.find((hit) => hit.contactId === "c3")?.status, "in_progress");
  assert.equal(out.people.items.find((hit) => hit.contactId === "c7")?.status, "acquaintance");
  assert.equal(out.people.items.some((hit) => hit.contactId === "c0"), false, "the oldest contact falls outside the 6");
  assert.deepEqual(out.people.items[0]!.highlights, [{ field: "title", start: 0, end: 2 }]);
  assert.equal(out.events.items[0]!.note, "参加予定 · 今夜");
  assert.deepEqual(out.suggestions, []);
  assert.deepEqual(out.alternatives, []);
  assert.equal(out.conversations, undefined, "no conversations group before R21");
  assert.equal(out.semantic.available, false);
  assert.equal(buildGlobalSearch(core({ people })).people.items[0]!.status, null, "no plan → no chip");
  const only = buildGlobalSearch(core({ people, wanted: ["events"] }));
  assert.equal(only.people.total, 0);
  assert.equal(globalSearchResponseSchema.safeParse(out).success, true);
});

test("core: an empty query answers only the capability part; conversations appear in types once a source exists", () => {
  const empty = buildGlobalSearch(core({ terms: [], query: "" }));
  assert.deepEqual(empty.people, { items: [], total: 0 });
  assert.deepEqual(empty.examples, ["投資家"]);
  assert.equal(empty.searchedPeople, 286);
  const withConversations = buildGlobalSearch(core({ types: ["people", "events", "conversations"], conversations: [{ highlights: [], href: "/app/agent?session=s1", id: "s1", kind: "iorbit", subtitle: "10/7 · iOrbit との会話", title: "高橋 さんへのお礼" }] }));
  assert.deepEqual(withConversations.types, ["people", "events", "conversations"]);
  assert.equal(withConversations.conversations?.total, 1);
});

test("core: no hits → 「近い条件なら」 (≤2 industries with a count > 0) and two 「ほかの方法」 rows", () => {
  assert.deepEqual(industriesForTerms(["半導体", "商社"]).slice(0, 2), ["manufacturing_supply_chain.semiconductors", "trade_logistics"]);
  const out = buildGlobalSearch(core({ query: "半導体 商社", terms: ["半導体", "商社"], industryCounts: [{ count: 0, id: "manufacturing_supply_chain.semiconductors" }, { count: 12, id: "manufacturing_supply_chain.electronics" }, { count: 35, id: "trade_logistics" }], events: events([{ emoji: "🏭", eventId: "e2", href: "/app/events/e2", startsAt: "2026-11-02T10:00:00+09:00", title: "製造業 DX カンファレンス 大阪" }]) }));
  assert.equal(out.people.total, 0);
  assert.equal(out.events.total, 0, "no people = the empty state; the event hit only feeds 「イベントで探す」");
  assert.deepEqual(out.suggestions.map((item) => [item.label, item.count, item.href]), [["貿易・物流", 35, "/app/contacts?industry=trade_logistics"]], "a zero count is skipped; 電子部品 is not implied by the terms");
  assert.deepEqual(out.alternatives.map((item) => item.kind), ["ask_iorbit", "events"]);
  assert.equal(out.alternatives[0]!.detail, "「半導体商社の人に会うには？」");
  assert.equal(out.alternatives[1]!.detail, "製造業 DX カンファレンス 大阪 · 11/2");
  const none = buildGlobalSearch(core({ query: "zzzz", terms: ["zzzz"] }));
  assert.deepEqual(none.suggestions, []);
  assert.equal(none.alternatives[1]!.detail, "探すで条件を変えて探す");
  assert.deepEqual(suggestionsFor({ industryCounts: [{ count: 3, id: "finance_investment.venture_capital" }], language: "ja", platform: "app", terms: ["投資家"] }).map((item) => item.href), ["/contacts?industry=finance_investment.venture_capital"]);
});

test("demo world: the three board inputs answer exactly the boards (b5 #57 / #58 / #59 and #54 / #55 / #56)", () => {
  const takahashi = demoGlobalSearch({ limit: 6, platform: "web", query: "高橋", semantic: false });
  assert.equal(takahashi.sample, true);
  assert.deepEqual([takahashi.people.total, takahashi.events.total, takahashi.conversations?.total], [2, 1, 2]);
  assert.deepEqual(takahashi.people.items.map((hit) => [hit.name, hit.status]), [["高橋 美咲", "in_progress"], ["高橋 亮", "acquaintance"]]);
  assert.equal(takahashi.events.items[0]!.note, "高橋さんも参加予定 · 10/16");
  assert.deepEqual(takahashi.conversations!.items.map((hit) => hit.kind), ["iorbit", "inbox"]);
  assert.equal(takahashi.people.items[0]!.href, "/app/contacts/demo-person-takahashi");
  assert.equal(demoGlobalSearch({ limit: 6, platform: "app", query: "高橋", semantic: false }).people.items[0]!.href, "/contacts/demo-person-takahashi");

  const investors = demoGlobalSearch({ limit: 6, platform: "web", query: "投資家", semantic: true });
  assert.deepEqual(investors.semantic, { available: true, enabled: true, matched: 9, related: 14 });
  assert.equal(investors.people.total, 23);
  assert.equal(investors.people.order, "relevance");
  assert.deepEqual(investors.people.items.map((hit) => hit.reason), ["役職「パートナー」· VC", "会社が VC", "役職「代表パートナー」", "メモ「VC 4社と面識」", "「投資家を紹介できる」", "投資契約に強い（関連）"]);
  assert.equal(investors.people.items[0]!.status, null, "reason rows carry no status chip");
  assert.equal(investors.events.items[0]!.via, "attendees");
  assert.equal(demoGlobalSearch({ limit: 6, platform: "web", query: "投資家", semantic: false }).semantic.enabled, false);

  const none = demoGlobalSearch({ limit: 6, platform: "web", query: "半導体 商社", semantic: false });
  assert.deepEqual([none.people.total, none.events.total], [0, 0]);
  assert.equal(none.searchedPeople, 286);
  assert.deepEqual(none.suggestions.map((item) => [item.label, item.count]), [["製造業 › 電子部品", 12], ["商社・流通", 35]]);
  assert.deepEqual(none.alternatives.map((item) => item.detail), ["「半導体商社の人に会うには？」", "製造業 DX カンファレンス 大阪 · 出展 12社"]);

  const initial = demoGlobalSearch({ limit: 6, platform: "app", query: "", semantic: false });
  assert.deepEqual(initial.types, ["people", "events", "conversations"]);
  assert.equal(initial.examples.length, 5);
  for (const answer of [takahashi, investors, none, initial]) assert.equal(globalSearchResponseSchema.safeParse(answer).success, true);
});

test("query: `q` may be empty, 101 chars is invalid, types is a comma list, limit defaults to 6, unknown keys are rejected", () => {
  assert.deepEqual(globalSearchQueryObject.parse({}), { limit: 6, q: "", semantic: false });
  assert.deepEqual(globalSearchQueryObject.parse({ q: " 高橋 ", types: "people,events,bogus", limit: "20", semantic: "1" }), { limit: 20, q: "高橋", semantic: true, types: ["people", "events"] });
  assert.equal(globalSearchQueryObject.safeParse({ q: "a".repeat(101) }).success, false);
  assert.equal(globalSearchQueryObject.safeParse({ q: "a", limit: "21" }).success, false);
  assert.equal(globalSearchQueryObject.safeParse({ q: "a", extra: "1" }).success, false);
});

test("rate window: the 61st keyword search inside a minute is refused, the window slides", () => {
  let at = Date.parse("2026-10-16T00:00:00Z");
  const window = createRateWindow(() => new Date(at));
  for (let index = 0; index < GLOBAL_SEARCH_KEYWORD_PER_MINUTE; index += 1) assert.equal(window.take("a:keyword", GLOBAL_SEARCH_KEYWORD_PER_MINUTE), true);
  assert.equal(window.take("a:keyword", GLOBAL_SEARCH_KEYWORD_PER_MINUTE), false);
  assert.equal(window.take("b:keyword", GLOBAL_SEARCH_KEYWORD_PER_MINUTE), true, "per actor");
  at += 60_001;
  assert.equal(window.take("a:keyword", GLOBAL_SEARCH_KEYWORD_PER_MINUTE), true);
});

async function withMode<T>(mode: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;
  try { return await run(); } finally { if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous; }
}
const get = (query: string, platform?: string) => new Request(`http://localhost/api/search/global?${query}${platform ? `&platform=${platform}` : ""}`);

function fakePorts(byActor: Record<string, { name: string; id: string }[]>): GlobalSearchLivePorts {
  return {
    conversations: null,
    async counts(actorId) { return { industries: [{ count: 2, id: "trade_logistics" }], total: byActor[actorId]?.length ?? 0 }; },
    async events() { return events([]); },
    async people(actorId, terms) {
      const items = (byActor[actorId] ?? []).filter((person) => terms.every((term) => normalizeSearchText(person.name).includes(term))).map((person) => ({ ...person, lastInteractionAt: null, org: null, other: [], role: null }));
      return { items, total: items.length };
    },
    async planLinked() { return null; },
    semanticAvailable: false,
  };
}

test("route: live requires a session (401), answers only the caller's contacts, reports types without conversations; mock answers the demo world", async () => {
  const ports = fakePorts({ "actor:a": [{ id: "a1", name: "高橋 A" }], "actor:b": [{ id: "b1", name: "高橋 B" }] });
  let actor: { id: string } | null = null;
  const handlers = createGlobalSearchHandlers({ livePorts: () => ports, now: () => NOW, resolveActor: async () => actor as never });
  await withMode("live", async () => {
    const anonymous = await handlers.get(get("q=高橋"));
    assert.equal(anonymous.status, 401);
    actor = { id: "actor:a" };
    const mine = await (await handlers.get(get("q=高橋", "app"))).json();
    assert.equal(mine.success, true);
    assert.deepEqual(mine.data.people.items.map((hit: { contactId: string; href: string }) => [hit.contactId, hit.href]), [["a1", "/contacts/a1"]], "actor b's contact never appears");
    assert.deepEqual(mine.data.types, ["people", "events"]);
    assert.equal(mine.data.semantic.available, false);
    assert.equal(mine.data.sample, undefined);
    const empty = await (await handlers.get(get("q="))).json();
    assert.equal(empty.data.searchedPeople, 1);
    assert.deepEqual(empty.data.examples, ["投資家", "製造業の決裁者"]);
    const bad = await handlers.get(get(`q=${"a".repeat(101)}`));
    assert.equal(bad.status, 400);
  });
  await withMode("mock", async () => {
    const demo = await (await handlers.get(get("q=高橋"))).json();
    assert.equal(demo.data.sample, true);
    assert.equal(demo.data.people.total, 2);
    assert.equal(demo.data.conversations.total, 2);
  });
});

test("route: 429 after the per-minute budget, with reason RATE_LIMITED", async () => {
  let at = NOW.getTime();
  const handlers = createGlobalSearchHandlers({ livePorts: () => fakePorts({ "actor:a": [] }), now: () => new Date(at), resolveActor: async () => ({ id: "actor:a" }) as never });
  await withMode("live", async () => {
    for (let index = 0; index < GLOBAL_SEARCH_KEYWORD_PER_MINUTE; index += 1) assert.equal((await handlers.get(get("q=x"))).status, 200);
    const refused = await handlers.get(get("q=x"));
    assert.equal(refused.status, 429);
    assert.equal((await refused.json()).error.context.reason, "RATE_LIMITED");
    at += 61_000;
    assert.equal((await handlers.get(get("q=x"))).status, 200);
  });
});

test("searchLive: an actor with no contacts and no events gets the empty-state rows, never another actor's data", async () => {
  const out = await searchLive(fakePorts({ "actor:a": [] }), { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "商社" });
  assert.equal(out.people.total, 0);
  assert.deepEqual(out.suggestions.map((item) => item.label), ["貿易・物流"]);
  assert.equal(out.alternatives.length, 2);
});

test("live AND: per-term rows intersect by id in the first list's order; terms arrive folded (全角 / case)", async () => {
  assert.deepEqual(intersectById([[{ id: "a" }, { id: "b" }, { id: "c" }], [{ id: "c" }, { id: "a" }], [{ id: "a" }, { id: "c" }, { id: "z" }]]).map((row) => row.id), ["a", "c"]);
  assert.deepEqual(intersectById([[{ id: "a" }]]).map((row) => row.id), ["a"]);
  assert.deepEqual(intersectById([]), []);
  const asked: string[][] = [];
  const ports = { ...fakePorts({ "actor:a": [{ id: "a1", name: "高橋太郎 AI" }, { id: "a2", name: "高橋 花子" }] }), async people(_actor: string, terms: readonly string[]) { asked.push([...terms]); return { items: [], total: 0 }; } };
  await searchLive(ports, { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "高橋　ＡＩ" });
  assert.deepEqual(asked, [["高橋", "ai"]], "full-width space splits, ＡＩ folds to ai before reaching the reader");
  const both = await searchLive(fakePorts({ "actor:a": [{ id: "a1", name: "高橋太郎 AI" }, { id: "a2", name: "高橋 花子" }] }), { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "高橋 ＡＩ" });
  assert.deepEqual(both.people.items.map((hit) => hit.contactId), ["a1"]);
});

test("people total comes from the source, not the rows shown (人 · 50 with 6 rows)", () => {
  const many = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, lastInteractionAt: null, name: `高橋 ${index}`, org: null, other: [], role: null }));
  const result = buildGlobalSearch(core({ people: many, peopleTotal: 50 }));
  assert.equal(result.people.items.length, 6);
  assert.equal(result.people.total, 50);
});

test("single type イベント (A5): events found are shown, not the people-empty state; no events → empty without industry suggestions", () => {
  const hit = { emoji: "🎤", eventId: "e1", href: "/app/events/e1", myStatus: null, startsAt: "2026-10-16T10:00:00+09:00", title: "高橋 Summit", venue: "東京" } as unknown as EventSearchResponse["events"][number];
  const found = buildGlobalSearch(core({ events: events([hit]), industryCounts: [{ count: 3, id: "trade_logistics" }], wanted: ["events"] }));
  assert.equal(found.events.items.length, 1);
  assert.deepEqual(found.alternatives, []);
  const none = buildGlobalSearch(core({ events: events([]), industryCounts: [{ count: 3, id: "trade_logistics" }], query: "商社", terms: ["商社"], wanted: ["events"] }));
  assert.equal(none.alternatives.length, 2);
  assert.deepEqual(none.suggestions, [], "industry suggestions filter people");
  const demo = demoGlobalSearch({ limit: 6, platform: "web", query: "高橋", semantic: false, types: ["events"] });
  assert.equal(demo.events.items.length, 1);
  assert.deepEqual(demo.alternatives, []);
});

test("the request log carries the query length, never the query", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const handlers = createGlobalSearchHandlers({ livePorts: () => fakePorts({ "actor:a": [{ id: "a1", name: "秘密の高橋" }] }), now: () => NOW, resolveActor: async () => ({ id: "actor:a" }) as never });
    await withMode("live", async () => { await handlers.get(get(`q=${encodeURIComponent("秘密の高橋")}`)); });
  } finally { console.info = original; }
  const log = lines.join("\n");
  assert.match(log, /"queryLength":5/);
  assert.doesNotMatch(log, /秘密|高橋/);
});

test("the capability counts are cached per actor for 5 minutes", async () => {
  let at = NOW.getTime();
  let calls = 0;
  const ports = { ...fakePorts({ "actor:a": [] }), async counts() { calls += 1; return { industries: [], total: 7 }; } };
  const handlers = createGlobalSearchHandlers({ livePorts: () => ports, now: () => new Date(at), resolveActor: async () => ({ id: "actor:a" }) as never });
  await withMode("live", async () => {
    await handlers.get(get("q="));
    await handlers.get(get("q="));
    assert.equal(calls, 1);
    at += 5 * 60_000 + 1;
    const again = await (await handlers.get(get("q="))).json();
    assert.equal(calls, 2);
    assert.equal(again.data.searchedPeople, 7);
  });
});

test("意味検索 lite: concepts, literal vs 関連, board-style reasons, nothing for queries outside the table", () => {
  const t = splitSearchTerms("投資家");
  assert.deepEqual(liteMatch({ name: "高橋 美咲", org: "青葉ベンチャーズ", role: "パートナー" }, t), { kind: "related", reason: "役職「パートナー」· VC" });
  assert.deepEqual(liteMatch({ name: "山本 彩", org: "東都キャピタル", role: "シニアアソシエイト" }, t), { kind: "related", reason: "会社が VC" });
  assert.deepEqual(liteMatch({ name: "伊藤 直子", org: "ハルモニア", role: "CFO", other: ["VC 4社と面識"] }, t), { kind: "related", reason: "メモ「VC 4社と面識」" });
  assert.deepEqual(liteMatch({ name: "渡辺 翔", org: "Nexa Robotics", role: "代表", other: ["投資家を紹介できる"] }, t), { kind: "literal", reason: "「投資家を紹介できる」" });
  assert.equal(liteMatch({ name: "佐藤", org: "東亜商事", role: "営業" }, t), null);
  assert.deepEqual(liteMatch({ name: "佐藤", org: "東亜精機", role: "部長" }, splitSearchTerms("製造業の決裁者")), { kind: "related", reason: "役職「部長」· メーカー" });
  assert.equal(liteMatch({ name: "佐藤", org: "東亜商事", role: "部長" }, splitSearchTerms("製造業の決裁者")), null, "every concept a term names must hit");
  assert.deepEqual(liteMatch({ name: "Kim", org: "Blue Ventures", role: "Partner" }, splitSearchTerms("investor"), "en"), { kind: "related", reason: "Role “Partner”· VC" });
  assert.equal(liteCanExpand(splitSearchTerms("先月会った人")), false);
});

test("live semantic=1 expands through lite (relevance order, 一致 / 関連 counts, reasons, no highlights); semantic=0 does not", async () => {
  const people = [
    { id: "p1", name: "高橋 美咲", org: "青葉ベンチャーズ", role: "パートナー" },
    { id: "p2", name: "渡辺 翔", org: "Nexa", role: "代表", other: ["投資家を紹介できる"] },
    { id: "p3", name: "佐藤 一郎", org: "東亜商事", role: "営業" },
  ];
  const asked: string[][] = [];
  const ports: GlobalSearchLivePorts = {
    ...fakePorts({}),
    async people(_actor, terms) {
      asked.push([...terms]);
      const items = people.filter((person) => terms.every((term) => normalizeSearchText([person.name, person.org, person.role, ...(person.other ?? [])].join(" ")).includes(term))).map((person) => ({ ...person, lastInteractionAt: null, other: person.other ?? [] }));
      return { items, total: items.length };
    },
    semanticAvailable: true,
  };
  const on = await searchLive(ports, { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "投資家", semantic: true });
  assert.deepEqual(on.people.items.map((hit) => [hit.contactId, hit.reason, hit.related ?? false]), [["p2", "「投資家を紹介できる」", false], ["p1", "役職「パートナー」· VC", true]]);
  assert.deepEqual(on.semantic, { available: true, enabled: true, matched: 1, related: 1 });
  assert.equal(on.people.order, "relevance");
  assert.ok(on.people.items.every((hit) => hit.highlights.length === 0 && hit.status === null));
  assert.ok(asked.length > 1 && asked.length <= 13, "one literal read plus at most 12 synonym reads");
  asked.length = 0;
  const off = await searchLive(ports, { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "投資家", semantic: false });
  assert.deepEqual(off.people.items.map((hit) => hit.contactId), ["p2"]);
  assert.equal(off.semantic.enabled, false);
  assert.deepEqual(asked, [["投資家"]]);
  const capability = await searchLive(ports, { actorId: "actor:a", language: "ja", limit: 6, now: NOW, platform: "web", query: "" });
  assert.deepEqual(capability.examples, ["投資家", "製造業の決裁者"], "only the examples lite can answer");
  assert.equal(capability.semantic.available, true);
});

test("the live ports declare lite semantic search available (no AI, no provider needed)", () => {
  const source = readFileSync(new URL("../../features/search/global/live.ts", import.meta.url), "utf8");
  assert.match(source, /semanticAvailable: true,/);
  const imports = source.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /ai-quota|embedding|openai|deepseek|orbit-ai/iu, "lite imports no AI client");
});
