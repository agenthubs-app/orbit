import type { OrbitApiClient } from "./client";
import { readUnifiedInboxCount } from "./inbox-summary";
import { MESSAGE_STATE_FOREGROUND_REFRESH_MS, subscribeMessageStateInvalidation } from "./message-state";

/** Sprint 0118: `messages` is the server's message count of the same summary (undefined when the read failed). */
type Listener = (count: number | undefined, messages?: number) => void;
interface Entry {
  listeners: Set<Listener>;
  controller: AbortController | null;
  count: number | undefined;
  messages: number | undefined;
  hasResult: boolean;
  refresh: (force?: boolean) => void;
  dispose: () => void;
}
// Active foreground subscribers only. Scope is never logged or persisted.
const activeResources = new Map<string, Entry>();

export function subscribeInboxBadge(input: {
  scope: string; actorId: string; client: OrbitApiClient; listener: Listener; refresh?: boolean;
}): () => void {
  let entry = activeResources.get(input.scope);
  const joining = Boolean(entry);
  if (!entry) {
    let queued = false, failures = 0, nextAttemptAt = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const created: Entry = {
      listeners: new Set(), controller: null, count: undefined, messages: undefined, hasResult: false,
      refresh(force = false) {
        if (!created.listeners.size) return;
        if (created.controller) { if (force) queued = true; return; }
        if (!force && Date.now() < nextAttemptAt) return;
        const controller = new AbortController();
        created.controller = controller;
        const current = () => !controller.signal.aborted && activeResources.get(input.scope) === created;
        const publish = (count: number | undefined, messages?: number) => {
          if (!current() || queued) return;
          created.hasResult = true;
          created.count = count !== undefined && count > 0 ? Math.min(count, 99) : undefined;
          created.messages = count !== undefined ? messages : undefined;
          for (const listener of created.listeners) listener(created.count, created.messages);
        };
        deadline = setTimeout(() => {
          if (!current()) return;
          created.count = undefined; created.messages = undefined; created.hasResult = true;
          for (const listener of created.listeners) listener(undefined, undefined);
          controller.abort(); created.controller = null;
          failures = Math.min(failures + 1, 3);
          nextAttemptAt = Date.now() + MESSAGE_STATE_FOREGROUND_REFRESH_MS * 2 ** failures;
          queued = false;
        }, MESSAGE_STATE_FOREGROUND_REFRESH_MS);
        void (async () => {
          let healthy = false;
          try {
            const summary = await readUnifiedInboxCount({ client: input.client, actorId: input.actorId, signal: controller.signal });
            if (!current()) return;
            healthy = summary.count !== undefined;
            publish(summary.count, summary.messages);
          } catch { publish(undefined); }
          finally {
            if (current()) {
              clearTimeout(deadline);
              created.controller = null;
              failures = healthy ? 0 : Math.min(failures + 1, 3);
              nextAttemptAt = healthy ? 0 : Date.now() + MESSAGE_STATE_FOREGROUND_REFRESH_MS * 2 ** failures + Math.random() * 3000;
              if (queued) { queued = false; created.refresh(true); }
            }
          }
        })();
      },
      dispose() {},
    };
    const timer = setInterval(() => created.refresh(), MESSAGE_STATE_FOREGROUND_REFRESH_MS);
    const unsubscribe = subscribeMessageStateInvalidation(() => created.refresh(true));
    created.dispose = () => { created.controller?.abort(); clearTimeout(deadline); clearInterval(timer); unsubscribe(); };
    entry = created;
    activeResources.set(input.scope, entry);
  }
  entry.listeners.add(input.listener);
  if (input.refresh && joining) entry.refresh(true);
  else if (entry.hasResult) input.listener(entry.count, entry.messages);
  else entry.refresh();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    entry.listeners.delete(input.listener);
    if (!entry.listeners.size) {
      entry.dispose();
      if (activeResources.get(input.scope) === entry) activeResources.delete(input.scope);
    }
  };
}
