/**
 * W0007 SC-01 / SC-02 / SC-03（真实 PostgreSQL）：plans / plan_items / plan_log 迁移与仓储。
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库，每个用例在随机 schema 里建表、用完即删。
 * 地址不是本机回环时直接失败（不是 skip）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { PLAN_MIGRATIONS, runPlanMigrations } from "../../features/plans/migrations";
import { createPostgresPlanRepository, type PlanRepository } from "../../features/plans/repository";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { PlanService } from "../../features/plans/contract";
import { planInput, steppingClock } from "../support/plan-fixture";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
};

const WORKSPACE = "workspace:plans-repository-test";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** 真实库只能是本机回环地址：不满足就让测试失败（不是 skip），也不打印连接串。 */
function assertLoopbackDatabaseUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    assert.fail("ORBIT_EVENT_DATABASE_URL is not a valid URL.");
  }
  assert.ok(
    LOOPBACK_HOSTS.has(hostname),
    "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL (localhost / 127.0.0.1 / ::1).",
  );
}

const PUBLISHED_EVENT_CATALOGUE = {
  async getPublishedEvent(id: string) {
    return id === "event:tokyo-saas-night" ? ({ eventId: id } as never) : null;
  },
};

/** alice 有 tanaka / sato / suzuki，另有一条已删除的 deleted-one；bob 有 bob-only；accountId 不符的一条不算。 */
async function seedContacts(pool: Pool): Promise<void> {
  const rows: Array<[string, string, string, Record<string, unknown>]> = [
    ["contact:tanaka", "actor:alice", "active", {}],
    ["contact:sato", "actor:alice", "active", {}],
    ["contact:suzuki", "actor:alice", "active", { accountId: "actor:alice" }],
    ["contact:deleted-one", "actor:alice", "deleted", {}],
    ["contact:bob-only", "actor:bob", "active", {}],
    ["contact:mismatched-account", "actor:alice", "active", { accountId: "actor:bob" }],
  ];
  for (const [id, userId, lifecycle, extra] of rows) {
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id,
         lifecycle_state, payload, created_at, updated_at)
       values ($1, 'contacts', $2, $3, 'manual', 'plans-test', $4, $5::jsonb, now(), now())`,
      [WORKSPACE, id, userId, lifecycle, JSON.stringify({ id, ...extra })],
    );
  }
}

interface Harness {
  pool: Pool;
  repository: PlanRepository;
  schema: string;
  serviceFor(actorId: string): PlanService;
}

async function withDatabase(run: (harness: Harness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  // 在建任何连接池之前先拦截非回环地址。
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `plans_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 6,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  try {
    await admin.query(`create schema ${schema}`);
    await runPlanMigrations(pool);
    // live 引用校验读真实的 orbit_records 联系人；活动目录用只认一个已发布活动的替身。
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await seedContacts(pool);
    const repository = createPostgresPlanRepository({ pool });
    await run({
      pool,
      repository,
      schema,
      serviceFor: (actorId) =>
        createPlanService({
          now: steppingClock(),
          references: createPostgresPlanReferenceValidator({
            actorId,
            client: pool,
            eventCore: PUBLISHED_EVENT_CATALOGUE,
            workspaceId: WORKSPACE,
          }),
          repository,
          scope: { actorId, workspaceId: WORKSPACE },
        }),
    });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

async function rejectsWith(promise: Promise<unknown>, reason: PlanServiceError["reason"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PlanServiceError, `expected PlanServiceError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  });
}

async function count(pool: Pool, sql: string, values: unknown[] = []): Promise<number> {
  return (await pool.query<{ count: number }>(`select count(*)::int as count from ${sql}`, values)).rows[0]!.count;
}

test("the PostgreSQL guard accepts only loopback hosts", () => {
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@localhost:5432/orbit_test"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@127.0.0.1/orbit_test"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@[::1]:5432/orbit_test"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgresql://u:p@ep-cloud.neon.tech/orbit"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgresql://u:p@db:5432/orbit"));
  assert.throws(() => assertLoopbackDatabaseUrl("not a url"));
});

test("plan migrations apply forward, are idempotent on rerun, and refuse a changed checksum", databaseTest, async () => {
  await withDatabase(async ({ pool, schema }) => {
    const tables = (await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = $1 order by tablename",
      [schema],
    )).rows.map((row) => row.tablename);
    assert.deepEqual(tables, ["orbit_records", "plan_commands", "plan_items", "plan_log", "plans", "plans_schema_migrations"]);

    const ledger = async () =>
      (await pool.query("select version, name, checksum, applied_at from plans_schema_migrations order by version")).rows;
    const before = await ledger();
    assert.deepEqual(
      before.map(({ version, name, checksum }) => ({ checksum, name, version })),
      PLAN_MIGRATIONS.map(({ version, name, checksum }) => ({ checksum, name, version })),
    );

    // 重复执行：不报错，历史（含执行时间）不变，已有数据保留。
    await pool.query(
      `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on)
       values ('w', 'p', 'a', 1, 'active', 'g', 'month', '2026-09-28')`,
    );
    await runPlanMigrations(pool);
    await runPlanMigrations(pool);
    assert.deepEqual(await ledger(), before);
    assert.equal(await count(pool, "plans"), 1);

    // 已执行迁移的 checksum 变了：拒绝执行。
    await pool.query("update plans_schema_migrations set checksum = 'tampered' where version = 1");
    await assert.rejects(runPlanMigrations(pool), /plans migration 1 checksum mismatch/);
  });
});

test("the partial unique index allows only one active plan per actor even without the service lock", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    const insert = (id: string, actor: string, version: number) =>
      pool.query(
        `insert into plans (workspace_id, id, actor_id, version, status, goal_snapshot, horizon, starts_on)
         values ($1, $2, $3, $4, 'active', 'g', 'month', '2026-09-28')`,
        [WORKSPACE, id, actor, version],
      );
    const results = await Promise.allSettled([insert("p1", "actor:a", 1), insert("p2", "actor:a", 2)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.equal((rejected.reason as { code?: string }).code, "23505");
    await insert("p3", "actor:b", 1);
    assert.equal(await count(pool, "plans where status = 'active'"), 2);
  });
});

test("concurrent version creation through the service yields exactly one active plan", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const service = serviceFor("actor:alice");
    // 两个都要求「当前没有计划」：只有一个成功。
    const guarded = await Promise.allSettled([
      service.createVersion(planInput({ basePlanId: null })),
      service.createVersion(planInput({ basePlanId: null })),
    ]);
    assert.equal(guarded.filter((result) => result.status === "fulfilled").length, 1);
    const failed = guarded.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.ok(failed.reason instanceof PlanServiceError);
    assert.equal(failed.reason.reason, "BASE_PLAN_MISMATCH");

    // 不带版本条件的并发创建：按 actor 串行，各自成为新版本，最终仍只有一份 active。
    const unguarded = await Promise.all([
      service.createVersion(planInput()),
      service.createVersion(planInput()),
      service.createVersion(planInput()),
    ]);
    assert.deepEqual(unguarded.map((snapshot) => snapshot.plan.version).sort(), [2, 3, 4]);
    assert.equal(await count(pool, "plans where actor_id = $1 and status = 'active'", ["actor:alice"]), 1);
    const current = await service.getCurrent();
    assert.equal(current?.plan.version, 4);

    // 同一 creationKey 并发提交只保存一份。
    const keyed = await Promise.all([
      service.createVersion(planInput({ creationKey: "bootstrap:k" })),
      service.createVersion(planInput({ creationKey: "bootstrap:k" })),
    ]);
    assert.equal(keyed[0].plan.id, keyed[1].plan.id);
    assert.equal(await count(pool, "plans where actor_id = $1", ["actor:alice"]), 5);

    // W0008：并发同 key 时恰好一份报告 created，另一份是复用。
    const outcomes = await Promise.all([
      service.createVersionWithOutcome(planInput({ creationKey: "bootstrap:k2" })),
      service.createVersionWithOutcome(planInput({ creationKey: "bootstrap:k2" })),
    ]);
    assert.equal(outcomes[0].snapshot.plan.id, outcomes[1].snapshot.plan.id);
    assert.deepEqual(outcomes.map((outcome) => outcome.created).sort(), [false, true]);
    assert.equal(await count(pool, "plans where actor_id = $1", ["actor:alice"]), 6);
  });
});

test("a new version on PostgreSQL archives the old one and carries completed actions and linked contacts", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const service = serviceFor("actor:alice");
    const v1 = await service.createVersion(planInput());
    assert.equal(v1.plan.startsOn, "2026-09-28");
    const [done, pending, need, info, event] = v1.items;
    assert.ok(done && pending && need && info && event);

    await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: done.id });
    await service.updateItem({ change: { contactId: "contact:tanaka", op: "link_contact" }, itemId: need.id });
    await service.updateItem({ change: { contactId: "contact:tanaka", op: "establish_contact" }, itemId: need.id });
    await service.updateItem({ change: { contactId: "contact:sato", op: "link_contact" }, itemId: need.id });
    await service.updateItem({ change: { answer: "大约 3 个月", op: "set_answer" }, itemId: info.id });
    await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });

    const v2 = await service.createVersion(planInput({
      basePlanId: v1.plan.id,
      items: [{ kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "新的第一周行动" }],
    }));
    assert.equal(v2.plan.version, 2);
    assert.equal(v2.plan.previousPlanId, v1.plan.id);

    const byOrigin = new Map(v2.items.map((item) => [item.carriedFromItemId, item]));
    assert.equal(byOrigin.get(done.id)?.status, "done");
    assert.ok(byOrigin.get(done.id)?.completedAt);
    assert.equal(byOrigin.has(pending.id), false, "unfinished actions are not carried");
    const carriedNeed = byOrigin.get(need.id);
    assert.deepEqual(carriedNeed?.linkedContactIds, ["contact:tanaka", "contact:sato"]);
    assert.deepEqual(carriedNeed?.contactLinks.map((link) => link.state), ["established", "linked"]);
    assert.equal(carriedNeed?.status, "established");
    assert.deepEqual(carriedNeed?.criteria?.titleKeywords, ["渠道", "BD"]);
    assert.equal(byOrigin.get(info.id)?.answer, "大约 3 个月");
    assert.equal(byOrigin.get(event.id)?.status, "registered");

    const rows = (await pool.query<{ version: number; status: string; archived: boolean }>(
      "select version, status, archived_at is not null as archived from plans order by version",
    )).rows;
    assert.deepEqual(rows, [
      { archived: true, status: "archived", version: 1 },
      { archived: false, status: "active", version: 2 },
    ]);
    // 旧版本的条目保留原样。
    assert.equal(await count(pool, "plan_items where plan_id = $1", [v1.plan.id]), 5);
    // 按联系人查询计划条目（W0010 用）。
    assert.equal(await count(pool, "plan_items where plan_id = $1 and linked_contact_ids @> array['contact:sato']", [v2.plan.id]), 1);
  });
});

test("item changes on PostgreSQL accept only legal transitions and write one auto log each", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const service = serviceFor("actor:alice");
    const v1 = await service.createVersion(planInput());
    const [action, , , , event] = v1.items;
    assert.ok(action && event);
    const logs = () => count(pool, "plan_log where plan_id = $1", [v1.plan.id]);
    assert.equal(await logs(), 1);

    await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: action.id });
    await rejectsWith(service.updateItem({ change: { op: "set_status", status: "in_progress" }, itemId: action.id }), "ILLEGAL_TRANSITION");
    await rejectsWith(service.updateItem({ change: { op: "set_status", status: "attended" }, itemId: event.id }), "ILLEGAL_TRANSITION");
    assert.equal(await logs(), 2);

    const registered = { change: { op: "set_status", status: "registered" } as const, idempotencyKey: "reg:1", itemId: event.id };
    await Promise.all([service.updateItem(registered), service.updateItem(registered)]);
    assert.equal(await logs(), 3);
    const cancelled = await service.updateItem({ change: { op: "set_status", status: "recommended" }, itemId: event.id });
    assert.equal(cancelled.item.status, "recommended");

    const { entry } = await service.addManualLog({
      body: "和田中聊了渠道",
      linkedContactIds: ["contact:tanaka"],
      linkedEventId: "event:tokyo-saas-night",
      targetItemId: event.id,
    });
    const stored = (await pool.query(
      "select kind, event, author, linked_contact_ids, linked_event_id, target_item_id from plan_log where id = $1",
      [entry.id],
    )).rows[0];
    assert.deepEqual(stored, {
      author: "user",
      event: "note",
      kind: "manual",
      linked_contact_ids: ["contact:tanaka"],
      linked_event_id: "event:tokyo-saas-night",
      target_item_id: event.id,
    });

    const current = await service.getCurrent();
    assert.deepEqual(
      current?.log.map((row) => row.event),
      ["note", "item_status_changed", "item_status_changed", "item_status_changed", "plan_created"],
    );
  });
});

test("rows are scoped by actor and a failed transaction writes nothing", databaseTest, async () => {
  await withDatabase(async ({ pool, repository, serviceFor }) => {
    const alice = serviceFor("actor:alice");
    const bob = serviceFor("actor:bob");
    const v1 = await alice.createVersion(planInput());
    assert.equal(await bob.getCurrent(), null);
    assert.equal(await bob.getPlan(v1.plan.id), null);
    await rejectsWith(bob.updateItem({ change: { op: "set_status", status: "done" }, itemId: v1.items[0]!.id }), "ITEM_NOT_FOUND");
    assert.equal((await alice.getCurrent())?.items[0]?.status, "not_started");

    const before = await count(pool, "plans");
    await assert.rejects(
      repository.transact({ actorId: "actor:alice", workspaceId: WORKSPACE }, async (tx) => {
        const active = await tx.activePlan();
        assert.ok(active);
        await tx.archivePlan(active.id, new Date().toISOString());
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(await count(pool, "plans"), before);
    assert.equal(await count(pool, "plans where status = 'active'"), 1);
  });
});

test("plan_log and plan_commands cannot reference another user's or another plan's items", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const alice = serviceFor("actor:alice");
    const bob = serviceFor("actor:bob");
    const aliceV1 = await alice.createVersion(planInput());
    const aliceV2 = await alice.createVersion(planInput());
    const bobPlan = await bob.createVersion(planInput({ items: [{ kind: "action", title: "bob 的行动" }] }));
    const aliceOldItem = aliceV1.items[0]!.id;
    const bobItem = bobPlan.items[0]!.id;

    const insertLog = (id: string, actor: string, planId: string, column: "item_id" | "target_item_id", itemId: string) =>
      pool.query(
        `insert into plan_log (workspace_id, id, actor_id, plan_id, ${column}, kind, event, author, body, idempotency_key)
         values ($1, $2, $3, $4, $5, 'manual', 'note', 'user', 'x', $2)`,
        [WORKSPACE, id, actor, planId, itemId],
      );
    const fkViolation = (error: unknown) => (error as { code?: string }).code === "23503";

    // 跨用户：alice 的记录引用 bob 的条目。
    await assert.rejects(insertLog("log:cross-user", "actor:alice", aliceV2.plan.id, "item_id", bobItem), fkViolation);
    await assert.rejects(insertLog("log:cross-user-t", "actor:alice", aliceV2.plan.id, "target_item_id", bobItem), fkViolation);
    // 跨计划：v2 的记录引用 v1 的条目。
    await assert.rejects(insertLog("log:cross-plan", "actor:alice", aliceV2.plan.id, "item_id", aliceOldItem), fkViolation);
    await assert.rejects(insertLog("log:cross-plan-t", "actor:alice", aliceV2.plan.id, "target_item_id", aliceOldItem), fkViolation);
    // 同一计划内的引用正常。
    await insertLog("log:ok", "actor:alice", aliceV1.plan.id, "item_id", aliceOldItem);

    const insertCommand = (key: string, actor: string, planId: string, itemId: string) =>
      pool.query(
        `insert into plan_commands (workspace_id, actor_id, idempotency_key, kind, plan_id, item_id, fingerprint, outcome)
         values ($1, $2, $3, 'item_change', $4, $5, repeat('a', 64), 'noop')`,
        [WORKSPACE, actor, key, planId, itemId],
      );
    await assert.rejects(insertCommand("cmd:cross-user", "actor:alice", aliceV2.plan.id, bobItem), fkViolation);
    await assert.rejects(insertCommand("cmd:cross-plan", "actor:alice", aliceV2.plan.id, aliceOldItem), fkViolation);
  });
});

test("a keyed no-op on PostgreSQL leaves a receipt; delayed and concurrent retries replay without writing", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const service = serviceFor("actor:alice");
    const v1 = await service.createVersion(planInput());
    const event = v1.items.find((item) => item.kind === "event")!;
    await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });

    const stale = { change: { op: "set_status", status: "registered" } as const, idempotencyKey: "tap:1", itemId: event.id };
    const first = await service.updateItem(stale);
    assert.equal(first.log, null);
    assert.deepEqual(
      (await pool.query("select idempotency_key, outcome, item_id, log_id from plan_commands")).rows,
      [{ idempotency_key: "item:tap:1", item_id: event.id, log_id: null, outcome: "noop" }],
    );

    await service.updateItem({ change: { op: "set_status", status: "recommended" }, itemId: event.id });
    const logs = () => count(pool, "plan_log where plan_id = $1", [v1.plan.id]);
    const logsBefore = await logs();
    const retries = await Promise.all([service.updateItem(stale), service.updateItem(stale)]);
    assert.ok(retries.every((result) => result.replayed && result.item.status === "recommended"));
    assert.equal(await logs(), logsBefore);

    await rejectsWith(
      service.updateItem({ ...stale, change: { op: "set_status", status: "attended" } }),
      "IDEMPOTENCY_KEY_REUSED",
    );

    // 有变化的带 key 请求：并发重试只写一条记录、一条回执。
    const action = v1.items.find((item) => item.kind === "action")!;
    const check = { change: { op: "set_status", status: "done" } as const, idempotencyKey: "check:1", itemId: action.id };
    const results = await Promise.all([service.updateItem(check), service.updateItem(check), service.updateItem(check)]);
    assert.equal(results.filter((result) => !result.replayed).length, 1);
    assert.equal(await logs(), logsBefore + 1);
    assert.equal(await count(pool, "plan_commands where outcome = 'applied' and log_id is not null"), 1);
  });
});

test("the live reference validator only accepts the actor's own, undeleted contacts and published events", databaseTest, async () => {
  await withDatabase(async ({ pool, serviceFor }) => {
    const alice = serviceFor("actor:alice");
    const plansBefore = await count(pool, "plans");
    for (const contactId of ["contact:bob-only", "contact:deleted-one", "contact:mismatched-account", "contact:nobody"]) {
      await rejectsWith(
        alice.createVersion(planInput({ items: [{ contactIds: [contactId], kind: "network_need", title: "需要的人" }] })),
        "REFERENCE_NOT_FOUND",
      );
    }
    await rejectsWith(
      alice.createVersion(planInput({ items: [{ kind: "event", linkedEventId: "event:draft", title: "草稿活动" }] })),
      "REFERENCE_NOT_FOUND",
    );
    assert.equal(await count(pool, "plans"), plansBefore);

    const v1 = await alice.createVersion(planInput({
      items: [{ contactIds: ["contact:suzuki"], kind: "network_need", title: "需要的人" }],
    }));
    const need = v1.items[0]!;
    const logsBefore = await count(pool, "plan_log");
    await rejectsWith(
      alice.updateItem({ change: { contactId: "contact:bob-only", op: "link_contact" }, itemId: need.id }),
      "REFERENCE_NOT_FOUND",
    );
    await rejectsWith(alice.addManualLog({ body: "x", linkedContactIds: ["contact:bob-only"] }), "REFERENCE_NOT_FOUND");
    await rejectsWith(alice.addManualLog({ body: "x", linkedEventId: "event:draft" }), "REFERENCE_NOT_FOUND");
    assert.equal(await count(pool, "plan_log"), logsBefore);

    const linked = await alice.updateItem({ change: { contactId: "contact:tanaka", op: "link_contact" }, itemId: need.id });
    assert.deepEqual(linked.item.linkedContactIds, ["contact:suzuki", "contact:tanaka"]);
    const { entry } = await alice.addManualLog({
      body: "见了面",
      linkedContactIds: ["contact:sato"],
      linkedEventId: "event:tokyo-saas-night",
    });
    assert.equal(entry.linkedEventId, "event:tokyo-saas-night");
  });
});
