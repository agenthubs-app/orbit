import type { FeatureMode } from "../../../shared/config/feature-mode";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import {
  createConfiguredStorageOrbitAgentChatSessionProvider,
  createStorageOrbitAgentChatSessionProvider,
  type OrbitAgentChatSessionProvider,
} from "./orbit-agent-chat-session-live-record-provider";

interface OrbitAgentChatSessionRuntimeGlobal {
  __orbitMockAgentChatSessionProvider?: OrbitAgentChatSessionProvider;
}

const runtimeGlobal = globalThis as typeof globalThis &
  OrbitAgentChatSessionRuntimeGlobal;

function mockSessionProvider(): OrbitAgentChatSessionProvider {
  if (!runtimeGlobal.__orbitMockAgentChatSessionProvider) {
    runtimeGlobal.__orbitMockAgentChatSessionProvider =
      createStorageOrbitAgentChatSessionProvider({
        source: "memory:orbit-agent-chat-session:workspace:mock",
        sourceLabel: "Orbit Agent mock chat session storage",
        store: createMemoryLiveRecordStore<Record<string, unknown>>(),
        workspaceId: "workspace:mock",
      });
  }

  return runtimeGlobal.__orbitMockAgentChatSessionProvider;
}

export function createOrbitAgentChatSessionProvider(
  mode: FeatureMode,
): OrbitAgentChatSessionProvider | null {
  if (mode === "mock" || mode === "hybrid") {
    return mockSessionProvider();
  }

  return createConfiguredStorageOrbitAgentChatSessionProvider();
}
