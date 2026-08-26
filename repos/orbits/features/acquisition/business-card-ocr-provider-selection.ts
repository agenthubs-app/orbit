import type { BusinessCardCloudOcrProvider } from "./business-card-cloud-ocr";
import { createConfiguredDeepseekBusinessCardOcrProvider } from "./deepseek-business-card-ocr-provider";
import { createConfiguredGeminiBusinessCardOcrProvider } from "./gemini-business-card-ocr-provider";

export interface ConfiguredBusinessCardOcrProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImplementation?: typeof fetch;
}

/** DeepSeek first (workspace default), Gemini kept as a compatible fallback. */
export function createConfiguredBusinessCardCloudOcrProvider(
  options: ConfiguredBusinessCardOcrProviderOptions = {},
): BusinessCardCloudOcrProvider | null {
  return (
    createConfiguredDeepseekBusinessCardOcrProvider(options) ??
    createConfiguredGeminiBusinessCardOcrProvider(options)
  );
}
