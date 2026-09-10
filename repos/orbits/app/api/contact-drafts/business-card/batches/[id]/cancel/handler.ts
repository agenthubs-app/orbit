import { NextResponse } from "next/server";
import { createConfiguredBusinessCardBatchService, type BusinessCardBatchService } from "../../../../../../../features/acquisition/business-card-batch-service";
import { success } from "../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../../../_shared/authenticated-actor";

export function createBusinessCardBatchCancelHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  service: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
) {
  return async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode(process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE));
    if (!service) return NextResponse.json({ error: { message: "Batch service unavailable." } }, { status: 503 });
    const { id } = await context.params;
    const detail = await service.getBatch(actor.id, id);
    if (!detail) return NextResponse.json({ error: { message: "Batch not found." } }, { status: 404 });
    if (detail.batch.status === "completed") return NextResponse.json({ error: { message: "Completed batches cannot be cancelled." } }, { status: 409 });
    try {
      await service.cancelBatch({ actorId: actor.id, batchId: id, now: new Date().toISOString() });
      return NextResponse.json(success({ state: "cancelled" }));
    } catch {
      // Dispatch may fail after cancellation commits. Retrying is idempotent;
      // the durable cleanup marker also remains visible to the scanner.
      return NextResponse.json({ error: { message: "Cancellation could not be confirmed. Refresh or retry." } }, { status: 503 });
    }
  };
}
