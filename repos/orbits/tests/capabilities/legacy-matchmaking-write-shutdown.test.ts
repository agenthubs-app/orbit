import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  createAgentDomainExecutors,
  type AgentDomainExecutorDependencies,
} from "../../features/agent/runtime/domain-executors";
import { createLiveOrbitAgentLocalBoundaryPayload } from "../../features/orbit-ai/live-agent-runtime";
import { createEventMatchmakingWorkflow } from "../../features/orbit-ai/workflows/event-matchmaking-v1";
import { createOrbitKnownWorkflowRouter } from "../../features/orbit-ai/workflows/router";

const repositoryRoot = process.cwd();

const runtimeEnvironmentKeys = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "ORBIT_DATABASE_URL",
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_FEATURE_MODE",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_MODULE_MODE",
] as const;

async function withExplicitMockRuntime<T>(
  externalEnvironmentConfigured: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map(
    runtimeEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  try {
    process.env.ORBIT_MODULE_MODE = "mock";
    process.env.ORBIT_FEATURE_MODE = "mock";
    if (externalEnvironmentConfigured) {
      process.env.ORBIT_EVENT_DATABASE_URL =
        "postgres://explicit-but-unused.invalid/orbit";
      process.env.GEMINI_API_KEY = "explicit-but-unused-test-key";
    } else {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
      delete process.env.ORBIT_LIVE_DATABASE_URL;
      delete process.env.ORBIT_DATABASE_URL;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
    }
    return await run();
  } finally {
    for (const key of runtimeEnvironmentKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const legacyWriteRoutes = [
  "app/api/events/[id]/matchmaking/route.ts",
  "app/api/agent/matchmaking/requests/[id]/respond/route.ts",
  "app/api/agent/matchmaking/requests/[id]/slots/route.ts",
  "app/api/agent/matchmaking/requests/[id]/outcome/route.ts",
];

test("legacy matchmaking HTTP writes are authenticated 410 read-only boundaries", () => {
  for (const route of legacyWriteRoutes) {
    const source = readFileSync(join(repositoryRoot, route), "utf8");
    assert.match(source, /LEGACY_MATCHMAKING_READ_ONLY/);
    assert.match(source, /status: 410/);
    assert.doesNotMatch(source, /\.createRequest\(/);
    assert.doesNotMatch(source, /\.respondToIntroduction\(/);
    assert.doesNotMatch(source, /\.proposeSlots\(/);
    assert.doesNotMatch(source, /\.selectSlot\(/);
    assert.doesNotMatch(source, /\.recordOutcome\(/);
  }

  const eventRoute = readFileSync(
    join(repositoryRoot, "app/api/events/[id]/matchmaking/route.ts"),
    "utf8",
  );
  assert.match(eventRoute, /export async function GET/);
  assert.match(eventRoute, /createEventMatchmakingContextService\(\)\.view/);
});

test("legacy matchmaking workflow cannot rank or enqueue the removed executor", async () => {
  const source = readFileSync(
    join(
      repositoryRoot,
      "features/orbit-ai/workflows/event-matchmaking-v1.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /events\.createIntroductionRequest/);
  assert.doesNotMatch(source, /create_intro_request/);
  assert.doesNotMatch(source, /\.rank\(/);
  assert.doesNotMatch(source, /\.createRun\(/);
  assert.match(source, /LEGACY_MATCHMAKING_READ_ONLY/);

  await assert.rejects(
    () =>
      createEventMatchmakingWorkflow().run({
        eventId: "event:retired",
        eventTitle: "Retired",
        organizerActorId: "actor:organizer",
        requester: {} as never,
        candidates: [],
      }),
    {
      code: "LEGACY_MATCHMAKING_READ_ONLY",
      message: /LEGACY_MATCHMAKING_READ_ONLY/,
    },
  );
});

test("router intercepts every retired trigger and live Agent stays local", async () => {
  for (const externalEnvironmentConfigured of [false, true]) {
    await withExplicitMockRuntime(externalEnvironmentConfigured, async () => {
      const router = createOrbitKnownWorkflowRouter();
      assert.equal(router.find("event_ended"), null, "legacy post-event routing is opt-in for tests/mock only");
      for (const trigger of [
        "event_matchmaking_requested",
        "event_goal_confirmed",
      ]) {
        const workflow = router.find(trigger);
        assert.equal(workflow?.key, "event_matchmaking_v1");
        await assert.rejects(() => workflow!.run({}), {
          code: "LEGACY_MATCHMAKING_READ_ONLY",
          message: /LEGACY_MATCHMAKING_READ_ONLY/,
        });
      }
    });
  }

  const boundary = createLiveOrbitAgentLocalBoundaryPayload(
    "运行 event_matchmaking_v1，为活动重新做撮合排名。",
  );
  assert.ok(boundary);
  assert.match(
    boundary.assistantMessage ?? "",
    /LEGACY_MATCHMAKING_READ_ONLY/,
  );
  assert.deepEqual(boundary.proposedToolIntents, []);
  assert.equal(boundary.provenance.safety.domainToolCallsExecuted, false);
  assert.equal(boundary.provenance.safety.aiProviderRequested, false);
});

test("legacy executor fails closed without affecting another domain executor", async () => {
  let legacyWriteCalls = 0;
  let followupWriteCalls = 0;
  const dependencies = {
    matchmaking: {
      async createIntroductionRequest() {
        legacyWriteCalls += 1;
        return { requestId: "must-not-exist" };
      },
    },
    followups: {
      async createTask() {
        followupWriteCalls += 1;
        return { recordId: "task:still-works" };
      },
    },
  } as unknown as AgentDomainExecutorDependencies;
  const executors = createAgentDomainExecutors(dependencies);
  const legacy = executors.find(
    (executor) => executor.key === "events.createIntroductionRequest",
  );
  const followup = executors.find(
    (executor) => executor.key === "followups.createTask",
  );
  assert.ok(legacy);
  assert.ok(followup);

  const context = {
    actionId: "action:test",
    runId: "run:test",
    operationId: "operation:test",
    idempotencyKey: "idempotency:test",
    now: "2026-08-04T00:00:00.000Z",
  };
  await assert.rejects(() => legacy.execute({}, context), {
    code: "LEGACY_MATCHMAKING_READ_ONLY",
    message: /LEGACY_MATCHMAKING_READ_ONLY/,
  });
  assert.equal(legacyWriteCalls, 0);

  const result = await followup.execute(
    { taskId: "task:still-works", title: "Still works" },
    context,
  );
  assert.equal(result.resultRef, "tasks:task:still-works");
  assert.equal(followupWriteCalls, 1);
});
