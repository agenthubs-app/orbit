import { NextResponse } from "next/server";
import { resolveSharedReadBudgetGate } from "../../../../features/sync/read-budget-gate";
import { readRelationshipUnreadSummary } from "../../../../features/relationship-communication/unread-summary";
import type { RelationshipUnreadSummaryDTO } from "../../../../shared/contract/relationship-communication";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

export function createRelationshipUnreadSummaryGetHandler(options: {
  resolveActor?: ResolveAuthenticatedApiActor;
  read?: (actorId: string) => Promise<RelationshipUnreadSummaryDTO>;
} = {}) {
  return async function GET(): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const actorId = actor.accountId ?? actor.id;
    try {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "relationship_communication_messages" });
      const data = options.read ? await options.read(actorId) : await (async () => {
        const runtime = createConfiguredPostgresLiveRecordStore();
        if (!runtime) throw new Error("Storage unavailable");
        return readRelationshipUnreadSummary({ ...runtime, actorId });
      })();
      return NextResponse.json(success(data), { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Message count is temporarily unavailable")), {
        status: 503, headers: { "Cache-Control": "private, no-store" },
      });
    }
  };
}
