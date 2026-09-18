import { NextResponse } from "next/server";
import {createConfiguredDeliveryPolicyRuntime} from '../../../../../features/notifications/typed-delivery-factory';
import type {TypedDeliveryContent} from '../../../../../features/notifications/typed-delivery-worker';
import type {NotificationDelivery} from '../../../../../features/notifications/delivery-service';

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
  resolveTyped?: (actorId:string, delivery:NotificationDelivery)=>Promise<TypedDeliveryContent|null>;
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
    if (!delivery || delivery.actorId !== actor.id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Notification delivery was not found." } },
        { status: 404 },
      );
    }
    if (delivery.policySource) {
      try {
        const source = await (dependencies.resolveTyped ?? ((actorId, candidate) => createConfiguredDeliveryPolicyRuntime(actorId)?.sources.resolve(candidate) ?? Promise.resolve(null)))(actor.id, delivery);
        return NextResponse.json({data:{deliveryId:id,data:{deliveryId:id},status:delivery.status,title:source?.title??'Orbit',body:source?.body??'',target:{deliveryId:id,kind:'inbox',status:source?'available':'unavailable',...(source?{href:source.href}:{})}}},{headers:{'Cache-Control':'no-store'}});
      } catch { return NextResponse.json({error:{code:'SERVICE_UNAVAILABLE',message:'Notification source temporarily unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}}); }
    }
    const { actorId: _actorId, deviceId: _deviceId, ...publicDelivery } = {
      ...delivery,
      data: { deliveryId: delivery.deliveryId },
      target: { deliveryId: delivery.deliveryId, kind: "inbox" as const },
    };
    return NextResponse.json({ data: publicDelivery }, { status: 200 });
  };
}
