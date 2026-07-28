import { NextResponse } from "next/server";

import { auth } from "../../../auth";
import type {
  LiveAccountSessionGraph,
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
  name?: string | null;
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
  graph: LiveAccountSessionGraph | null;
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

  const mode = resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
  const config = resolveLiveDatabaseConnectionConfig();
  const workspaceId = config?.workspaceId ?? "workspace:mock-auth";
  const provider = createConfiguredStorageAccountSessionProvider();
  const graph = provider ? await provider.readAccountSessionGraph() : null;

  return resolveAuthenticatedApiActorIdentity({
    graph,
    mode,
    session: {
      email: session.user.email,
      name: session.user.name,
      userId: session.user.id,
    },
    workspaceId,
  });
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
