import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventAccessService } from "../../features/events/event-access/service";
import {
  EventAccessRepositoryError,
  createPostgresEventAccessRepository,
} from "../../features/events/event-access/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function schemaUrl(value: string, searchPath: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${searchPath}`);
  return url.toString();
}

async function mainEvidence(pool: Pool, workspaceId: string): Promise<unknown> {
  return (
    await pool.query(
      `select
         (select coalesce(max(version),0)::text
            from event_ops_schema_migrations) as migration_version,
         (select name from event_ops_schema_migrations
           order by version desc limit 1) as migration_name,
         (select checksum from event_ops_schema_migrations
           order by version desc limit 1) as migration_checksum,
         to_regclass('event_ops_event_role_assignment_versions')::text
           as role_versions,
         to_regclass('event_ops_event_role_assignment_heads')::text
           as role_heads,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,''
                                      order by to_jsonb(item)::text),''))
            from event_ops_events item
           where workspace_id=$1) as events_hash,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,''
                                      order by to_jsonb(item)::text),''))
            from event_ops_audit_log item
           where workspace_id=$1) as audit_hash,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,''
                                      order by to_jsonb(item)::text),''))
            from event_ops_membership_heads item
           where workspace_id=$1) as membership_hash,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,''
                                      order by to_jsonb(item)::text),''))
            from event_ops_profile_heads item
           where workspace_id=$1) as profile_hash,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,''
                                      order by to_jsonb(item)::text),''))
            from orbit_records item
           where workspace_id=$1) as legacy_hash`,
      [workspaceId],
    )
  ).rows[0];
}

async function mutationCounts(pool: Pool): Promise<{
  audits: string;
  heads: string;
  versions: string;
}> {
  return (
    await pool.query(
      `select
         (select count(*)::text
            from event_ops_event_role_assignment_versions) as versions,
         (select count(*)::text
            from event_ops_event_role_assignment_heads) as heads,
         (select count(*)::text
            from event_ops_audit_log
           where aggregate_type='event_role_assignment') as audits`,
    )
  ).rows[0];
}

async function expectNoMutation(
  pool: Pool,
  operation: () => Promise<unknown>,
  expectedCode?: ConstructorParameters<typeof EventAccessRepositoryError>[0],
): Promise<void> {
  const before = await mutationCounts(pool);
  await assert.rejects(
    operation(),
    expectedCode
      ? (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === expectedCode
      : undefined,
  );
  assert.deepEqual(await mutationCounts(pool), before);
}

test(
  "main event access schema is cut over and missing-event reads stay non-mutating",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const workspaceId = process.env.ORBIT_WORKSPACE_ID ?? "workspace:default";
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool,
    });
    const service = createEventAccessService(
      createPostgresEventAccessRepository({ client, workspaceId }),
    );
    try {
      const before = await mainEvidence(pool, workspaceId);
      assert.ok(
        Number((before as { migration_version: string }).migration_version) >= 15,
        "the live schema must include the reviewed event-access migrations",
      );
      assert.equal(
        (before as { role_heads: string | null }).role_heads,
        "event_ops_event_role_assignment_heads",
      );
      assert.equal(
        (before as { role_versions: string | null }).role_versions,
        "event_ops_event_role_assignment_versions",
      );
      await assert.rejects(
        service.get({
          eventId: "event:not-ready",
          subjectActorId: "actor:not-ready",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_FOUND",
      );
      assert.deepEqual(await mainEvidence(pool, workspaceId), before);
    } finally {
      await client.close();
    }
  },
);

test(
  "event access repository enforces owner authority, workspace isolation, transitions, CAS, and atomic audit",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_access_repository_${suffix}`;
    const connectionString = schemaUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString, max: 6 });
    const client = createEventOperationsPostgresClient({
      connectionString,
      max: 6,
      pool,
    });
    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await pool.query(
        `insert into event_ops_events (
           workspace_id,event_id,organizer_actor_id,lifecycle_state,
           revision,created_at,updated_at,lifecycle_state_v2
         ) values
           ('workspace:a','event:shared','actor:owner-a','active',1,now(),now(),'published'),
           ('workspace:b','event:shared','actor:owner-b','active',1,now(),now(),'published'),
           ('workspace:a','event:legacy','actor:legacy-owner','active',1,now(),now(),null)`,
      );
      const repositoryA = createPostgresEventAccessRepository({
        client,
        workspaceId: "workspace:a",
      });
      const repositoryB = createPostgresEventAccessRepository({
        client,
        workspaceId: "workspace:b",
      });
      const serviceA = createEventAccessService(repositoryA);
      const serviceB = createEventAccessService(repositoryB);

      // A pre-cutover event_ops row must not lend its organizer-shaped field
      // to the canonical access boundary. The operator migration must create
      // Event Core v2 metadata before any role read or write becomes valid.
      await assert.rejects(
        serviceA.get({
          eventId: "event:legacy",
          subjectActorId: "actor:legacy-owner",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_FOUND",
      );
      await expectNoMutation(
        pool,
        () => serviceA.grant({
          actingActorId: "actor:legacy-owner",
          eventId: "event:legacy",
          expectedRevision: 0,
          reason: "Legacy rows must not establish role authority",
          role: "operations",
          subjectActorId: "actor:legacy-operator",
        }),
        "EVENT_ACCESS_NOT_FOUND",
      );

      assert.deepEqual(
        await serviceA.get({
          eventId: "event:shared",
          subjectActorId: "actor:owner-a",
        }),
        {
          eventId: "event:shared",
          owner: true,
          revision: 0,
          role: null,
          state: null,
          subjectActorId: "actor:owner-a",
        },
      );
      await expectNoMutation(
        pool,
        () => serviceA.grant({
          actingActorId: "actor:owner-b",
          eventId: "event:shared",
          expectedRevision: 0,
          reason: "Cross-workspace owner must not authorize this write",
          role: "operations",
          subjectActorId: "actor:cross-workspace",
        }),
        "EVENT_ACCESS_FORBIDDEN",
      );
      await expectNoMutation(
        pool,
        () => serviceB.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 0,
          reason: "The inverse cross-workspace write must also fail",
          role: "reviewer",
          subjectActorId: "actor:cross-workspace",
        }),
        "EVENT_ACCESS_FORBIDDEN",
      );
      await serviceB.grant({
        actingActorId: "actor:owner-b",
        eventId: "event:shared",
        expectedRevision: 0,
        reason: "Analyze aggregate outcomes for workspace B",
        role: "read_only_analyst",
        subjectActorId: "actor:shared-subject",
      });
      assert.equal(
        (
          await serviceA.get({
            eventId: "event:shared",
            subjectActorId: "actor:shared-subject",
          })
        ).role,
        null,
      );
      assert.equal(
        (
          await serviceB.get({
            eventId: "event:shared",
            subjectActorId: "actor:shared-subject",
          })
        ).role,
        "read_only_analyst",
      );
      await expectNoMutation(
        pool,
        () => serviceA.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 0,
          reason: "Owner must never become a delegated assignment",
          role: "operations",
          subjectActorId: "actor:owner-a",
        }),
        "EVENT_ACCESS_FORBIDDEN",
      );

      const grant = await serviceA.grant({
        actingActorId: "actor:owner-a",
        eventId: "event:shared",
        expectedRevision: 0,
        reason: "Own the bilingual event operations runbook",
        role: "operations",
        subjectActorId: "actor:operator-a",
      });
      assert.deepEqual(
        { revision: grant.revision, role: grant.role, state: grant.state },
        { revision: 1, role: "operations", state: "active" },
      );
      await expectNoMutation(
        pool,
        () => serviceA.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 1,
          reason: "Duplicate active role must be rejected",
          role: "operations",
          subjectActorId: "actor:operator-a",
        }),
        "EVENT_ACCESS_CONFLICT",
      );
      const changed = await serviceA.grant({
        actingActorId: "actor:owner-a",
        eventId: "event:shared",
        expectedRevision: 1,
        reason: "Move to the constrained check-in roster",
        role: "check_in",
        subjectActorId: "actor:operator-a",
      });
      assert.deepEqual(
        { revision: changed.revision, role: changed.role, state: changed.state },
        { revision: 2, role: "check_in", state: "active" },
      );
      const revoked = await serviceA.revoke({
        actingActorId: "actor:owner-a",
        eventId: "event:shared",
        expectedRevision: 2,
        reason: "Check-in shift is complete",
        subjectActorId: "actor:operator-a",
      });
      assert.deepEqual(
        {
          revision: revoked.revision,
          role: revoked.role,
          state: revoked.state,
        },
        { revision: 3, role: "check_in", state: "revoked" },
      );
      await expectNoMutation(
        pool,
        () => serviceA.revoke({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 3,
          reason: "A revoked assignment cannot be revoked twice",
          subjectActorId: "actor:operator-a",
        }),
        "EVENT_ACCESS_CONFLICT",
      );
      await serviceA.grant({
        actingActorId: "actor:owner-a",
        eventId: "event:shared",
        expectedRevision: 3,
        reason: "Return as the admission reviewer",
        role: "reviewer",
        subjectActorId: "actor:operator-a",
      });

      const beforeRace = await mutationCounts(pool);
      const race = await Promise.allSettled([
        serviceA.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 4,
          reason: "Race candidate for event operations",
          role: "operations",
          subjectActorId: "actor:operator-a",
        }),
        serviceA.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 4,
          reason: "Race candidate for constrained check-in",
          role: "check_in",
          subjectActorId: "actor:operator-a",
        }),
      ]);
      assert.equal(
        race.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        race.filter((result) => result.status === "rejected").length,
        1,
      );
      const afterRace = await mutationCounts(pool);
      assert.deepEqual(
        {
          audits: Number(afterRace.audits) - Number(beforeRace.audits),
          heads: Number(afterRace.heads) - Number(beforeRace.heads),
          versions: Number(afterRace.versions) - Number(beforeRace.versions),
        },
        { audits: 1, heads: 0, versions: 1 },
      );
      assert.equal(
        (
          await serviceA.get({
            eventId: "event:shared",
            subjectActorId: "actor:operator-a",
          })
        ).revision,
        5,
      );

      const audit = await pool.query<{
        action: string;
        actor_id: string;
        after_payload: {
          assignedByActorId: string;
          reason: string;
        };
      }>(
        `select action,actor_id,after_payload
           from event_ops_audit_log
          where workspace_id='workspace:a'
            and aggregate_type='event_role_assignment'
            and aggregate_id='actor:operator-a'
          order by occurred_at,audit_id`,
      );
      assert.deepEqual(
        audit.rows.slice(0, 4).map((row) => row.action),
        [
          "event.access.granted",
          "event.access.changed",
          "event.access.revoked",
          "event.access.granted",
        ],
      );
      assert.ok(
        audit.rows.every(
          (row) =>
            row.actor_id === "actor:owner-a" &&
            row.after_payload.assignedByActorId === "actor:owner-a" &&
            row.after_payload.reason.length > 10,
        ),
      );
      assert.deepEqual(
        (
          await pool.query(
            `select distinct assigned_by_actor_id
               from event_ops_event_role_assignment_versions
              where workspace_id='workspace:a'
                and subject_actor_id='actor:operator-a'`,
          )
        ).rows,
        [{ assigned_by_actor_id: "actor:owner-a" }],
      );

      await pool.query(
        `create function event_access_test_reject_audit()
         returns trigger language plpgsql as $guard$
         begin
           if new.aggregate_type='event_role_assignment'
              and new.aggregate_id='actor:rollback' then
             raise exception 'forced private audit failure';
           end if;
           return new;
         end
         $guard$`,
      );
      await pool.query(
        `create trigger event_access_test_reject_audit
         before insert on event_ops_audit_log
         for each row execute function event_access_test_reject_audit()`,
      );
      const beforeRollback = await mutationCounts(pool);
      await assert.rejects(
        serviceA.grant({
          actingActorId: "actor:owner-a",
          eventId: "event:shared",
          expectedRevision: 0,
          reason: "Prove version, head, and audit remain atomic",
          role: "operations",
          subjectActorId: "actor:rollback",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_REPOSITORY_FAILED" &&
          !error.message.includes("private"),
      );
      assert.deepEqual(await mutationCounts(pool), beforeRollback);
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_event_role_assignment_versions
                where subject_actor_id='actor:rollback'`,
            )
          ).rows[0]?.count,
        ),
        0,
      );
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "event access readiness rejects migration evidence and role tables resolved from different schemas",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const suffix = randomUUID().replaceAll("-", "");
    const sourceSchema = `event_access_source_${suffix}`;
    const evidenceSchema = `event_access_evidence_${suffix}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const sourceUrl = schemaUrl(databaseUrl, sourceSchema);
    const sourcePool = new Pool({ connectionString: sourceUrl, max: 2 });
    const sourceClient = createEventOperationsPostgresClient({
      connectionString: sourceUrl,
      pool: sourcePool,
    });
    let mixedClient: ReturnType<typeof createEventOperationsPostgresClient> | null =
      null;
    try {
      await admin.query(`create schema ${sourceSchema}`);
      await admin.query(`create schema ${evidenceSchema}`);
      await runEventOperationsMigrations(sourceClient);
      await admin.query(
        `create table ${evidenceSchema}.event_ops_schema_migrations
           (like ${sourceSchema}.event_ops_schema_migrations including all)`,
      );
      await admin.query(
        `insert into ${evidenceSchema}.event_ops_schema_migrations
         select * from ${sourceSchema}.event_ops_schema_migrations`,
      );
      const mixedUrl = schemaUrl(
        databaseUrl,
        `${evidenceSchema},${sourceSchema}`,
      );
      mixedClient = createEventOperationsPostgresClient({
        connectionString: mixedUrl,
        max: 1,
      });
      const service = createEventAccessService(
        createPostgresEventAccessRepository({
          client: mixedClient,
          workspaceId: "workspace:mixed",
        }),
      );
      const before = await mutationCounts(sourcePool);
      await assert.rejects(
        service.get({
          eventId: "event:mixed",
          subjectActorId: "actor:mixed",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_READY",
      );
      await assert.rejects(
        service.grant({
          actingActorId: "actor:mixed-owner",
          eventId: "event:mixed",
          expectedRevision: 0,
          reason: "Mixed schemas must never compose authority",
          role: "operations",
          subjectActorId: "actor:mixed",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_READY",
      );
      assert.deepEqual(await mutationCounts(sourcePool), before);
    } finally {
      if (mixedClient) await mixedClient.close();
      await sourceClient.close();
      await admin.query(`drop schema if exists ${evidenceSchema} cascade`);
      await admin.query(`drop schema if exists ${sourceSchema} cascade`);
      await admin.end();
    }
  },
);
