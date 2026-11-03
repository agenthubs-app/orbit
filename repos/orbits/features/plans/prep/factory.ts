/**
 * R37a 准备卡服务的装配。仓储与 v2 服务共用（`resolvePlanV2Parts`）。AI 与计划生成流程同一开关：
 * live + `ORBIT_PLAN_V2_AI=ai` + `DEEPSEEK_API_KEY` + 账本 → DeepSeek；live 其他情况 → disabled（不产生演示内容）；mock 模式 → mock。
 */
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../../acquisition/deepseek-business-card-ocr-provider";
import { getConfiguredNetworkAnalysisRuntime } from "../../network-analysis/runtime";
import { createConfiguredContactFactStore } from "../../contacts/facts/store";
import { createProfileService } from "../../profile/service-factory";
import type { ModuleMode, ServiceResolution } from "../../../shared/services/module-mode";
import { bindDeepseekPlanChat } from "../ai-generator";
import { demoPlanEventFacts, livePlanEventFacts } from "../v2/event-facts";
import { PLAN_V2_AI_ENV } from "../v2/flow-factory";
import type { PlanPoolLike } from "../repository";
import { resolvePlanV2Parts } from "../v2/service-factory";
import { createDeepseekPlanPrepAi, createDisabledPlanPrepAi, createMockPlanPrepAi } from "./ai";
import { createPlanPrepService, type PlanPrepService } from "./service";
import type { PlanPrepAi, PlanPrepContactCard, PlanPrepContext, PlanPrepProfile } from "./types";

const PREP_MAX_OUTPUT_TOKENS = 2048;

export function configuredPlanPrepAi(env: Record<string, string | undefined> = process.env): PlanPrepAi {
  if ((env[PLAN_V2_AI_ENV] ?? "").trim().toLowerCase() !== "ai") return createDisabledPlanPrepAi();
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  const runtime = apiKey ? getConfiguredNetworkAnalysisRuntime() : null;
  if (!apiKey || !runtime) return createDisabledPlanPrepAi();
  const model = env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL?.trim() || DEFAULT_BUSINESS_CARD_TEXT_MODEL;
  return createDeepseekPlanPrepAi({ chat: bindDeepseekPlanChat({ apiKey, maxTokens: PREP_MAX_OUTPUT_TOKENS, model }), ledger: runtime.ledger, model });
}

async function profileOf(actorId: string, mode: string): Promise<PlanPrepProfile> {
  let result: Awaited<ReturnType<ReturnType<typeof createProfileService>["getProfile"]>> | null = null;
  try { result = await createProfileService(mode as never).getProfile({ actorId }); } catch { result = null; }
  const profile = result && result.success === true ? result.data.profile : null;
  const text = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);
  return {
    homeMarket: text(profile?.homeMarket),
    industry: text(profile?.industry),
    name: text(profile?.displayName) ?? "—",
    organization: text(profile?.organization),
    role: text(profile?.role),
    spokenLanguages: profile?.spokenLanguages ? [...profile.spokenLanguages] : [],
  };
}

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** live：联系人卡的系统字段（名片字段、添加日期、来源、关联活动、最后互动）。 */
function liveContext(pool: PlanPoolLike, workspaceId: string): PlanPrepContext {
  const facts = createConfiguredContactFactStore();
  return {
    async contacts(actorId, ids) {
      if (ids.length === 0) return [];
      const client = await pool.connect();
      let rows: Row[];
      try {
        rows = ((await client.query(
        `select c.record_id, c.payload->>'displayName' as name, c.payload->>'organization' as organization, c.payload->>'role' as role,
                c.payload->>'primaryIndustryLabel' as industry, c.created_at, c.payload->'source'->>'type' as source_type,
                coalesce(nullif(c.payload->>'metEventTitle', ''), c.payload->'source'->>'eventTitle') as source_event_title,
                (select max(d.payload->'lastInteraction'->>'occurredAt') from orbit_records d
                  where d.workspace_id = c.workspace_id and d.collection_name = 'contact_detail_states' and d.lifecycle_state <> 'deleted'
                    and d.user_id = $2 and d.payload->>'contactId' = c.record_id) as last_interaction_at
           from orbit_records c
          where c.workspace_id = $1 and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted' and c.user_id = $2
            and c.record_id = any($3::text[])`,
        [workspaceId, actorId, [...ids]],
        )).rows ?? []) as Row[];
      } finally {
        client.release();
      }
      return rows.map((row): PlanPrepContactCard => ({
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at),
        id: String(row.record_id),
        industry: text(row.industry),
        lastInteractionAt: text(row.last_interaction_at),
        lastInteractionLabel: null,
        name: text(row.name) ?? "—",
        organization: text(row.organization),
        role: text(row.role),
        sourceEventTitle: text(row.source_event_title),
        sourceLabel: row.source_type === "business_card_ocr" ? "card" : text(row.source_type),
      }));
    },
    async facts(actorId, contactId) {
      if (!facts) return [];
      return (await facts.list({ actorId, contactId })).map((fact) => ({ date: fact.memoDate, id: fact.id, memoId: fact.memoId, text: fact.text }));
    },
    profile: (actorId) => profileOf(actorId, "live"),
  };
}

/** mock 模式：联系人来自演示世界的投影，没有事实（卡片会提示「写一句当时聊了什么」）。 */
function mockContext(contacts: (ids: readonly string[]) => Promise<Array<{ id: string; name: string; organization: string | null; role: string | null; lastInteractionAt: string | null }>>): PlanPrepContext {
  return {
    async contacts(_actorId, ids) {
      return (await contacts(ids)).map((contact) => ({ createdAt: null, id: contact.id, industry: null, lastInteractionAt: contact.lastInteractionAt, lastInteractionLabel: null, name: contact.name, organization: contact.organization, role: contact.role, sourceEventTitle: null, sourceLabel: null }));
    },
    async facts() { return []; },
    profile: (actorId) => profileOf(actorId, "mock"),
  };
}

export function resolvePlanPrepService(input: { actorId: string; mode?: ModuleMode | string; now?: () => Date; ai?: PlanPrepAi }): ServiceResolution<PlanPrepService> {
  const parts = resolvePlanV2Parts(input);
  if (parts.success === false) return parts;
  const { pool, repository, scope } = parts.service;
  const live = Boolean(pool);
  return {
    mode: parts.mode,
    service: createPlanPrepService({
      ai: input.ai ?? (live ? configuredPlanPrepAi() : createMockPlanPrepAi()),
      context: live ? liveContext(pool as PlanPoolLike, scope.workspaceId) : mockContext((ids) => repository.read(scope, (reader) => reader.contactViews(ids))),
      events: live
        ? livePlanEventFacts({ actorId: input.actorId, sources: async () => (await import("../../events/assessment/plan-sources")).createLivePlanEventSources(input.actorId), workspaceId: scope.workspaceId })
        : async () => demoPlanEventFacts(),
      now: input.now,
      repository,
      scope,
    }),
    success: true,
  };
}

/** 备注写入、手动补事实之后：把这个联系人的准备卡标为「资料有更新」（失败不挡调用方）。 */
export async function markPlanPrepStale(input: { actorId: string; contactId: string; mode?: ModuleMode | string }): Promise<number> {
  try {
    const resolution = resolvePlanPrepService({ actorId: input.actorId, mode: input.mode });
    if (resolution.success === false) return 0;
    return await resolution.service.markStale(input.contactId);
  } catch (error) {
    console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_prep_mark_stale_failed" }));
    return 0;
  }
}
