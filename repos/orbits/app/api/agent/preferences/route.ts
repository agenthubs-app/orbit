import { NextResponse } from "next/server";

import { createAgentPreferencesService } from "../../../../features/agent/preferences";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    data: await createAgentPreferencesService().get(),
  });
}

export async function PUT(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as unknown;
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "JSON body required." } },
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
    const preferences = await createAgentPreferencesService().update({
      autoPrepareMeetingNotes:
        typeof body.autoPrepareMeetingNotes === "boolean"
          ? body.autoPrepareMeetingNotes
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
        typeof body.timeZone === "string" ? body.timeZone.trim() : undefined,
    });
    return NextResponse.json({ data: preferences });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_PREFERENCES_INVALID",
          message:
            error instanceof Error ? error.message : "Preferences invalid.",
        },
      },
      { status: 400 },
    );
  }
}
