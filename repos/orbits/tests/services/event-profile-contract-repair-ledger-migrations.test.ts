import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import {
  PROFILE_CONTRACT_REPAIR_ID,
  compareUtf16CodeUnits,
} from "../../features/events/registration/profile-contract-repair/contract";
import {
  PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
  PROFILE_CONTRACT_REPAIR_REMOVED_PATHS,
  PROFILE_CONTRACT_REPAIR_TYPE,
} from "../../features/events/registration/profile-contract-repair/ledger-contract";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function connectionStringForSchema(connectionString: string, schema: string): string {
  const value = new URL(connectionString);
  value.searchParams.set("options", `-c search_path=${schema}`);
  return value.toString();
}

type QueryClient = Pick<PoolClient, "query">;

interface RunInput {
  appliedAt: string;
  createdAt: string;
  expectedCount: number;
  planHash: string;
  repairId: string;
  repairType: string;
  resultHash: string;
  revertedAt: string | null;
  schemaVersion: number;
  workspaceId: string;
}

const validRun: RunInput = {
  appliedAt: "2026-08-05T10:00:00.000Z",
  createdAt: "2026-08-05T10:00:01.000Z",
  expectedCount: 24,
  planHash: hash("profile-repair-plan"),
  repairId: "repair-run:20260805:primary",
  repairType: PROFILE_CONTRACT_REPAIR_TYPE,
  resultHash: hash("profile-repair-result"),
  revertedAt: null,
  schemaVersion: PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
  workspaceId: "workspace:profile-repair-ledger",
};

async function insertRun(
  client: QueryClient,
  overrides: Partial<RunInput> = {},
): Promise<void> {
  const value = { ...validRun, ...overrides };
  await client.query(
    `insert into event_ops_data_repair_runs (
       workspace_id, repair_id, repair_type, schema_version, plan_hash,
       expected_count, result_hash, applied_at, reverted_at, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      value.workspaceId,
      value.repairId,
      value.repairType,
      value.schemaVersion,
      value.planHash,
      value.expectedCount,
      value.resultHash,
      value.appliedAt,
      value.revertedAt,
      value.createdAt,
    ],
  );
}

interface ItemInput {
  actorId: string;
  afterMembershipHash: string;
  afterProfileHash: string;
  beforeMembershipHash: string;
  beforeProfileHash: string;
  createdAt: string;
  eventId: string;
  participantId: string;
  removedPaths: readonly (string | null)[];
  repairId: string;
  sourceMembershipVersion: number;
  sourceProfileVersion: number;
  targetMembershipVersion: number;
  targetProfileVersion: number;
  workspaceId: string;
}

function validItem(index: number, repairId = validRun.repairId): ItemInput {
  const sourceProfileVersion = index + 1;
  const sourceMembershipVersion = index + 11;
  return {
    actorId: `actor:repair-ledger:${index}`,
    afterMembershipHash: hash(`membership-after-${index}`),
    afterProfileHash: hash(`profile-after-${index}`),
    beforeMembershipHash: hash(`membership-before-${index}`),
    beforeProfileHash: hash(`profile-before-${index}`),
    createdAt: "2026-08-05T10:00:01.000Z",
    eventId: index < 12 ? "repair-event-a" : "repair-event-b",
    participantId: `participant:repair-ledger:${index}`,
    removedPaths:
      index % 2 === 0
        ? [
            "participant.profileAnswers.industry",
            "registrationProfile.answers.industry",
          ]
        : ["registrationProfile.answers.desiredOutcome"],
    repairId,
    sourceMembershipVersion,
    sourceProfileVersion,
    targetMembershipVersion: sourceMembershipVersion + 1,
    targetProfileVersion: sourceProfileVersion + 1,
    workspaceId: validRun.workspaceId,
  };
}

async function insertItem(
  client: QueryClient,
  input: ItemInput,
): Promise<void> {
  await client.query(
    `insert into event_ops_data_repair_items (
       workspace_id, repair_id, event_id, actor_id, participant_id,
       source_profile_version, target_profile_version,
       source_membership_version, target_membership_version,
       before_profile_hash, after_profile_hash,
       before_membership_hash, after_membership_hash,
       removed_paths, created_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )`,
    [
      input.workspaceId,
      input.repairId,
      input.eventId,
      input.actorId,
      input.participantId,
      input.sourceProfileVersion,
      input.targetProfileVersion,
      input.sourceMembershipVersion,
      input.targetMembershipVersion,
      input.beforeProfileHash,
      input.afterProfileHash,
      input.beforeMembershipHash,
      input.afterMembershipHash,
      input.removedPaths,
      input.createdAt,
    ],
  );
}

test("profile repair ledger contract separates operator run id from algorithm type", () => {
  assert.equal(PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION, 1);
  assert.equal(PROFILE_CONTRACT_REPAIR_TYPE, "canonical_profile_empty_answer_v1");
  assert.notEqual(PROFILE_CONTRACT_REPAIR_TYPE, PROFILE_CONTRACT_REPAIR_ID);
  assert.equal(PROFILE_CONTRACT_REPAIR_REMOVED_PATHS.length, 16);
  assert.equal(new Set(PROFILE_CONTRACT_REPAIR_REMOVED_PATHS).size, 16);
  assert.deepEqual(
    PROFILE_CONTRACT_REPAIR_REMOVED_PATHS,
    [...PROFILE_CONTRACT_REPAIR_REMOVED_PATHS].sort(compareUtf16CodeUnits),
  );
  assert.equal(Object.isFrozen(PROFILE_CONTRACT_REPAIR_REMOVED_PATHS), true);
});

test(
  "profile repair ledger migration is idempotent and enforces immutable audit facts",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `profile_repair_ledger_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const migrationPool = new Pool({
      connectionString: connectionStringForSchema(databaseUrl, schema),
      max: 2,
    });
    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(migrationPool);
      await runEventOperationsMigrations(migrationPool);

      const migration = await migrationPool.query<{ count: string }>(
        `select count(*)::text as count
           from event_ops_schema_migrations
          where version = 11
            and name = 'event-operations-v11-profile-repair-audit-ledger'`,
      );
      assert.equal(migration.rows[0]?.count, "1");

      const columns = await migrationPool.query<{
        column_name: string;
        data_type: string;
        table_name: string;
      }>(
        `select table_name, column_name, data_type
           from information_schema.columns
          where table_schema = current_schema()
            and table_name in (
              'event_ops_data_repair_runs',
              'event_ops_data_repair_items'
            )
          order by table_name, ordinal_position`,
      );
      assert.equal(
        columns.rows.filter((row) => row.table_name === "event_ops_data_repair_runs")
          .length,
        10,
      );
      assert.equal(
        columns.rows.filter((row) => row.table_name === "event_ops_data_repair_items")
          .length,
        15,
      );
      assert.equal(columns.rows.some((row) => row.data_type === "jsonb"), false);
      assert.equal(
        columns.rows.some((row) => /answer|payload|response/iu.test(row.column_name)),
        false,
      );

      await insertRun(migrationPool);
      for (let index = 0; index < 24; index += 1) {
        await insertItem(migrationPool, validItem(index));
      }
      const stored = await migrationPool.query<{
        expected_count: number;
        item_count: string;
      }>(
        `select run.expected_count,
                count(item.actor_id)::text as item_count
           from event_ops_data_repair_runs run
           join event_ops_data_repair_items item
             on item.workspace_id = run.workspace_id
            and item.repair_id = run.repair_id
          where run.workspace_id = $1 and run.repair_id = $2
          group by run.expected_count`,
        [validRun.workspaceId, validRun.repairId],
      );
      assert.deepEqual(stored.rows[0], { expected_count: 24, item_count: "24" });

      await assert.rejects(
        insertRun(migrationPool, {
          repairId: "repair-run:duplicate-id",
          resultHash: hash("duplicate-result"),
        }),
        /event_ops_data_repair_runs_type_plan_unique/iu,
      );
      await assert.rejects(insertRun(migrationPool), /duplicate key/iu);

      const invalidRuns: readonly [string, Partial<RunInput>][] = [
        ["workspace", { workspaceId: " " }],
        ["repair-id", { repairId: " " }],
        ["repair-type", { repairType: "unknown_repair_type" }],
        ["schema-version", { schemaVersion: 0 }],
        ["plan-hash", { planHash: "A".repeat(64) }],
        ["expected-count", { expectedCount: 0 }],
        ["result-hash", { resultHash: "not-a-hash" }],
        [
          "applied-after-created",
          {
            appliedAt: "2026-08-05T10:00:02.000Z",
            createdAt: "2026-08-05T10:00:01.000Z",
          },
        ],
        ["applied-minus-infinity", { appliedAt: "-infinity" }],
        ["applied-plus-infinity", { appliedAt: "infinity" }],
        ["created-minus-infinity", { createdAt: "-infinity" }],
        ["created-plus-infinity", { createdAt: "infinity" }],
        ["reverted-minus-infinity", { revertedAt: "-infinity" }],
        ["reverted-plus-infinity", { revertedAt: "infinity" }],
        [
          "reverted-before-created",
          { revertedAt: "2026-08-05T10:00:00.500Z" },
        ],
      ];
      for (const [name, invalid] of invalidRuns) {
        await assert.rejects(
          insertRun(migrationPool, {
            ...invalid,
            planHash: invalid.planHash ?? hash(`invalid-plan-${name}`),
            repairId: invalid.repairId ?? `repair-run:invalid:${name}`,
            resultHash: invalid.resultHash ?? hash(`invalid-result-${name}`),
          }),
          undefined,
          `invalid run ${name}`,
        );
      }

      const invalidItems: readonly [string, Partial<ItemInput>][] = [
        ["missing-run", { repairId: "repair-run:missing" }],
        ["event-id", { eventId: " " }],
        ["actor-id", { actorId: " " }],
        ["participant-id", { participantId: " " }],
        ["source-profile-version", { sourceProfileVersion: 0, targetProfileVersion: 1 }],
        ["target-profile-version", { targetProfileVersion: 99 }],
        [
          "source-membership-version",
          { sourceMembershipVersion: 0, targetMembershipVersion: 1 },
        ],
        ["target-membership-version", { targetMembershipVersion: 99 }],
        ["before-profile-hash", { beforeProfileHash: "invalid" }],
        ["after-profile-hash", { afterProfileHash: "F".repeat(64) }],
        ["before-membership-hash", { beforeMembershipHash: "invalid" }],
        ["after-membership-hash", { afterMembershipHash: "F".repeat(64) }],
        ["created-minus-infinity", { createdAt: "-infinity" }],
        ["created-plus-infinity", { createdAt: "infinity" }],
        ["empty-paths", { removedPaths: [] }],
        ["unknown-path", { removedPaths: ["registrationProfile.answers.unknown"] }],
        [
          "participant-only-path",
          { removedPaths: ["participant.profileAnswers.industry"] },
        ],
        [
          "participant-path-with-different-registration-field",
          {
            removedPaths: [
              "participant.profileAnswers.industry",
              "registrationProfile.answers.desiredOutcome",
            ],
          },
        ],
        [
          "duplicate-path",
          {
            removedPaths: [
              "registrationProfile.answers.industry",
              "registrationProfile.answers.industry",
            ],
          },
        ],
        [
          "unsorted-paths",
          {
            removedPaths: [
              "registrationProfile.answers.industry",
              "participant.profileAnswers.industry",
            ],
          },
        ],
        ["null-path", { removedPaths: [null] }],
      ];
      for (const [index, [name, invalid]] of invalidItems.entries()) {
        const base = validItem(100 + index);
        await assert.rejects(
          insertItem(migrationPool, { ...base, ...invalid }),
          undefined,
          `invalid item ${name}`,
        );
      }
      const sameProfileHash = validItem(200);
      await assert.rejects(
        insertItem(migrationPool, {
          ...sameProfileHash,
          afterProfileHash: sameProfileHash.beforeProfileHash,
        }),
      );
      const sameMembershipHash = validItem(201);
      await assert.rejects(
        insertItem(migrationPool, {
          ...sameMembershipHash,
          afterMembershipHash: sameMembershipHash.beforeMembershipHash,
        }),
      );
      await assert.rejects(
        insertItem(migrationPool, {
          ...validItem(999),
          eventId: validItem(0).eventId,
          participantId: validItem(0).participantId,
        }),
        /event_ops_data_repair_items_participant_unique/iu,
      );

      await assert.rejects(
        migrationPool.query(
          `update event_ops_data_repair_items
              set created_at = created_at
            where workspace_id = $1 and repair_id = $2
              and event_id = 'repair-event-a'
              and actor_id = 'actor:repair-ledger:0'`,
          [validRun.workspaceId, validRun.repairId],
        ),
        /data repair items are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query(
          `delete from event_ops_data_repair_items
            where workspace_id = $1 and repair_id = $2
              and event_id = 'repair-event-a'
              and actor_id = 'actor:repair-ledger:0'`,
          [validRun.workspaceId, validRun.repairId],
        ),
        /data repair items are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query(
          `update event_ops_data_repair_runs
              set expected_count = expected_count + 1
            where workspace_id = $1 and repair_id = $2`,
          [validRun.workspaceId, validRun.repairId],
        ),
        /data repair runs are append-only/iu,
      );

      const timeValidRepairId = "repair-run:time-valid";
      const sameAppliedAndCreatedAt = "2026-08-05T11:00:00.000Z";
      const validRevertedAt = "2026-08-05T11:00:01.000Z";
      await insertRun(migrationPool, {
        appliedAt: sameAppliedAndCreatedAt,
        createdAt: sameAppliedAndCreatedAt,
        expectedCount: 1,
        planHash: hash("time-valid-plan"),
        repairId: timeValidRepairId,
        resultHash: hash("time-valid-result"),
      });
      const reverted = await migrationPool.query<{ reverted_at: Date }>(
        `update event_ops_data_repair_runs
            set reverted_at = $3
          where workspace_id = $1 and repair_id = $2
          returning reverted_at`,
        [validRun.workspaceId, timeValidRepairId, validRevertedAt],
      );
      assert.equal(reverted.rows[0]?.reverted_at.toISOString(), validRevertedAt);
      await assert.rejects(
        migrationPool.query(
          `update event_ops_data_repair_runs
              set reverted_at = '2026-08-05T11:00:02.000Z'
            where workspace_id = $1 and repair_id = $2`,
          [validRun.workspaceId, timeValidRepairId],
        ),
        /data repair runs are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query(
          `update event_ops_data_repair_runs
              set reverted_at = null
            where workspace_id = $1 and repair_id = $2`,
          [validRun.workspaceId, timeValidRepairId],
        ),
        /data repair runs are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query(
          `delete from event_ops_data_repair_runs
            where workspace_id = $1 and repair_id = $2`,
          [validRun.workspaceId, timeValidRepairId],
        ),
        /data repair runs are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query("truncate event_ops_data_repair_items"),
        /data repair items are append-only/iu,
      );
      await assert.rejects(
        migrationPool.query("truncate event_ops_data_repair_runs cascade"),
        /data repair .* are append-only/iu,
      );
      const preservedLedger = await migrationPool.query<{
        item_count: string;
        run_count: string;
      }>(
        `select
           (select count(*)::text from event_ops_data_repair_runs) as run_count,
           (select count(*)::text from event_ops_data_repair_items) as item_count`,
      );
      assert.deepEqual(preservedLedger.rows[0], {
        item_count: "24",
        run_count: "2",
      });

      const rollbackRepairId = "repair-run:rollback";
      const transaction = await migrationPool.connect();
      try {
        await transaction.query("begin");
        await insertRun(transaction, {
          planHash: hash("rollback-plan"),
          repairId: rollbackRepairId,
          resultHash: hash("rollback-result"),
        });
        await insertItem(transaction, validItem(500, rollbackRepairId));
        await assert.rejects(
          insertItem(transaction, {
            ...validItem(501, rollbackRepairId),
            targetProfileVersion: 999,
          }),
        );
      } finally {
        await transaction.query("rollback");
        transaction.release();
      }
      const rolledBack = await migrationPool.query<{ count: string }>(
        `select (
           select count(*) from event_ops_data_repair_runs where repair_id = $1
         ) + (
           select count(*) from event_ops_data_repair_items where repair_id = $1
         ) as count`,
        [rollbackRepairId],
      );
      assert.equal(String(rolledBack.rows[0]?.count), "0");

      const indexes = await migrationPool.query<{ indexname: string }>(
        `select indexname
           from pg_indexes
          where schemaname = current_schema()
            and tablename in (
              'event_ops_data_repair_runs',
              'event_ops_data_repair_items'
            )`,
      );
      const indexNames = new Set(indexes.rows.map((row) => row.indexname));
      assert.equal(indexNames.has("event_ops_data_repair_items_event_actor_idx"), true);
      assert.equal(
        indexNames.has("event_ops_data_repair_items_event_participant_idx"),
        true,
      );
    } finally {
      await migrationPool.end();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);

test(
  "main database repair ledger remains unapplied or empty without test writes",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const presence = await pool.query<{
        items_table: string | null;
        runs_table: string | null;
      }>(
        `select
           to_regclass('public.event_ops_data_repair_runs')::text as runs_table,
           to_regclass('public.event_ops_data_repair_items')::text as items_table`,
      );
      const runsTable = presence.rows[0]?.runs_table ?? null;
      const itemsTable = presence.rows[0]?.items_table ?? null;
      assert.equal(runsTable === null, itemsTable === null);
      if (runsTable !== null && itemsTable !== null) {
        const counts = await pool.query<{ item_count: string; run_count: string }>(
          `select
             (select count(*)::text from public.event_ops_data_repair_runs) as run_count,
             (select count(*)::text from public.event_ops_data_repair_items) as item_count`,
        );
        assert.deepEqual(counts.rows[0], { item_count: "0", run_count: "0" });
      }
    } finally {
      await pool.end();
    }
  },
);
