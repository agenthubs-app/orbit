import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventOperationsGenerationPublishPostHandler,
  createEventOperationsGenerationRetryPostHandler,
  createEventOperationsGenerationRunPostHandler,
  createEventOperationsGenerationStartPostHandler,
} from "../../app/api/events/[id]/operations/handlers";
import type {
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../features/events/event-access/contract";
import type { EventAccessService } from "../../features/events/event-access/service";
import {
  EventAccessRepositoryError,
  type EventAccessRepositoryErrorCode,
} from "../../features/events/event-access/storage/postgres-repository";
import type { EventOperationsService } from "../../features/events/event-operations/service";

const eventId = "event:generation";
const actorId = "actor:generation";
const generationId = "generation:one";
const eventContext = { params: Promise.resolve({ id: eventId }) };
const generationContext = {
  params: Promise.resolve({ generationId, id: eventId }),
};

interface AccessFacts {
  owner: boolean;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
}

function accessService(facts: AccessFacts): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: facts.owner,
        revision: 1,
        role: facts.role,
        state: facts.state,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

function failingAccessService(code: EventAccessRepositoryErrorCode): EventAccessService {
  return {
    async get() {
      throw new EventAccessRepositoryError(code);
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

function generationService(calls: Record<string, number>): EventOperationsService {
  return {
    async publishGeneration() {
      calls.publish += 1;
      return {} as never;
    },
    async retryGeneration() {
      calls.retry += 1;
      return {} as never;
    },
    async startGeneration() {
      calls.start += 1;
      return {} as never;
    },
  } as unknown as EventOperationsService;
}

type GenerationHandler = (request: Request, context: never) => Promise<Response>;

interface RouteCase {
  create: (dependencies: Parameters<typeof createEventOperationsGenerationStartPostHandler>[0]) => GenerationHandler;
  name: string;
  request: () => Request;
  statusWhenAuthorized: number;
  invokedService: "publish" | "retry" | "start" | null;
}

const routes: readonly RouteCase[] = [
  {
    create: createEventOperationsGenerationStartPostHandler as unknown as RouteCase["create"],
    invokedService: "start",
    name: "start",
    request: () =>
      new Request("http://test", { body: "{}", method: "POST" }),
    statusWhenAuthorized: 202,
  },
  {
    create: createEventOperationsGenerationRetryPostHandler as unknown as RouteCase["create"],
    invokedService: "retry",
    name: "retry",
    request: () => new Request("http://test", { method: "POST" }),
    statusWhenAuthorized: 202,
  },
  {
    create: createEventOperationsGenerationRunPostHandler as unknown as RouteCase["create"],
    invokedService: null,
    name: "run",
    request: () => new Request("http://test", { method: "POST" }),
    statusWhenAuthorized: 409,
  },
  {
    create: createEventOperationsGenerationPublishPostHandler as unknown as RouteCase["create"],
    invokedService: "publish",
    name: "publish",
    request: () => new Request("http://test", { method: "POST" }),
    statusWhenAuthorized: 200,
  },
];

function contextFor(route: RouteCase): never {
  return (route.name === "start" ? eventContext : generationContext) as never;
}

test("generation routes admit only owner and active operations staff", async (t) => {
  const roles: readonly [string, AccessFacts, boolean][] = [
    ["owner", { owner: true, role: null, state: null }, true],
    ["operations", { owner: false, role: "operations", state: "active" }, true],
    ["check-in", { owner: false, role: "check_in", state: "active" }, false],
    ["reviewer", { owner: false, role: "reviewer", state: "active" }, false],
    [
      "analyst",
      { owner: false, role: "read_only_analyst", state: "active" },
      false,
    ],
    ["revoked", { owner: false, role: "operations", state: "revoked" }, false],
    ["unassigned", { owner: false, role: null, state: null }, false],
  ];

  for (const route of routes) {
    await t.test(route.name, async (routeTest) => {
      for (const [roleName, facts, allowed] of roles) {
        await routeTest.test(roleName, async () => {
          const calls = { publish: 0, retry: 0, start: 0 };
          let serviceRuntimeCalls = 0;
          const handler = route.create({
            createAccessService: () => accessService(facts),
            createService: () => {
              serviceRuntimeCalls += 1;
              return generationService(calls);
            },
            resolveActor: async () => ({ id: actorId }),
          });

          const response = await handler(route.request(), contextFor(route));

          assert.equal(response.status, allowed ? route.statusWhenAuthorized : 403);
          assert.equal(
            serviceRuntimeCalls,
            allowed && route.invokedService !== null ? 1 : 0,
          );
          assert.equal(
            calls[route.invokedService ?? "start"],
            allowed && route.invokedService !== null ? 1 : 0,
          );
        });
      }
    });
  }
});

test("generation access failures use the canonical API mapping before operations runtime creation", async (t) => {
  const cases: readonly [EventAccessRepositoryErrorCode, number, string][] = [
    ["EVENT_ACCESS_NOT_READY", 503, "SERVICE_UNAVAILABLE"],
    ["EVENT_ACCESS_NOT_FOUND", 404, "NOT_FOUND"],
    ["EVENT_ACCESS_CONFLICT", 409, "CONFLICT"],
  ];

  for (const route of routes) {
    await t.test(route.name, async (routeTest) => {
      for (const [code, status, apiCode] of cases) {
        await routeTest.test(code, async () => {
          let serviceRuntimeCalls = 0;
          const handler = route.create({
            createAccessService: () => failingAccessService(code),
            createService: () => {
              serviceRuntimeCalls += 1;
              return generationService({ publish: 0, retry: 0, start: 0 });
            },
            resolveActor: async () => ({ id: actorId }),
          });

          const response = await handler(route.request(), contextFor(route));
          const payload = (await response.json()) as { error?: { code?: string } };

          assert.equal(response.status, status);
          assert.equal(payload.error?.code, apiCode);
          assert.equal(serviceRuntimeCalls, 0);
        });
      }
    });
  }
});
