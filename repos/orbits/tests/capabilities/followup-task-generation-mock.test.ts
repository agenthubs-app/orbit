/**
 * 跟进任务生成 mock 的契约测试。
 *
 * 验证触发信号、任务列表、limit 规则和不创建真实提醒的边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as followupsFixtures from "../../features/followups/fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the followup task generation mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("followup task generation contract exports typed fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    FOLLOWUP_TASK_GENERATION_ERROR_CODES: readonly string[];
    FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE: string;
    mockFollowupTaskGenerationFixture: {
      state: string;
      tasks: readonly Array<{
        taskId: string;
        title: string;
        triggerKind: string;
        connectionId: string;
        evidenceIds: readonly string[];
        generatedBy: string;
        dueInDays: number;
        audit: {
          sourceLabel: string;
          providerBoundary: string;
          verificationAction: string;
        };
        backgroundSchedulerRequested: false;
        liveDatabaseWriteExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationDelivered: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        backgroundSchedulerRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        aiProviderRequested: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationDelivered: false;
        externalNetworkRequested: false;
      };
    };
    mockEmptyFollowupTaskGenerationFixture: {
      state: string;
      tasks: readonly unknown[];
      nextAction: string;
    };
    mockPendingFollowupTaskGenerationFixture: {
      state: string;
      tasks: readonly unknown[];
      nextAction: string;
    };
    mockFollowupTaskGenerationCategories: readonly string[];
  }>("features/followups/fixtures.ts");
  const serviceModule = await importProjectModule<{
    createMockFollowupTaskGenerationService: () => {
      listTasks: (input?: {
        scenario?: string | null;
        triggerKind?: string | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: typeof followupsFixtures.mockFollowupTaskGenerationFixture;
        error?: { code: string; appCode: string };
      };
      generateTasks: (input?: {
        scenario?: string | null;
        triggerKinds?: readonly string[] | null;
        connectionId?: string | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: typeof followupsFixtures.mockFollowupTaskGenerationFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/followups/mock-service.ts");
  const serviceInterface = readFileSync(
    join(projectRoot, "features/followups/service.ts"),
    "utf8",
  );
  const service = serviceModule.createMockFollowupTaskGenerationService();
  const listed = service.listTasks();
  const generated = service.generateTasks();
  const filtered = service.generateTasks({
    triggerKinds: ["promised_action", "dormant_relationship"],
    limit: 2,
  });
  const empty = service.listTasks({ scenario: "empty" });
  const pending = service.generateTasks({ scenario: "pending" });
  const failure = service.listTasks({ scenario: "failure" });

  assert.match(serviceInterface, /interface FollowupTaskGenerationService/);
  assert.match(serviceInterface, /listTasks/);
  assert.match(serviceInterface, /generateTasks/);
  assert.deepEqual(contract.FOLLOWUP_TASK_GENERATION_ERROR_CODES, [
    "FOLLOWUP_TASK_GENERATION_TASK_ID_REQUIRED",
    "FOLLOWUP_TASK_GENERATION_TASK_NOT_FOUND",
    "FOLLOWUP_TASK_GENERATION_EMPTY",
    "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
    "FOLLOWUP_TASK_GENERATION_PENDING",
    "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS
      .FOLLOWUP_TASK_GENERATION_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS
      .FOLLOWUP_TASK_GENERATION_EMPTY.recovery,
    /new connections|event encounters|promised actions|dormant relationships/i,
  );

  assert.deepEqual(followupsFixtures.mockFollowupTaskGenerationCategories, [
    "new_connection",
    "event_encounter",
    "promised_action",
    "dormant_relationship",
  ]);
  assert.equal(followupsFixtures.mockFollowupTaskGenerationFixture.state, "success");
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.provenance.source,
    followupsFixtures.FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    followupsFixtures.mockFollowupTaskGenerationFixture.tasks.map(
      (task) => task.triggerKind,
    ),
    [
      "new_connection",
      "event_encounter",
      "promised_action",
      "dormant_relationship",
    ],
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.tasks[0]
      .backgroundSchedulerRequested,
    false,
  );
  assert.deepEqual(followupsFixtures.mockFollowupTaskGenerationFixture.tasks[0].audit, {
    sourceLabel: "Climate operators breakfast roster",
    providerBoundary: "scheduler false, AI false, persistence false",
    verificationAction: "Verify evidence",
  });
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.tasks[0].aiProviderRequested,
    false,
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.tasks[0].notificationDelivered,
    false,
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.provenance
      .backgroundSchedulerRequested,
    false,
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.provenance
      .liveDatabaseReadExecuted,
    false,
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.provenance
      .liveDatabaseWriteExecuted,
    false,
  );
  assert.equal(
    followupsFixtures.mockFollowupTaskGenerationFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    followupsFixtures.mockEmptyFollowupTaskGenerationFixture.state,
    "empty",
  );
  assert.match(
    followupsFixtures.mockEmptyFollowupTaskGenerationFixture.nextAction,
    /Add a new connection|record an encounter|promised action|relationship/i,
  );
  assert.equal(
    followupsFixtures.mockPendingFollowupTaskGenerationFixture.state,
    "pending",
  );

  assert.equal(listed.success, true);
  assert.equal(listed.data?.tasks.length, 4);
  assert.equal(generated.success, true);
  assert.equal(generated.data?.state, "success");
  assert.equal(generated.data?.tasks[0].generatedBy, "mock-followup-rules");
  assert.equal(filtered.success, true);
  assert.deepEqual(
    filtered.data?.tasks.map((task) => task.triggerKind),
    ["promised_action", "dormant_relationship"],
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.tasks.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
  );
});

test("mock followup task generation service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockFollowupTaskGenerationService: () => {
      listTasks: (input?: {
        scenario?: string | null;
        triggerKind?: string | null;
        limit?: number | null;
      }) => unknown;
      generateTasks: (input?: {
        scenario?: string | null;
        triggerKinds?: readonly string[] | null;
        connectionId?: string | null;
        limit?: number | null;
      }) => unknown;
    };
  }>("features/followups/mock-service.ts");
  const service = serviceModule.createMockFollowupTaskGenerationService();
  const generationInput = {
    connectionId: "connection:maya-chen",
    triggerKinds: ["new_connection", "promised_action"],
  };

  assert.deepEqual(service.listTasks(), service.listTasks());
  assert.deepEqual(
    service.generateTasks(generationInput),
    service.generateTasks(generationInput),
  );
  assert.deepEqual(
    service.listTasks({ scenario: "unknown" }),
    service.listTasks(),
  );

  for (const filePath of [
    "features/followups/contract.ts",
    "features/followups/fixtures.ts",
    "features/followups/service.ts",
    "features/followups/mock-service.ts",
    "app/api/tasks/route.ts",
    "app/api/tasks/generate/route.ts",
    "features/followups/followup-task-generation-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /OpenAI|Anthropic|Pinecone|Weaviate|Qdrant/);
  }
});

test("followup task API routes return stable envelopes with empty and failure paths", async () => {
  const tasksRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/tasks/route.ts");
  const generateRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/tasks/generate/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyFollowupTaskGenerationFixture: unknown;
  }>("features/followups/fixtures.ts");

  const tasksResponse = await tasksRoute.GET(
    new Request("https://orbit.local/api/tasks", {
      method: "GET",
    }),
  );
  const generateResponse = await generateRoute.POST(
    new Request("https://orbit.local/api/tasks/generate", {
      body: JSON.stringify({
        triggerKinds: ["new_connection", "event_encounter"],
      }),
      method: "POST",
    }),
  );
  const emptyResponse = await tasksRoute.GET(
    new Request("https://orbit.local/api/tasks?scenario=empty", {
      method: "GET",
    }),
  );
  const failureResponse = await tasksRoute.GET(
    new Request("https://orbit.local/api/tasks?scenario=failure", {
      method: "GET",
    }),
  );

  assert.equal(tasksResponse.status, 200);
  assert.equal(tasksResponse.headers.get("cache-control"), "no-store");
  assert.equal(tasksResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(generateResponse.status, 200);
  assert.equal(generateResponse.headers.get("cache-control"), "no-store");

  const tasksEnvelope = (await tasksResponse.json()) as {
    success: true;
    data: {
      state: string;
      tasks: readonly Array<{
        taskId: string;
        triggerKind: string;
        aiProviderRequested: false;
        backgroundSchedulerRequested: false;
      }>;
      provenance: {
        aiProviderRequested: false;
        liveDatabaseWriteExecuted: false;
      };
    };
  };
  const generateEnvelope = (await generateResponse.json()) as {
    success: true;
    data: {
      state: string;
      tasks: readonly Array<{ triggerKind: string }>;
    };
  };

  assert.equal(tasksEnvelope.success, true);
  assert.equal(tasksEnvelope.data.state, "success");
  assert.equal(tasksEnvelope.data.tasks.length, 4);
  assert.equal(tasksEnvelope.data.tasks[0].triggerKind, "new_connection");
  assert.equal(tasksEnvelope.data.tasks[0].aiProviderRequested, false);
  assert.equal(
    tasksEnvelope.data.tasks[0].backgroundSchedulerRequested,
    false,
  );
  assert.equal(tasksEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(tasksEnvelope.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(generateEnvelope.success, true);
  assert.equal(generateEnvelope.data.state, "success");
  assert.deepEqual(
    generateEnvelope.data.tasks.map((task) => task.triggerKind),
    ["new_connection", "event_encounter"],
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyFollowupTaskGenerationFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock followup task generation boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        followupTaskGenerationErrorCode:
          "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock followup task generation failure came from deterministic fixture rules.",
        service: "followup-task-generation-mock",
      },
    },
  });
});

test("followup task generation dev probe manifest exercises declared API paths", async () => {
  const debugView = await importProjectModule<{
    FOLLOWUP_TASK_GENERATION_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
  }>("features/followups/followup-task-generation-mock/debug-view.tsx");
  const tasksRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/tasks/route.ts");
  const generateRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/tasks/generate/route.ts");

  assert.deepEqual(
    debugView.FOLLOWUP_TASK_GENERATION_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["GET", "/api/tasks", 200],
      ["POST", "/api/tasks/generate", 200],
      ["GET", "/api/tasks?scenario=empty", 200],
      ["GET", "/api/tasks?scenario=pending", 200],
      ["GET", "/api/tasks?scenario=failure", 503],
    ],
  );

  for (const probe of debugView.FOLLOWUP_TASK_GENERATION_API_PROBES) {
    const response =
      probe.method === "GET"
        ? await tasksRoute.GET(
            new Request(`https://orbit.local${probe.path}`, {
              method: probe.method,
            }),
          )
        : await generateRoute.POST(
            new Request(`https://orbit.local${probe.path}`, {
              body: JSON.stringify({ triggerKinds: ["new_connection"] }),
              method: probe.method,
            }),
          );
    const envelope = (await response.json()) as {
      success: boolean;
      data?: { state?: string };
      error?: { context?: { followupTaskGenerationErrorCode?: string } };
    };

    assert.equal(response.status, probe.expectedStatus, probe.label);
    assert.equal(typeof envelope.success, "boolean", probe.label);

    if (probe.path.includes("scenario=pending")) {
      assert.equal(envelope.success, true);
      assert.equal(envelope.data?.state, "pending");
    }

    if (probe.path.includes("scenario=failure")) {
      assert.equal(envelope.success, false);
      assert.equal(
        envelope.error?.context?.followupTaskGenerationErrorCode,
        "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
      );
    }
  }
});

test("followup task generation debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    FOLLOWUP_TASK_GENERATION_MOCK_SLUG: string;
    FollowupTaskGenerationMockDemo: () => React.ReactElement;
  }>("features/followups/followup-task-generation-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.FollowupTaskGenerationMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/followups/followup-task-generation-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.FOLLOWUP_TASK_GENERATION_MOCK_SLUG,
    "followup-task-generation-mock",
  );
  assert.match(pageSource, /FOLLOWUP_TASK_GENERATION_MOCK_SLUG/);
  assert.match(pageSource, /FollowupTaskGenerationMockDemo/);

  assert.match(html, /Followup task generation mock/);
  assert.match(
    html,
    /aria-label="Followup task generation operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Followup task generation state matrix"/);
  assert.match(html, /Success: 4 followup tasks/);
  assert.match(html, /Empty: no eligible relationship triggers/);
  assert.match(html, /Pending: generation guard/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /New connection/);
  assert.match(html, /Event encounter/);
  assert.match(html, /Promised action/);
  assert.match(html, /Dormant relationship/);
  assert.match(html, /aria-label="Audit followup task task:followup:new-connection:maya"/);
  assert.match(html, /Verify evidence/);
  assert.match(html, /Source: Climate operators breakfast roster/);
  assert.match(html, /Provider boundary: scheduler false, AI false, persistence false/);
  assert.match(html, /evidence:followup:new-connection/);
  assert.match(html, /scheduler false/);
  assert.match(html, /AI provider false/);
  assert.match(html, /database write false/);
  assert.match(html, /FOLLOWUP_TASK_GENERATION_MOCK_FAILED/);
  assert.match(html, /GET \/api\/tasks/);
  assert.match(html, /POST \/api\/tasks\/generate/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);

  for (const requiredText of [
    "Live service files",
    "ORBIT_FOLLOWUP_TASK_GENERATION_PROVIDER",
    "background scheduler",
    "task persistence provider",
    "AI task generation provider",
    "calendar",
    "email",
    "notification",
    "source evidence",
    "provenance",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
