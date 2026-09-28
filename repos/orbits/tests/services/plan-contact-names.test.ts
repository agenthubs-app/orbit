/**
 * W0009：「我的计划」里联系人名字的批量读取（`features/plans/contact-names.ts`）。
 *
 * - 按快照里的 id 列表一次查询（去重、有上限，空列表不查），只取几个轻字段；
 * - 归属谓词与引用校验器一致：别人的联系人 id 读不出名字，界面显示占位名。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import { buildMyPlanViewModel } from "../../app/(app)/app/agent/plan/plan-route-view-model";
import {
  createPostgresPlanContactNameReader,
  PLAN_CONTACT_NAME_LIMIT,
  planContactIds,
} from "../../features/plans/contact-names";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { ME, OTHER } from "../support/plan-bootstrap-fixture";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

test("the reader queries once by a bounded, de-duplicated id list and skips empty lists", async () => {
  const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  const read = createPostgresPlanContactNameReader({
    client: {
      query: (async (sql: string, values?: readonly unknown[]) => {
        queries.push({ sql, values: values ?? [] });
        return {
          rows: [
            { display_name: " 森下真理 ", organization: "丸和工业", record_id: "contact:a", role: "课长" },
            { display_name: "只有名字", organization: null, record_id: "contact:b", role: " " },
            { display_name: "  ", organization: "x", record_id: "contact:blank", role: null },
          ],
        };
      }) as never,
    },
    workspaceId: "workspace:plans",
  });

  assert.deepEqual(await read(ME, []), {});
  assert.equal(queries.length, 0, "no ids → no query");

  const many = Array.from({ length: PLAN_CONTACT_NAME_LIMIT + 50 }, (_, index) => `contact:${index}`);
  const names = await read(ME, ["contact:a", "contact:a", "contact:b", ...many]);
  assert.equal(queries.length, 1);
  const [workspace, actor, ids] = queries[0]!.values as [string, string, string[]];
  assert.equal(workspace, "workspace:plans");
  assert.equal(actor, ME);
  assert.equal(ids.length, PLAN_CONTACT_NAME_LIMIT);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(queries[0]!.sql, /record_id = any\(\$3::text\[\]\)/);
  assert.match(queries[0]!.sql, /user_id = \$2/);
  assert.deepEqual(names, {
    "contact:a": { name: "森下真理", subtitle: "丸和工业 · 课长" },
    "contact:b": { name: "只有名字", subtitle: null },
  });
});

test("the snapshot's contact ids are every linked contact once", () => {
  assert.deepEqual(planContactIds(planSnapshotFixture()), ["contact:c1", "contact:c2"]);
});

/* ── 真实 PostgreSQL ────────────────────────────────────────────────── */

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

test(
  "real PG: several of my contacts resolve; another actor's contact id stays a placeholder",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname), "ORBIT_EVENT_DATABASE_URL must be a loopback database");
    const schema = `plan_names_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
    await client.connect();
    try {
      await client.query(`create schema ${schema}`);
      await client.query(`set search_path = ${schema}`);
      await client.query(ORBIT_RECORDS_SCHEMA_SQL);
      const insert = (recordId: string, userId: string, payload: Record<string, unknown>, lifecycle = "active") =>
        client.query(
          `insert into orbit_records
             (workspace_id, collection_name, record_id, user_id, lifecycle_state, payload, source_type, source_id, evidence_ids, created_at, updated_at)
           values ('workspace:plans', 'contacts', $1, $2, $3, $4::jsonb, 'manual', 'test', '{}'::text[], now(), now())`,
          [recordId, userId, lifecycle, JSON.stringify(payload)],
        );
      await insert("contact:c1", ME, { displayName: "森下真理", id: "contact:c1", organization: "丸和工业", role: "情报系统课长" });
      await insert("contact:c2", ME, { accountId: ME, displayName: "高木一郎", id: "contact:c2", organization: "北辰精工" });
      await insert("contact:theirs", OTHER, { displayName: "别人的联系人", id: "contact:theirs" });
      await insert("contact:other-account", ME, { accountId: OTHER, displayName: "别的账号", id: "contact:other-account" });
      await insert("contact:deleted", ME, { displayName: "已删除", id: "contact:deleted" }, "deleted");

      const read = createPostgresPlanContactNameReader({
        client: { query: (sql: string, values?: readonly unknown[]) => client.query(sql, values as unknown[]) as never },
        workspaceId: "workspace:plans",
      });
      const names = await read(ME, ["contact:c1", "contact:c2", "contact:theirs", "contact:other-account", "contact:deleted"]);
      assert.deepEqual(names, {
        "contact:c1": { name: "森下真理", subtitle: "丸和工业 · 情报系统课长" },
        "contact:c2": { name: "高木一郎", subtitle: "北辰精工" },
      });

      // 快照里关联了一个别人的联系人 id：界面显示占位名，不泄露对方的名字。
      const snapshot = planSnapshotFixture();
      snapshot.items = snapshot.items.map((item) =>
        item.id === "n-connector"
          ? {
              ...item,
              contactLinks: [
                ...item.contactLinks,
                { contactId: "contact:theirs", establishedAt: null, linkedAt: "2026-09-27T01:00:00.000Z", state: "linked" as const },
              ],
            }
          : item,
      );
      const model = buildMyPlanViewModel({
        contactNames: await read(ME, planContactIds(snapshot)),
        guideEnabled: true,
        language: "zh",
        now: PLAN_NOW,
        snapshot,
      });
      assert.equal(model.state, "ready");
      const people = model.state === "ready" ? model.view.needs[0]!.people : [];
      assert.deepEqual(
        people.map((person) => [person.contactId, person.name, person.subtitle, person.known]),
        [
          ["contact:theirs", "联系人", null, false],
          ["contact:c2", "高木一郎", "北辰精工", true],
          ["contact:c1", "森下真理", "丸和工业 · 情报系统课长", true],
        ],
      );
    } finally {
      await client.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await client.end();
    }
  },
);
