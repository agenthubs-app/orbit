import {
  BUSINESS_CARD_IMAGE_MIME_TYPES,
  type BusinessCardCloudOcrProvider,
  type BusinessCardImageMimeType,
} from "./business-card-cloud-ocr";
import {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  parseBusinessCardStructuredExtraction,
} from "./business-card-ocr-validation";

const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT =
  "https://api.deepseek.com/chat/completions";
export const DEFAULT_BUSINESS_CARD_VISION_MODEL = "deepseek-v4-flash-vision-exp";
export const DEFAULT_BUSINESS_CARD_TEXT_MODEL = "deepseek-v4-flash";
// Measured 2026-08-26: the vision stage takes ~25s on a real card photo even
// with thinking disabled; 20s (the Gemini default) times out reliably.
const DEFAULT_TIMEOUT_MS = 60_000;

/** Both stages run with reasoning disabled; latency, not depth, is the constraint. */
const THINKING_DISABLED = { type: "disabled" } as const;

export const BUSINESS_CARD_TRANSCRIPTION_PROMPT = [
  "Transcribe every piece of text visibly printed on this business card.",
  "The photographed card may be rotated; read it in its natural orientation.",
  "Preserve the original wording, line breaks, and office or contact labels.",
  "Keep native-script and romanized spellings separately when both are printed.",
  "If more than one business card appears in the photo, transcribe each card as a separate block.",
  "When a character, digit, or word is too small or blurry to read with confidence, omit it entirely instead of guessing.",
  "Do not translate, summarize, or invent text that is not on the card.",
].join(" ");

export function businessCardStructuringPrompt(): string {
  return [
    "You convert a raw business-card transcription into structured JSON.",
    "Use only text present in the transcription. Never infer or invent missing values.",
    "Keep native-script and romanized names separate when both are transcribed.",
    "Keep printed office labels on phones, faxes, emails, and addresses.",
    "If the transcription contains multiple business cards, structure only the single card with the most complete details, and never merge values from different cards.",
    "Return null or an empty array for absent fields; never fabricate a value the transcription does not contain.",
    "Respond with a single JSON object matching this JSON schema exactly:",
    JSON.stringify(BUSINESS_CARD_EXTRACTION_JSON_SCHEMA),
  ].join(" ");
}

type BusinessCardOcrEnv = Record<string, string | undefined>;

export interface ConfiguredDeepseekBusinessCardOcrProviderOptions {
  env?: BusinessCardOcrEnv;
  fetchImplementation?: typeof fetch;
  nowMs?: () => number;
  timeoutMs?: number;
}

function readString(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chatCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const first: unknown = payload.choices[0];

  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }

  return typeof first.message.content === "string" ? first.message.content : null;
}

function chatCompletionUsage(payload: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { inputTokens: 0, outputTokens: 0 };
  }

  return {
    inputTokens:
      typeof payload.usage.prompt_tokens === "number"
        ? payload.usage.prompt_tokens
        : 0,
    outputTokens:
      typeof payload.usage.completion_tokens === "number"
        ? payload.usage.completion_tokens
        : 0,
  };
}

function isBusinessCardMimeType(value: string): value is BusinessCardImageMimeType {
  return BUSINESS_CARD_IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
}

async function postChatCompletion(input: {
  apiKey: string;
  body: Record<string, unknown>;
  fetchImplementation: typeof fetch;
  timeoutMs: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImplementation(
      DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT,
      {
        body: JSON.stringify(input.body),
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new BusinessCardCloudOcrProviderError(
        "PROVIDER_REQUEST_FAILED",
        `The business-card OCR provider request failed with status ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    const content = chatCompletionContent(payload);

    if (!content?.trim()) {
      throw new BusinessCardCloudOcrProviderError(
        "INVALID_STRUCTURED_OUTPUT",
        "The OCR provider returned an invalid structured business-card result.",
      );
    }

    return { content, ...chatCompletionUsage(payload) };
  } catch (error) {
    if (error instanceof BusinessCardCloudOcrProviderError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new BusinessCardCloudOcrProviderError(
        "PROVIDER_TIMEOUT",
        "The business-card OCR provider request timed out.",
      );
    }

    throw new BusinessCardCloudOcrProviderError(
      "PROVIDER_REQUEST_FAILED",
      "The business-card OCR provider request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createConfiguredDeepseekBusinessCardOcrProvider({
  env = process.env,
  fetchImplementation = fetch,
  nowMs = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ConfiguredDeepseekBusinessCardOcrProviderOptions = {}): BusinessCardCloudOcrProvider | null {
  const apiKey = readString(env.DEEPSEEK_API_KEY);

  if (!apiKey) {
    return null;
  }

  const visionModel =
    readString(env.ORBIT_BUSINESS_CARD_OCR_VISION_MODEL) ??
    DEFAULT_BUSINESS_CARD_VISION_MODEL;
  const textModel =
    readString(env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL) ??
    DEFAULT_BUSINESS_CARD_TEXT_MODEL;

  return {
    model: `${visionModel}+${textModel}`,
    providerName: "deepseek-chat-completions",
    async extract(input) {
      if (!isBusinessCardMimeType(input.mimeType)) {
        throw new BusinessCardCloudOcrProviderError(
          "INVALID_STRUCTURED_OUTPUT",
          "The OCR provider received an unsupported business-card image type.",
        );
      }

      const startedAt = nowMs();
      const transcription = await postChatCompletion({
        apiKey,
        body: {
          messages: [
            {
              content: [
                { text: BUSINESS_CARD_TRANSCRIPTION_PROMPT, type: "text" },
                {
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBase64}`,
                  },
                  type: "image_url",
                },
              ],
              role: "user",
            },
          ],
          model: visionModel,
          thinking: THINKING_DISABLED,
        },
        fetchImplementation,
        timeoutMs,
      });

      const structured = await postChatCompletion({
        apiKey,
        body: {
          messages: [
            { content: businessCardStructuringPrompt(), role: "system" },
            { content: transcription.content, role: "user" },
          ],
          model: textModel,
          response_format: { type: "json_object" },
          thinking: THINKING_DISABLED,
        },
        fetchImplementation,
        timeoutMs,
      });

      let parsed: unknown;

      try {
        parsed = JSON.parse(structured.content);
      } catch {
        throw new BusinessCardCloudOcrProviderError(
          "INVALID_STRUCTURED_OUTPUT",
          "The OCR provider returned an invalid structured business-card result.",
        );
      }

      return {
        extraction: parseBusinessCardStructuredExtraction(parsed),
        usage: {
          inputTokens: transcription.inputTokens + structured.inputTokens,
          latencyMs: Math.max(0, nowMs() - startedAt),
          outputTokens: transcription.outputTokens + structured.outputTokens,
        },
      };
    },
  };
}
