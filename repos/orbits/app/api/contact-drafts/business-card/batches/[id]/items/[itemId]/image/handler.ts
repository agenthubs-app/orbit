import {
  createConfiguredBusinessCardBatchService,
  type BusinessCardBatchService,
} from "../../../../../../../../../features/acquisition/business-card-batch-service";
import {
  createBusinessCardBatchImageStore,
  type BusinessCardBatchImageStore,
} from "../../../../../../../../../features/acquisition/storage/business-card-batch-image-store";
import { resolveFeatureMode } from "../../../../../../../../../shared/config/feature-mode";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../../../../_shared/authenticated-actor";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export function createBusinessCardBatchItemImageHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  service: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
  imageStore: BusinessCardBatchImageStore = createBusinessCardBatchImageStore(),
) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    if (!service) {
      return new Response(null, { status: 503 });
    }

    const { id, itemId } = await context.params;
    const detail = await service.getBatch(actor.id, id);
    const item = detail?.items.find((entry) => entry.id === itemId);

    if (!item?.imagePath) {
      return new Response(null, { status: 404 });
    }

    const bytes = await imageStore.read(item.imagePath);

    if (!bytes) {
      return new Response(null, { status: 404 });
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, max-age=0",
        "Content-Type": "image/jpeg",
      },
      status: 200,
    });
  };
}
