import type { LocalSyncCursor } from "./local-sync-repository";

export const SYNC_FRESHNESS_TTL_MS = 300_000;
export const SYNC_FOREGROUND_THRESHOLD_MS = 60_000;

export type SyncRefreshReason =
  | "mount"
  | "explicit"
  | "foreground"
  | "invalidated";

export interface SyncAppStateSource {
  readonly currentState: string | null;
  addEventListener(
    event: "change",
    listener: (state: string) => void,
  ): { remove(): void };
}

export function subscribeToSyncAppState(input: {
  appState: SyncAppStateSource;
  now: () => number;
  onForeground: (backgroundDurationMs: number) => void;
}): () => void {
  let backgroundAt =
    input.appState.currentState === "active" ? null : input.now();
  const listener = input.appState.addEventListener("change", (state) => {
    if (state === "active") {
      const startedAt = backgroundAt;
      backgroundAt = null;
      if (startedAt !== null) {
        input.onForeground(Math.max(0, input.now() - startedAt));
      }
      return;
    }
    backgroundAt ??= input.now();
  });
  return () => listener.remove();
}

export function shouldSynchronize(input: {
  backgroundDurationMs?: number;
  cursor: LocalSyncCursor | null;
  now: number;
  reason?: SyncRefreshReason;
}): boolean {
  if (!input.cursor || input.cursor.bootstrapState !== "complete") {
    return true;
  }
  if (input.reason === "explicit" || input.reason === "invalidated") {
    return true;
  }
  if (
    input.reason === "foreground" &&
    (input.backgroundDurationMs ?? 0) >= SYNC_FOREGROUND_THRESHOLD_MS
  ) {
    return true;
  }
  const lastSyncedAt = Date.parse(input.cursor.lastSyncedAt);
  if (!Number.isFinite(lastSyncedAt) || lastSyncedAt > input.now) {
    return true;
  }
  return input.now - lastSyncedAt >= SYNC_FRESHNESS_TTL_MS;
}
