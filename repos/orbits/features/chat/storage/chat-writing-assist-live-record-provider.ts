import {
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { LiveChatWritingAssistProvider } from "../live-assist-service";
import {
  createConfiguredStorageChatRecordStore,
  createStorageChatConversationMessageProvider,
} from "./chat-conversation-live-record-provider";

export interface StorageChatWritingAssistProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageChatWritingAssistProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageChatWritingAssistProvider {
  key: string;
  provider: LiveChatWritingAssistProvider;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageChatWritingAssistProvider
  | null = null;

export function createStorageChatWritingAssistProvider({
  source,
  sourceLabel = "Chat writing assist shared live storage",
  store,
  workspaceId,
}: StorageChatWritingAssistProviderOptions): LiveChatWritingAssistProvider {
  const chatProvider = createStorageChatConversationMessageProvider({
    source: source ?? `live-record-store:chat-writing-assist:${workspaceId}`,
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

export function createConfiguredStorageChatWritingAssistProvider({
  env,
  sourceLabel = "Chat writing assist Postgres live storage",
}: ConfiguredStorageChatWritingAssistProviderOptions = {}): LiveChatWritingAssistProvider | null {
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

  const provider = createStorageChatWritingAssistProvider({
    source: `postgres-live-record-store:chat-writing-assist:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
