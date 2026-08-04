import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Pool } from "pg";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

test(
  "event core backfill CLI requires an explicit reviewed apply protocol",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 90_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_core_command_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:command-test:${schema}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const migrationPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(migrationPool);
      await migrationPool.query(
        `insert into orbit_records (
           workspace_id, collection_name, record_id, user_id, source_type,
           source_id, evidence_ids, lifecycle_state, search_text, payload,
           created_at, updated_at
         ) values
         ($1, 'events', 'event_signup_02', 'account:command-test-owner',
          'event_import', 'source:command:event_signup_02', '{}', 'active', '',
          $2::jsonb, now(), now()),
         ($1, 'events', 'event_signup_03', 'account:command-test-owner',
          'event_import', 'source:command:event_signup_03', '{}', 'active', '',
          $3::jsonb, now(), now())`,
        [
          workspaceId,
          JSON.stringify({
            endsAt: "2026-09-01T14:00:00+09:00",
            location: "东京",
            name: "东京 AI 落地伙伴报名会",
            startsAt: "2026-09-01T14:00:00+09:00",
          }),
          JSON.stringify({
            endsAt: "2026-09-15T18:00:00+09:00",
            location: "东京",
            name: "日中投资人与创业者报名沙龙",
            startsAt: "2026-09-15T18:00:00+09:00",
          }),
        ],
      );
      const runCommand = (args: readonly string[]) =>
        spawnSync(
          "npm",
          ["run", "db:backfill:event-core", "--", ...args],
          {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            EVENT_CORE_BACKFILL_TIMEZONE: "Asia/Tokyo",
            EVENT_CORE_PUBLIC_OWNER_ACTOR_ID: "account:command-test-owner",
            ORBIT_EVENT_DATABASE_URL: databaseUrl,
            ORBIT_WORKSPACE_ID: workspaceId,
            PGOPTIONS: `-c search_path=${schema}`,
          },
          timeout: 25_000,
          },
        );
      const canonicalCount = async () => {
        const result = await migrationPool.query<{ count: number }>(
          `select count(*)::int as count from event_ops_events
           where workspace_id = $1 and lifecycle_state_v2 is not null`,
          [workspaceId],
        );
        return Number(result.rows[0]?.count ?? -1);
      };

      const dryRun = runCommand(["--dry-run"]);

      assert.equal(
        dryRun.status,
        0,
        `dry-run failed\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`,
      );
      assert.equal(await canonicalCount(), 0);
      const reviewed = JSON.parse(
        dryRun.stdout.slice(dryRun.stdout.indexOf("{")),
      ) as { count: number; hash: string };
      assert.match(reviewed.hash, /^[a-f0-9]{64}$/);
      assert.ok(reviewed.count > 0);
      assert.match(dryRun.stdout, /"migrationId"\s*:\s*"event-canonical-v1"/);
      assert.match(dryRun.stdout, /"resolutionCount"\s*:\s*4/);
      assert.doesNotMatch(dryRun.stderr, /rows.*length|TypeError/i);

      const rejectedCommands = [
        runCommand([]),
        runCommand(["--dry-run", "--unknown-option"]),
        runCommand(["--apply"]),
        runCommand([
          "--apply",
          "--expected-plan-hash",
          reviewed.hash,
          "--expected-count",
          "9".repeat(400),
        ]),
        runCommand([
          "--apply",
          "--expected-plan-hash",
          "0".repeat(64),
          "--expected-count",
          String(reviewed.count),
        ]),
        runCommand([
          "--apply",
          "--expected-plan-hash",
          reviewed.hash,
          "--expected-count",
          String(reviewed.count + 1),
        ]),
      ];
      for (const rejected of rejectedCommands) {
        assert.notEqual(rejected.status, 0);
        assert.equal(await canonicalCount(), 0);
      }

      await migrationPool.query(
        `insert into orbit_records (
           workspace_id, collection_name, record_id, user_id, source_type,
           source_id, evidence_ids, lifecycle_state, search_text, payload,
           created_at, updated_at
         ) values (
           $1, 'events', 'event:added-after-review', 'account:command-test-owner',
           'event_import', 'source:command:added-after-review', '{}', 'active', '',
           $2::jsonb, now(), now()
         )`,
        [
          workspaceId,
          JSON.stringify({
            endsAt: "2030-01-20T12:00:00.000Z",
            location: "Tokyo",
            name: "Added after plan review",
            startsAt: "2030-01-20T10:00:00.000Z",
          }),
        ],
      );
      const staleReview = runCommand([
        "--apply",
        "--expected-plan-hash",
        reviewed.hash,
        "--expected-count",
        String(reviewed.count),
      ]);
      assert.notEqual(staleReview.status, 0);
      assert.equal(await canonicalCount(), 0);

      const refreshedDryRun = runCommand(["--dry-run"]);
      assert.equal(refreshedDryRun.status, 0);
      const refreshed = JSON.parse(
        refreshedDryRun.stdout.slice(refreshedDryRun.stdout.indexOf("{")),
      ) as { count: number; hash: string };
      assert.equal(refreshed.count, reviewed.count + 1);
      assert.notEqual(refreshed.hash, reviewed.hash);

      const applied = runCommand([
        "--apply",
        "--expected-plan-hash",
        refreshed.hash,
        "--expected-count",
        String(refreshed.count),
      ]);
      assert.equal(
        applied.status,
        0,
        `apply failed\nstdout:\n${applied.stdout}\nstderr:\n${applied.stderr}`,
      );
      assert.equal(await canonicalCount(), refreshed.count);
    } finally {
      await migrationPool.end();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
