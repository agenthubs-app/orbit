import { normalizeOrbitApiBaseUrl } from "../api/base-url";
import { buildWidgetSnapshot, type WidgetCards } from "./snapshot";

export type NativeWidgetSnapshotStore = {
  containerAvailable: () => Promise<boolean>;
  activateScope: (scopeHash: string) => Promise<void>;
  clearSnapshot: () => Promise<void>;
  writeSnapshot: (json: string) => Promise<void>;
};

type HashScope = (normalizedBaseUrl: string, actorId: string) => Promise<string>;

export function createWidgetSnapshotRuntime(input: { native: NativeWidgetSnapshotStore | null; hashScope: HashScope }) {
  let generation = 0;
  let active: { key: string; hash: string } | null = null;
  let pending: { key: string; promise: Promise<string | null> } | null = null;
  let nativeTail: Promise<void> = Promise.resolve();
  const onNativeQueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = nativeTail.then(operation);
    nativeTail = result.then(() => undefined, () => undefined);
    return result;
  };
  const keyFor = (baseUrl: string, actorId: string) => `${normalizeOrbitApiBaseUrl(baseUrl)}\u0000${actorId}`;

  async function clear(): Promise<boolean> {
    generation += 1;
    active = null;
    pending = null;
    if (!input.native) return false;
    try { await onNativeQueue(() => input.native!.clearSnapshot()); return true; }
    catch (error) { console.warn("WIDGET_SNAPSHOT_CLEAR_FAILED", error); return false; }
  }

  function activate(baseUrl: string, actorId: string): Promise<string | null> {
    if (!input.native || !actorId) return Promise.resolve(null);
    const key = keyFor(baseUrl, actorId);
    if (active?.key === key) return Promise.resolve(active.hash);
    if (pending?.key === key) return pending.promise;
    const ticket = ++generation;
    active = null;
    const promise = (async () => {
      try {
        await onNativeQueue(() => input.native!.clearSnapshot());
        if (ticket !== generation) return null;
        const hash = await input.hashScope(normalizeOrbitApiBaseUrl(baseUrl), actorId);
        if (ticket !== generation) return null;
        await onNativeQueue(() => ticket === generation ? input.native!.activateScope(hash) : Promise.resolve());
        if (ticket !== generation) return null;
        active = { key, hash };
        return hash;
      } catch (error) { console.warn("WIDGET_SCOPE_ACTIVATE_FAILED", error); return null; }
    })();
    pending = { key, promise };
    void promise.then(() => { if (pending?.promise === promise) pending = null; });
    return promise;
  }

  async function publish(source: { baseUrl: string; actorId: string; now: Date; timeZone: string;
    layoutRevision: number; sourceExpiresAt?: string; widgets: WidgetCards }): Promise<boolean> {
    if (!input.native || active?.key !== keyFor(source.baseUrl, source.actorId)) return false;
    const ticket = generation;
    try {
      const snapshot = buildWidgetSnapshot({ scopeHash: active.hash, now: source.now, timeZone: source.timeZone,
        layoutRevision: source.layoutRevision, widgets: source.widgets,
        ...(source.sourceExpiresAt ? { sourceExpiresAt: source.sourceExpiresAt } : {}) });
      if (ticket !== generation) return false;
      await onNativeQueue(() => ticket === generation ? input.native!.writeSnapshot(JSON.stringify(snapshot)) : Promise.resolve());
      return ticket === generation;
    } catch (error) { console.warn("WIDGET_SNAPSHOT_WRITE_FAILED", error); return false; }
  }

  return { activate, clear, publish, containerAvailable: async () => input.native?.containerAvailable() ?? false };
}
