import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import type {
  HomeFactsRouteModel,
} from "../../app/(app)/app/agent/home-facts-route-service";
import {
  loadHomeDashboardSnapshot,
  type HomeDashboardActor,
  type HomeDashboardRouteDependencies,
} from "../../app/(app)/app/agent/home-dashboard-route-service";
import { resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import type {
  PublicGoalRecommendationsResult,
} from "../../features/events/public-goal-recommendations";

const testRequire = createRequire(__filename);
const snapshotAt = "2026-09-17T00:00:00.000Z";
const workspaceId = "workspace:w5-a";
const actor: HomeDashboardActor = {
  accountId: "account:canonical",
  id: "account:canonical",
  workspaceId,
};

function factsModel(overrides: Partial<HomeFactsRouteModel> = {}): HomeFactsRouteModel {
  const group = (key: "overdue" | "plan-past" | "recent" | "undated") => ({
    count: key === "recent" ? 1 : 0,
    items: key === "recent"
      ? [{
          dueAt: snapshotAt,
          group: "recent" as const,
          href: "/app/tasks/task%3Ahome",
          id: "task:home",
          key: "tasks:task:home",
          status: "open" as const,
          title: "安全投影待办",
        }]
      : [],
    key,
    viewHref: "/app/tasks",
  });
  const taskSource = {
    count: 1,
    groups: [group("overdue"), group("plan-past"), group("recent"), group("undated")],
    items: [group("recent").items[0]!],
    sourceLabel: "待办事项",
    state: "ready" as const,
    viewHref: "/app/tasks",
  };
  const followupItem = {
    collection: "current" as const,
    contactId: "contact:home",
    contactName: "Home Contact",
    connectionId: "connection:home",
    dueAt: snapshotAt,
    group: "recent" as const,
    id: "followup:home",
    key: "followups:followup:home",
    operationHref: "/app/contacts/contact%3Ahome",
    organization: "Orbit",
    relationshipStage: "active" as const,
    status: "open" as const,
    title: "安全投影跟进",
    updatedAt: snapshotAt,
  };
  const followupSource = {
    count: 1,
    current: {
      count: 1,
      items: [followupItem],
      viewHref: "/app/tasks",
    },
    groups: [
      { count: 0, items: [], key: "overdue" as const, viewHref: "/app/tasks" },
      { count: 0, items: [], key: "plan-past" as const, viewHref: "/app/tasks" },
      { count: 1, items: [followupItem], key: "recent" as const, viewHref: "/app/tasks" },
      { count: 0, items: [], key: "undated" as const, viewHref: "/app/tasks" },
    ],
    history: { count: 2, items: [], viewHref: "/app/tasks" },
    items: [followupItem],
    orphan: { count: 1, items: [], viewHref: "/app/tasks", warning: "存在失联跟进，请在待办中处理。" },
    sourceLabel: "关系跟进",
    state: "ready" as const,
    viewHref: "/app/tasks",
  };
  const personalItem = {
    id: "personal:home",
    key: "personal:personal:home",
    startsAt: snapshotAt,
    state: "upcoming" as const,
    title: "个人日程",
  };
  const personalSource = {
    count: 1,
    coverage: "starts-in-window" as const,
    items: [personalItem],
    sourceLabel: "个人日程",
    state: "ready" as const,
    viewHref: "/app/tasks/personal",
  };
  const appointmentItem = {
    appointmentId: "appointment:home",
    contactId: "contact:home",
    durationMinutes: 30,
    endsAtUtc: "2026-09-17T00:30:00.000Z",
    href: "/app/today#arrangements",
    key: "appointments:appointment:home",
    medium: "video" as const,
    needsReconfirmation: false,
    startsAtUtc: snapshotAt,
    status: "confirmed" as const,
    temporalState: "upcoming" as const,
  };
  const base = {
    appointments: {
      count: 1,
      items: [appointmentItem],
      sourceLabel: "约见",
      state: "ready" as const,
      viewHref: "/app/today#arrangements",
    },
    followups: followupSource,
    personal: personalSource,
    snapshotAt,
    tasks: taskSource,
    window: {
      coverage: "starts-in-window" as const,
      from: snapshotAt,
      productDate: "2026-09-17",
      timeZone: "Asia/Tokyo" as const,
      to: "2026-09-23T15:00:00.000Z",
    },
  } satisfies HomeFactsRouteModel;
  return { ...base, ...overrides };
}

function recommendationResult(
  state: PublicGoalRecommendationsResult["state"],
): PublicGoalRecommendationsResult {
  return {
    items: state === "success"
      ? [{
          description: "公开活动说明",
          eventId: "event:public",
          matchedTokens: ["关系目标"],
          publicCode: "public-event",
          sourceEvidenceIds: ["evidence:event"],
          startsAt: "2026-09-18T01:00:00.000Z",
          title: "公开活动",
          venue: "Tokyo",
          privatePayload: "must-not-leak",
        } as PublicGoalRecommendationsResult["items"][number] & { privatePayload: string }]
      : [],
    state,
  };
}

function injectedDependencies(
  facts: HomeFactsRouteModel,
  recommendations: PublicGoalRecommendationsResult,
  calls: { facts: unknown[]; recommendationFactory: unknown[]; recommendation: unknown[] },
): HomeDashboardRouteDependencies {
  return {
    async loadFacts(input) {
      calls.facts.push(input);
      return facts;
    },
    createRecommendations(input) {
      calls.recommendationFactory.push(input.now());
      return {
        async recommend(value) {
          calls.recommendation.push(value);
          return recommendations;
        },
      };
    },
  };
}

test("loadHomeDashboardSnapshot takes one timestamp and composes facts with W3 account scope", async () => {
  const calls = { facts: [] as unknown[], recommendationFactory: [] as unknown[], recommendation: [] as unknown[] };
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: injectedDependencies(factsModel(), recommendationResult("success"), calls),
  });

  assert.equal(result.owner.accountId, actor.id);
  assert.equal(result.owner.workspaceId, workspaceId);
  assert.equal(result.snapshotAt, snapshotAt);
  assert.deepEqual(calls.facts[0], { actorId: actor.id, snapshotAt });
  assert.equal((calls.recommendationFactory[0] as Date).toISOString(), snapshotAt);
  assert.deepEqual(calls.recommendation[0], { accountId: actor.id });
  assert.equal(result.recommendations.state, "success");
  assert.equal(result.recommendations.items[0]?.publicCode, "public-event");
});

test("snapshot keeps each facts state and recommendation state independent", async () => {
  for (const recommendationState of ["success", "needs_goal", "no_match", "unavailable"] as const) {
    const facts = factsModel({
      appointments: {
        count: null,
        items: [],
        reason: "约见来源不可用",
        sourceLabel: "约见",
        state: "unavailable",
        viewHref: "/app/today#arrangements",
      },
    });
    const result = await loadHomeDashboardSnapshot({
      actor,
      snapshotAt,
      dependencies: injectedDependencies(facts, recommendationResult(recommendationState), {
        facts: [],
        recommendationFactory: [],
        recommendation: [],
      }),
    });

    assert.equal(result.facts.appointments.state, "unavailable");
    assert.equal(result.facts.appointments.count, null);
    assert.equal(result.recommendations.state, recommendationState);
    assert.deepEqual(result.recommendations.items, recommendationState === "success"
      ? [{
          description: "公开活动说明",
          eventId: "event:public",
          matchedTokens: ["关系目标"],
          publicCode: "public-event",
          sourceEvidenceIds: ["evidence:event"],
          startsAt: "2026-09-18T01:00:00.000Z",
          title: "公开活动",
          venue: "Tokyo",
        }]
      : []);
  }
});

test("snapshot preserves ready, empty, and unavailable state independently for all four facts sources", async () => {
  const sourceKeys = ["tasks", "followups", "personal", "appointments"] as const;
  for (const key of sourceKeys) {
    const base = factsModel();
    const source = base[key] as unknown as Record<string, unknown>;
    for (const state of ["empty", "unavailable"] as const) {
      const changedSource: Record<string, unknown> = {
        ...source,
        count: state === "empty" ? 0 : null,
        items: [],
        ...(state === "unavailable" ? { reason: `${key} unavailable` } : {}),
        state,
      };
      if (Array.isArray(source.groups)) {
        changedSource.groups = source.groups.map((group) => ({
          ...(group as Record<string, unknown>),
          count: 0,
          items: [],
        }));
      }
      const facts = { ...base, [key]: changedSource } as HomeFactsRouteModel;
      const result = await loadHomeDashboardSnapshot({
        actor,
        snapshotAt,
        dependencies: injectedDependencies(facts, recommendationResult("no_match"), {
          facts: [],
          recommendationFactory: [],
          recommendation: [],
        }),
      });
      const projected = (result.facts as unknown as Record<string, { count: number | null; state: string }>)[key]!;
      assert.equal(projected.state, state);
      assert.equal(projected.count, state === "empty" ? 0 : null);
    }
  }
});

test("recommendation rejection leaves facts available and invalid snapshot fails closed", async () => {
  const factsCalls: unknown[] = [];
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: {
      async loadFacts(input) {
        factsCalls.push(input);
        return factsModel();
      },
      createRecommendations() {
        return {
          async recommend() {
            throw new Error("recommendation unavailable");
          },
        };
      },
    },
  });
  assert.equal(factsCalls.length, 1);
  assert.equal(result.facts.tasks.state, "ready");
  assert.equal(result.recommendations.state, "unavailable");

  await assert.rejects(
    loadHomeDashboardSnapshot({
      actor,
      snapshotAt: "2026-09-17T00:00:00",
      dependencies: injectedDependencies(factsModel(), recommendationResult("success"), {
        facts: [],
        recommendationFactory: [],
        recommendation: [],
      }),
    }),
    /instant|snapshot/i,
  );
});

test("a synchronous facts-loader failure preserves recommendations and marks every facts source unavailable", async () => {
  const calls = { facts: 0, recommendationFactory: 0, recommendation: 0 };
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: {
      loadFacts() {
        calls.facts += 1;
        throw new Error("facts sync failure");
      },
      createRecommendations() {
        calls.recommendationFactory += 1;
        return {
          async recommend() {
            calls.recommendation += 1;
            return recommendationResult("success");
          },
        };
      },
    },
  });

  assert.equal(calls.facts, 1);
  assert.equal(calls.recommendationFactory, 1);
  assert.equal(calls.recommendation, 1);
  for (const key of ["tasks", "followups", "personal", "appointments"] as const) {
    assert.equal(result.facts[key].state, "unavailable");
    assert.equal(result.facts[key].count, null);
  }
  assert.equal(result.recommendations.state, "success");
});

test("an asynchronous facts-loader rejection preserves recommendations and marks every facts source unavailable", async () => {
  const calls = { facts: 0, recommendationFactory: 0, recommendation: 0 };
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: {
      async loadFacts() {
        calls.facts += 1;
        await Promise.resolve();
        throw new Error("facts async failure");
      },
      createRecommendations() {
        calls.recommendationFactory += 1;
        return {
          async recommend() {
            calls.recommendation += 1;
            return recommendationResult("success");
          },
        };
      },
    },
  });

  assert.equal(calls.facts, 1);
  assert.equal(calls.recommendationFactory, 1);
  assert.equal(calls.recommendation, 1);
  for (const key of ["tasks", "followups", "personal", "appointments"] as const) {
    assert.equal(result.facts[key].state, "unavailable");
    assert.equal(result.facts[key].count, null);
  }
  assert.equal(result.recommendations.state, "success");
});

test("trusted dashboard composition rejects invalid actors before either business source runs", async () => {
  const invalidActors = [
    { id: "", workspaceId },
    { id: "   ", workspaceId },
    { id: actor.id, accountId: "account:other", workspaceId },
    { id: actor.id, accountId: "", workspaceId },
    { id: actor.id, workspaceId: "" },
  ];

  for (const invalidActor of invalidActors) {
    const calls = { facts: [] as unknown[], recommendationFactory: [] as unknown[], recommendation: [] as unknown[] };
    await assert.rejects(
      loadHomeDashboardSnapshot({
        actor: invalidActor,
        snapshotAt,
        dependencies: injectedDependencies(factsModel(), recommendationResult("success"), calls),
      }),
      /canonical dashboard actor|account identity/i,
    );
    assert.equal(calls.facts.length, 0);
    assert.equal(calls.recommendationFactory.length, 0);
  }
});

test("trusted composition isolates synchronous recommendation-factory failure and rejects facts time drift", async () => {
  const factsCalls: unknown[] = [];
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: {
      async loadFacts(input) {
        factsCalls.push(input);
        return factsModel();
      },
      createRecommendations() {
        throw new Error("recommendation factory unavailable");
      },
    },
  });
  assert.equal(factsCalls.length, 1);
  assert.equal(result.facts.tasks.state, "ready");
  assert.equal(result.recommendations.state, "unavailable");

  const driftCalls = { facts: [] as unknown[], recommendationFactory: [] as unknown[], recommendation: [] as unknown[] };
  await assert.rejects(
    loadHomeDashboardSnapshot({
      actor,
      snapshotAt,
      dependencies: {
        async loadFacts(input) {
          driftCalls.facts.push(input);
          return factsModel({ snapshotAt: "2026-09-18T00:00:00.000Z" });
        },
        createRecommendations: injectedDependencies(factsModel(), recommendationResult("success"), driftCalls).createRecommendations,
      },
    }),
    /snapshot time drifted/i,
  );
  assert.equal(driftCalls.facts.length, 1);
});

test("snapshot projection drops private and feature-only fields while remaining serializable", async () => {
  const unsafeFacts = factsModel({
    tasks: {
      ...factsModel().tasks,
      items: [{ ...factsModel().tasks.items[0]!, notes: "private task notes" } as never],
    },
  });
  const result = await loadHomeDashboardSnapshot({
    actor,
    snapshotAt,
    dependencies: injectedDependencies(unsafeFacts, recommendationResult("success"), {
      facts: [],
      recommendationFactory: [],
      recommendation: [],
    }),
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private|privatePayload|accountId.*profileId|session|payload/u);
  assert.deepEqual(Object.keys(result.facts.tasks.items[0]!).sort(), [
    "dueAt",
    "group",
    "href",
    "id",
    "key",
    "status",
    "title",
  ]);
  assert.deepEqual(Object.keys(result.recommendations.items[0]!).sort(), [
    "description",
    "eventId",
    "matchedTokens",
    "publicCode",
    "sourceEvidenceIds",
    "startsAt",
    "title",
    "venue",
  ]);
});

type ActionModule = typeof import("../../app/(app)/app/agent/home-dashboard-actions");

const actionPath = testRequire.resolve("../../app/(app)/app/agent/home-dashboard-actions.ts");
const modePath = testRequire.resolve("../../shared/config/feature-mode.ts");
const configPath = testRequire.resolve("../../shared/storage/live-database-config.ts");
const authPath = testRequire.resolve("../../auth.ts");
const resolverPath = testRequire.resolve("../../app/api/_shared/authenticated-actor.ts");
const dashboardPath = testRequire.resolve("../../app/(app)/app/agent/home-dashboard-route-service.ts");

test("the dashboard action module is server-only and exports one async no-arg action", () => {
  const source = readFileSync(actionPath, "utf8");
  assert.match(source, /^"use server";\n/u);

  const actionModule = testRequire(actionPath) as ActionModule;
  const runtimeExports = Object.keys(actionModule).filter(
    (key) => key !== "__esModule",
  );

  assert.deepEqual(runtimeExports, ["refreshHomeDashboardAction"]);
  assert.equal(actionModule.refreshHomeDashboardAction.length, 0);
  assert.equal(
    actionModule.refreshHomeDashboardAction.constructor.name,
    "AsyncFunction",
  );
});

type ActionStubOptions = {
  actor?: unknown;
  auth?: unknown | (() => unknown);
  config?: unknown | (() => unknown);
  mode: "mock" | "hybrid" | "live";
  snapshot?: unknown | (() => unknown);
  resolver?: unknown | (() => unknown);
};

function installModule(path: string, exports: unknown): void {
  testRequire.cache[path] = {
    exports,
    filename: path,
    id: path,
    loaded: true,
    paths: [],
  } as never;
}

async function withActionStubs<T>(
  options: ActionStubOptions,
  callback: (actions: ActionModule, calls: { auth: number; config: number; mode: number; resolver: number; snapshot: number; resolverInput?: unknown; snapshotInput?: unknown }) => Promise<T>,
): Promise<T> {
  const paths = [actionPath, modePath, configPath, authPath, resolverPath, dashboardPath];
  const previous = new Map(paths.map((path) => [path, testRequire.cache[path]]));
  const calls = { auth: 0, config: 0, mode: 0, resolver: 0, snapshot: 0, resolverInput: undefined as unknown, snapshotInput: undefined as unknown };
  const valueOf = (value: unknown | (() => unknown)): unknown => typeof value === "function" ? (value as () => unknown)() : value;
  try {
    installModule(modePath, { resolveFeatureMode: () => { calls.mode += 1; return options.mode; } });
    installModule(configPath, { resolveLiveDatabaseConnectionConfig: () => { calls.config += 1; return valueOf(options.config); } });
    installModule(authPath, { auth: async () => { calls.auth += 1; return valueOf(options.auth); } });
    installModule(resolverPath, {
      resolveAuthenticatedApiActorFromSession: async (input: unknown) => {
        calls.resolver += 1;
        calls.resolverInput = input;
        return valueOf(options.resolver);
      },
    });
    installModule(dashboardPath, {
      loadHomeDashboardSnapshot: async (input: unknown) => {
        calls.snapshot += 1;
        calls.snapshotInput = input;
        return options.snapshot === undefined
          ? { state: "snapshot", snapshot: { owner: actor, snapshotAt } }
          : valueOf(options.snapshot);
      },
    });
    delete testRequire.cache[actionPath];
    const actions = testRequire(actionPath) as ActionModule;
    return await callback(actions, calls);
  } finally {
    for (const path of paths) {
      const old = previous.get(path);
      if (old) testRequire.cache[path] = old;
      else delete testRequire.cache[path];
    }
  }
}

const liveConfig = {
  connectionString: "postgresql://w5-a@127.0.0.1:1/orbit_w5_a_test",
  workspaceId,
};
const liveSession = { user: { email: "person@example.test", id: "profile:raw", name: "Person" } };
const canonicalActor = {
  accountId: actor.id,
  id: actor.id,
  name: "Person",
  profileId: "profile:raw",
  userId: "profile:raw",
  workspaceId,
};

test("clean default exported action is unavailable without live mode/configuration", async () => {
  const actions = testRequire(actionPath) as ActionModule;
  const result = await actions.refreshHomeDashboardAction();
  assert.deepEqual(result, { state: "unavailable" });
});

test("action rejects mock, hybrid, missing, empty, and throwing configuration before auth", async () => {
  for (const mode of ["mock", "hybrid"] as const) {
    await withActionStubs({ mode, config: liveConfig }, async (actions, calls) => {
      assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
      assert.equal(calls.config, 0);
      assert.equal(calls.auth, 0);
      assert.equal(calls.resolver, 0);
      assert.equal(calls.snapshot, 0);
    });
  }
  for (const config of [null, { connectionString: "", workspaceId }, { connectionString: liveConfig.connectionString, workspaceId: "" }]) {
    await withActionStubs({ mode: "live", config }, async (actions, calls) => {
      assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
      assert.equal(calls.auth, 0);
      assert.equal(calls.resolver, 0);
      assert.equal(calls.snapshot, 0);
    });
  }
  await withActionStubs({ mode: "live", config: () => { throw new Error("config failed"); } }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.auth, 0);
    assert.equal(calls.resolver, 0);
    assert.equal(calls.snapshot, 0);
  });
});

test("action authenticates every call and never reads business services without a session", async () => {
  await withActionStubs({ mode: "live", config: liveConfig, auth: null }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unauthenticated" });
    assert.equal(calls.resolver, 0);
    assert.equal(calls.snapshot, 0);
  });
  await withActionStubs({ mode: "live", config: liveConfig, auth: () => { throw new Error("auth failed"); } }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.resolver, 0);
    assert.equal(calls.snapshot, 0);
  });
  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: null }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.snapshot, 0);
  });
  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: () => { throw new Error("resolver failed"); } }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.snapshot, 0);
  });
});

test("action maps aggregate failure to unavailable after the authenticated snapshot attempt", async () => {
  await withActionStubs({
    mode: "live",
    config: liveConfig,
    auth: liveSession,
    resolver: canonicalActor,
    snapshot: () => {
      throw new Error("facts aggregate failed");
    },
  }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.resolver, 1);
    assert.equal(calls.snapshot, 1);
  });
});

test("action accepts only a canonical live actor and passes no client-controlled scope", async () => {
  const invalidActors = [
    { ...canonicalActor, id: "" },
    { ...canonicalActor, id: "   " },
    { ...canonicalActor, accountId: "account:other" },
    { ...canonicalActor, accountId: "" },
    { ...canonicalActor, accountId: null },
    { ...canonicalActor, workspaceId: "workspace:other" },
    {
      ...canonicalActor,
      accountId: "profile:raw",
      id: "profile:raw",
      workspaceId: "workspace:mock-auth",
    },
    { ...canonicalActor, workspaceId: "" },
    { ...canonicalActor, workspaceId: undefined },
  ];
  for (const invalidActor of invalidActors) {
    await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: invalidActor }, async (actions, calls) => {
      assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
      assert.equal(calls.snapshot, 0);
    });
  }

  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: canonicalActor }, async (actions, calls) => {
    // @ts-expect-error The action intentionally accepts no client parameters.
    const result = await actions.refreshHomeDashboardAction({ accountId: "account:evil", workspaceId: "workspace:evil" });
    assert.equal(result.state, "snapshot");
    assert.deepEqual(calls.resolverInput, {
      email: liveSession.user.email,
      name: liveSession.user.name,
      userId: liveSession.user.id,
    });
    assert.deepEqual(calls.snapshotInput, {
      actor,
    });
  });

  const inheritedMismatch = Object.create({ accountId: "account:inherited-other" }) as Record<string, unknown>;
  inheritedMismatch.id = actor.id;
  inheritedMismatch.workspaceId = workspaceId;
  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: inheritedMismatch }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.resolver, 1);
    assert.equal(calls.snapshot, 0);
  });

  const actorWithoutAccountId = { id: actor.id, workspaceId };
  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: actorWithoutAccountId }, async (actions, calls) => {
    const result = await actions.refreshHomeDashboardAction();
    assert.equal(result.state, "snapshot");
    assert.equal(calls.snapshot, 1);
    assert.deepEqual(calls.snapshotInput, { actor });
  });
});

test("two action calls re-authenticate and resolve independently without a cross-request cache", async () => {
  await withActionStubs({ mode: "live", config: liveConfig, auth: liveSession, resolver: canonicalActor }, async (actions, calls) => {
    await actions.refreshHomeDashboardAction();
    await actions.refreshHomeDashboardAction();
    assert.equal(calls.auth, 2);
    assert.equal(calls.resolver, 2);
    assert.equal(calls.snapshot, 2);
  });
});

test("the existing actor resolver distinguishes mock no-graph fallback from live no-graph failure before action mode gating", async () => {
  const mockActor = resolveAuthenticatedApiActorIdentity({
    graph: null,
    mode: "mock",
    session: { email: liveSession.user.email, name: liveSession.user.name, userId: liveSession.user.id },
    workspaceId: "workspace:mock-auth",
  });
  assert.equal(mockActor?.id, liveSession.user.id);

  const liveActor = resolveAuthenticatedApiActorIdentity({
    graph: null,
    mode: "live",
    session: { email: liveSession.user.email, name: liveSession.user.name, userId: liveSession.user.id },
    workspaceId,
  });
  assert.equal(liveActor, null);

  await withActionStubs({ mode: "mock", config: liveConfig, auth: liveSession, resolver: mockActor }, async (actions, calls) => {
    assert.deepEqual(await actions.refreshHomeDashboardAction(), { state: "unavailable" });
    assert.equal(calls.resolver, 0);
    assert.equal(calls.snapshot, 0);
  });
});

test("default route composition binds existing facts loader and W3 runtime once", async () => {
  const routePath = testRequire.resolve("../../app/(app)/app/agent/home-dashboard-route-service.ts");
  const factsPath = testRequire.resolve("../../app/(app)/app/agent/home-facts-route-service.ts");
  const runtimePath = testRequire.resolve("../../features/events/public-goal-recommendations-runtime.ts");
  const paths = [routePath, factsPath, runtimePath];
  const previous = new Map(paths.map((path) => [path, testRequire.cache[path]]));
  const calls: { facts?: unknown; runtime?: unknown; recommend?: unknown } = {};
  try {
    installModule(factsPath, {
      loadHomeFacts: async (input: unknown) => {
        calls.facts = input;
        return factsModel();
      },
    });
    installModule(runtimePath, {
      createConfiguredPublicGoalRecommendationsRuntime: (input: { now: () => Date }) => {
        calls.runtime = input.now();
        return {
          async recommend(value: unknown) {
            calls.recommend = value;
            return recommendationResult("success");
          },
        };
      },
    });
    delete testRequire.cache[routePath];
    const route = testRequire(routePath) as typeof import("../../app/(app)/app/agent/home-dashboard-route-service");
    const result = await route.loadHomeDashboardSnapshot({ actor, snapshotAt });
    assert.deepEqual(calls.facts, { actorId: actor.id, snapshotAt });
    assert.equal((calls.runtime as Date).toISOString(), snapshotAt);
    assert.deepEqual(calls.recommend, { accountId: actor.id });
    assert.equal(result.recommendations.state, "success");
  } finally {
    for (const path of paths) {
      const old = previous.get(path);
      if (old) testRequire.cache[path] = old;
      else delete testRequire.cache[path];
    }
  }
});

test("facts-loader failure fallback supplies explicit null readers without touching configured fact leaves", async () => {
  const routePath = testRequire.resolve("../../app/(app)/app/agent/home-dashboard-route-service.ts");
  const factsPath = testRequire.resolve("../../app/(app)/app/agent/home-facts-route-service.ts");
  const taskFactoryPath = testRequire.resolve("../../features/tasks/service-factory.ts");
  const personalFactoryPath = testRequire.resolve("../../features/personal-schedule/service-factory.ts");
  const appointmentFactoryPath = testRequire.resolve("../../features/appointments/runtime.ts");
  const followupReaderPath = testRequire.resolve("../../features/followups/storage/relationship-lifecycle-facts-reader.ts");
  const paths = [routePath, factsPath, taskFactoryPath, personalFactoryPath, appointmentFactoryPath, followupReaderPath];
  const previous = new Map(paths.map((path) => [path, testRequire.cache[path]]));
  const factoryCalls = { appointments: 0, followups: 0, personal: 0, tasks: 0 };
  const emptyFollowupFacts = {
    contacts: [],
    connections: [],
    tasks: [],
  };

  try {
    installModule(taskFactoryPath, {
      createConfiguredTaskService: () => {
        factoryCalls.tasks += 1;
        return { list: async () => [] };
      },
    });
    installModule(personalFactoryPath, {
      createConfiguredPersonalScheduleService: () => {
        factoryCalls.personal += 1;
        return { list: async () => [] };
      },
    });
    installModule(appointmentFactoryPath, {
      createConfiguredAppointmentService: () => {
        factoryCalls.appointments += 1;
        return { list: async () => [] };
      },
    });
    installModule(followupReaderPath, {
      createConfiguredRelationshipLifecycleFactsReader: () => {
        factoryCalls.followups += 1;
        return {
          readRelationshipLifecycleFacts: async () => emptyFollowupFacts,
          sourceLabel: "Relationship lifecycle facts",
        };
      },
    });
    delete testRequire.cache[factsPath];
    delete testRequire.cache[routePath];

    const facts = testRequire(factsPath) as typeof import("../../app/(app)/app/agent/home-facts-route-service");
    await facts.loadHomeFacts({ actorId: actor.id, snapshotAt });
    assert.deepEqual(factoryCalls, { appointments: 1, followups: 1, personal: 1, tasks: 1 });
    factoryCalls.appointments = 0;
    factoryCalls.followups = 0;
    factoryCalls.personal = 0;
    factoryCalls.tasks = 0;

    const route = testRequire(routePath) as typeof import("../../app/(app)/app/agent/home-dashboard-route-service");
    const result = await route.loadHomeDashboardSnapshot({
      actor,
      snapshotAt,
      dependencies: {
        loadFacts() {
          throw new Error("facts source failed");
        },
        createRecommendations() {
          return {
            async recommend() {
              return recommendationResult("no_match");
            },
          };
        },
      },
    });

    for (const key of ["tasks", "followups", "personal", "appointments"] as const) {
      assert.equal(result.facts[key].state, "unavailable");
      assert.equal(result.facts[key].count, null);
    }
    assert.equal(result.recommendations.state, "no_match");
    assert.deepEqual(factoryCalls, { appointments: 0, followups: 0, personal: 0, tasks: 0 });
  } finally {
    for (const path of paths) {
      const old = previous.get(path);
      if (old) testRequire.cache[path] = old;
      else delete testRequire.cache[path];
    }
  }
});

test("an independent process exercises the real action-to-facts-and-recommendations default chain", () => {
  const script = String.raw`
const assert = require("node:assert/strict");
const Module = require("node:module");
const { createRequire } = Module;
const { join } = require("node:path");
const root = process.cwd();
const req = createRequire(join(root, "package.json"));
const counts = { auth: 0, graph: 0, tasks: 0, personal: 0, followups: 0, appointments: 0, profile: 0, catalogue: 0 };
const calls = [];
let signedIn = true;
let graphValid = true;
let appointmentFailure = false;
function stub(relativePath, exports) {
  const path = join(root, relativePath);
  const module = new Module(path);
  module.filename = path;
  module.loaded = true;
  module.exports = exports;
  req.cache[path] = module;
}
stub("auth.ts", {
  auth: async () => {
    counts.auth += 1;
    return signedIn ? { user: { id: "profile:raw", email: "fixture@example.invalid", name: "Fixture" } } : null;
  },
});
stub("features/account/storage/account-live-record-provider.ts", {
  createConfiguredStorageAccountSessionProvider: () => ({
    readAccountSessionGraph: async (input) => {
      counts.graph += 1;
      assert.deepEqual(input, { userId: "profile:raw" });
      return graphValid
        ? { accounts: [{ id: "account:canonical" }], profiles: [{ id: "profile:raw", accountId: "account:canonical" }] }
        : { accounts: [], profiles: [] };
    },
  }),
});
stub("features/tasks/service-factory.ts", {
  createConfiguredTaskService: () => ({
    list: async (input) => {
      counts.tasks += 1;
      calls.push(["tasks", input]);
      return [];
    },
  }),
});
stub("features/personal-schedule/service-factory.ts", {
  createConfiguredPersonalScheduleService: () => ({
    list: async (input) => {
      counts.personal += 1;
      calls.push(["personal", input]);
      return [];
    },
  }),
});
stub("features/appointments/runtime.ts", {
  createConfiguredAppointmentService: () => ({
    list: async (input) => {
      counts.appointments += 1;
      calls.push(["appointments", input]);
      if (appointmentFailure) throw new Error("private appointment diagnostic");
      return [];
    },
  }),
});
const followupPath = "features/followups/storage/relationship-lifecycle-facts-reader.ts";
const actualFollowupModule = req(join(root, followupPath));
stub(followupPath, {
  ...actualFollowupModule,
  createConfiguredRelationshipLifecycleFactsReader: () => ({
    readRelationshipLifecycleFacts: async (accountId) => {
      counts.followups += 1;
      assert.equal(accountId, "account:canonical");
      return { tasks: [], contacts: [], connections: [] };
    },
  }),
});
stub("features/profile/service-factory.ts", {
  createProfileService: (mode) => {
    assert.equal(mode, "live");
    return {
      getProfile: async (input) => {
        counts.profile += 1;
        assert.deepEqual(input, { actorId: "account:canonical" });
        return { success: true, data: { profile: { relationshipGoal: "AI" } } };
      },
    };
  },
});
stub("features/events/core/public-catalogue-runtime.ts", {
  createConfiguredCanonicalPublicEventCatalogue: ({ now }) => ({
    readRecords: async () => {
      counts.catalogue += 1;
      return { generatedAt: now.toISOString(), records: [], organizerIds: {}, participantCounts: {}, publicCodes: {} };
    },
  }),
});
stub("features/events/event-operations/repository.ts", {
  createConfiguredEventOperationsRepository: () => null,
});
for (const relativePath of [
  "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx",
  "features/events/canonical-participant-event-journeys.ts",
  "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
]) {
  stub(relativePath, new Proxy({}, { get() { throw new Error("old home/chat/journey forbidden"); } }));
}
const { refreshHomeDashboardAction } = req(join(root, "app/(app)/app/agent/home-dashboard-actions.ts"));
(async () => {
  delete process.env.ORBIT_MODULE_MODE;
  delete process.env.ORBIT_FEATURE_MODE;
  assert.deepEqual(await refreshHomeDashboardAction(), { state: "unavailable" });
  assert.deepEqual(counts, { auth: 0, graph: 0, tasks: 0, personal: 0, followups: 0, appointments: 0, profile: 0, catalogue: 0 });

  process.env.ORBIT_MODULE_MODE = "live";
  assert.deepEqual(await refreshHomeDashboardAction(), { state: "unavailable" });
  assert.equal(counts.auth, 0);

  process.env.ORBIT_EVENT_DATABASE_URL = "postgresql://synthetic.invalid/never-connect";
  process.env.ORBIT_WORKSPACE_ID = "workspace:controller";
  signedIn = false;
  assert.deepEqual(await refreshHomeDashboardAction(), { state: "unauthenticated" });
  assert.equal(counts.graph, 0);

  signedIn = true;
  graphValid = false;
  assert.deepEqual(await refreshHomeDashboardAction(), { state: "unavailable" });
  assert.equal(counts.tasks, 0);

  graphValid = true;
  const result = await refreshHomeDashboardAction({ accountId: "attacker", workspaceId: "attacker" });
  assert.equal(result.state, "snapshot");
  assert.deepEqual(result.snapshot.owner, { accountId: "account:canonical", workspaceId: "workspace:controller" });
  assert.equal(result.snapshot.snapshotAt, result.snapshot.facts.snapshotAt);
  for (const key of ["tasks", "followups", "personal", "appointments"]) {
    assert.equal(result.snapshot.facts[key].state, "empty");
    assert.equal(result.snapshot.facts[key].count, 0);
  }
  assert.equal(result.snapshot.recommendations.state, "no_match", JSON.stringify({ counts, calls, result }));
  for (const [, input] of calls) assert.equal(input.actorId, "account:canonical");

  appointmentFailure = true;
  const failed = await refreshHomeDashboardAction();
  assert.equal(failed.state, "snapshot");
  assert.equal(failed.snapshot.facts.appointments.state, "unavailable");
  assert.equal(failed.snapshot.facts.appointments.count, null);
  assert.equal(failed.snapshot.facts.tasks.state, "empty");
  assert.equal(JSON.stringify(failed).includes("private appointment diagnostic"), false);
  assert.deepEqual(counts, { auth: 4, graph: 3, tasks: 2, personal: 2, followups: 2, appointments: 2, profile: 2, catalogue: 2 });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

  const child = spawnSync(process.execPath, ["--import", "tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? "",
      PATH: process.env.PATH ?? "/opt/homebrew/bin:/usr/bin:/bin:/Users/li/.npm-global/bin",
      TZ: "Asia/Tokyo",
    },
  });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
});
