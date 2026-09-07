import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createConfiguredEventOperationsPostgresRuntime } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

export function useRegistrationCatalogueFixture(
  additionalPublishedEvents: readonly {
    id: string;
    code: string;
    title: string;
    venue: string;
  }[] = [],
): void {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let schema: string | undefined;
  let runtime: ReturnType<typeof createConfiguredEventOperationsPostgresRuntime>;
  let restoreFetch: (() => void) | undefined;
  let unexpectedRequests = 0;
  const previous = new Map<string, string | undefined>();

  test.after(async () => {
    restoreFetch?.();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      await runtime?.client.close();
    } finally {
      try {
        await pool?.end();
      } finally {
        try {
          if (schema) await admin?.query(`drop schema if exists ${schema} cascade`);
        } finally {
          await admin?.end();
        }
      }
    }
    assert.equal(unexpectedRequests, 0, "Registration fixtures must not request an external provider.");
  });

  test.before(async () => {
    const fetchMock = test.mock.method(globalThis, "fetch", async () => {
      unexpectedRequests += 1;
      throw new Error("External requests are disabled in registration integration tests.");
    });
    restoreFetch = () => fetchMock.mock.restore();
    loadLocalEnv();
    const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
    assert.ok(databaseUrl, "Registration integration tests require ORBIT_EVENT_DATABASE_URL pointing to a test database.");
    schema = `registration_catalogue_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const url = new URL(databaseUrl);
    url.searchParams.set("options", `-c search_path=${schema}`);
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    await admin.query(`create schema ${schema}`);
    pool = new Pool({ connectionString: url.toString(), max: 1 });
    await runOrbitRecordsMigration(pool);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    for (const event of [
      { id: "event_signup_01", code: "EVTSIGNUP01", title: "关西跨境商务对接会", venue: "大阪", start: now + 30 * day, state: "published" },
      { id: "event_01", code: "EVTENDED01", title: "Ended registration fixture", venue: "大阪", start: now - 30 * day, state: "published" },
      { id: "event_001", code: "EVTDRAFT01", title: "Unpublished registration fixture", venue: "大阪", start: now + 30 * day, state: "draft" },
      ...additionalPublishedEvents.map((event) => ({
        ...event,
        start: now + 30 * day,
        state: "published",
      })),
    ]) {
      const startsAt = new Date(event.start).toISOString();
      const endsAt = new Date(event.start + 2 * 60 * 60 * 1000).toISOString();
      const values = [workspaceId, event.id, event.code, event.title, startsAt, endsAt, event.state, event.venue];
      await pool.query(`insert into event_ops_events (
        workspace_id,event_id,organizer_actor_id,created_at,updated_at,public_code,
        title,description,venue,timezone,starts_at,ends_at,lifecycle_state_v2,source_payload,event_version
      ) values ($1,$2,'organizer:registration-test',now(),now(),$3,$4,
        'Independent registration test event',$8,'Asia/Tokyo',$5,$6,$7,'{}',1)`, values);
      await pool.query(`insert into event_event_versions (
        workspace_id,event_id,event_version,public_code,title,description,venue,timezone,
        starts_at,ends_at,lifecycle_state_v2,source_payload,organizer_actor_id,content_hash,created_at
      ) values ($1,$2,1,$3,$4,'Independent registration test event',$8,'Asia/Tokyo',
        $5,$6,$7,'{}','organizer:registration-test',$9,now())`,
      [...values, createHash("sha256").update(JSON.stringify(values)).digest("hex")]);
      await pool.query(`insert into event_aliases (workspace_id,normalized_alias,alias_value,alias_type,event_id)
        values ($1,lower($2),$2,'public_code',$3), ($1,lower($3),$3,'event_id',$3)`,
      [workspaceId, event.code, event.id]);
    }
    const environment = {
      ORBIT_EVENT_DATABASE_URL: url.toString(),
      ORBIT_LIVE_DATABASE_URL: url.toString(),
      ORBIT_DATABASE_URL: url.toString(),
      ORBIT_WORKSPACE_ID: workspaceId,
      OPENAI_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      GEMINI_API_KEY: "",
    };
    for (const [key, value] of Object.entries(environment)) {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    }
    runtime = createConfiguredEventOperationsPostgresRuntime();
  });
}
