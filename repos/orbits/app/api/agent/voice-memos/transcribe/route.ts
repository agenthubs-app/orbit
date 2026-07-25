import { NextResponse } from "next/server";
import {
  createConfiguredVoiceMemoAsrProvider,
  createVoiceMemoTranscriptionService,
} from "../../../../../features/events/voice-memo/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    audioBase64?: unknown;
    durationMs?: unknown;
    locale?: unknown;
    mimeType?: unknown;
  };
  try {
    const result = await createVoiceMemoTranscriptionService({
      provider: createConfiguredVoiceMemoAsrProvider(),
    }).transcribe({
      audioBase64:
        typeof body.audioBase64 === "string" ? body.audioBase64 : "",
      durationMs:
        typeof body.durationMs === "number" ? body.durationMs : Number.NaN,
      locale: body.locale === "en" ? "en" : "zh",
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
    });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "VOICE_MEMO_TRANSCRIPTION_FAILED",
          message: error instanceof Error ? error.message : "ASR failed.",
          fallback: "typed_note",
        },
      },
      { status: 422 },
    );
  }
}
