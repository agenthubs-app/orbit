import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../../shared/errors/app-error";
import {
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
} from "../../../../../../features/events/registration/adaptive-interview-service";
import {
  loadEventForRegistration,
  localizedEventTitle,
} from "../../../../../../features/events/registration/event-loader";
import { bilingualSegment } from "../../../../../../features/orbit-ai/event-recommendation-artifact-service";

export const dynamic = "force-dynamic";

interface InterviewRouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/events/[id]/registration/interview
// body: { language?: "en"|"zh", transcript: [{field, prompt, answer}] }
// 返回 { done, question }——由模型基于活动语境和已有回答生成下一题。
export async function POST(
  request: Request,
  context: InterviewRouteContext,
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

  if (!["confirmed", "imported"].includes(event.status)) {
    return NextResponse.json(
      failure(
        new AppError("CONFLICT", "This event is not open for registration."),
      ),
      { headers: runtimeBoundaryHeaders(mode), status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    language?: unknown;
    transcript?: unknown;
  };
  const language = body.language === "en" ? ("en" as const) : ("zh" as const);
  // live 活动的 title/venue 是「日/中/英」拼接串;进模型前挑出当前语言段,
  // 生成的题目措辞才不会夹带三语标题。
  const step = await nextAdaptiveInterviewQuestion({
    event: {
      ...event,
      title: localizedEventTitle(event, language),
      venue: bilingualSegment(event.venue, language),
    },
    language,
    transcript: readInterviewTranscript(body.transcript),
  });

  return NextResponse.json(success(step), {
    headers: runtimeBoundaryHeaders(mode),
    status: 200,
  });
}
