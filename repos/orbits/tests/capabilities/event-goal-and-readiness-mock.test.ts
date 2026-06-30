/**
 * 活动目标与 readiness mock 的契约测试。
 *
 * 验证目标、准备清单、建议和 API/debug-view 的状态覆盖。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the event goal and readiness mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event goal and readiness contract exposes goal suggestions checklist preparation fixtures and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_GOAL_READINESS_ERROR_CODES: readonly string[];
    EVENT_GOAL_READINESS_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_GOAL_READINESS_FIXTURE_SOURCE: string;
    mockEventGoalReadinessFixture: {
      state: string;
      event: { id: string; title: string; venue: string };
      goal: {
        goalId: string;
        intent: string;
        aiProviderRequested: false;
        liveDatabaseWriteExecuted: false;
      };
      suggestedGoals: readonly Array<{
        goalId: string;
        label: string;
        rationale: string;
        aiProviderRequested: false;
      }>;
      readinessChecklist: readonly Array<{
        itemId: string;
        label: string;
        status: string;
        evidenceIds: readonly string[];
      }>;
      preparationState: {
        readinessScore: number;
        calendarConflictCheck: {
          hasConflict: boolean;
          liveCalendarRequested: false;
        };
        preEventBriefReady: boolean;
      };
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
        aiProviderRequested: false;
        calendarProviderRequested: false;
      };
    };
    mockEmptyEventGoalReadinessFixture: {
      state: string;
      goal: null;
      suggestedGoals: readonly unknown[];
      readinessChecklist: readonly unknown[];
      nextAction: string;
    };
    mockPendingEventGoalReadinessFixture: {
      state: string;
      preparationState: {
        calendarConflictCheck: { hasConflict: boolean };
        preEventBriefReady: boolean;
      };
      nextAction: string;
    };
  }>("features/events/goal-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventGoalAndReadinessService: () => {
      suggestGoals: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        relationshipFocus?: string | null;
      }) => {
        success: boolean;
        data?: {
          suggestedGoals: typeof contract.mockEventGoalReadinessFixture.suggestedGoals;
          provenance: typeof contract.mockEventGoalReadinessFixture.provenance;
        };
        error?: { code: string; appCode: string };
      };
      setGoal: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        goalText?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventGoalReadinessFixture & {
          goal: typeof contract.mockEventGoalReadinessFixture.goal;
        };
        error?: { code: string; appCode: string };
      };
      getReadiness: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventGoalReadinessFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/mock-goal-service.ts");

  assert.deepEqual(contract.EVENT_GOAL_READINESS_ERROR_CODES, [
    "EVENT_GOAL_READINESS_EVENT_ID_REQUIRED",
    "EVENT_GOAL_READINESS_EVENT_NOT_FOUND",
    "EVENT_GOAL_READINESS_GOAL_REQUIRED",
    "EVENT_GOAL_READINESS_PREPARATION_PENDING",
    "EVENT_GOAL_READINESS_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EVENT_GOAL_READINESS_ERROR_DEFINITIONS
      .EVENT_GOAL_READINESS_GOAL_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );
  assert.match(
    contract.EVENT_GOAL_READINESS_ERROR_DEFINITIONS
      .EVENT_GOAL_READINESS_MOCK_FAILED.recovery,
    /AI|calendar|email|notification|database/i,
  );

  assert.equal(contract.mockEventGoalReadinessFixture.state, "success");
  assert.equal(contract.mockEventGoalReadinessFixture.event.id, "demo-event-1");
  assert.equal(
    contract.mockEventGoalReadinessFixture.event.title,
    "Climate founders dinner",
  );
  assert.equal(contract.mockEventGoalReadinessFixture.suggestedGoals.length, 3);
  assert.deepEqual(
    contract.mockEventGoalReadinessFixture.suggestedGoals.map(
      (goal) => goal.goalId,
    ),
    [
      "goal-suggestion:operator-intros",
      "goal-suggestion:storage-pilot",
      "goal-suggestion:investor-context",
    ],
  );
  assert.deepEqual(
    contract.mockEventGoalReadinessFixture.readinessChecklist.map(
      (item) => item.status,
    ),
    ["ready", "ready", "pending", "ready"],
  );
  assert.equal(
    contract.mockEventGoalReadinessFixture.preparationState
      .calendarConflictCheck.liveCalendarRequested,
    false,
  );
  assert.equal(
    contract.mockEventGoalReadinessFixture.provenance.source,
    contract.EVENT_GOAL_READINESS_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockEventGoalReadinessFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockEventGoalReadinessFixture.provenance.calendarProviderRequested,
    false,
  );
  assert.equal(contract.mockEmptyEventGoalReadinessFixture.state, "empty");
  assert.equal(contract.mockEmptyEventGoalReadinessFixture.goal, null);
  assert.equal(
    contract.mockEmptyEventGoalReadinessFixture.nextAction,
    "Set a local mock goal before composing pre-event preparation.",
  );
  assert.equal(contract.mockPendingEventGoalReadinessFixture.state, "pending");
  assert.equal(
    contract.mockPendingEventGoalReadinessFixture.preparationState
      .preEventBriefReady,
    false,
  );

  const service = serviceModule.createMockEventGoalAndReadinessService();
  const suggested = service.suggestGoals({ eventId: "demo-event-1" });
  const focused = service.suggestGoals({
    eventId: "demo-event-1",
    relationshipFocus: "storage_pilot",
  });
  const readiness = service.getReadiness({ eventId: "demo-event-1" });
  const customGoal = service.setGoal({
    eventId: "demo-event-1",
    goalText:
      "Meet two climate operators who can validate storage-pilot partnerships.",
  });
  const empty = service.getReadiness({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.getReadiness({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.setGoal({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const missingEvent = service.getReadiness({ eventId: "missing-event" });
  const blankGoal = service.setGoal({
    eventId: "demo-event-1",
    goalText: "  ",
  });

  assert.equal(suggested.success, true);
  assert.equal(suggested.data?.suggestedGoals.length, 3);
  assert.equal(focused.success, true);
  assert.deepEqual(
    focused.data?.suggestedGoals.map((goal) => goal.goalId),
    ["goal-suggestion:storage-pilot"],
  );
  assert.equal(readiness.success, true);
  assert.equal(readiness.data?.preparationState.readinessScore, 75);
  assert.equal(
    readiness.data?.preparationState.calendarConflictCheck.hasConflict,
    false,
  );
  assert.equal(customGoal.success, true);
  assert.equal(
    customGoal.data?.goal.intent,
    "Meet two climate operators who can validate storage-pilot partnerships.",
  );
  assert.equal(customGoal.data?.goal.aiProviderRequested, false);
  assert.equal(customGoal.data?.goal.liveDatabaseWriteExecuted, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.readinessChecklist.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENT_GOAL_READINESS_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "EVENT_GOAL_READINESS_EVENT_NOT_FOUND");
  assert.equal(blankGoal.success, false);
  assert.equal(blankGoal.error?.code, "EVENT_GOAL_READINESS_GOAL_REQUIRED");
});

test("mock event goal and readiness service is deterministic rule-based code with no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventGoalAndReadinessService: () => {
      suggestGoals: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        relationshipFocus?: string | null;
      }) => unknown;
      setGoal: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        goalText?: string | null;
      }) => unknown;
      getReadiness: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/events/mock-goal-service.ts");
  const service = serviceModule.createMockEventGoalAndReadinessService();
  const input = {
    eventId: "demo-event-1",
    relationshipFocus: "storage_pilot",
  };

  assert.deepEqual(
    service.suggestGoals({ eventId: "demo-event-1" }),
    service.suggestGoals({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.getReadiness({ eventId: "demo-event-1" }),
    service.getReadiness({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(service.suggestGoals(input), service.suggestGoals(input));
  assert.deepEqual(
    service.setGoal({
      eventId: "demo-event-1",
      goalText: "Meet two partner-path operators.",
    }),
    service.setGoal({
      eventId: "demo-event-1",
      goalText: "Meet two partner-path operators.",
    }),
  );
  assert.deepEqual(
    service.getReadiness({
      eventId: "demo-event-1",
      scenario: "unknown-scenario",
    }),
    service.getReadiness({ eventId: "demo-event-1" }),
  );

  for (const filePath of [
    "features/events/goal-contract.ts",
    "features/events/mock-goal-service.ts",
    "app/api/events/[id]/goal/route.ts",
    "app/api/events/[id]/readiness/route.ts",
    "features/events/event-goal-and-readiness-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("event goal and readiness API routes return stable envelopes with empty and failure paths", async () => {
  const goalRoute = await importProjectModule<{
    PUT: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/goal/route.ts");
  const readinessRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/readiness/route.ts");
  const contract = await importProjectModule<{
    mockEventGoalReadinessFixture: unknown;
    mockEmptyEventGoalReadinessFixture: unknown;
  }>("features/events/goal-contract.ts");

  const goalResponse = await goalRoute.PUT(
    new Request("https://orbit.local/api/events/demo-event-1/goal", {
      body: JSON.stringify({
        goalText:
          "Meet two climate operators who can validate storage-pilot partnerships.",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "PUT",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const readinessResponse = await readinessRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1/readiness", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyReadinessResponse = await readinessRoute.GET(
    new Request(
      "https://orbit.local/api/events/demo-event-1/readiness?scenario=empty",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureGoalResponse = await goalRoute.PUT(
    new Request(
      "https://orbit.local/api/events/demo-event-1/goal?scenario=failure",
      {
        method: "PUT",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );

  assert.equal(goalResponse.status, 200);
  assert.equal(goalResponse.headers.get("cache-control"), "no-store");
  assert.equal(goalResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(readinessResponse.status, 200);
  assert.equal(readinessResponse.headers.get("cache-control"), "no-store");
  assert.equal(readinessResponse.headers.get("x-orbit-feature-mode"), "mock");

  const goalEnvelope = (await goalResponse.json()) as {
    success: true;
    data: {
      state: string;
      event: { id: string; title: string };
      goal: { intent: string; aiProviderRequested: false };
      readinessChecklist: readonly unknown[];
    };
  };
  const readinessEnvelope = (await readinessResponse.json()) as {
    success: true;
    data: {
      state: string;
      event: { id: string; title: string };
      goal: { goalId: string };
      readinessChecklist: readonly unknown[];
      preparationState: {
        calendarConflictCheck: { liveCalendarRequested: false };
      };
    };
  };

  assert.equal(goalEnvelope.success, true);
  assert.equal(goalEnvelope.data.state, "success");
  assert.equal(goalEnvelope.data.event.id, "demo-event-1");
  assert.equal(
    goalEnvelope.data.goal.intent,
    "Meet two climate operators who can validate storage-pilot partnerships.",
  );
  assert.equal(goalEnvelope.data.goal.aiProviderRequested, false);
  assert.equal(readinessEnvelope.success, true);
  assert.equal(readinessEnvelope.data.state, "success");
  assert.equal(
    readinessEnvelope.data.preparationState.calendarConflictCheck
      .liveCalendarRequested,
    false,
  );
  assert.equal(readinessEnvelope.data.readinessChecklist.length, 4);
  assert.equal(emptyReadinessResponse.status, 200);
  assert.deepEqual(await emptyReadinessResponse.json(), {
    success: true,
    data: contract.mockEmptyEventGoalReadinessFixture,
  });
  assert.deepEqual(
    {
      ...readinessEnvelope,
      data: {
        ...readinessEnvelope.data,
        goal: undefined,
      },
    },
    {
      success: true,
      data: {
        ...(contract.mockEventGoalReadinessFixture as Record<string, unknown>),
        goal: undefined,
      },
    },
  );

  assert.equal(failureGoalResponse.status, 503);
  assert.deepEqual(await failureGoalResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event goal and readiness boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventGoalReadinessErrorCode: "EVENT_GOAL_READINESS_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event goal and readiness failure came from deterministic fixture rules.",
        service: "event-goal-and-readiness-mock",
      },
    },
  });
});

test("event goal and readiness debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_GOAL_AND_READINESS_MOCK_SLUG: string;
    EventGoalAndReadinessMockDemo: () => React.ReactElement;
  }>("features/events/event-goal-and-readiness-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventGoalAndReadinessMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/events/event-goal-and-readiness-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_GOAL_AND_READINESS_MOCK_SLUG,
    "event-goal-and-readiness-mock",
  );
  assert.match(pageSource, /EVENT_GOAL_AND_READINESS_MOCK_SLUG/);
  assert.match(pageSource, /EventGoalAndReadinessMockDemo/);

  assert.match(html, /Event goal and readiness mock/);
  assert.match(html, /aria-label="Event goal readiness operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Event goal readiness state matrix"/);
  assert.match(html, /Success: 75% ready/);
  assert.match(html, /Empty: no goal selected/);
  assert.match(html, /Pending: 40% ready/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Suggested goals/);
  assert.match(html, /Readiness checklist/);
  assert.match(html, /Pre-event preparation/);
  assert.match(html, /model calls false/);
  assert.match(html, /calendar provider false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Meet two climate operators/);
  assert.match(html, /Storage pilot validation/);
  assert.match(html, /EVENT_GOAL_READINESS_MOCK_FAILED/);
  assert.match(html, /PUT \/api\/events\/demo-event-1\/goal/);
  assert.match(html, /GET \/api\/events\/demo-event-1\/readiness/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_GOAL_READINESS_PROVIDER/);
  assert.match(html, /event-goal-readiness-workbench/);
  assert.match(
    html,
    /\.event-goal-readiness-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/events\/event-goal-and-readiness-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/events\/event-goal-and-readiness-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_GOAL_READINESS_PROVIDER/);
  assert.match(liveDoc, /AI goal generation provider/);
  assert.match(liveDoc, /live calendar conflict provider/);
  assert.match(liveDoc, /required environment variables/);
  assert.match(liveDoc, /permissions/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
