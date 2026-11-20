import { NextResponse } from "next/server";
import {createConfiguredDeliveryPolicyRuntime} from '../../../../../features/notifications/typed-delivery-factory';
import type {TypedDeliveryContent} from '../../../../../features/notifications/typed-delivery-worker';
import type {NotificationDelivery} from '../../../../../features/notifications/delivery-service';

import { resolveRuleReminderTarget } from "../../../../../features/agent/automations/reminder-target";
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
  /** agent-design AG16: null when the id is not one of this account's scheduled-task reminders. */
  resolveRuleReminder?: typeof resolveRuleReminderTarget;
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
    // agent-design AG16: a scheduled task's reminder. Its id names a run in the signed-in account's own history; the
    // answer points at that period's inbox entry and says nothing of its content (the inbox page reads it).
    const reminder = await (dependencies.resolveRuleReminder ?? resolveRuleReminderTarget)(actor.id, id);
    if (reminder) {
      // `success: true`: the App's client accepts only that envelope (its tap on a reminder goes through here).
      return NextResponse.json({ success: true, data: { body: reminder.body, data: { deliveryId: id }, deliveryId: id, status: reminder.status, target: { deliveryId: id, kind: "inbox", status: reminder.href ? "available" : "unavailable", ...(reminder.href ? { href: reminder.href } : {}) }, title: reminder.title } }, { headers: { "Cache-Control": "no-store" } });
    }
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
        return NextResponse.json({success:true,data:{deliveryId:id,data:{deliveryId:id},status:delivery.status,title:source?.title??'Orbit',body:source?.body??'',target:{deliveryId:id,kind:'inbox',status:source?'available':'unavailable',...(source?{href:source.href}:{})}}},{headers:{'Cache-Control':'no-store'}});
      } catch { return NextResponse.json({error:{code:'SERVICE_UNAVAILABLE',message:'Notification source temporarily unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}}); }
    }
    const { actorId: _actorId, deviceId: _deviceId, ...publicDelivery } = {
      ...delivery,
      data: { deliveryId: delivery.deliveryId },
      target: { deliveryId: delivery.deliveryId, kind: "inbox" as const },
    };
    return NextResponse.json({ success: true, data: publicDelivery }, { status: 200 });
  };
}
