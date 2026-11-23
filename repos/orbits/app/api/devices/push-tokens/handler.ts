import { NextResponse } from "next/server";

import {
  createPushDeviceService,
  type PushDevicePlatform,
  type PushDeviceService,
  type PushPermissionState,
} from "../../../../features/notifications/push-device-service";
import { parseWebPushSubscription, webPushTokenOf } from "../../../../features/notifications/web-push-adapter";
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
  /** agent-design AG16: the environment the browser-subscription check reads (the eval allows its local simulator). */
  env?: NodeJS.ProcessEnv;
}

export function createPushTokenRouteHandlers(
  dependencies: PushTokenRouteDependencies = {},
): {
  POST: (request: Request) => Promise<Response>;
  GET: (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
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
        if (platform === "web") {
          // agent-design AG16 (PLANNER 易错边界 2/6): a browser is registered only with the permission granted and a real
          // push subscription. A browser that said no, or took the permission back, is not a device to send to: any
          // earlier registration of it is revoked and nothing new is stored.
          const service = serviceForActor(actor.id);
          if (!deviceId.trim() || deviceId.length > 256) throw new Error("Device is invalid.");
          if (permission !== "granted") {
            if (permission !== "denied" && permission !== "undetermined") throw new Error("Push permission is invalid.");
            const revoked = await service.revoke(deviceId, "user");
            return NextResponse.json({ data: revoked ? { ...revoked, permission } : { active: false, deviceId, permission, platform: "web" } }, { status: 200 });
          }
          const subscription = parseWebPushSubscription(body.subscription ?? body.token, dependencies.env);
          if (!subscription) throw new Error("Browser push subscription is invalid.");
          const registered = await service.register({ appVersion, deviceId, permission: "granted", platform: "web", token: webPushTokenOf(subscription) });
          return NextResponse.json({ data: registered }, { status: 200 });
        }
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
    /**
     * agent-design AG16: what the server knows about this browser or phone (视觉稿 16-3) — registered and sent to, turned
     * off here by the owner, or refused by the push service when a reminder was sent. Only the signed-in account's own
     * device resolves; no token or subscription is returned.
     */
    async GET(_request, context) {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      try {
        const { id } = await context.params;
        const device = await serviceForActor(actor.id).get?.(id);
        if (!device) {
          return NextResponse.json(
            { error: { code: "NOT_FOUND", message: "Push device was not found." } },
            { headers: { "cache-control": "no-store" }, status: 404 },
          );
        }
        const state = { active: device.active && (device.permission === "granted" || device.permission === "provisional"), deviceId: device.deviceId, permission: device.permission, platform: device.platform, ...(device.revokedAt ? { revokedAt: device.revokedAt, revokedReason: device.revokedReason ?? "user" } : {}) };
        return NextResponse.json({ data: state }, { headers: { "cache-control": "no-store" }, status: 200 });
      } catch (error) {
        return NextResponse.json(
          { error: { code: "PUSH_DEVICE_INVALID", message: error instanceof Error ? error.message : "Push device is invalid." } },
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
