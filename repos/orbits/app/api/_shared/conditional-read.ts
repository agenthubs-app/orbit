import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { failure, runtimeBoundaryHeaders } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import {
  READ_AUTHORIZATION_COLLECTIONS,
  readDomainWatermark,
  type DomainWatermarkSqlClient,
} from "../../../shared/storage/domain-watermark";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";

/**
 * Conditional GET: one indexed watermark row decides whether the business read
 * runs at all. The ETag covers everything the body can depend on — route,
 * query string, actor, workspace, the data watermark (including authorization
 * collections) and the code version — so a hit is safe to replay client-side.
 */
export interface ConditionalReadScope {
  routeKey: string;
  request: Request;
  actorId: string;
  /** Falls back to the configured store's workspace when the actor carries none. */
  workspaceId?: string;
  /** Collections the response is built from. */
  collections: readonly string[];
  /** Private domains: watermark only this actor's rows in `collections`. */
  userScoped?: boolean;
  /** Workspace-wide collections a private read also depends on (e.g. contacts for a note search). */
  sharedCollections?: readonly string[];
}

export interface ConditionalReadDependencies {
  /** null disables conditional reads (mock mode, no database). */
  client: DomainWatermarkSqlClient | null;
  /** Anything that changes serialization must change this; defaults to the deployed commit. */
  version?: string;
  workspaceId?: string;
}

export const CONDITIONAL_READ_HEADERS = {
  "Cache-Control": "private, no-cache",
  Vary: "Cookie",
} as const;

function readVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.ORBIT_READ_ETAG_VERSION?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim() || "dev";
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").map((candidate) => candidate.trim()).some((candidate) => candidate === etag || candidate === "*");
}

function withHeaders(response: Response, etag: string): Response {
  const headers = new Headers(response.headers);
  headers.set("ETag", etag);
  for (const [key, value] of Object.entries(CONDITIONAL_READ_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function conditionalJsonRead(
  scope: ConditionalReadScope,
  dependencies: ConditionalReadDependencies,
  produce: () => Promise<Response>,
): Promise<Response> {
  const workspaceId = scope.workspaceId ?? dependencies.workspaceId;
  if (!dependencies.client || !workspaceId) return produceOrFail(scope, produce);
  let etag: string;
  try {
    const url = new URL(scope.request.url);
    const shared = [...(scope.sharedCollections ?? []), ...READ_AUTHORIZATION_COLLECTIONS];
    const watermark = await readDomainWatermark({
      client: dependencies.client,
      workspaceId,
      collections: scope.userScoped ? scope.collections : [...scope.collections, ...shared],
      ...(scope.userScoped ? { userId: scope.actorId, sharedCollections: shared } : {}),
    });
    const digest = createHash("sha256")
      .update(JSON.stringify([
        scope.routeKey, url.pathname, url.search, scope.actorId, workspaceId,
        watermark.fingerprint, dependencies.version ?? readVersion(),
      ]))
      .digest("hex");
    etag = `W/"${digest}"`;
  } catch {
    // The watermark is an optimisation; a failure there must not fail the read.
    return produceOrFail(scope, produce);
  }
  if (etagMatches(scope.request.headers.get("If-None-Match"), etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag, ...CONDITIONAL_READ_HEADERS } });
  }
  const response = await produceOrFail(scope, produce);
  return response.status === 200 ? withHeaders(response, etag) : response;
}

/**
 * A read that fails closed (e.g. the process read budget) must answer with its
 * reason in the envelope, not surface as an anonymous 500 from the framework.
 */
async function produceOrFail(scope: ConditionalReadScope, produce: () => Promise<Response>): Promise<Response> {
  try {
    return await produce();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const mode = resolveFeatureMode();
    return NextResponse.json(
      failure(error, { boundary: "runtime", mode, privacy: "actor-scoped-read", service: scope.routeKey }),
      { headers: runtimeBoundaryHeaders(mode), status: getHttpStatusForAppErrorCode(error.code) },
    );
  }
}

/** Live-mode default: the configured Postgres client; null in mock mode or without a database. */
export function defaultConditionalReadDependencies(): ConditionalReadDependencies {
  if (resolveFeatureMode() === "mock") return { client: null };
  const configured = createConfiguredPostgresLiveRecordStore();
  return configured ? { client: configured.client, workspaceId: configured.workspaceId } : { client: null };
}
