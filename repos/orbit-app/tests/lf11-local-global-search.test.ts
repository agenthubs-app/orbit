import assert from "node:assert/strict";
import test from "node:test";

import type { AiSessionSummaryItemContract } from "../src/api/contract/ai-session-page";
import type { ContactSyncPayload } from "../src/api/contract/contact-local-directory";
import type { GlobalSearchResponse } from "../src/api/contract/global-search";
import { localGlobalSearch } from "../src/screens/search/local-global-search";
import { buildGlobalSearch } from "../../orbits/features/search/global/core";
import { normalizeSearchText } from "../src/api/compute/search-normalize";

// LF11: the device's global search. People come from the contacts mirror with the server's rule (each term on its own,
// AND by id) and the server's core ranks and groups them; events (and online conversations) are the server's answer.
const NOW = new Date("2026-10-21T03:00:00.000Z");
function contact(id: string, name: string, org: string, role: string, extra: { industry?: string; last?: string; text?: string } = {}): ContactSyncPayload {
  return {
    id,
    card: { id, displayName: name, organization: org, role, sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-10-01T00:00:00.000Z",
      ...(extra.industry ? { primaryIndustryId: extra.industry } : {}), ...(extra.last ? { lastInteractionAt: extra.last } : {}) },
    tags: [],
    search: { text: normalizeSearchText([name, org, role, extra.text ?? ""].join(" ")), occurredAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", error: null },
    detail: null,
  };
}
const contacts = [
  contact("c1", "高橋 美咲", "青葉ベンチャーズ", "パートナー", { industry: "finance_investment", last: "2026-10-10T00:00:00.000Z" }),
  contact("c2", "高田 健", "星河能源", "CEO", { last: "2026-10-12T00:00:00.000Z" }),
  contact("c3", "佐藤 花子", "高橋商事", "営業", { text: "メモ 半導体" }),
  contact("c4", "山本 一郎", "東海キャピタル", "投資担当", { industry: "finance_investment" }),
];
const session = (id: string, title: string, updatedAt: string): AiSessionSummaryItemContract => ({
  id, title, firstUserText: "", lastMessagePreview: "", createdAt: updatedAt, updatedAt, messageRevision: 1, organization: { customTitle: null, groupId: null, pinned: false, revision: 0 },
});
const base = { language: "ja" as const, now: NOW, contacts, goalIds: ["c1"], sessions: [session("s1", "高橋さんへの紹介", "2026-10-20T01:00:00.000Z")], server: null, filter: "all" as const };

test("people: AND across terms, name hits first, plan chips from the cached goal ids", () => {
  const result = localGlobalSearch({ ...base, query: "高" });
  assert.deepEqual(result.people.items.map((item) => item.contactId), ["c2", "c1", "c3"], "name starts (by last contact) before an organisation hit");
  assert.deepEqual(result.people.items.map((item) => item.status), ["acquaintance", "in_progress", "acquaintance"]);
  assert.equal(result.people.total, 3);
  assert.deepEqual(localGlobalSearch({ ...base, query: "高橋 商事" }).people.items.map((item) => item.contactId), ["c3"]);
  assert.equal(localGlobalSearch({ ...base, query: "" }).searchedPeople, 4);
});

test("lite: a concept word also recalls its synonyms, literal hits first", () => {
  const result = localGlobalSearch({ ...base, query: "投資家", semantic: true });
  assert.deepEqual(new Set(result.people.items.map((item) => item.contactId)), new Set(["c1", "c4"]));
  assert.equal(result.people.order, "relevance");
  assert.equal(localGlobalSearch({ ...base, query: "投資家" }).people.items.length, 0, "without lite only literal text matches");
});

test("events and online conversations are the server's groups; offline the device's AI sessions answer", () => {
  const event = { emoji: "🎟️", eventId: "e1", href: "/events/e1", highlights: [], note: "10/30", startsAt: "2026-10-30T09:00:00.000Z", title: "高橋 VC ナイト", via: null };
  const server = { events: { items: [event], total: 1 }, conversations: { items: [{ id: "srv", kind: "iorbit", title: "本文で一致", subtitle: "", highlights: [], href: "/ai/srv" }], total: 1 } } as unknown as GlobalSearchResponse;
  const online = localGlobalSearch({ ...base, query: "高橋", server });
  assert.deepEqual(online.events.items.map((item) => item.eventId), ["e1"]);
  assert.deepEqual(online.conversations?.items.map((item) => item.id), ["srv"]);
  const offline = localGlobalSearch({ ...base, query: "高橋" });
  assert.deepEqual(offline.events, { items: [], total: 0 });
  assert.deepEqual(offline.conversations?.items.map((item) => [item.id, item.subtitle, item.href]), [["s1", "10/20 · iOrbit との会話", "/ai/s1"]]);
});

test("nothing found: the server's empty rule — industry suggestions from the device's counts and the two other ways", () => {
  const result = localGlobalSearch({ ...base, query: "金融" });
  assert.equal(result.people.items.length, 0);
  assert.deepEqual(result.suggestions.map((item) => [item.href, item.count]), [["/contacts?industry=finance_investment", 2]]);
  assert.deepEqual(result.alternatives.map((item) => item.kind), ["ask_iorbit", "events"]);
});

test("the same candidates give the server's answer (one core on both sides)", () => {
  const people = contacts.map((row) => ({ id: row.id, name: row.card!.displayName, org: row.card!.organization, role: row.card!.role, other: [null, ""], lastInteractionAt: row.card!.lastInteractionAt ?? null }));
  const server = buildGlobalSearch({ query: "高", terms: ["高"], limit: 6, types: ["people", "events", "conversations"], platform: "app", language: "ja", now: NOW, people: people.filter((person) => normalizeSearchText(`${person.name} ${person.org} ${person.role}`).includes("高")), planLinked: new Set(["c1"]), searchedPeople: 4, events: null, conversations: null, industryCounts: [], semanticAvailable: true, examples: [] });
  const device = localGlobalSearch({ ...base, query: "高", sessions: [] });
  assert.deepEqual(device.people, server.people);
});
