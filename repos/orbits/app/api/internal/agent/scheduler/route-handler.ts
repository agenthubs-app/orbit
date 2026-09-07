import { NextResponse } from "next/server";
import type { AgentPreferences } from "../../../../../features/agent/preferences";
import { createAgentPreferencesService } from "../../../../../features/agent/preferences";
import type { AgentRuntimeService } from "../../../../../features/agent/runtime/service";
import { createOrbitAgentRuntimeService } from "../../../../../features/agent/runtime/service-factory";
import type { OrbitPushAdapter } from "../../../../../features/notifications/push-adapter";
import { createConfiguredExpoPushAdapter } from "../../../../../features/notifications/push-adapter";
import type { NotificationDeliveryService } from "../../../../../features/notifications/delivery-service";
import { createNotificationDeliveryService } from "../../../../../features/notifications/delivery-service";
import {
  createConfiguredPreEventBriefCandidateCollector,
  type PreEventBriefCandidateCollector,
} from "../../../../../features/orbit-ai/workflows/pre-event-brief-candidate-source";
import { createAgentWorkflowScheduler } from "../../../../../features/orbit-ai/workflows/scheduler";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";

type SchedulerPreferences = Pick<
  AgentPreferences,
  "preEventBriefPushEnabled" | "quietHours" | "timeZone"
>;

export interface AgentSchedulerRouteDependencies {
  authorize?: (request: Request) => boolean;
  collectorForActor?: (
    actorId: string,
    mode: ModuleMode,
  ) => PreEventBriefCandidateCollector;
  preferences?: (actorId: string) => Promise<SchedulerPreferences>;
  deliveryForActor?: (actorId: string) => NotificationDeliveryService;
  push?: () => OrbitPushAdapter | null;
  resolveActorId?: (request: Request) => string | null;
  resolveMode?: () => ModuleMode;
  runtimeForActor?: (actorId: string, mode: ModuleMode) => AgentRuntimeService;
}

function defaultAuthorized(request: Request): boolean {
  const secret = process.env.ORBIT_AGENT_WORKER_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function defaultActorId(request: Request): string | null {
  const actorId = request.headers.get("x-orbit-actor-id")?.trim();
  return actorId ? actorId.slice(0, 240) : null;
}

async function bodyFor(request: Request): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") return {};
  const body = (await request.json().catch(() => ({}))) as unknown;
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function createAgentSchedulerRouteHandler(
  dependencies: AgentSchedulerRouteDependencies = {},
): (request: Request) => Promise<Response> {
  const authorize = dependencies.authorize ?? defaultAuthorized;
  const resolveActorId = dependencies.resolveActorId ?? defaultActorId;
  const resolveMode = dependencies.resolveMode ?? (() => resolveModuleMode());
  const runtimeForActor =
    dependencies.runtimeForActor ??
    ((actorId, mode) =>
      createOrbitAgentRuntimeService(mode, {
        actorId,
      }));
  const preferences =
    dependencies.preferences ??
    ((actorId) => createAgentPreferencesService({ actorId }).get());
  const push = dependencies.push ?? createConfiguredExpoPushAdapter;
  const deliveryForActor =
    dependencies.deliveryForActor ??
    ((actorId) => createNotificationDeliveryService({ actorId }));

  return async function handleAgentSchedulerRequest(
    request: Request,
  ): Promise<Response> {
    if (!authorize(request)) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Scheduler secret invalid.",
          },
        },
        { status: 401 },
      );
    }
    const actorId = resolveActorId(request);
    if (!actorId) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authenticated scheduler actor required.",
          },
        },
        { status: 401 },
      );
    }

    const body = await bodyFor(request);
    if (
      Object.hasOwn(body, "candidates") ||
      Object.hasOwn(body, "actorId") ||
      Object.hasOwn(body, "workspaceId")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "CLIENT_SCHEDULER_INPUT_FORBIDDEN",
            message:
              "Scheduler candidates and identity are collected from server-owned sources.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const mode = resolveMode();
      const schedulerPreferences = await preferences(actorId);
      const collector = dependencies.collectorForActor
        ? dependencies.collectorForActor(actorId, mode)
        : createConfiguredPreEventBriefCandidateCollector({
            actorId,
            delivery: {
              async getDeliveryProfile() {
                return {
                  // The durable delivery worker still rechecks the user's
                  // preference and active device. This profile marks the
                  // server-owned pre-event candidate as eligible; no client
                  // can inject a costlyMiss flag through the route body.
                  costlyMiss: true,
                  pushEnabled: schedulerPreferences.preEventBriefPushEnabled,
                };
              },
            },
            mode,
          });
      const scheduler = createAgentWorkflowScheduler({
        collector,
        delivery: deliveryForActor(actorId),
        runtime: runtimeForActor(actorId, mode),
        push: push(),
        preferences: schedulerPreferences,
      });
      const result = await scheduler.tick();
      return NextResponse.json({ data: result }, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: "AGENT_SCHEDULER_FAILED",
            message:
              error instanceof Error ? error.message : "Scheduler tick failed.",
          },
        },
        { status: 503 },
      );
    }
  };
}
