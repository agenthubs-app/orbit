import AsyncStorage from "@react-native-async-storage/async-storage";

import type { NoteMentionContract } from "../api/contract/notes";

export interface NoteDraft {
  title: string;
  body: string;
  manualContactIds: readonly string[];
  mentions: readonly NoteMentionContract[];
  eventIds: readonly string[];
  savedAt: string;
}

export interface NoteDraftAdapter {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

function key(scope: { accountId: string; server: string; noteId?: string }): string {
  return `orbit:note-draft:v2:${encodeURIComponent(scope.server)}:${encodeURIComponent(scope.accountId)}:${encodeURIComponent(scope.noteId ?? "new")}`;
}

function isDraft(value: unknown): value is NoteDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && typeof item.body === "string"
    && Array.isArray(item.manualContactIds) && item.manualContactIds.every((id) => typeof id === "string" && id.length > 0)
    && Array.isArray(item.mentions) && item.mentions.every((mention) => {
      if (typeof mention !== "object" || mention === null || Array.isArray(mention)) return false;
      const part = mention as Record<string, unknown>;
      return typeof part.contactId === "string" && part.contactId.length > 0
        && Number.isSafeInteger(part.start) && Number(part.start) >= 0
        && Number.isSafeInteger(part.end) && Number(part.end) > Number(part.start)
        && typeof part.displayText === "string" && part.displayText.length > 0
        && Number(part.end) <= String(item.body).length
        && String(item.body).slice(Number(part.start), Number(part.end)) === part.displayText;
    }) && Array.isArray(item.eventIds)
    && item.eventIds.every((id) => typeof id === "string" && id.length > 0)
    && typeof item.savedAt === "string" && Number.isFinite(Date.parse(item.savedAt));
}

export function createNoteDraftStorage(adapter: NoteDraftAdapter = {
  getItem: (draftKey) => AsyncStorage.getItem(draftKey),
  removeItem: (draftKey) => AsyncStorage.removeItem(draftKey),
  setItem: (draftKey, value) => AsyncStorage.setItem(draftKey, value),
}) {
  const writes = new Map<string, Promise<void>>();
  const enqueue = (draftKey: string, operation: () => Promise<void>): Promise<void> => {
    const next = (writes.get(draftKey) ?? Promise.resolve()).catch(() => {}).then(operation);
    writes.set(draftKey, next);
    void next.finally(() => { if (writes.get(draftKey) === next) writes.delete(draftKey); }).catch(() => {});
    return next;
  };
  return {
    async load(scope: { accountId: string; server: string; noteId?: string }): Promise<NoteDraft | null> {
      const raw = await adapter.getItem(key(scope));
      if (!raw) return null;
      try { const parsed: unknown = JSON.parse(raw); return isDraft(parsed) ? parsed : null; }
      catch { return null; }
    },
    async save(scope: { accountId: string; server: string; noteId?: string }, draft: NoteDraft): Promise<void> {
      if (!isDraft(draft)) throw new Error("Note draft is invalid");
      const serialized = JSON.stringify(draft);
      await enqueue(key(scope), () => adapter.setItem(key(scope), serialized));
    },
    async clear(scope: { accountId: string; server: string; noteId?: string }): Promise<void> {
      await enqueue(key(scope), () => adapter.removeItem(key(scope)));
    },
  };
}

export const noteDraftStorage = createNoteDraftStorage();
