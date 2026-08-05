import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventAccessDirectoryService } from "../../features/events/event-access/directory-service";
import { createEventAccessService } from "../../features/events/event-access/service";
import {
  EventAccessRepositoryError,
  createPostgresEventAccessRepository,
} from "../../features/events/event-access/storage/postgres-repository";
import { createPostgresEventAccessDirectoryRepository } from "../../features/events/event-access/storage/postgres-directory-repository";
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

test(
  "event access directory is event-scoped, shows only active assignments, and lets only the Event Core owner list current roles",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_access_directory_${suffix}`;
    const connectionString = schemaUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString, max: 4 });
    const client = createEventOperationsPostgresClient({
      connectionString,
      max: 4,
      pool,
    });
    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await pool.query(
        `insert into event_ops_events (
           workspace_id,event_id,organizer_actor_id,lifecycle_state,revision,
           created_at,updated_at,title,venue,starts_at,ends_at,lifecycle_state_v2
         ) values
           ('workspace:center','event:owned','actor:owner','active',1,now(),now(),
            'Owner planning session','Tokyo','2026-09-10T09:00:00Z','2026-09-10T11:00:00Z','published'),
           ('workspace:center','event:pending','actor:owner','active',1,now(),now(),
            'Legacy title must stay hidden','Legacy venue','2026-09-11T09:00:00Z','2026-09-11T11:00:00Z',null),
           ('workspace:center','event:delegated','actor:other-owner','active',1,now(),now(),
            'Delegated check-in','Osaka','2026-09-12T09:00:00Z','2026-09-12T11:00:00Z','draft'),
           ('workspace:center','event:revoked','actor:other-owner','active',1,now(),now(),
            'Completed shift','Nagoya','2026-09-14T09:00:00Z','2026-09-14T11:00:00Z','published'),
           ('workspace:center','event:not-assigned','actor:other-owner','active',1,now(),now(),
            'No assignment','Kyoto','2026-09-15T09:00:00Z','2026-09-15T11:00:00Z','published'),
           ('workspace:other','event:delegated','actor:foreign-owner','active',1,now(),now(),
            'Foreign workspace event','Sapporo','2026-09-16T09:00:00Z','2026-09-16T11:00:00Z','published')`,
      );

      const writes = createEventAccessService(
        createPostgresEventAccessRepository({
          client,
          workspaceId: "workspace:center",
        }),
      );
      await writes.grant({
        actingActorId: "actor:other-owner",
        eventId: "event:delegated",
        expectedRevision: 0,
        reason: "负责嘉宾到场核验",
        role: "check_in",
        subjectActorId: "actor:operator",
      });
      await writes.grant({
        actingActorId: "actor:other-owner",
        eventId: "event:revoked",
        expectedRevision: 0,
        reason: "临时支持签到",
        role: "check_in",
        subjectActorId: "actor:operator",
      });
      await writes.revoke({
        actingActorId: "actor:other-owner",
        eventId: "event:revoked",
        expectedRevision: 1,
        reason: "现场班次已经结束",
        subjectActorId: "actor:operator",
      });

      const directory = createEventAccessDirectoryService(
        createPostgresEventAccessDirectoryRepository({
          client,
          workspaceId: "workspace:center",
        }),
      );
      const ownerEvents = await directory.listAccessibleEvents({
        actorId: "actor:owner",
      });
      assert.deepEqual(ownerEvents.map((event) => ({
        eventId: event.eventId,
        owner: event.owner,
        role: event.role,
      })), [
        { eventId: "event:owned", owner: true, role: "owner" },
        { eventId: "event:pending", owner: true, role: "owner" },
      ]);
      const pending = ownerEvents.find((event) => event.eventId === "event:pending");
      assert.deepEqual(
        pending && {
          endsAt: pending.endsAt,
          migrationPending: pending.migrationPending,
          startsAt: pending.startsAt,
          title: pending.title,
          venue: pending.venue,
        },
        {
          endsAt: null,
          migrationPending: true,
          startsAt: null,
          title: null,
          venue: null,
        },
      );

      const operatorEvents = await directory.listAccessibleEvents({
        actorId: "actor:operator",
      });
      assert.deepEqual(operatorEvents.map((event) => ({
        eventId: event.eventId,
        owner: event.owner,
        revision: event.revision,
        role: event.role,
      })), [{
        eventId: "event:delegated",
        owner: false,
        revision: 1,
        role: "check_in",
      }]);
      assert.equal(operatorEvents[0]?.title, "Delegated check-in");
      assert.equal(operatorEvents[0]?.lifecycleState, "draft");
      assert.equal(operatorEvents[0]?.migrationPending, false);

      const roles = await directory.listEventRoleMembers({
        actingActorId: "actor:other-owner",
        eventId: "event:delegated",
      });
      assert.deepEqual(roles.members.map((member) => ({
        assignedByActorId: member.assignedByActorId,
        reason: member.reason,
        revision: member.revision,
        role: member.role,
        subjectActorId: member.subjectActorId,
      })), [
        {
          assignedByActorId: null,
          reason: "Derived from the Event Core organizer.",
          revision: 0,
          role: "owner",
          subjectActorId: "actor:other-owner",
        },
        {
          assignedByActorId: "actor:other-owner",
          reason: "负责嘉宾到场核验",
          revision: 1,
          role: "check_in",
          subjectActorId: "actor:operator",
        },
      ]);
      assert.ok(Object.isFrozen(roles.members));

      await assert.rejects(
        directory.listEventRoleMembers({
          actingActorId: "actor:operator",
          eventId: "event:delegated",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_FORBIDDEN",
      );
      await assert.rejects(
        directory.listEventRoleMembers({
          actingActorId: "actor:owner",
          eventId: "event:pending",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_FOUND",
      );
      await assert.rejects(
        directory.listEventRoleMembers({
          actingActorId: "actor:owner",
          eventId: "event:missing",
        }),
        (error: unknown) =>
          error instanceof EventAccessRepositoryError &&
          error.code === "EVENT_ACCESS_NOT_FOUND",
      );
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
