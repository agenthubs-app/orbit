import type { FeatureMode } from "../../../shared/config/feature-mode";
import {
  createMemoryLiveRecordStore,
  type LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  createConfiguredStorageOrbitAgentChatSessionProvider,
  createStorageOrbitAgentChatSessionProvider,
  type OrbitAgentChatSessionProvider,
} from "./orbit-agent-chat-session-live-record-provider";

interface OrbitAgentChatSessionRuntimeGlobal {
  __orbitMockAgentChatSessionProviders?: Map<
    string,
    OrbitAgentChatSessionProvider
  >;
  __orbitMockAgentChatSessionStore?: LiveRecordStoreLike<
    Record<string, unknown>
  >;
}

const runtimeGlobal = globalThis as typeof globalThis &
  OrbitAgentChatSessionRuntimeGlobal;

function mockSessionProvider(actorId: string): OrbitAgentChatSessionProvider {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Orbit Agent chat sessions require an authenticated actor");
  }

  runtimeGlobal.__orbitMockAgentChatSessionStore ??=
    createMemoryLiveRecordStore<Record<string, unknown>>();
  runtimeGlobal.__orbitMockAgentChatSessionProviders ??= new Map();

  const cachedProvider =
    runtimeGlobal.__orbitMockAgentChatSessionProviders.get(normalizedActorId);
  if (cachedProvider) {
    return cachedProvider;
  }

  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: normalizedActorId,
    source: "memory:orbit-agent-chat-session:workspace:mock",
    sourceLabel: "Orbit Agent mock chat session storage",
    store: runtimeGlobal.__orbitMockAgentChatSessionStore,
    workspaceId: "workspace:mock",
  });
  runtimeGlobal.__orbitMockAgentChatSessionProviders.set(
    normalizedActorId,
    provider,
  );

  return provider;
}

export function createOrbitAgentChatSessionProvider(
  mode: FeatureMode,
  actorId: string,
): OrbitAgentChatSessionProvider | null {
  if (mode === "mock" || mode === "hybrid") {
    return mockSessionProvider(actorId);
  }

  return createConfiguredStorageOrbitAgentChatSessionProvider({ actorId });
}
