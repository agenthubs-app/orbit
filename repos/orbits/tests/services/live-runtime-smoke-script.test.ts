import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { defaultMockFixtures } from "../../shared/mock/fixtures";

const projectRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const scriptPath = path.join(projectRoot, "scripts/smoke-live-runtime.ts");
const generatedEventApiRecords = defaultMockFixtures.events.map((event) => ({
  id: event.id,
  title: event.name,
}));

test("live runtime smoke script is available as a safe npm command", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["db:smoke:live-runtime"],
    "tsx scripts/smoke-live-runtime.ts",
  );
  assert.equal(fs.existsSync(scriptPath), true);

  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /ORBIT_LIVE_BASE_URL/);
  assert.match(source, /x-orbit-feature-mode/);
  assert.match(source, /\/api\/health/);
  assert.match(source, /\/api\/ai\/proactive-turns/);
  assert.match(source, /\/api\/app\/bootstrap/);
  assert.match(source, /\/api\/profile/);
  assert.match(source, /\/api\/tasks/);
  assert.match(source, /\/api\/events/);
  assert.match(source, /\/api\/contacts/);
  assert.doesNotMatch(source, /ORBIT_EVENT_DATABASE_URL/);
  assert.doesNotMatch(source, /ORBIT_LIVE_DATABASE_URL/);
  assert.doesNotMatch(source, /ORBIT_DATABASE_URL/);
  assert.doesNotMatch(source, /connectionString/);
});

test("live runtime smoke script validates live headers and seeded payloads", async () => {
  assert.equal(fs.existsSync(scriptPath), true);

  const smokeModule = (await import(pathToFileURL(scriptPath).href)) as {
    runLiveRuntimeSmoke: (options: {
      baseUrl: string;
      fetchImpl: typeof fetch;
      log: (message: string) => void;
    }) => Promise<{
      checkedRoutes: readonly { path: string; detail: string }[];
    }>;
  };
  const calls: string[] = [];
  const responseFor = (pathName: string): Response => {
    const headers = {
      "content-type": "application/json",
      "x-orbit-feature-mode": "live",
    };

    if (pathName === "/api/health") {
      return Response.json(
        { success: true, data: { mode: "live", service: "health" } },
        { headers },
      );
    }

    if (pathName === "/api/app/bootstrap") {
      return Response.json(
        {
          success: true,
          data: {
            connectionSummary: { totalContacts: 66 },
            pendingTasks: [{ taskId: "task_001" }],
            upcomingEvents: [{ eventId: "event_01" }],
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/events") {
      return Response.json(
        {
          success: true,
          data: {
            events: generatedEventApiRecords,
            provenance: {
              generationMethod: "live-store-query",
              source: "postgres-live-record-store:events:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/profile") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            profile: {
              id: "profile_live_generated_operator",
              displayName: "結城 航太郎",
            },
            completeness: { score: 100 },
            provenance: {
              source: "postgres-live-record-store:profiles:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/tasks") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            tasks: [{ taskId: "task_001" }],
            provenance: {
              generationMethod: "live-store-query",
              liveDatabaseReadExecuted: true,
              source: "postgres-live-record-store:followups:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/contacts") {
      return Response.json(
        {
          success: true,
          data: {
            contacts: [{ id: "contact_001" }],
            provenance: { databaseQueryExecuted: true },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/ai/proactive-turns") {
      return Response.json(
        {
          success: true,
          data: {
            message: {
              deliverySurface: "orbit_ai_chat",
              turnKind: "proactive",
            },
            provenance: {
              generationMethod: "live-policy-proactive-turn",
              safety: {
                liveDatabaseWriteExecuted: false,
                notificationDelivered: false,
                pushProviderRequested: false,
              },
            },
          },
        },
        { headers },
      );
    }

    return Response.json(
      { success: false, error: { code: "NOT_FOUND" } },
      { status: 404, headers },
    );
  };
  const result = await smokeModule.runLiveRuntimeSmoke({
    baseUrl: "http://127.0.0.1:3000/",
    fetchImpl: async (input) => {
      const url = new URL(input.toString());
      calls.push(url.pathname);

      return responseFor(url.pathname);
    },
    log: () => undefined,
  });

  assert.deepEqual(calls, [
    "/api/health",
    "/api/app/bootstrap",
    "/api/profile",
    "/api/tasks",
    "/api/events",
    "/api/contacts",
    "/api/ai/proactive-turns",
  ]);
  assert.deepEqual(
    result.checkedRoutes.map((route) => route.path),
    calls,
  );
  assert.match(result.checkedRoutes[1].detail, /66 contacts/);
  assert.match(result.checkedRoutes[2].detail, /結城 航太郎/);
  assert.match(result.checkedRoutes[3].detail, /1 tasks/);
  assert.match(result.checkedRoutes[4].detail, /13 events/);
  assert.match(result.checkedRoutes[5].detail, /1 contacts/);
  assert.match(result.checkedRoutes[6].detail, /Orbit AI chat/);
});

test("live runtime smoke rejects legacy event records in product event lists", async () => {
  assert.equal(fs.existsSync(scriptPath), true);

  const smokeModule = (await import(pathToFileURL(scriptPath).href)) as {
    runLiveRuntimeSmoke: (options: {
      baseUrl: string;
      fetchImpl: typeof fetch;
      log: (message: string) => void;
    }) => Promise<{
      checkedRoutes: readonly { path: string; detail: string }[];
    }>;
  };
  const headers = {
    "content-type": "application/json",
    "x-orbit-feature-mode": "live",
  };
  const responseFor = (pathName: string): Response => {
    if (pathName === "/api/health") {
      return Response.json(
        { success: true, data: { mode: "live", service: "health" } },
        { headers },
      );
    }

    if (pathName === "/api/app/bootstrap") {
      return Response.json(
        {
          success: true,
          data: {
            connectionSummary: { totalContacts: 66 },
            pendingTasks: [{ taskId: "task_001" }],
            upcomingEvents: [{ eventId: "event_01" }],
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/events") {
      return Response.json(
        {
          success: true,
          data: {
            events: [
              { id: "event_01" },
              { id: "demo-event-1" },
            ],
            provenance: {
              generationMethod: "live-store-query",
              source: "postgres-live-record-store:events:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/profile") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            profile: {
              id: "profile_live_generated_operator",
              displayName: "結城 航太郎",
            },
            completeness: { score: 100 },
            provenance: {
              source: "postgres-live-record-store:profiles:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/tasks") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            tasks: [{ taskId: "task_001" }],
            provenance: {
              generationMethod: "live-store-query",
              liveDatabaseReadExecuted: true,
              source: "postgres-live-record-store:followups:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/contacts") {
      return Response.json(
        {
          success: true,
          data: {
            contacts: [{ id: "contact_001" }],
            provenance: { databaseQueryExecuted: true },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/ai/proactive-turns") {
      return Response.json(
        {
          success: true,
          data: {
            message: {
              deliverySurface: "orbit_ai_chat",
              turnKind: "proactive",
            },
            provenance: {
              generationMethod: "live-policy-proactive-turn",
              safety: {
                liveDatabaseWriteExecuted: false,
                notificationDelivered: false,
                pushProviderRequested: false,
              },
            },
          },
        },
        { headers },
      );
    }

    return Response.json(
      { success: false, error: { code: "NOT_FOUND" } },
      { status: 404, headers },
    );
  };

  await assert.rejects(
    smokeModule.runLiveRuntimeSmoke({
      baseUrl: "http://127.0.0.1:3000/",
      fetchImpl: async (input) => responseFor(new URL(input.toString()).pathname),
      log: () => undefined,
    }),
    /legacy event records/i,
  );
});

test("live runtime smoke rejects incomplete generated event batches", async () => {
  assert.equal(fs.existsSync(scriptPath), true);

  const smokeModule = (await import(pathToFileURL(scriptPath).href)) as {
    runLiveRuntimeSmoke: (options: {
      baseUrl: string;
      fetchImpl: typeof fetch;
      log: (message: string) => void;
    }) => Promise<{
      checkedRoutes: readonly { path: string; detail: string }[];
    }>;
  };
  const headers = {
    "content-type": "application/json",
    "x-orbit-feature-mode": "live",
  };
  const responseFor = (pathName: string): Response => {
    if (pathName === "/api/health") {
      return Response.json(
        { success: true, data: { mode: "live", service: "health" } },
        { headers },
      );
    }

    if (pathName === "/api/app/bootstrap") {
      return Response.json(
        {
          success: true,
          data: {
            connectionSummary: { totalContacts: 66 },
            pendingTasks: [{ taskId: "task_001" }],
            upcomingEvents: [{ eventId: "event_01" }],
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/events") {
      return Response.json(
        {
          success: true,
          data: {
            events: generatedEventApiRecords.slice(0, -1),
            provenance: {
              generationMethod: "live-store-query",
              source: "postgres-live-record-store:events:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/profile") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            profile: {
              id: "profile_live_generated_operator",
              displayName: "結城 航太郎",
            },
            completeness: { score: 100 },
            provenance: {
              source: "postgres-live-record-store:profiles:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/tasks") {
      return Response.json(
        {
          success: true,
          data: {
            state: "success",
            tasks: [{ taskId: "task_001" }],
            provenance: {
              generationMethod: "live-store-query",
              liveDatabaseReadExecuted: true,
              source: "postgres-live-record-store:followups:workspace:orbit-dev",
            },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/contacts") {
      return Response.json(
        {
          success: true,
          data: {
            contacts: [{ id: "contact_001" }],
            provenance: { databaseQueryExecuted: true },
          },
        },
        { headers },
      );
    }

    if (pathName === "/api/ai/proactive-turns") {
      return Response.json(
        {
          success: true,
          data: {
            message: {
              deliverySurface: "orbit_ai_chat",
              turnKind: "proactive",
            },
            provenance: {
              generationMethod: "live-policy-proactive-turn",
              safety: {
                liveDatabaseWriteExecuted: false,
                notificationDelivered: false,
                pushProviderRequested: false,
              },
            },
          },
        },
        { headers },
      );
    }

    return Response.json(
      { success: false, error: { code: "NOT_FOUND" } },
      { status: 404, headers },
    );
  };

  await assert.rejects(
    smokeModule.runLiveRuntimeSmoke({
      baseUrl: "http://127.0.0.1:3000/",
      fetchImpl: async (input) => responseFor(new URL(input.toString()).pathname),
      log: () => undefined,
    }),
    /missing generated event batch records/i,
  );
});
