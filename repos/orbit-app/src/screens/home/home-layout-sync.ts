import type { OrbitApiClient } from "../../api/client";
import type { HomeLayoutContract } from "../../api/contract/home-layout";
import { homeLayoutSchema } from "../../api/schema/home-layout";
import type { HomeLayoutDraft } from "./home-layout-storage";

export type DraftReconciliation =
  | { kind: "saved"; layout: HomeLayoutContract }
  | { kind: "conflict"; layout: HomeLayoutContract }
  | { kind: "pending"; layout: HomeLayoutContract };

/** A draft never wins after another revision; the whole server layout is adopted on conflict. */
export async function reconcileHomeLayoutDraft(
  server: HomeLayoutContract, draft: HomeLayoutDraft, put: Pick<OrbitApiClient, "put">["put"],
): Promise<DraftReconciliation> {
  if (server.revision !== draft.baseRevision) return { kind: "conflict", layout: server };
  const result = await put<unknown>("/api/home/layout", { body: {
    expectedRevision: server.revision, mutationId: draft.mutationId, app: draft.app, web: server.web,
    ...(draft.hintDismissedAt ?? server.hintDismissedAt ? { hintDismissedAt: draft.hintDismissedAt ?? server.hintDismissedAt } : {}),
  } });
  if (result.success) {
    const parsed = homeLayoutSchema.safeParse(result.data);
    return parsed.success ? { kind: "saved", layout: parsed.data } : { kind: "pending", layout: server };
  }
  if (result.status === 409 && result.error.context?.currentLayout) {
    try {
      const parsed = homeLayoutSchema.safeParse(JSON.parse(result.error.context.currentLayout));
      if (parsed.success) return { kind: "conflict", layout: parsed.data };
    } catch { /* A malformed conflict leaves the draft queued and visible. */ }
  }
  return { kind: "pending", layout: server };
}
