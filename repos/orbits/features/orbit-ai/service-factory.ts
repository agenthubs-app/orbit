import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveOrbitAgentConversationService } from "./live-conversation-service";
import { createMockOrbitAgentArtifactTaskService } from "./mock-artifact-task-service";
import { createMockOrbitAgentConversationService } from "./mock-conversation-service";
import { createMockOrbitAiCommandService } from "./mock-service";
import type {
  OrbitAgentArtifactTaskService,
  OrbitAgentConversationService,
  OrbitAiCommandService,
} from "./service";

// Orbit AI 被拆成三个 capability：
// 1. command：旧的首页/命令中心 mock 能力；
// 2. conversation：真实 chat agent 或 mock conversation；
// 3. artifact-task：chat agent 计划出的可复核结果面板。
// 调用方通过 create/resolve 函数拿服务，不直接依赖具体实现。
export const orbitAiCommandServiceFactory =
  createModuleServiceFactory<OrbitAiCommandService>({
    capabilityId: "orbit-ai-command",
    implementations: {
      mock: () => createMockOrbitAiCommandService(),
    },
  });

export const orbitAgentConversationServiceFactory =
  createModuleServiceFactory<OrbitAgentConversationService>({
    capabilityId: "orbit-agent-conversation",
    implementations: {
      // live 会进入模型 provider + 本地边界 + artifact 编排链路。
      live: () => createLiveOrbitAgentConversationService(),
      // mock 提供稳定 fixture，供页面开发、测试和无 key 环境使用。
      mock: () => createMockOrbitAgentConversationService(),
    },
  });

export const orbitAgentArtifactTaskServiceFactory =
  createModuleServiceFactory<OrbitAgentArtifactTaskService>({
    capabilityId: "orbit-agent-artifact-task",
    implementations: {
      mock: () => createMockOrbitAgentArtifactTaskService(),
    },
  });

export function resolveOrbitAiCommandService(mode?: ModuleMode | string) {
  return orbitAiCommandServiceFactory.create(mode);
}

export function resolveOrbitAgentConversationService(
  mode?: ModuleMode | string,
) {
  // Chat Agent conversation 有自己的开关，避免全局 ORBIT_MODULE_MODE
  // 意外把其它还没实现 live 的 capability 一起切过去。
  return orbitAgentConversationServiceFactory.create(
    mode ?? process.env.ORBIT_AGENT_CONVERSATION_MODE,
  );
}

export function resolveOrbitAgentArtifactTaskService(
  mode?: ModuleMode | string,
) {
  return orbitAgentArtifactTaskServiceFactory.create(mode);
}

export function createOrbitAiCommandService(
  mode?: ModuleMode | string,
): OrbitAiCommandService {
  const resolution = resolveOrbitAiCommandService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createOrbitAgentArtifactTaskService(
  mode?: ModuleMode | string,
): OrbitAgentArtifactTaskService {
  const resolution = resolveOrbitAgentArtifactTaskService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createOrbitAgentConversationService(
  mode?: ModuleMode | string,
): OrbitAgentConversationService {
  const resolution = resolveOrbitAgentConversationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
