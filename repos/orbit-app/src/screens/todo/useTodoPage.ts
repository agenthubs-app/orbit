import { Platform } from "react-native";

import type { TodoPageContract } from "../../api/contract/todo-page";
import type { TaskItemContract } from "../../api/contract/tasks";
import { todoPageSchema } from "../../api/schema/todo-page";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { overlayTodoPage, todoPageIsStale } from "./todo-page-model";

/** R20a To-do first page; R10/R19 may consume this without generating or mutating server data. */
export function useTodoPage(timeZone: string, date: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const mirror = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const outbox = useOfflineTaskOutbox(mirror, Platform.OS !== "web");
  const path = `/api/todo/page?date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent(timeZone)}`;
  const state = usePageCopyResource<unknown>(path, value => {
    const result = todoPageSchema.safeParse(value);
    return result.success && result.data.counts.decisions === 0 && result.data.counts.nextMoves === 0 && result.data.counts.followups === 0;
  }, { copy: { id: "todo-page", variant: "main" }, enabled: auth.ready && auth.signedIn && Boolean(auth.actorId),
    dropCopyOnErrorCodes: ["NOT_IMPLEMENTED"],
    scopeKey: JSON.stringify([auth.actorId, auth.cookieHeader, auth.notificationSessionRevision, server.baseUrl, date, timeZone]),
    accept: value => todoPageSchema.safeParse(value).success });
  const parsed = state.kind === "success" || state.kind === "empty" ? todoPageSchema.safeParse(state.data) : null;
  const canonical = mirror.records.flatMap(record => record.deletedAt === null && record.payload ? [record.payload as unknown as TaskItemContract] : []);
  const page: TodoPageContract | null = parsed?.success
    ? overlayTodoPage(parsed.data, canonical, outbox.queuedMutations, auth.actorId ?? "") : null;
  return { state, page, copy: state.copy, staleDay: page ? todoPageIsStale(page, date, timeZone) : false,
    refresh: state.refresh, mirror, outbox };
}
