import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createPostgresContactCardReader, readContactSyncListRows, readOpenFollowUpContactIds, tokyoMonthStart } from "../../features/contacts/storage/contact-list-postgres-reader";
import { boundedGoalRelatedIds, wrapContactCardReader } from "../../features/contacts/card-service";
import { contactMetKind, contactSourceChip, meetingNoteValue } from "../../shared/compute/contact-source-chip";
import { contactDensity, mergeContactDensity } from "../../shared/compute/contact-density";
import { contactCardSchema as legacyCardSchemaShape } from "../../shared/api-schema/contact-card-page";
import { localContactDirectory, localContactDirectorySummary } from "../../shared/api-schema/contact-local-directory";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { z } from "zod";

// R11a SC-02 / SC-03 / SC-05：人脈列表的浓度 / 出どころ / 出会った場所 / 页签 / 絞り込み / 汇总在 SQL 里算，
// 与 shared/compute 的同一组规则逐人对照；汇总是 SQL 聚合，按全部联系人计数。
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const NOW = Date.parse("2026-10-18T03:00:00.000Z");
const T = "2026-10-01T00:00:00.000Z";

interface Seed {
  id: string;
  sourceType: string;
  label?: string;
  importFormat?: string;
  notes?: string;
  email?: string;
  phone?: string;
  metEventId?: string;
  createdAt?: string;
  linkedinConnectedAt?: string;
  primaryIndustryId?: string;
  secondaryIndustryId?: string;
  city?: string;
  stage?: string;
  user?: string;
}

const SEEDS: Seed[] = [
  { id: "c-meishi", sourceType: "business_card_ocr", email: "a@x.jp", metEventId: "ev1", primaryIndustryId: "finance", city: "Tokyo" },
  { id: "c-li", sourceType: "external_contacts", label: "CSV 导入", importFormat: "linkedin", notes: "LinkedIn: https://l/x", linkedinConnectedAt: "2024-03-10T03:00:00.000Z", primaryIndustryId: "it", secondaryIndustryId: "it.saas", city: "Osaka" },
  { id: "c-li-legacy", sourceType: "external_contacts", label: "CSV 导入", notes: "LinkedIn: https://l/y" },
  { id: "c-vcard-legacy", sourceType: "external_contacts", label: "vCard 导入", phone: "090" },
  { id: "c-generic", sourceType: "external_contacts", label: "CSV 导入", importFormat: "generic", notes: "LinkedIn: https://l/z" },
  { id: "c-event", sourceType: "event_import", importFormat: "event", metEventId: "ev2", email: "e@x.jp", city: "Tokyo" },
  { id: "c-self", sourceType: "referral", stage: "nurture" },
  { id: "c-visit", sourceType: "manual", notes: "メモ\n出会い：訪問（本社）", phone: "080", primaryIndustryId: "finance" },
  { id: "c-intro", sourceType: "manual", notes: "出会い：紹介（田中さん）" },
  { id: "c-interact", sourceType: "manual" },
  { id: "c-goal", sourceType: "manual", stage: "nurture" },
  { id: "c-follow", sourceType: "manual", createdAt: "2026-09-30T15:30:00.000Z" },
  { id: "c-follow-lc", sourceType: "qr_scan", createdAt: "2026-09-30T14:30:00.000Z" },
  { id: "c-done", sourceType: "manual", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "foreign", sourceType: "manual", user: "b" },
];
const INVITE = ["c-self"];
const GOAL = ["c-goal", "c-meishi"];
const INTERACTED = new Set(["c-interact"]);

function expectedFor(seed: Seed) {
  const inviteLinked = INVITE.includes(seed.id);
  const note = meetingNoteValue(seed.notes);
  const base = contactDensity({ hasIdentity: true, hasContactPoint: Boolean(seed.email || seed.phone), hasMetContext: Boolean(seed.metEventId) || note !== null,
    hasGoalRelation: false, hasInteraction: INTERACTED.has(seed.id), selfReported: inviteLinked }).level;
  return {
    density: base,
    effective: mergeContactDensity(base, { goalRelated: GOAL.includes(seed.id) }),
    sourceChip: contactSourceChip({ sourceType: seed.sourceType, format: seed.importFormat ?? null, sourceLabel: seed.label ?? "", hasLinkedinNote: /^LinkedIn:/mu.test(seed.notes ?? ""), inviteLinked }),
    metKind: contactMetKind({ sourceType: seed.sourceType, metEventId: seed.metEventId ?? null, inviteLinked, meetingNote: note }),
  };
}

test("R11a: list cards, tabs, filters and the summary are computed in SQL with the shared rules", { skip: !databaseUrl }, async () => {
  const schema = `contact_network_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  let bytes = 0;
  let reads = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    reads += 1;
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const common = { workspaceId: "w", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: T, updatedAt: T, lifecycleState: "active" as const };
    for (const seed of SEEDS) {
      await store.upsertRecord({ ...common, userId: seed.user ?? "a", collectionName: "contacts", recordId: seed.id, payload: {
        id: seed.id, displayName: `名前 ${seed.id}`, stage: seed.stage ?? "active",
        source: { type: seed.sourceType, id: "s", ...(seed.label ? { label: seed.label } : {}) }, evidenceIds: ["e"],
        createdAt: seed.createdAt ?? T, updatedAt: T,
        ...(seed.importFormat ? { importFormat: seed.importFormat } : {}),
        ...(seed.notes ? { notes: seed.notes } : {}),
        ...(seed.email ? { primaryEmail: seed.email } : {}),
        ...(seed.phone ? { primaryPhone: seed.phone } : {}),
        ...(seed.metEventId ? { metEventId: seed.metEventId } : {}),
        ...(seed.linkedinConnectedAt ? { linkedinConnectedAt: seed.linkedinConnectedAt } : {}),
        ...(seed.primaryIndustryId ? { primaryIndustryId: seed.primaryIndustryId } : {}),
        ...(seed.secondaryIndustryId ? { secondaryIndustryId: seed.secondaryIndustryId } : {}),
        ...(seed.city ? { region: { countryCode: "JP", city: seed.city } } : {}),
      } });
    }
    await store.upsertRecord({ ...common, userId: "a", collectionName: "contact_detail_states", recordId: "contact-detail:a:c-interact", payload: {
      actorId: "a", contactId: "c-interact", status: "active", updatedAt: T, tags: [],
      notes: [{ id: "n1", body: "会った", createdAt: T }],
      lastInteraction: { interactionId: "i1", channel: "meeting", occurredAt: "2026-10-16T09:00:00.000Z", summary: "面談" },
    } });
    const task = (id: string, contactId: string | undefined, status: string, extra: Record<string, unknown> = {}, lifecycleState: "active" | "deleted" = "active") =>
      store.upsertRecord({ ...common, lifecycleState, userId: "a", collectionName: "tasks", recordId: id, payload: { version: 1, activities: [],
        task: { id, accountId: "a", ownerUserId: "a", title: "t", status, category: "work", priority: "normal", source: "manual", createdAt: T, updatedAt: T, ...(contactId ? { relatedContactId: contactId } : {}), ...extra } } });
    await task("t-open", "c-follow", "open");
    await task("t-open-dup", "c-follow", "open");
    await task("t-done", "c-done", "completed");
    await task("t-cancel", "c-done", "cancelled");
    await task("t-deleted", "c-done", "open", {}, "deleted");
    await task("t-relationship-no-contact", undefined, "open", { category: "relationship" });
    await store.upsertRecord({ ...common, userId: "a", collectionName: "tasks", recordId: "lc-1", payload: { taskId: "lc-1", actorId: "a", contactId: "c-follow-lc", connectionId: "k1", status: "scheduled", purpose: "follow_up", title: "x", dueAt: T, createdAt: T, updatedAt: T, version: 1 } });
    await store.upsertRecord({ ...common, userId: "a", collectionName: "tasks", recordId: "lc-2", payload: { taskId: "lc-2", actorId: "a", contactId: "c-done", connectionId: "k2", status: "dismissed", purpose: "follow_up", title: "x", dueAt: T, createdAt: T, updatedAt: T, version: 1 } });

    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3), now: () => NOW });
    const merge = { goalRelatedIds: async () => GOAL, inviteLinkedIds: async () => INVITE };
    const service = wrapContactCardReader(reader, { id: "a" }, merge);

    // Every card carries the shared-rule facts (SC-02 parity, SC-03 density without the plan).
    bytes = 0; reads = 0;
    const page = await service.page({ limit: 50 }, "a");
    const firstPage = { reads, bytes };
    assert.equal(reads, 1);
    const own = SEEDS.filter((seed) => !seed.user);
    assert.equal(page.items.length, own.length);
    for (const seed of own) {
      const card = page.items.find((item) => item.id === seed.id)!;
      const expected = expectedFor(seed);
      assert.equal(card.density, expected.density, `${seed.id} density`);
      assert.equal(card.sourceChip, expected.sourceChip, `${seed.id} sourceChip`);
      assert.equal(card.metKind, expected.metKind, `${seed.id} metKind`);
      assert.equal(card.goalRelated, GOAL.includes(seed.id), `${seed.id} goalRelated`);
      assert.equal(mergeContactDensity(card.density, { goalRelated: card.goalRelated }), expected.effective, `${seed.id} merged density`);
    }
    const chips = Object.fromEntries(page.items.map((item) => [item.id, item.sourceChip]));
    assert.deepEqual(chips, { "c-meishi": "meishi", "c-li": "linkedin", "c-li-legacy": "linkedin", "c-vcard-legacy": "phone", "c-generic": "manual", "c-event": "event",
      "c-self": "self", "c-visit": "manual", "c-intro": "manual", "c-interact": "manual", "c-goal": "manual", "c-follow": "manual", "c-follow-lc": "meishi", "c-done": "manual" });
    const li = page.items.find((item) => item.id === "c-li")!;
    assert.equal(li.addedAt, "2024-03-10T03:00:00.000Z", "LinkedIn connection date is earlier than the entry time (R16 #2)");
    assert.deepEqual(li.region, { countryCode: "JP", city: "Osaka" });
    assert.equal(li.primaryIndustryId, "it");
    assert.equal(li.secondaryIndustryId, "it.saas");
    assert.equal(page.items.find((item) => item.id === "c-interact")!.lastInteractionAt, "2026-10-16T09:00:00.000Z");
    assert.equal(page.items.find((item) => item.id === "c-goal")!.density, 1, "the card density leaves the plan out");
    assert.equal(page.items.find((item) => item.id === "c-self")!.density, 3, "self-reported reads ●●●");

    const ids = async (query: Parameters<typeof service.page>[0]) => (await service.page({ limit: 50, ...query }, "a")).items.map((item) => item.id).sort();
    assert.deepEqual(await ids({ goalRelated: true }), ["c-goal", "c-meishi"]);
    assert.deepEqual(await ids({ needsFollowUp: true }), ["c-follow", "c-follow-lc"], "open plain tasks + open/scheduled lifecycle tasks; completed / cancelled / deleted / dismissed do not count");
    assert.deepEqual(await ids({ industryFilters: ["finance"] }), ["c-meishi", "c-visit"]);
    assert.deepEqual(await ids({ industryFilters: ["it.saas"] }), ["c-li"], "a secondary industry id (search 「近い条件なら」) matches");
    assert.deepEqual(await ids({ regionFilters: ["Tokyo"] }), ["c-event", "c-meishi"]);
    assert.equal((await ids({ regionFilters: ["none"] })).length, own.length - 3);
    assert.deepEqual(await ids({ metFilters: ["event"] }), ["c-event", "c-meishi"]);
    assert.deepEqual(await ids({ metFilters: ["referral"] }), ["c-intro", "c-self"]);
    assert.deepEqual(await ids({ metFilters: ["visit"] }), ["c-visit"]);
    assert.deepEqual(await ids({ densityFilters: ["3"] }), ["c-goal", "c-interact", "c-meishi", "c-self"], "density filter uses the plan-merged level");
    assert.deepEqual(await ids({ statusFilters: ["nurture"] }), ["c-goal", "c-self"]);
    assert.deepEqual(await ids({ goalRelated: true, statusFilters: ["active"] }), ["c-meishi"], "tabs and filters combine");
    assert.deepEqual(await ids({ metFilters: ["event", "visit"], industryFilters: ["finance"] }), ["c-meishi", "c-visit"]);

    assert.deepEqual(await readOpenFollowUpContactIds(client, { workspaceId: "w", actorId: "a" }), { ids: ["c-follow", "c-follow-lc"], truncated: false }, "the ids the App caches for 要フォロー");

    // Cursor paging under a filter is stable and complete.
    const walked: string[] = [];
    let cursor: string | null = null;
    do {
      const next = await service.page({ limit: 2, metFilters: ["other", "referral"], ...(cursor ? { cursor } : {}) }, "a");
      walked.push(...next.items.map((item) => item.id));
      cursor = next.nextCursor;
    } while (cursor);
    assert.deepEqual(walked.slice().sort(), await ids({ metFilters: ["other", "referral"] }));
    assert.equal(new Set(walked).size, walked.length);
    const filteredFirst = await service.page({ limit: 2, needsFollowUp: true }, "a");
    const allCursor = (await service.page({ limit: 2 }, "a")).nextCursor;
    await assert.rejects(service.page({ limit: 2, needsFollowUp: true, cursor: allCursor }, "a"), /CONTACT_CURSOR_INVALID/, "a cursor from another tab is refused");
    assert.equal(filteredFirst.hasMore, false);

    // Summary: SQL aggregation. total = matches of the query (everyone when unfiltered); the facets, addedThisMonth and tabCounts are over every contact.
    bytes = 0; reads = 0;
    const summary = await service.summary({}, "a");
    const summaryCost = { reads, bytes };
    assert.equal(reads, 1);
    assert.equal(summary.total, own.length);
    const counts = summary.densityCounts!;
    assert.equal(counts[1] + counts[2] + counts[3], summary.total);
    const effective = own.map((seed) => expectedFor(seed).effective);
    assert.deepEqual(counts, { 1: effective.filter((level) => level === 1).length, 2: effective.filter((level) => level === 2).length, 3: effective.filter((level) => level === 3).length });
    assert.equal(tokyoMonthStart(NOW), "2026-09-30T15:00:00.000Z");
    // c-follow joined at 2026-10-01 00:30 JST (this month); c-follow-lc at 2026-09-30 23:30 JST and c-done / c-li earlier.
    assert.equal(summary.addedThisMonth, own.filter((seed) => !["c-follow-lc", "c-done", "c-li"].includes(seed.id)).length);
    assert.deepEqual(summary.tabCounts, { goalRelated: 2, needsFollowUp: 2 });
    assert.equal(summary.sourceChips!.self, 1);
    assert.equal(summary.sourceChips!.event, 1);
    assert.equal(summary.industries!.finance, 2);
    assert.equal(summary.regions!.Tokyo, 2);
    assert.equal(summary.metKinds!.visit, 1);
    const filtered = await service.summary({ goalRelated: true, metFilters: ["event"] }, "a");
    assert.equal(filtered.total, 1, "total is the number of matches");
    assert.deepEqual(filtered.densityCounts, summary.densityCounts);
    assert.equal(filtered.addedThisMonth, summary.addedThisMonth);
    assert.deepEqual(filtered.tabCounts, summary.tabCounts);

    // Plans unavailable → density falls back to the card level and the tab is empty (SC-03).
    const noPlan = wrapContactCardReader(reader, { id: "a" }, { goalRelatedIds: async () => [], inviteLinkedIds: async () => INVITE });
    assert.deepEqual((await noPlan.page({ limit: 50, goalRelated: true }, "a")).items, []);
    assert.equal((await noPlan.summary({}, "a")).tabCounts!.goalRelated, 0);

    // Invalid filter values keep the original contract error.
    await assert.rejects(service.page({ metFilters: ["somewhere"] }, "a"), /CONTACT_PAGE_INPUT_INVALID/);
    await assert.rejects(service.page({ densityFilters: ["4"] }, "a"), /CONTACT_PAGE_INPUT_INVALID/);

    // Sync rows carry the same facts (self merged at read time, no plan).
    const rows = await readContactSyncListRows(client, { workspaceId: "w", actorId: "a", contactRecordIds: own.map((seed) => seed.id), inviteLinkedContactIds: INVITE });
    const self = rows.find((row) => row.contactId === "c-self")!;
    assert.equal(self.card?.sourceChip, "self");
    assert.equal(self.card?.density, 3);
    assert.equal(rows.find((row) => row.contactId === "c-goal")!.card?.goalRelated, undefined, "the mirror never carries the plan link");
    assert.equal(rows.find((row) => row.contactId === "c-event")!.card?.metKind, "event");

    // The device lists its mirror with the same rules (shared/api-schema/contact-local-directory.ts): same ids per filter, same facets.
    const mirror = rows.map((row) => ({ id: row.recordId, card: row.card, tags: row.tags, detail: null,
      search: { text: row.searchText, occurredAt: row.sortOccurredAt, updatedAt: row.sortUpdatedAt, error: row.errorCode } }));
    const local = { goalRelatedIds: GOAL, followUpContactIds: ["c-follow", "c-follow-lc"], monthStart: tokyoMonthStart(NOW) };
    const localIds = (query: Record<string, unknown>) => localContactDirectory(mirror, { ...local, ...query }).map((row) => row.id).sort();
    for (const query of [{ goalRelated: true }, { needsFollowUp: true }, { industryFilters: ["it.saas"] }, { regionFilters: ["none"] }, { metFilters: ["referral", "visit"] }, { densityFilters: ["3"] }, { goalRelated: true, statusFilters: ["active"] }]) {
      assert.deepEqual(localIds(query), await ids(query), JSON.stringify(query));
    }
    const localSummary = localContactDirectorySummary(mirror, local);
    for (const key of ["densityCounts", "addedThisMonth", "tabCounts", "sourceChips", "industries", "regions", "metKinds"] as const) {
      assert.deepEqual(localSummary[key], summary[key], key);
    }

    // An older App's schema (no R11a fields, strict enums) still reads the new cards: extra fields are dropped.
    const legacy = z.object(Object.fromEntries(Object.entries(legacyCardSchemaShape.shape).filter(([key]) => !["density", "sourceChip", "primaryIndustryId", "secondaryIndustryId", "region", "metKind", "addedAt", "lastInteractionAt", "goalRelated"].includes(key))));
    for (const item of page.items) assert.ok(legacy.safeParse(item).success);

    console.log(JSON.stringify({ measurement: "r11a-contact-network-read", contacts: own.length, firstPage, summary: summaryCost }));
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});

test("R11a: goal-related ids are de-duplicated, sorted and capped", () => {
  const many = Array.from({ length: 520 }, (_, n) => `c${String(n).padStart(4, "0")}`);
  const bounded = boundedGoalRelatedIds([...many, "c0001", " "]);
  assert.equal(bounded.ids.length, 500);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.ids[0], "c0000");
  assert.deepEqual(boundedGoalRelatedIds(["b", "a", "a"]), { ids: ["a", "b"], truncated: false });
});
