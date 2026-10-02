import { NextResponse } from "next/server";

import { draftReconnectEmail, type PlanEmailDraft } from "../../../../../features/plans/email-draft";
import { getConfiguredNetworkAnalysisRuntime } from "../../../../../features/network-analysis/runtime";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../../shared/errors/app-error";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import type { LiveRecordSqlClient } from "../../../../../shared/storage/postgres-live-record-store";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

/**
 * W0050（W50-4）：`POST /api/contacts/:id/reconnect-draft` —— 机会标签「待唤醒」的「起草邮件」。
 *
 * 只在点击时调用，返回可编辑的模板草稿 `{ draft: { subject, body, provider } }`：不保存、不发送、0 次模型调用。
 * 身份只在服务端解析；联系人按本人归属谓词读取（user_id = 本人、未删除、accountId 为空或本人），
 * 他人的、已删除的、不存在的一律 404（与不存在相同），不写库。
 */
export interface ReconnectDraftContact {
  displayName: string;
  organization: string | null;
  role: string | null;
}

export interface ReconnectDraftRouteDependencies {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  /** null = 联系人不存在或不属于本人；抛错 = 读取失败。 */
  readContact?: (actorId: string, contactId: string) => Promise<ReconnectDraftContact | null>;
  readGoal?: (actorId: string) => Promise<string | null>;
}

const OWNED_CONTACT_SQL = `/* contacts:reconnect-draft-contact */
  select payload->>'displayName' as display_name, payload->>'organization' as organization, payload->>'role' as role
  from orbit_records
  where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and lifecycle_state <> 'deleted'
    and (record_id = $3 or payload->>'id' = $3)
    and (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($2::text))
  order by (record_id = $3) desc
  limit 1`;

export async function readOwnedContact(
  input: { client: LiveRecordSqlClient; workspaceId: string },
  actorId: string,
  contactId: string,
): Promise<ReconnectDraftContact | null> {
  const result = await input.client.query<{ display_name: string | null; organization: string | null; role: string | null }>(OWNED_CONTACT_SQL, [input.workspaceId, actorId, contactId]);
  const row = result.rows[0];
  const name = typeof row?.display_name === "string" ? row.display_name.trim() : "";
  return row && name ? { displayName: name, organization: row.organization ?? null, role: row.role ?? null } : null;
}

async function defaultReadContact(actorId: string, contactId: string): Promise<ReconnectDraftContact | null> {
  const runtime = getConfiguredNetworkAnalysisRuntime();
  if (!runtime) throw new AppError("SERVICE_UNAVAILABLE", "Drafting requires the live contact database.");
  return readOwnedContact({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, contactId);
}

async function defaultReadGoal(actorId: string): Promise<string | null> {
  const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
  return result.success === false ? null : result.data.profile?.relationshipGoal ?? null;
}

type Context = { params: Promise<{ id: string }> };

export function createReconnectDraftRouteHandlers(dependencies: ReconnectDraftRouteDependencies = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const readContact = dependencies.readContact ?? defaultReadContact;
  const readGoal = dependencies.readGoal ?? defaultReadGoal;
  return {
    async POST(request: Request, context: Context): Promise<Response> {
      const mode = resolveFeatureMode();
      const headers = runtimeBoundaryHeaders(mode);
      const fail = (appError: AppError) => NextResponse.json(failure(appError), { headers, status: getHttpStatusForAppErrorCode(appError.code) });
      try {
        const actor = await resolveActor();
        if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
        const { id } = await context.params;
        const contactId = typeof id === "string" ? decodeURIComponent(id).trim() : "";
        if (!contactId || contactId.length > 200) throw new AppError("VALIDATION_ERROR", "A contact id is required.");
        const body = (await request.json().catch(() => ({}))) as { language?: unknown } | null;
        const language = body && typeof body === "object" && body.language === "en" ? "en" : "zh";
        const contact = await readContact(actor.id, contactId);
        if (!contact) throw new AppError("NOT_FOUND", "Contact not found.");
        const goal = await readGoal(actor.id).catch(() => null);
        const draft: PlanEmailDraft = draftReconnectEmail({ contactName: contact.displayName, goal, language, organization: contact.organization, role: contact.role });
        return NextResponse.json(success({ draft }), { headers });
      } catch (error) {
        return fail(toAppError(error));
      }
    },
  };
}
