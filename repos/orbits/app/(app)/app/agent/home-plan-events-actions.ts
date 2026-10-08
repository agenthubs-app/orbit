"use server";

/**
 * W0036 SC-07 备选约束：首页 snapshot 的「近期可报名」只带前 12 场时，计划点名、却不在其中（也不在目标
 * 匹配里）的活动由首页**只此一次**调用这里补查。鉴权与 `refreshHomeDashboardAction` 同一口径（live 模式、
 * 本人 canonical actor）；客户端给的 id 只用来筛选，读取范围仍是整份公开目录 + 本人报名。
 */
import { auth } from "../../../../auth";
import {
  resolveAuthenticatedApiActorFromSession,
  type AuthenticatedApiActor,
} from "../../../api/_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { resolveLiveDatabaseConnectionConfig } from "../../../../shared/storage/live-database-config";
import type { HomeEventPoolCandidate } from "../../../../features/agent/home-event-pool";
import {
  HOME_PLAN_EVENT_IDS_LIMIT,
  resolveHomePlanEventCandidates,
} from "./home-dashboard-route-service";

export type HomePlanEventsActionResult =
  | { state: "events"; items: HomeEventPoolCandidate[] }
  | { state: "invalid" }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

function validEventIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > HOME_PLAN_EVENT_IDS_LIMIT) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (!nonBlank(id) || id !== id.trim() || id.length > 200) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function validCanonicalActor(
  value: AuthenticatedApiActor | null,
  workspaceId: string,
): value is AuthenticatedApiActor & { id: string; workspaceId: string } {
  if (!value || typeof value !== "object") return false;
  if (!nonBlank(value.id) || !nonBlank(value.workspaceId) || value.workspaceId !== workspaceId) return false;
  const accountId = value.accountId;
  return accountId === undefined || (nonBlank(accountId) && accountId === value.id);
}

export async function resolveHomePlanEventsAction(eventIds: unknown): Promise<HomePlanEventsActionResult> {
  const ids = validEventIds(eventIds);
  if (!ids) return { state: "invalid" };

  let workspaceId: string;
  try {
    if (resolveFeatureMode() !== "live") return { state: "unavailable" };
    const config = resolveLiveDatabaseConnectionConfig() as { connectionString?: unknown; workspaceId?: unknown } | null;
    if (!config || !nonBlank(config.connectionString) || !nonBlank(config.workspaceId)) return { state: "unavailable" };
    workspaceId = config.workspaceId;
  } catch {
    return { state: "unavailable" };
  }

  let user: { email?: string | null; id?: unknown; name?: string | null } | null;
  try {
    const session = await auth();
    user = session?.user ? { email: session.user.email, id: session.user.id, name: session.user.name } : null;
  } catch {
    return { state: "unavailable" };
  }
  if (!user || !nonBlank(user.id)) return { state: "unauthenticated" };

  let actor: AuthenticatedApiActor | null;
  try {
    actor = await resolveAuthenticatedApiActorFromSession({ email: user.email, name: user.name, userId: user.id });
  } catch {
    return { state: "unavailable" };
  }
  if (!validCanonicalActor(actor, workspaceId)) return { state: "unavailable" };

  try {
    const items = await resolveHomePlanEventCandidates({
      actor: { accountId: actor.accountId ?? actor.id, id: actor.id, workspaceId: actor.workspaceId },
      eventIds: ids,
    });
    return { items, state: "events" };
  } catch {
    return { state: "unavailable" };
  }
}
