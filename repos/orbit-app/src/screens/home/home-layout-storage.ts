import AsyncStorage from "@react-native-async-storage/async-storage";

import { homeLayoutSchema, homeLayoutUpdateInputSchema } from "../../api/schema/home-layout";
import type { HomeLayoutContract, HomeWidgetSlot } from "../../api/contract/home-layout";
import { normalizeOrbitApiBaseUrl } from "../../api/base-url";

export interface HomeLayoutDraft {
  baseRevision: number;
  app: readonly HomeWidgetSlot[];
  mutationId: string;
  savedAt: string;
  hintDismissedAt?: string;
}
export interface StoredHomeLayout {
  snapshot: HomeLayoutContract | null;
  fetchedAt: string | null;
  draft: HomeLayoutDraft | null;
}

interface Adapter { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
const empty = (): StoredHomeLayout => ({ snapshot: null, fetchedAt: null, draft: null });

export function homeLayoutStorageKey(actorId: string, baseUrl: string): string | null {
  if (!actorId.trim() || !baseUrl.trim()) return null;
  return `orbit:home-layout:v1:${encodeURIComponent(normalizeOrbitApiBaseUrl(baseUrl))}:${encodeURIComponent(actorId)}`;
}

export function createHomeLayoutStorage(adapter: Adapter = AsyncStorage) {
  return {
    async read(actorId: string, baseUrl: string): Promise<StoredHomeLayout> {
      const key = homeLayoutStorageKey(actorId, baseUrl);
      if (!key) return empty();
      try {
        const raw = await adapter.getItem(key);
        if (!raw) return empty();
        const value = JSON.parse(raw) as Record<string, unknown>;
        const parsed = homeLayoutSchema.safeParse(value.snapshot);
        const draft = value.draft as Partial<HomeLayoutDraft> | null;
        const validDraft = draft && Number.isSafeInteger(draft.baseRevision) && typeof draft.mutationId === "string"
          && !!draft.mutationId && typeof draft.savedAt === "string" && Number.isFinite(Date.parse(draft.savedAt))
          && homeLayoutUpdateInputSchema.safeParse({ expectedRevision: draft.baseRevision, mutationId: draft.mutationId,
            app: draft.app, web: [], ...(draft.hintDismissedAt ? { hintDismissedAt: draft.hintDismissedAt } : {}) }).success;
        return { snapshot: parsed.success ? parsed.data : null, fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : null,
          draft: validDraft ? draft as HomeLayoutDraft : null };
      } catch { return empty(); }
    },
    async write(actorId: string, baseUrl: string, value: StoredHomeLayout): Promise<void> {
      const key = homeLayoutStorageKey(actorId, baseUrl);
      if (!key) throw new Error("Missing home layout storage scope");
      if (value.snapshot && !homeLayoutSchema.safeParse(value.snapshot).success) throw new Error("Invalid home layout snapshot");
      await adapter.setItem(key, JSON.stringify(value));
    },
  };
}

export const homeLayoutStorage = createHomeLayoutStorage();
