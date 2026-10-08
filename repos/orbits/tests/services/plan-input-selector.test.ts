/**
 * W0008 SC-03：生成器输入裁剪与真实数据来源。
 *
 * - 本人联系人 199／200 位全部带上，201 位起只保留近 90 天有互动的与和目标相关的；
 * - 只取本人的联系人（别人的混进来也会被挡掉）；
 * - 真实 PostgreSQL：读取 SQL 按 actor 过滤、排除初始化中与已删除的、带上本人记录的最后互动；
 *   活动只取已发布且还没开始的。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import type { PlanInputContact } from "../../features/plans/generator";
import {
  PLAN_INPUT_CONTACT_LIMIT,
  PLAN_INPUT_RECENT_DAYS,
  selectPlanContacts,
} from "../../features/plans/input-selector";
import {
  createEventCorePlanEventReader,
  createPostgresPlanContactReader,
} from "../../features/plans/input-source";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { ME, NOW, OTHER, contact } from "../support/plan-bootstrap-fixture";

const GOAL = "三个月内认识 3 位日本市场的渠道伙伴";
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

/** n 位「老的、和目标无关」的本人联系人。 */
function oldUnrelated(count: number, prefix = "old"): PlanInputContact[] {
  return Array.from({ length: count }, (_, index) =>
    contact({ createdAt: daysAgo(400), displayName: `${prefix}-${String(index).padStart(3, "0")}`, id: `contact:${prefix}-${index}` }),
  );
}

test("199 and 200 contacts are all kept; the 201st turns on trimming", () => {
  for (const count of [PLAN_INPUT_CONTACT_LIMIT - 1, PLAN_INPUT_CONTACT_LIMIT]) {
    const selection = selectPlanContacts({ actorId: ME, contacts: oldUnrelated(count), goalText: GOAL, now: NOW });
    assert.equal(selection.contacts.length, count);
    assert.equal(selection.total, count);
    assert.equal(selection.trimmed, false);
  }
  const selection = selectPlanContacts({ actorId: ME, contacts: oldUnrelated(PLAN_INPUT_CONTACT_LIMIT + 1), goalText: GOAL, now: NOW });
  assert.equal(selection.total, 201);
  assert.equal(selection.trimmed, true);
  assert.equal(selection.contacts.length, 0, "none of them is recent or related to the goal");
});

test("over 200: keep contacts with an interaction in the last 90 days and contacts related to the goal", () => {
  const recentInteraction = contact({ createdAt: daysAgo(400), id: "contact:recent-talk", lastInteractionAt: daysAgo(PLAN_INPUT_RECENT_DAYS - 1) });
  const recentCard = contact({ createdAt: daysAgo(10), id: "contact:new-card" });
  const edgeOld = contact({ createdAt: daysAgo(400), id: "contact:edge", lastInteractionAt: daysAgo(PLAN_INPUT_RECENT_DAYS + 1) });
  const relatedByRole = contact({ createdAt: daysAgo(500), id: "contact:channel", role: "渠道经理" });
  const relatedByIndustry = contact({ createdAt: daysAgo(500), id: "contact:logistics", primaryIndustryId: "trade_logistics" });
  const contacts = [...oldUnrelated(200), recentInteraction, recentCard, edgeOld, relatedByRole, relatedByIndustry];

  const selection = selectPlanContacts({ actorId: ME, contacts, goalText: GOAL, now: NOW });
  assert.equal(selection.total, 205);
  assert.deepEqual(
    selection.contacts.map((entry) => entry.id),
    // 与目标相关的在前，其次按最近互动倒序。
    ["contact:channel", "contact:logistics", "contact:new-card", "contact:recent-talk"],
  );
});

test("only the actor's own contacts are counted and selected", () => {
  const mine = oldUnrelated(3, "mine");
  const theirs = [contact({ createdAt: daysAgo(1), id: "contact:theirs", ownerId: OTHER, role: "渠道经理" })];
  const selection = selectPlanContacts({ actorId: ME, contacts: [...theirs, ...mine], goalText: GOAL, now: NOW });
  assert.equal(selection.total, 3);
  assert.deepEqual(selection.contacts.map((entry) => entry.ownerId), [ME, ME, ME]);

  // 别人的 200 位不会让本人的 3 位被裁掉。
  const flooded = selectPlanContacts({ actorId: ME, contacts: [...oldUnrelated(250, "x").map((entry) => ({ ...entry, ownerId: OTHER })), ...mine], goalText: GOAL, now: NOW });
  assert.equal(flooded.trimmed, false);
  assert.equal(flooded.contacts.length, 3);
});

test("upcoming published events only, earliest first, as canonical ids", async () => {
  const published = (eventId: string, startsAt: string, phase: "upcoming" | "live" | "ended") => ({
    endsAt: startsAt,
    eventId,
    phase,
    startsAt,
    title: `Event ${eventId}`,
    venue: null,
  });
  const read = createEventCorePlanEventReader({
    listPublishedEvents: async () =>
      [
        published("ev-late", "2026-11-01T00:00:00.000Z", "upcoming"),
        published("ev-ended", "2026-09-01T00:00:00.000Z", "ended"),
        published("ev-soon", "2026-10-01T00:00:00.000Z", "upcoming"),
        published("ev-live", "2026-09-28T01:00:00.000Z", "live"),
      ] as never,
  });
  assert.deepEqual((await read(NOW)).map((event) => event.id), ["ev-soon", "ev-late"]);
  assert.deepEqual(await createEventCorePlanEventReader(null)(NOW), []);
});

/* ── 真实 PostgreSQL ────────────────────────────────────────────────── */

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

test(
  "the contact SQL reads only the actor's confirmed contacts with their own last interaction",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must be a loopback database");
    const schema = `plan_input_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
    await client.connect();
    try {
      await client.query(`create schema ${schema}`);
      await client.query(`set search_path = ${schema}`);
      await client.query(ORBIT_RECORDS_SCHEMA_SQL);
      const insert = (collection: string, recordId: string, userId: string, payload: Record<string, unknown>, lifecycle = "active") =>
        client.query(
          `insert into orbit_records
             (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
           values ('workspace:plans', $1, $2, $3, $4, $5::jsonb, 'manual', 'test', '{}'::text[], now(), now())`,
          [collection, recordId, userId, lifecycle, JSON.stringify(payload)],
        );
      await insert("contacts", "contact:mine", ME, {
        displayName: "王砚",
        id: "contact:mine",
        organization: "北辰精工",
        primaryIndustryId: "manufacturing_supply_chain",
        role: "采购部长",
        secondaryIndustryId: "manufacturing_supply_chain.robotics",
      });
      await insert("contacts", "contact:mine-quiet", ME, { accountId: ME, displayName: "佐藤", id: "contact:mine-quiet" });
      await insert("contacts", "contact:pending", ME, { displayName: "待确认", id: "contact:pending", lifecycleInitialization: "pending" });
      await insert("contacts", "contact:deleted", ME, { displayName: "已删除", id: "contact:deleted" }, "deleted");
      await insert("contacts", "contact:other-account", ME, { accountId: OTHER, displayName: "别的账号", id: "contact:other-account" });
      await insert("contacts", "contact:theirs", OTHER, { displayName: "别人的", id: "contact:theirs" });
      await insert("contact_detail_states", "state:mine", ME, {
        actorId: ME,
        contactId: "contact:mine",
        lastInteraction: { channel: "meeting", occurredAt: "2026-09-20T00:00:00.000Z", summary: "见面" },
      });
      // 别人给同一个联系人记的互动不算本人的互动。
      await insert("contact_detail_states", "state:theirs", OTHER, {
        actorId: OTHER,
        contactId: "contact:mine-quiet",
        lastInteraction: { channel: "meeting", occurredAt: "2026-09-25T00:00:00.000Z", summary: "x" },
      });

      const read = createPostgresPlanContactReader({
        client: { query: (sql: string, values?: readonly unknown[]) => client.query(sql, values as unknown[]) as never },
        workspaceId: "workspace:plans",
      });
      const query = { goalText: GOAL, now: NOW };
      const { contacts: rows, total } = await read(ME, query);
      assert.equal(total, 2);
      assert.deepEqual(rows.map((row) => row.id).sort(), ["contact:mine", "contact:mine-quiet"]);
      const mine = rows.find((row) => row.id === "contact:mine")!;
      assert.equal(mine.ownerId, ME);
      assert.equal(mine.lastInteractionAt, "2026-09-20T00:00:00.000Z");
      assert.equal(mine.primaryIndustryId, "manufacturing_supply_chain");
      assert.equal(mine.secondaryIndustryId, "manufacturing_supply_chain.robotics");
      assert.equal(rows.find((row) => row.id === "contact:mine-quiet")!.lastInteractionAt, null);
      assert.deepEqual((await read(OTHER, query)).contacts.map((row) => row.id), ["contact:theirs"]);
    } finally {
      await client.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await client.end();
    }
  },
);

test(
  "over 5000 contacts: the retention rules run in SQL, so an old contact with a recent interaction is never cut by the read cap",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must be a loopback database");
    const schema = `plan_input_big_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
    await client.connect();
    try {
      await client.query(`create schema ${schema}`);
      await client.query(`set search_path = ${schema}`);
      await client.query(ORBIT_RECORDS_SCHEMA_SQL);
      const old = new Date(NOW.getTime() - 400 * DAY).toISOString();
      // 5001 位建档很久、没有近期互动、与目标无关的联系人——比保险上限（5000）还多。
      await client.query(
        `insert into orbit_records
           (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
         select 'workspace:plans', 'contacts', 'contact:bulk-' || n, $1, 'active',
                jsonb_build_object('id', 'contact:bulk-' || n, 'displayName', 'Bulk ' || n),
                'manual', 'test', '{}'::text[], $2::timestamptz + (n || ' seconds')::interval, now()
           from generate_series(1, 5001) as n`,
        [ME, old],
      );
      const insertOld = (recordId: string, payload: Record<string, unknown>) =>
        client.query(
          `insert into orbit_records
             (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
           values ('workspace:plans', 'contacts', $1, $2, 'active', $3::jsonb, 'manual', 'test', '{}'::text[], $4::timestamptz - interval '1 day', now())`,
          [recordId, ME, JSON.stringify({ id: recordId, ...payload }), old],
        );
      await insertOld("contact:old-but-talked", { displayName: "老朋友" });
      await insertOld("contact:old-related", { displayName: "渠道经理", role: "渠道经理" });
      await insertOld("contact:old-quiet", { displayName: "很久没联系" });
      await client.query(
        `insert into orbit_records
           (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
         values ('workspace:plans', 'contact_detail_states', 'state:talked', $1, 'active', $2::jsonb, 'manual', 'test', '{}'::text[], now(), now())`,
        [ME, JSON.stringify({ actorId: ME, contactId: "contact:old-but-talked", lastInteraction: { channel: "call", occurredAt: daysAgo(3), summary: "通话" } })],
      );

      const read = createPostgresPlanContactReader({
        client: { query: (sql: string, values?: readonly unknown[]) => client.query(sql, values as unknown[]) as never },
        workspaceId: "workspace:plans",
      });
      const { contacts, total } = await read(ME, { goalText: GOAL, now: NOW });
      assert.equal(total, 5004);
      assert.deepEqual(contacts.map((row) => row.id).sort(), ["contact:old-but-talked", "contact:old-related"]);
      // 超过 200 位但一条都没筛中：仍然拿到总数（不会误判成「联系人很少」）。
      const unrelated = await read(ME, { goalText: "从 0 到 1 打造自有品牌", now: new Date(NOW.getTime() + 200 * DAY) });
      assert.deepEqual(unrelated, { contacts: [], total: 5004 });
      assert.deepEqual(await read(OTHER, { goalText: GOAL, now: NOW }), { contacts: [], total: 0 });

      const selection = selectPlanContacts({ actorId: ME, contacts, goalText: GOAL, now: NOW, total });
      assert.equal(selection.trimmed, true);
      assert.equal(selection.total, 5004);
      assert.deepEqual(selection.contacts.map((row) => row.id), ["contact:old-related", "contact:old-but-talked"]);
    } finally {
      await client.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await client.end();
    }
  },
);
