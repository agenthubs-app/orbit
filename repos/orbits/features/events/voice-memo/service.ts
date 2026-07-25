export const MAX_VOICE_MEMO_DURATION_MS = 15_000;
export const MAX_VOICE_MEMO_BYTES = 1_500_000;

export interface VoiceMemoTranscriptionInput {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  locale?: "zh" | "en";
}

export interface VoiceMemoTranscriptionResult {
  transcript: string;
  durationMs: number;
  rawAudioPersisted: false;
  evidenceCreated: false;
  requiresTextConfirmation: true;
  fallback: "typed_note";
}

export interface VoiceMemoAsrProvider {
  transcribe: (input: VoiceMemoTranscriptionInput) => Promise<string>;
}

export function createVoiceMemoTranscriptionService(input: {
  provider: VoiceMemoAsrProvider | null;
}): {
  transcribe: (
    request: VoiceMemoTranscriptionInput,
  ) => Promise<VoiceMemoTranscriptionResult>;
} {
  return {
    async transcribe(request) {
      if (
        !Number.isFinite(request.durationMs) ||
        request.durationMs <= 0 ||
        request.durationMs > MAX_VOICE_MEMO_DURATION_MS
      ) {
        throw new Error("Voice memo duration must be between 1 and 15 seconds.");
      }
      const byteLength = Math.ceil((request.audioBase64.length * 3) / 4);
      if (
        !request.audioBase64 ||
        byteLength <= 0 ||
        byteLength > MAX_VOICE_MEMO_BYTES
      ) {
        throw new Error("Voice memo audio is empty or too large.");
      }
      if (!/^audio\/(webm|mp4|mpeg|wav|ogg)/.test(request.mimeType)) {
        throw new Error("Unsupported voice memo audio type.");
      }
      if (!input.provider) {
        throw new Error(
          "Speech transcription is unavailable. Continue with a typed note.",
        );
      }
      const transcript = (
        await input.provider.transcribe({
          ...request,
          audioBase64: request.audioBase64,
        })
      ).trim();
      if (!transcript) {
        throw new Error(
          "Speech transcription returned no text. Continue with a typed note.",
        );
      }
      return {
        transcript,
        durationMs: request.durationMs,
        rawAudioPersisted: false,
        evidenceCreated: false,
        requiresTextConfirmation: true,
        fallback: "typed_note",
      };
    },
  };
}

export function createConfiguredVoiceMemoAsrProvider(
  env: NodeJS.ProcessEnv = process.env,
): VoiceMemoAsrProvider | null {
  const endpoint = env.ORBIT_ASR_ENDPOINT?.trim();
  const apiKey = env.ORBIT_ASR_API_KEY?.trim();
  if (!endpoint || !apiKey) return null;

  return {
    async transcribe(input) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audioBase64: input.audioBase64,
          mimeType: input.mimeType,
          durationMs: input.durationMs,
          locale: input.locale ?? "zh",
          store: false,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        text?: unknown;
        transcript?: unknown;
      };
      const transcript =
        typeof body.transcript === "string"
          ? body.transcript
          : typeof body.text === "string"
            ? body.text
            : "";
      if (!response.ok || !transcript.trim()) {
        throw new Error(`ASR provider returned HTTP ${response.status}.`);
      }
      return transcript;
    },
  };
}
