import { NextResponse } from "next/server";

import {
  createNotificationDeliveryService,
  type NotificationDeliveryService,
} from "../../../../../features/notifications/delivery-service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

export interface NotificationDeliveryRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  serviceForActor?: (actorId: string) => NotificationDeliveryService;
}

export function createNotificationDeliveryRouteHandler(
  dependencies: NotificationDeliveryRouteDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor =
    dependencies.serviceForActor ?? ((actorId) => createNotificationDeliveryService({ actorId }));

  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const { id } = await context.params;
    const delivery = await serviceForActor(actor.id).get(id);
    if (!delivery) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Notification delivery was not found." } },
        { status: 404 },
      );
    }
    const { actorId: _actorId, deviceId: _deviceId, ...publicDelivery } = {
      ...delivery,
      data: { deliveryId: delivery.deliveryId },
      target: { deliveryId: delivery.deliveryId, kind: "inbox" as const },
    };
    return NextResponse.json({ data: publicDelivery }, { status: 200 });
  };
}
