/**
 * R11b: GET /api/network/analysis and GET /api/network/analysis/people (read only, sign-in required).
 *
 * live → analysis-reader (R11a rows + plan needs; below 10 people only the count is read). Outside production,
 * `ORBIT_REDESIGN_MOCK=network-analysis` serves the fixture world instead (analysis-fixtures.ts: no database, no AI).
 * A failed count is a SERVICE_UNAVAILABLE error — never a 0-person lock.
 */
import { NextResponse } from "next/server";

import { failure, success } from "../../shared/api/envelope";
import { networkAnalysisPeopleQuerySchema, networkAnalysisPeopleSchema, networkAnalysisViewSchema } from "../../shared/api-schema/network-analysis-view";
import { AppError, getHttpStatusForAppErrorCode } from "../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { redesignContractMode } from "../redesign-contracts/route";
import { defaultNetworkAnalysisReadDeps, loadNetworkAnalysisPeople, loadNetworkAnalysisView, type NetworkAnalysisReadDeps } from "./analysis-reader";

export interface NetworkAnalysisRouteOptions {
  resolveActor?: ResolveAuthenticatedApiActor;
  deps?: () => NetworkAnalysisReadDeps | Promise<NetworkAnalysisReadDeps>;
}

const HEADERS = { "Cache-Control": "private, no-store" };

/** live reads, or the fixture world when the network-analysis capability is mocked (never in production). */
export async function resolveNetworkAnalysisReadDeps(): Promise<NetworkAnalysisReadDeps> {
  if (redesignContractMode("network-analysis") === "mock") return (await import("./analysis-fixtures")).fixtureNetworkAnalysisReadDeps();
  return defaultNetworkAnalysisReadDeps();
}

function unavailable(error: unknown): Response {
  const safe = error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "The network analysis is temporarily unavailable.");
  if (!(error instanceof AppError)) console.error(JSON.stringify({ event: "network_analysis_read_failed", errorCategory: error instanceof TypeError ? "TypeError" : error instanceof Error ? "Error" : "unknown", errorCode: safe.code }));
  return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers: HEADERS });
}

export function createNetworkAnalysisRouteHandlers(options: NetworkAnalysisRouteOptions = {}) {
  const resolveActor = options.resolveActor ?? resolveAuthenticatedApiActor;
  const deps = options.deps ?? resolveNetworkAnalysisReadDeps;
  return {
    async GET(): Promise<Response> {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      try {
        const view = await loadNetworkAnalysisView({ id: actor.id, workspaceId: actor.workspaceId }, await deps());
        return NextResponse.json(success(networkAnalysisViewSchema.parse(view)), { headers: HEADERS });
      } catch (error) {
        return unavailable(error);
      }
    },

    async people(request: Request): Promise<Response> {
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const params = Object.fromEntries(new URL(request.url).searchParams);
      const query = networkAnalysisPeopleQuerySchema.safeParse(params);
      if (!query.success) return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "The list query is invalid.")), { status: 400, headers: HEADERS });
      try {
        const people = await loadNetworkAnalysisPeople({ id: actor.id, workspaceId: actor.workspaceId }, query.data, await deps());
        if (people === "locked") return NextResponse.json(failure(new AppError("CONFLICT", "The network analysis opens from 10 people."), { reason: "LOCKED" }), { status: 409, headers: HEADERS });
        if (!people) return NextResponse.json(failure(new AppError("NOT_FOUND", "This list does not exist.")), { status: 404, headers: HEADERS });
        return NextResponse.json(success(networkAnalysisPeopleSchema.parse(people)), { headers: HEADERS });
      } catch (error) {
        if (error instanceof Error && error.message === "NETWORK_ANALYSIS_CURSOR_INVALID") {
          return NextResponse.json(failure(new AppError("VALIDATION_ERROR", "The list page has expired. Reload from the first page.")), { status: 400, headers: HEADERS });
        }
        return unavailable(error);
      }
    },
  };
}
