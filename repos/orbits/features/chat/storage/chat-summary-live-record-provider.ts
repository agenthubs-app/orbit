import {
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { LiveChatSummaryExtractionProvider } from "../live-summary-service";
import {
  createConfiguredStorageChatRecordStore,
  createStorageChatConversationMessageProvider,
} from "./chat-conversation-live-record-provider";

export interface StorageChatSummaryExtractionProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageChatSummaryExtractionProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

interface CachedConfiguredStorageChatSummaryExtractionProvider {
  key: string;
  provider: LiveChatSummaryExtractionProvider;
}

let cachedDefaultProvider:
  | CachedConfiguredStorageChatSummaryExtractionProvider
  | null = null;

export function createStorageChatSummaryExtractionProvider({
  source,
  sourceLabel = "Chat summary shared live storage",
  store,
  workspaceId,
}: StorageChatSummaryExtractionProviderOptions): LiveChatSummaryExtractionProvider {
  const chatProvider = createStorageChatConversationMessageProvider({
    source: source ?? `live-record-store:chat-summary-extraction:${workspaceId}`,
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

export function createConfiguredStorageChatSummaryExtractionProvider({
  env,
  sourceLabel = "Chat summary Postgres live storage",
}: ConfiguredStorageChatSummaryExtractionProviderOptions = {}): LiveChatSummaryExtractionProvider | null {
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

  const provider = createStorageChatSummaryExtractionProvider({
    source: `postgres-live-record-store:chat-summary-extraction:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProvider = { key, provider };

  return provider;
}
