import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import {
  createAgentPreferencesService,
  type AgentPreferencesService,
} from "../../../../features/agent/preferences";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authenticatedActorId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id?.trim() || null;
}

function unauthorized(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in is required for Agent preferences.",
      },
    },
    { status: 401 },
  );
}

export interface AgentPreferencesRouteDependencies {
  resolveActorId?: () => Promise<string | null>;
  serviceForActor?: (actorId: string) => AgentPreferencesService;
}

export function createAgentPreferencesRouteHandlers(
  dependencies: AgentPreferencesRouteDependencies = {},
): {
  GET: () => Promise<Response>;
  PUT: (request: Request) => Promise<Response>;
} {
  const resolveActorId =
    dependencies.resolveActorId ?? authenticatedActorId;
  const serviceForActor =
    dependencies.serviceForActor ??
    ((actorId) => createAgentPreferencesService({ actorId }));
  return {
    async GET() {
      const actorId = await resolveActorId();
      if (!actorId) return unauthorized();
      return NextResponse.json({
        data: await serviceForActor(actorId).get(),
      });
    },
    async PUT(request) {
      const actorId = await resolveActorId();
      if (!actorId) return unauthorized();
      const body = (await request.json().catch(() => ({}))) as unknown;
      if (!isRecord(body)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "JSON body required.",
            },
          },
          { status: 400 },
        );
      }
      try {
        const quietHours = isRecord(body.quietHours)
          ? {
              start:
                typeof body.quietHours.start === "string"
                  ? body.quietHours.start
                  : "",
              end:
                typeof body.quietHours.end === "string"
                  ? body.quietHours.end
                  : "",
            }
          : undefined;
        const preferences = await serviceForActor(actorId).update({
          autoPrepareMeetingNotes:
            typeof body.autoPrepareMeetingNotes === "boolean"
              ? body.autoPrepareMeetingNotes
              : undefined,
          externalCalendarWritesEnabled:
            typeof body.externalCalendarWritesEnabled === "boolean"
              ? body.externalCalendarWritesEnabled
              : undefined,
          postEventReminderPushEnabled:
            typeof body.postEventReminderPushEnabled === "boolean"
              ? body.postEventReminderPushEnabled
              : undefined,
          preEventBriefPushEnabled:
            typeof body.preEventBriefPushEnabled === "boolean"
              ? body.preEventBriefPushEnabled
              : undefined,
          quietHours,
          timeZone:
            typeof body.timeZone === "string"
              ? body.timeZone.trim()
              : undefined,
        });
        return NextResponse.json({ data: preferences });
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              code: "AGENT_PREFERENCES_INVALID",
              message:
                error instanceof Error
                  ? error.message
                  : "Preferences invalid.",
            },
          },
          { status: 400 },
        );
      }
    },
  };
}
