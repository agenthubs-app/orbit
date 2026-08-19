import { NextResponse } from "next/server";

import {
  createPushDeviceService,
  type PushDevicePlatform,
  type PushDeviceService,
  type PushPermissionState,
} from "../../../../features/notifications/push-device-service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PushTokenRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  serviceForActor?: (actorId: string) => PushDeviceService;
}

export function createPushTokenRouteHandlers(
  dependencies: PushTokenRouteDependencies = {},
): {
  POST: (request: Request) => Promise<Response>;
  DELETE: (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
} {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor =
    dependencies.serviceForActor ?? ((actorId) => createPushDeviceService({ actorId }));

  return {
    async POST(request) {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const body = (await request.json().catch(() => null)) as unknown;
      if (!isRecord(body)) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "JSON body required." } },
          { status: 400 },
        );
      }
      try {
        const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
        const token = typeof body.token === "string" ? body.token : "";
        const platform = body.platform as PushDevicePlatform;
        const permission = body.permission as PushPermissionState | undefined;
        const appVersion = typeof body.appVersion === "string" ? body.appVersion : undefined;
        const device = await serviceForActor(actor.id).register({
          appVersion,
          deviceId,
          permission,
          platform,
          token,
        });
        return NextResponse.json({ data: device }, { status: 200 });
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              code: "PUSH_DEVICE_INVALID",
              message: error instanceof Error ? error.message : "Push device is invalid.",
            },
          },
          { status: 400 },
        );
      }
    },
    async DELETE(_request, context) {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      try {
        const { id } = await context.params;
        const device = await serviceForActor(actor.id).revoke(id);
        if (!device) {
          return NextResponse.json(
            { error: { code: "NOT_FOUND", message: "Push device was not found." } },
            { status: 404 },
          );
        }
        return NextResponse.json({ data: device }, { status: 200 });
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              code: "PUSH_DEVICE_INVALID",
              message: error instanceof Error ? error.message : "Push device is invalid.",
            },
          },
          { status: 400 },
        );
      }
    },
  };
}
