import { NextResponse } from "next/server";
import { SyncCursorError } from "../../../features/sync/cursor";
import {
  createDomainReadService,
  DomainNotAuthorizedError,
  DomainUnknownError,
  type DomainReadService,
} from "../../../features/sync/domain-read-service";
import { SYNC_DOMAINS } from "../../../features/sync/domain-registry";
import { SYNC_DEFAULT_LIMIT, SYNC_MAX_LIMIT } from "../../../features/sync/read-service";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";
import { conditionalJsonRead, defaultConditionalReadDependencies, type ConditionalReadDependencies } from "../_shared/conditional-read";

export interface SyncDomainRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  createService?: () => DomainReadService | null;
  now?: () => number;
  /** Auth.js session lifetime; the offline lease never outlives it. */
  sessionMaxAgeMs?: number;
  offlineMaxAgeMs?: number;
  /** Manifest conditional read (ETag/304); defaults to the configured store's client. */
  conditionalRead?: ConditionalReadDependencies;
}

const DEFAULT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let configuredService: { key: string; service: DomainReadService } | null = null;

function createConfiguredDomainReadService(): DomainReadService | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  const cursorSecret = process.env.ORBIT_SYNC_CURSOR_SECRET?.trim();
  if (!configured || !cursorSecret) return null;
  const key = `${configured.workspaceId}|${cursorSecret.length}`;
  if (configuredService?.key === key) return configuredService.service;
  const service = createDomainReadService({ client: configured.client, cursorSecret });
  configuredService = { key, service };
  return service;
}

function parseLimit(url: URL): number {
  if (!url.searchParams.has("limit")) return SYNC_DEFAULT_LIMIT;
  const raw = url.searchParams.get("limit");
  const limit = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SYNC_MAX_LIMIT) {
    throw new AppError("VALIDATION_ERROR", `limit must be an integer between 1 and ${SYNC_MAX_LIMIT}.`);
  }
  return limit;
}

/** The lease binds to the base URL the client will replay it against; behind a proxy that is not the server's own origin. */
function leaseBaseUrl(url: URL): string {
  const raw = url.searchParams.get("baseUrl") ?? url.origin;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", "baseUrl must be an absolute http(s) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AppError("VALIDATION_ERROR", "baseUrl must be an absolute http(s) URL without credentials, query or fragment.");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
}

interface GuardedInput {
  actorId: string;
  subject: string;
  workspaceId: string;
  service: DomainReadService;
  mode: ReturnType<typeof resolveFeatureMode>;
}

export function createSyncDomainHandlers(dependencies: SyncDomainRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const createService = dependencies.createService ?? createConfiguredDomainReadService;
  const now = dependencies.now ?? Date.now;
  const sessionMaxAgeMs = dependencies.sessionMaxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS;
  const offlineMaxAgeMs = dependencies.offlineMaxAgeMs ?? DEFAULT_OFFLINE_MAX_AGE_MS;
  const noStore = (mode: GuardedInput["mode"]) => ({ ...runtimeBoundaryHeaders(mode), "Cache-Control": "private, no-store" });

  async function guarded(run: (input: GuardedInput) => Promise<Response>): Promise<Response> {
    const mode = resolveFeatureMode();
    try {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      const service = createService();
      if (!actor.workspaceId || !service) {
        return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Sync is temporarily unavailable.")), { headers: runtimeBoundaryHeaders(mode), status: 503 });
      }
      return await run({ actorId: actor.id, subject: actor.userId ?? actor.id, workspaceId: actor.workspaceId, service, mode });
    } catch (error) {
      if (error instanceof SyncCursorError && error.code === "SYNC_RESET_REQUIRED") {
        return NextResponse.json(failure(new AppError("CONFLICT", "Sync cursor must be reset."), { syncErrorCode: "SYNC_RESET_REQUIRED" }), { headers: runtimeBoundaryHeaders(mode), status: 409 });
      }
      if (error instanceof DomainUnknownError) {
        return NextResponse.json(failure(new AppError("NOT_FOUND", error.message)), { headers: runtimeBoundaryHeaders(mode), status: 404 });
      }
      if (error instanceof DomainNotAuthorizedError) {
        return NextResponse.json(failure(new AppError("FORBIDDEN", error.message), { syncErrorCode: "SYNC_NOT_AUTHORIZED" }), { headers: runtimeBoundaryHeaders(mode), status: 403 });
      }
      if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
        return NextResponse.json(failure(error), { headers: runtimeBoundaryHeaders(mode), status: 400 });
      }
      return NextResponse.json(
        failure(new AppError("SERVICE_UNAVAILABLE", "Sync is temporarily unavailable.", { cause: error })),
        { headers: runtimeBoundaryHeaders(mode), status: 503 },
      );
    }
  }

  return {
    lease(request: Request): Promise<Response> {
      return guarded(async ({ actorId, subject, workspaceId, service, mode }) => {
        const nowMs = now();
        const envelope = await service.lease({
          actorId, subject, workspaceId, baseUrl: leaseBaseUrl(new URL(request.url)),
          sessionExpiresAt: nowMs + sessionMaxAgeMs, offlineMaxAgeMs, nowMs,
        });
        return NextResponse.json(success(envelope), { headers: noStore(mode), status: 200 });
      });
    },
    // The manifest is a watermark read: when nothing in the actor's registered
    // collections (or the authorization rows) moved, the client gets a 304 and
    // replays its cached manifest, so an unchanged sync touches no business row.
    manifest(request: Request): Promise<Response> {
      return guarded(({ actorId, workspaceId, service, mode }) =>
        conditionalJsonRead(
          { routeKey: "sync.manifest", request, actorId, workspaceId, collections: SYNC_DOMAINS.map((domain) => domain.collectionName), userScoped: true },
          dependencies.conditionalRead ?? defaultConditionalReadDependencies(),
          async () => {
            const manifest = await service.manifest({ actorId, workspaceId });
            return NextResponse.json(success(manifest), { headers: noStore(mode), status: 200 });
          },
        ));
    },
    domain(request: Request, domainId: string): Promise<Response> {
      return guarded(async ({ actorId, workspaceId, service, mode }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get("cursor");
        const page = await service.readDomainPage({ actorId, workspaceId, domainId, limit: parseLimit(url), ...(cursor === null ? {} : { cursor }) });
        return NextResponse.json(success(page), { headers: noStore(mode), status: 200 });
      });
    },
  };
}
