"use server";

import { auth } from "../../../../auth";
import {
  resolveAuthenticatedApiActorFromSession,
  type AuthenticatedApiActor,
} from "../../../api/_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { resolveLiveDatabaseConnectionConfig } from "../../../../shared/storage/live-database-config";
import {
  loadHomeDashboardSnapshot,
  type HomeDashboardSnapshot,
} from "./home-dashboard-route-service";

export type HomeDashboardActionResult =
  | { state: "snapshot"; snapshot: HomeDashboardSnapshot }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

function validLiveConfiguration(value: unknown): value is {
  connectionString: string;
  workspaceId: string;
} {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return nonBlank(config.connectionString) && nonBlank(config.workspaceId);
}

function validCanonicalActor(
  value: AuthenticatedApiActor | null,
  workspaceId: string,
): value is AuthenticatedApiActor & { id: string; workspaceId: string } {
  if (!value || typeof value !== "object") return false;
  if (!nonBlank(value.id) || !nonBlank(value.workspaceId) || value.workspaceId !== workspaceId) {
    return false;
  }
  const accountId = value.accountId;
  if (accountId !== undefined && (!nonBlank(accountId) || accountId !== value.id)) {
    return false;
  }
  return true;
}

export async function refreshHomeDashboardAction(): Promise<HomeDashboardActionResult> {
  let mode: ReturnType<typeof resolveFeatureMode>;
  try {
    mode = resolveFeatureMode();
  } catch {
    return { state: "unavailable" };
  }
  if (mode !== "live") return { state: "unavailable" };

  let config: ReturnType<typeof resolveLiveDatabaseConnectionConfig>;
  try {
    config = resolveLiveDatabaseConnectionConfig();
  } catch {
    return { state: "unavailable" };
  }
  if (!validLiveConfiguration(config)) return { state: "unavailable" };

  let sessionUser: {
    email?: string | null;
    id?: unknown;
    name?: string | null;
  } | null | undefined;
  try {
    const session = await auth();
    sessionUser = session?.user
      ? {
          email: session.user.email,
          id: session.user.id,
          name: session.user.name,
        }
      : null;
  } catch {
    return { state: "unavailable" };
  }
  const userId = sessionUser?.id;
  if (!sessionUser || !nonBlank(userId)) {
    return { state: "unauthenticated" };
  }

  let resolvedActor: AuthenticatedApiActor | null;
  try {
    resolvedActor = await resolveAuthenticatedApiActorFromSession({
      email: sessionUser.email,
      name: sessionUser.name,
      userId,
    });
  } catch {
    return { state: "unavailable" };
  }
  if (!validCanonicalActor(resolvedActor, config.workspaceId)) {
    return { state: "unavailable" };
  }

  try {
    const snapshot = await loadHomeDashboardSnapshot({
      actor: {
        accountId: resolvedActor.accountId ?? resolvedActor.id,
        id: resolvedActor.id,
        workspaceId: resolvedActor.workspaceId,
      },
    });
    return { snapshot, state: "snapshot" };
  } catch {
    return { state: "unavailable" };
  }
}
