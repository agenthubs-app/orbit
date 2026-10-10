/**
 * W0048a SC-W0048a-03 R-5（真实 PostgreSQL，严格 sync_revision 与无 sync_revision 两种库）：
 * sourceDataVersion 按来源分别定义版本算法——每个来源「只改它 → 它那一段与总版本变；不依赖它的段不变」，
 * 都不改 → 版本不变；plan_log 用 count:sum(seq):max(seq)，SQL 不引用 plan_log.sync_revision。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSnapshotSourceVersionReader, snapshotTimelinePlanVersionSql, type SnapshotSourceParts } from "../../features/network-analysis/source-version";
import { ALICE, BOB, databaseTest, insertActivePlan, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const PROFILE = { profile: { relationshipGoal: "goal" }, state: "ready" };

async function seed(harness: NetworkHarness) {
  await harness.addContact(ALICE, "c1");
  await harness.addContact(ALICE, "c2");
  await harness.addContact(BOB, "b1");
  await harness.insertRecord({ collection: "notes", id: "note-1", payload: { note: { accountId: ALICE, contactIds: ["c1"], id: "note-1", ownerUserId: ALICE } }, userId: ALICE });
  await insertActivePlan(harness.pool, ALICE, { needs: [{ id: "need-1", title: "SaaS 决策人" }, { id: "need-2", title: "投资人" }] });
}

type Part = keyof SnapshotSourceParts;

async function check(harness: NetworkHarness, rules: { value: string }, label: string, change: () => Promise<void>, expected: Part[]) {
  const reader = createSnapshotSourceVersionReader({ client: harness.client, strengthRulesVersion: () => rules.value, workspaceId: WORKSPACE });
  const read = () => reader.read({ actorId: ALICE, goal: "goal", profileSection: PROFILE, promptVersion: "p1" });
  const before = await read();
  await change();
  const after = await read();
  const changed = (Object.keys(before.parts) as Part[]).filter((part) => before.parts[part] !== after.parts[part]).sort();
  assert.deepEqual(changed, [...expected].sort(), `${label}: changed parts`);
  assert.notEqual(after.sourceDataVersion, before.sourceDataVersion, `${label}: version moves`);
  assert.match(after.sourceDataVersion, /^[0-9a-f]{64}$/);
}

for (const syncRevision of [true, false]) {
  test(`SC-03 R-5 (${syncRevision ? "strict sync_revision" : "no sync_revision column"}): each source alone moves the version; nothing changed → same version`, databaseTest, async () => {
    await withNetworkDatabase(async (harness) => {
      await seed(harness);
      const rules = { value: "rs-test-v1" };
      const reader = createSnapshotSourceVersionReader({ client: harness.client, strengthRulesVersion: () => rules.value, workspaceId: WORKSPACE });
      const a = await reader.read({ actorId: ALICE, goal: "goal", profileSection: PROFILE, promptVersion: "p1" });
      const b = await reader.read({ actorId: ALICE, goal: "goal", profileSection: PROFILE, promptVersion: "p1" });
      assert.deepEqual(b, a, "nothing changed → identical version");
      // 别人的数据变化不影响本人版本。
      await harness.addContact(BOB, "b2");
      assert.equal((await reader.read({ actorId: ALICE, goal: "goal", profileSection: PROFILE, promptVersion: "p1" })).sourceDataVersion, a.sourceDataVersion);

      await check(harness, rules, "orbit_records six collections (contacts)", () => harness.addContact(ALICE, "c3"), ["graphVersion", "strengthVersion"]);
      await check(harness, rules, "six collections (contact_detail_states update)", () => harness.insertRecord({ collection: "contact_detail_states", id: "detail:c1", payload: { actorId: ALICE, contactId: "c1", notes: [] }, userId: ALICE }), ["graphVersion", "strengthVersion"]);
      await check(harness, rules, "notes", () => harness.insertRecord({ collection: "notes", id: "note-2", payload: { note: { accountId: ALICE, contactIds: ["c2"], id: "note-2", ownerUserId: ALICE } }, userId: ALICE }), ["strengthVersion", "timelineVersion"]);
      await check(harness, rules, "human_encounters", () => harness.insertRecord({ collection: "human_encounters", id: "enc-1", payload: { actorId: ALICE, contactId: "c1", observedAt: "2026-09-30T00:00:00.000Z" }, userId: ALICE }), ["strengthVersion", "timelineVersion"]);
      await check(harness, rules, "personal_schedule_items", () => harness.insertRecord({ collection: "personal_schedule_items", id: "s-1", payload: { contactIds: ["c1"], id: "s-1", kind: "meeting", startsAt: "2026-09-29T00:00:00.000Z" }, userId: ALICE }), ["strengthVersion", "timelineVersion"]);
      await check(harness, rules, "plan_log append", () => harness.pool.query(
        `insert into plan_log (workspace_id, id, actor_id, plan_id, kind, event, author, body, idempotency_key) values ($1, 'log-1', $2, $3, 'manual', 'note', 'user', 'x', 'log-1')`,
        [WORKSPACE, ALICE, `plan:${ALICE}`],
      ).then(() => undefined), ["planLogVersion"]);
      await check(harness, rules, "plan_items: edit a need", () => harness.pool.query(
        `update plan_items set title = 'SaaS 采购决策人', updated_at = now() + interval '1 second' where workspace_id = $1 and id = 'need-1'`, [WORKSPACE],
      ).then(() => undefined), ["planNeedVersion"]);
      await check(harness, rules, "plan_items: delete a need", () => harness.pool.query(`delete from plan_items where workspace_id = $1 and id = 'need-2'`, [WORKSPACE]).then(() => undefined), ["planNeedVersion"]);
      await check(harness, rules, "relationship strength source stamp (memo_extractions)", () => harness.insertRecord({ collection: "memo_extractions", id: "me-1", payload: { actorId: ALICE, noteId: "n", status: "succeeded" }, userId: ALICE }), ["strengthVersion"]);
      await check(harness, rules, "relationship strength rulesVersion", async () => { rules.value = "rs-test-v2"; }, ["strengthVersion"]);
      // 生效计划换版本（id:version 变）。
      await check(harness, rules, "plan version", () => harness.pool.query(`update plans set version = 2 where workspace_id = $1 and actor_id = $2`, [WORKSPACE, ALICE]).then(() => undefined), ["planNeedVersion"]);
      // 目标原文变化：资料段变 → 总版本变（graph 段本身不变），goalDigest 变。
      const goalReader = createSnapshotSourceVersionReader({ client: harness.client, strengthRulesVersion: () => rules.value, workspaceId: WORKSPACE });
      const g1 = await goalReader.read({ actorId: ALICE, goal: "goal", profileSection: PROFILE, promptVersion: "p1" });
      const g2 = await goalReader.read({ actorId: ALICE, goal: "new goal", profileSection: { profile: { relationshipGoal: "new goal" }, state: "ready" }, promptVersion: "p1" });
      assert.deepEqual(g2.parts, g1.parts);
      assert.notEqual(g2.sourceDataVersion, g1.sourceDataVersion);
      assert.notEqual(g2.goalDigest, g1.goalDigest);
    }, { syncRevision });
  });
}

test("SC-03 R-5 the timeline/plan SQL never reads plan_log.sync_revision", () => {
  for (const mode of ["revision", "timestamp"] as const) {
    const sql = snapshotTimelinePlanVersionSql(mode);
    const planLogPart = sql.slice(sql.indexOf("from plan_log") - 120, sql.indexOf("from plan_log"));
    assert.ok(!planLogPart.includes("sync_revision"), mode);
    assert.match(sql, /coalesce\(sum\(seq\), 0\)/);
  }
});

test("R22 (review M8): with two active v2 goals, a change to the second goal's types moves the plan need version", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const insertGoal = (id: string, goal: string, version: number) => harness.pool.query(
      `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, starts_on, model_version, goal_id, goal_kind, event_allocation, event_target_count)
       values ($1, $2, $3, $4, 'active', 'g', '2026-10-01', 2, $5, 'launch', 15, 3)`, [WORKSPACE, id, ALICE, version, goal]);
    await insertGoal("goal-a", "intake-a", 1);
    await insertGoal("goal-b", "intake-b", 2);
    for (const [id, plan] of [["type-a", "goal-a"], ["type-b", "goal-b"]] as const) {
      await harness.pool.query(
        `insert into plan_items (workspace_id, id, actor_id, plan_id, kind, title, status, sort_key, criteria, allocation, type_slot)
         values ($1, $2, $3, $4, 'network_need', 'VC', 'open', 1, '{"targetCount":2}'::jsonb, 30, 'vc')`, [WORKSPACE, id, ALICE, plan]);
    }
    const read = async () => (await harness.pool.query(snapshotTimelinePlanVersionSql("timestamp"), [WORKSPACE, ALICE])).rows[0].plan_need_version as string;
    const before = await read();
    assert.ok(before.includes("goal-a") && before.includes("goal-b"), before);
    assert.equal(await read(), before, "stable when nothing changed");
    await harness.pool.query(`update plan_items set updated_at = now() + interval '1 minute', skipped_at = now() where id = 'type-b'`);
    assert.notEqual(await read(), before);
  });
});
