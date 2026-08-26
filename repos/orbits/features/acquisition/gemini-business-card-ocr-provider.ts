import {
  BUSINESS_CARD_IMAGE_MIME_TYPES,
  type BusinessCardCloudOcrProvider,
  type BusinessCardImageMimeType,
  type BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";
import {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  parseBusinessCardStructuredExtraction,
} from "./business-card-ocr-validation";

export {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  type BusinessCardCloudOcrProviderErrorCode,
} from "./business-card-ocr-validation";

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 20_000;

export const BUSINESS_CARD_EXTRACTION_PROMPT = [
  "Extract only text visibly printed on this business card.",
  "The photographed card may be rotated; interpret it in its natural reading orientation.",
  "Preserve native-script and romanized names separately when both are printed.",
  "Preserve organization, department, title, office labels, and address wording.",
  "Label every phone, mobile, fax, email, and address with its printed office label when visible.",
  "Never infer or invent missing values. Return null or an empty array when absent.",
].join(" ");

type BusinessCardOcrEnv = Record<string, string | undefined>;

export interface ConfiguredGeminiBusinessCardOcrProviderOptions {
  env?: BusinessCardOcrEnv;
  fetchImplementation?: typeof fetch;
  nowMs?: () => number;
  timeoutMs?: number;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.steps)) {
    return null;
  }

  const text = payload.steps
    .flatMap((step) =>
      isRecord(step) && Array.isArray(step.content) ? step.content : [],
    )
    .map((content) =>
      isRecord(content) && typeof content.text === "string" ? content.text : "",
    )
    .filter(Boolean)
    .join("\n");

  return text || null;
}

function usageFor(payload: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  return {
    inputTokens:
      typeof payload.usage.total_input_tokens === "number"
        ? payload.usage.total_input_tokens
        : 0,
    outputTokens:
      typeof payload.usage.total_output_tokens === "number"
        ? payload.usage.total_output_tokens
        : 0,
  };
}

function parseProviderPayload(payload: unknown): {
  extraction: BusinessCardStructuredExtraction;
  inputTokens: number;
  outputTokens: number;
} {
  const text = responseText(payload);

  if (!text) {
    throw new BusinessCardCloudOcrProviderError(
      "INVALID_STRUCTURED_OUTPUT",
      "The OCR provider returned an invalid structured business-card result.",
    );
  }

  try {
    const usage = usageFor(payload);

    return {
      extraction: parseBusinessCardStructuredExtraction(JSON.parse(text) as unknown),
      ...usage,
    };
  } catch (error) {
    if (error instanceof BusinessCardCloudOcrProviderError) {
      throw error;
    }

    throw new BusinessCardCloudOcrProviderError(
      "INVALID_STRUCTURED_OUTPUT",
      "The OCR provider returned an invalid structured business-card result.",
    );
  }
}

function isBusinessCardMimeType(value: string): value is BusinessCardImageMimeType {
  return BUSINESS_CARD_IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function createConfiguredGeminiBusinessCardOcrProvider({
  env = process.env,
  fetchImplementation = fetch,
  nowMs = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ConfiguredGeminiBusinessCardOcrProviderOptions = {}): BusinessCardCloudOcrProvider | null {
  const apiKey =
    readString(env.GEMINI_API_KEY) ?? readString(env.GOOGLE_API_KEY);

  if (!apiKey) {
    return null;
  }

  const model = readString(env.ORBIT_BUSINESS_CARD_OCR_MODEL) ?? DEFAULT_MODEL;

  return {
    model,
    providerName: "google-gemini-interactions",
    async extract(input) {
      if (!isBusinessCardMimeType(input.mimeType)) {
        throw new BusinessCardCloudOcrProviderError(
          "INVALID_STRUCTURED_OUTPUT",
          "The OCR provider received an unsupported business-card image type.",
        );
      }

      const startedAt = nowMs();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImplementation(GEMINI_INTERACTIONS_ENDPOINT, {
          body: JSON.stringify({
            generation_config: {
              thinking_level: "minimal",
            },
            input: [
              {
                text: BUSINESS_CARD_EXTRACTION_PROMPT,
                type: "text",
              },
              {
                data: input.imageBase64,
                mime_type: input.mimeType,
                resolution: "high",
                type: "image",
              },
            ],
            model,
            response_format: {
              mime_type: "application/json",
              schema: BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
              type: "text",
            },
          }),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new BusinessCardCloudOcrProviderError(
            "PROVIDER_REQUEST_FAILED",
            `The business-card OCR provider request failed with status ${response.status}.`,
          );
        }

        const parsed = parseProviderPayload(await response.json());

        return {
          extraction: parsed.extraction,
          usage: {
            inputTokens: parsed.inputTokens,
            latencyMs: Math.max(0, nowMs() - startedAt),
            outputTokens: parsed.outputTokens,
          },
        };
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
    },
  };
}
