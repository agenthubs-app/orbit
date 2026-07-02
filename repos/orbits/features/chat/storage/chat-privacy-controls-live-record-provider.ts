import {
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { LiveChatPrivacyControlsProvider } from "../live-privacy-service";
import {
  createConfiguredStorageChatRecordStore,
  createStorageChatConversationMessageProvider,
} from "./chat-conversation-live-record-provider";

export interface StorageChatPrivacyControlsProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageChatPrivacyControlsProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageChatPrivacyControlsProvider {
  key: string;
  provider: LiveChatPrivacyControlsProvider;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageChatPrivacyControlsProvider
  | null = null;

export function createStorageChatPrivacyControlsProvider({
  source,
  sourceLabel = "Chat privacy controls shared live storage",
  store,
  workspaceId,
}: StorageChatPrivacyControlsProviderOptions): LiveChatPrivacyControlsProvider {
  const chatProvider = createStorageChatConversationMessageProvider({
    source: source ?? `live-record-store:chat-privacy-controls:${workspaceId}`,
    sourceLabel,
    store,
    workspaceId,
  });

  return {
    source: chatProvider.source,
    sourceLabel: chatProvider.sourceLabel,
    readChatGraph: chatProvider.readChatGraph,
  };
}

export function createConfiguredStorageChatPrivacyControlsProvider({
  env,
  sourceLabel = "Chat privacy controls Postgres live storage",
}: ConfiguredStorageChatPrivacyControlsProviderOptions = {}): LiveChatPrivacyControlsProvider | null {
  const configuredStore = createConfiguredStorageChatRecordStore({ env });

  if (!configuredStore) {
    return null;
  }

  const key = [
    configuredStore.connectionString,
    configuredStore.workspaceId,
    sourceLabel,
  ].join("\u0000");

  if (cachedDefaultProvider?.key === key) {
    return cachedDefaultProvider.provider;
  }

  const provider = createStorageChatPrivacyControlsProvider({
    source: `postgres-live-record-store:chat-privacy-controls:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
