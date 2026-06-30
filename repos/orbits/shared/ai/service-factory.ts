// shared AI provider factory 管理旧 AI mock provider。
// 新 Orbit Agent live provider 不走这里，而是走 features/orbit-ai/gemini-provider.ts。
import { createModuleServiceFactory, type ModuleMode } from "../services/module-mode";
import { createMockAiProviderService } from "./mock-provider";
import type { AiProviderService } from "./provider";

export const aiProviderServiceFactory =
  createModuleServiceFactory<AiProviderService>({
    capabilityId: "ai-provider",
    implementations: {
      mock: () => createMockAiProviderService(),
    },
  });

export function resolveAiProviderService(mode?: ModuleMode | string) {
  return aiProviderServiceFactory.create(mode);
}

export function createAiProviderService(
  mode?: ModuleMode | string,
): AiProviderService {
  const resolution = resolveAiProviderService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
