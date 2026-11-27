import { accountTierOf, type AccountTier } from "../../../features/ai-quota/tiers";
import { NextResponse } from "next/server";

import { auth } from "../../../auth";
import type {
  LiveAccountSessionIdentity,
} from "../../../features/account/storage/account-live-record-provider";
import {
  createConfiguredStorageAccountSessionProvider,
} from "../../../features/account/storage/account-live-record-provider";
import { failure, runtimeBoundaryHeaders } from "../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
import { noteReadReceiptAccount } from "../../../shared/observability/read-receipts";
import { cacheForRequest } from "../../../shared/performance/request-cache";
import { resolveLiveDatabaseConnectionConfig } from "../../../shared/storage/live-database-config";

export interface AuthenticatedApiActor {
  /**
   * Canonical account owner id used by actor-scoped feature services.
   *
   * Keep this compatibility field until every feature contract names
   * `accountId` explicitly. It must never contain the raw Auth.js user id.
   */
  id: string;
  accountId?: string;
  email?: string | null;
  /** From the session check's own read; absent = not known. */
  emailVerification?: { verified: boolean; sent: boolean };
  /** 2026-11-27: the account tier (free unless operations set pro); rides on the session check's read, no extra query. */
  tier?: AccountTier;
  name?: string | null;
  /** 资料里的姓名。`name` 是会话里的账号名（简化注册后是邮箱前缀），给别人看的名字用这个，没有才退回 `name`。 */
  profileName?: string;
  profileId?: string;
  userId?: string;
  workspaceId?: string;
}

export type ResolveAuthenticatedApiActor = () => Promise<
  AuthenticatedApiActor | null
>;

export interface AuthenticatedApiSessionIdentity {
  email?: string | null;
  name?: string | null;
  userId: string;
}

export interface ResolveAuthenticatedApiActorInput {
  /** A full `LiveAccountSessionGraph` also fits (scripts pass one). */
  graph: LiveAccountSessionIdentity | null;
  mode: FeatureMode;
  session: AuthenticatedApiSessionIdentity;
  workspaceId: string;
}

/**
 * Resolve the Auth.js principal into Orbit's account ownership boundary.
 *
 * Existing seeded users use the profile id as the Auth.js subject. Legacy
 * integrations may still use the account id directly. Both cases resolve
 * through persisted account/profile membership; live mode never falls back to
 * an arbitrary workspace account.
 */
export function resolveAuthenticatedApiActorIdentity({
  graph,
  mode,
  session,
  workspaceId,
}: ResolveAuthenticatedApiActorInput): AuthenticatedApiActor | null {
  if (mode === "mock" && !graph) {
    return {
      accountId: session.userId,
      email: session.email,
      id: session.userId,
      name: session.name,
      profileId: session.userId,
      userId: session.userId,
      workspaceId,
    };
  }

  if (!graph) {
    return null;
  }

  const profile =
    graph.profiles.find((item) => item.id === session.userId) ??
    graph.profiles.find((item) => item.accountId === session.userId) ??
    null;
  const accountId = profile?.accountId ?? session.userId;
  const account = graph.accounts.find((item) => item.id === accountId) ?? null;

  if (!profile || !account) {
    return null;
  }

  return {
    accountId: account.id,
    email: session.email,
    id: account.id,
    name: session.name ?? profile.displayName,
    ...(profile.displayName?.trim() ? { profileName: profile.displayName.trim() } : {}),
    profileId: profile.id,
    userId: session.userId,
    workspaceId,
  };
}

export async function resolveAuthenticatedApiActor(): Promise<AuthenticatedApiActor | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  const { emailVerification } = session.user;
  if (!actor) return actor;
  return { ...actor, ...(emailVerification ? { emailVerification } : {}), tier: accountTierOf(session.user.tier) };
}

// Layout, page and server components resolve the same actor; within one server render they share
// one identity read. Outside a render React calls straight through.
const readSessionIdentityForRequest = cacheForRequest(async (userId: string): Promise<LiveAccountSessionIdentity | null> => {
  const provider = createConfiguredStorageAccountSessionProvider();
  // Identity fields only (W0030); providers without the lightweight read fall back to the full graph.
  return provider
    ? await (provider.readAccountSessionIdentity
      ? provider.readAccountSessionIdentity({ userId })
      : provider.readAccountSessionGraph({ userId }))
    : null;
});

export async function resolveAuthenticatedApiActorFromSession(
  session: AuthenticatedApiSessionIdentity,
): Promise<AuthenticatedApiActor | null> {
  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const config = resolveLiveDatabaseConnectionConfig();
  const workspaceId = config?.workspaceId ?? "workspace:mock-auth";
  const graph = await readSessionIdentityForRequest(session.userId);

  const actor = resolveAuthenticatedApiActorIdentity({
    graph,
    mode,
    session,
    workspaceId,
  });
  // The single identity boundary for API routes and server pages: tag the
  // current request read receipt with the account it reads for.
  noteReadReceiptAccount(actor?.id);
  return actor;
}

export function authenticatedApiActorRequiredResponse(
  mode: FeatureMode,
): Response {
  return NextResponse.json(
    failure(new AppError("UNAUTHORIZED", "Sign in to access this resource."), {
      boundary: "runtime",
      mode,
      privacy: "authenticated-actor-required",
      provenance:
        "The request was rejected before any profile service or storage provider ran.",
      service: "authenticated-api-actor",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 401,
    },
  );
}
