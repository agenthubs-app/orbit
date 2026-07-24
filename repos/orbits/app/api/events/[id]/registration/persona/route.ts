import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import {
  generateEventPersona,
  readInterviewTranscript,
} from "../../../../../../features/events/registration/adaptive-interview-service";
import {
  loadEventForRegistration,
  localizedEventTitle,
} from "../../../../../../features/events/registration/event-loader";
import { bilingualSegment } from "../../../../../../features/orbit-ai/event-recommendation-artifact-service";

export const dynamic = "force-dynamic";

interface PersonaRouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/events/[id]/registration/persona
// body: { language?: "en"|"zh", transcript: [{field, prompt, answer}] }
// 基于完整问答生成面向本次活动的个人画像;至少要有一轮有效回答。
export async function POST(
  request: Request,
  context: PersonaRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const event = await loadEventForRegistration(id);

  if (!event) {
    return NextResponse.json(
      failure(new AppError("NOT_FOUND", "The event could not be found.")),
      { headers: runtimeBoundaryHeaders(mode), status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    language?: unknown;
    transcript?: unknown;
  };
  const transcript = readInterviewTranscript(body.transcript);

  if (transcript.length === 0) {
    return NextResponse.json(
      failure(
        new AppError(
          "VALIDATION_ERROR",
          "At least one answered interview turn is required to build a persona.",
        ),
      ),
      { headers: runtimeBoundaryHeaders(mode), status: 422 },
    );
  }

  const language = body.language === "en" ? ("en" as const) : ("zh" as const);
  const persona = await generateEventPersona({
    event: {
      ...event,
      title: localizedEventTitle(event, language),
      venue: bilingualSegment(event.venue, language),
    },
    language,
    transcript,
  });

  return NextResponse.json(success({ persona }), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
