import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import { resolveAuthenticatedApiActor, type AuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { accountExportCreateInputSchema } from "../../../shared/api-schema/account";
import { AppError, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { readBody, type ContractReply } from "../../redesign-contracts/route";
import { createAccountExportRecordStore } from "./records";
import { createAccountExportService } from "./service";
import { createPrivateAccountExportStore } from "./storage/private-zip";

type ExportService = Pick<ReturnType<typeof createAccountExportService>, "create" | "list" | "get">;
type Claims = { userId: string; authenticatedAt: number };

async function resolveClaims(request: Request): Promise<Claims | null> {
  const token = await getToken({ req: request as NextRequest, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: new URL(request.url).protocol === "https:" });
  if (!token || typeof token.sub !== "string") return null;
  const authenticatedAt = typeof token.authenticatedAt === "number" ? token.authenticatedAt : NaN;
  return Number.isSafeInteger(authenticatedAt) ? { userId: token.sub, authenticatedAt } : null;
}

export function createConfiguredAccountExportService(): ReturnType<typeof createAccountExportService> | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!runtime || !secret) return null;
  const records = createAccountExportRecordStore({ db: runtime.client, workspaceId: runtime.workspaceId });
  return createAccountExportService({ records, storage: createPrivateAccountExportStore({ workspaceId: runtime.workspaceId }),
    secret, publicBaseUrl: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL });
}

export function createAccountExportLiveHandlers(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveClaims?: (request: Request) => Promise<Claims | null>;
  service?: ExportService | null;
} = {}) {
  const actor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const claims = deps.resolveClaims ?? resolveClaims;
  const service = () => deps.service !== undefined ? deps.service : createConfiguredAccountExportService();
  const unavailable = (): ContractReply => ({ error: new AppError("SERVICE_UNAVAILABLE", "Account exports are unavailable."), context: { reason: "ACCOUNT_EXPORT_UNCONFIGURED" } });
  const internal = (): ContractReply => ({ error: new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE) });
  async function authorized(): Promise<AuthenticatedApiActor | null | "unavailable"> {
    try { return await actor(); }
    catch { return "unavailable"; }
  }
  return {
    async list(request: Request): Promise<ContractReply> {
      const principal = await authorized();
      if (principal === "unavailable") return unavailable();
      if (!principal) return { error: new AppError("UNAUTHORIZED", "Sign in to access exports.") };
      const resolved = service();
      if (!resolved) return unavailable();
      try { return { data: await resolved.list(principal.id, request) }; }
      catch { return internal(); }
    },
    async create(request: Request): Promise<ContractReply> {
      const principal = await authorized();
      if (principal === "unavailable") return unavailable();
      if (!principal) return { error: new AppError("UNAUTHORIZED", "Sign in to create an export.") };
      const claim = await claims(request);
      if (!claim || claim.userId !== principal.userId) return { error: new AppError("UNAUTHORIZED", "Sign in again to create an export.") };
      if (Date.now() - claim.authenticatedAt > 10 * 60_000 || claim.authenticatedAt > Date.now() + 30_000) {
        return { error: new AppError("FORBIDDEN", "Sign in again to create an export."), context: { reason: "RECENT_LOGIN_REQUIRED" } };
      }
      const body = await readBody(request, accountExportCreateInputSchema);
      if (body.ok === false) return body.reply;
      const resolved = service();
      if (!resolved) return unavailable();
      try {
        const created = await resolved.create(principal.id, body.value, claim.authenticatedAt);
        if (created.kind === "reauth") return { error: new AppError("FORBIDDEN", "Sign in again to create an export."), context: { reason: "RECENT_LOGIN_REQUIRED" } };
        if (created.kind === "quota") return { error: new AppError("CONFLICT", "The daily export limit has been reached."), context: { reason: "DAILY_EXPORT_LIMIT" }, status: 429 };
        if (created.kind === "active") return { error: new AppError("CONFLICT", "An export is already in progress."), context: { reason: "EXPORT_IN_PROGRESS" } };
        if (!("export" in created)) return internal();
        const shown = await resolved.get(principal.id, created.export.id, request);
        return shown.kind === "found" ? { data: shown.export, status: created.kind === "accepted" ? 202 : 200 } : internal();
      } catch { return internal(); }
    },
    async get(request: Request, params: Record<string, string>): Promise<ContractReply> {
      const principal = await authorized();
      if (principal === "unavailable") return unavailable();
      if (!principal) return { error: new AppError("UNAUTHORIZED", "Sign in to access exports.") };
      const resolved = service();
      if (!resolved) return unavailable();
      try {
        const result = await resolved.get(principal.id, params.id ?? "", request);
        return result.kind === "found" ? { data: result.export } : { error: new AppError("NOT_FOUND", "Export not found.") };
      } catch { return internal(); }
    },
  };
}

let live: ReturnType<typeof createAccountExportLiveHandlers> | null = null;
export function accountExportLiveHandlers() {
  live ??= createAccountExportLiveHandlers();
  return live;
}
