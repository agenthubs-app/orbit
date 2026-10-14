/**
 * R26 活动评估的 live 装配（events DESIGN §3.1、§5、§6）。Owner: 甲 (R26).
 * Used by: `handlers.ts`（live 路由）、维护任务（处理器兜底 / 回收 / 重算 / 海报清理）、计划 live 事实（我的外部评估一路）。
 *
 * - 与联系人同一个 PostgreSQL（`createConfiguredTransactionalPostgresRuntime`）；迁移「event-assessments-core」首次使用时以
 *   advisory lock 幂等执行（同 invite-codes），失败后下次再试。**生产库执行需要用户单独授权**。
 * - 付费 AI（E1 / E2）：`DEEPSEEK_API_KEY` 已配置**且** `ORBIT_EVENT_ASSESSMENT_AI=ai` 才打开（照计划 v2 `ORBIT_PLAN_V2_AI` 的先例；
 *   生产开启等合回授权，A1）。没开时按 G18 隐藏 URL / 海报入口（`availability().aiReadAvailable = false`），
 *   3 项手入力与库内活动的规则评分照常；URL 若有 JSON-LD 仍按规则出结果。
 * - 当前目标 = `PlanV2Service.summary().current`（首页 / Task 显示的那一个，DESIGN §3.5「多目标」）。
 */
import { PLAN_GOAL_TEMPLATES } from "../../../shared/compute/plan-templates";
import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../../shared/compute/event-score";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { AI_QUOTA_MONTHLY_LIMITS, EVENT_ASSESSMENT_DAILY_LIMIT } from "../../ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../ai-quota/ledger";
import { resolvePlanV2Service } from "../../plans/v2/service-factory";
import { createConfiguredEventCoreService } from "../core/runtime";
import { listRuntimeEventRosterEntries } from "../registration/runtime";
import { createConfiguredEventFactsProvider } from "./extract-provider";
import { emptyJudgeContext, type JudgeContext } from "./judge";
import { runEventAssessmentMigrations } from "./migrations";
import { createOrbitEventFactsReader, type OrbitEventReaders } from "./orbit-event-facts";
import { createPostgresEventAssessmentRepository, type EventAssessmentRepository } from "./repository";
import { createEventAssessmentService, type AssessmentPlanPort, type EventAssessmentService } from "./service";
import { fetchEventPage } from "./url-fetch";

export const EVENT_ASSESSMENT_AI_ENV = "ORBIT_EVENT_ASSESSMENT_AI";
const CONTACTS_LIMIT = 3000;

export function eventAssessmentAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[EVENT_ASSESSMENT_AI_ENV]?.trim() === "ai" && Boolean(env.DEEPSEEK_API_KEY?.trim());
}

type Query = (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

/** 我的联系人（id + 名字，既存のつながり用；有界）。 */
export async function listContactsForAssessment(query: Query, workspaceId: string, actorId: string) {
  const result = await query(
    `select record_id, coalesce(payload->>'displayName', payload->>'name', '') as name from orbit_records
     where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and lifecycle_state <> 'deleted' limit $3`,
    [workspaceId, actorId, CONTACTS_LIMIT],
  );
  return result.rows.map((row) => ({ id: String(row.record_id), name: String(row.name ?? "") })).filter((row) => row.name);
}

/** `eventPreferences` 集合（R18 做设置界面；现在只读、没有就缺省）。 */
export async function readPreferencesForAssessment(query: Query, workspaceId: string, actorId: string) {
  try {
    const row = (await query(
      `select payload from orbit_records where workspace_id = $1 and collection_name = 'eventPreferences' and user_id = $2 and lifecycle_state <> 'deleted' order by updated_at desc limit 1`,
      [workspaceId, actorId],
    )).rows[0]?.payload as Record<string, unknown> | undefined;
    if (!row) return { homeArea: null, preferences: DEFAULT_EVENT_SCORE_PREFERENCES };
    const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback);
    return {
      homeArea: typeof row.homeArea === "string" && row.homeArea.trim() ? row.homeArea.trim() : null,
      preferences: {
        maxFee: num(row.maxFee, DEFAULT_EVENT_SCORE_PREFERENCES.maxFee),
        maxTravelMinutes: num(row.maxTravelMinutes, DEFAULT_EVENT_SCORE_PREFERENCES.maxTravelMinutes),
        weekdayEvening: typeof row.weekdayEvening === "boolean" ? row.weekdayEvening : DEFAULT_EVENT_SCORE_PREFERENCES.weekdayEvening,
      },
    };
  } catch {
    return { homeArea: null, preferences: DEFAULT_EVENT_SCORE_PREFERENCES };
  }
}

/** 当前目标的判定上下文（live 计划；没有计划 → 空类型）。 */
export function createLivePlanPort(input: { query: Query; workspaceId: string }): AssessmentPlanPort {
  return {
    async context(actorId: string, language: PlanCopyLanguage): Promise<JudgeContext> {
      const [contacts, prefs] = await Promise.all([listContactsForAssessment(input.query, input.workspaceId, actorId), readPreferencesForAssessment(input.query, input.workspaceId, actorId)]);
      const resolved = resolvePlanV2Service({ actorId });
      const base = { ...emptyJudgeContext(language, contacts, prefs.homeArea), preferences: prefs.preferences };
      if (!resolved.success) return base;
      const summary = await resolved.service.summary().catch(() => null);
      const current = summary?.current;
      if (!current) return base;
      const [detail, remaining] = await Promise.all([resolved.service.detail(current.planId), resolved.service.planRemainingTargets()]);
      if (!detail) return base;
      const left = remaining.find((plan) => plan.planId === current.planId);
      const types = detail.content.personTypes.map((type) => {
        const r = left?.types.find((item) => item.key === type.key);
        return {
          allocation: type.allocation,
          emoji: type.emoji,
          key: type.key,
          metCount: r ? Math.max(0, r.targetCount - r.remaining) : 0,
          roleSituation: type.roleSituation,
          shortLabel: type.shortLabel,
          skipped: type.skipped || Boolean(r?.skipped),
          targetCount: type.targetCount,
        };
      });
      const template = (PLAN_GOAL_TEMPLATES as Record<string, { keywords: readonly string[] } | undefined>)[String(current.goalKind)];
      return { ...base, goalKeywords: template?.keywords ?? [], goalLabel: current.goal, planId: current.planId, types };
    },
    async addToPlan(actorId, { eventId, external, title }) {
      const resolved = resolvePlanV2Service({ actorId });
      if (!resolved.success) return null;
      const current = (await resolved.service.summary()).current;
      const planId = current?.planId ?? null;
      const added = external
        ? await resolved.service.addAssessmentToPlan({ assessmentId: eventId.replace(/^assessment:/, ""), planId, title })
        : await resolved.service.addEventToPlan({ eventId, planId, title });
      return added ? { itemId: added.itemId, planId: added.planId } : null;
    },
  };
}

/** 库内活动读取（live）：发布中的活动 + roster 公开字段。 */
export function createLiveOrbitEventReaders(): OrbitEventReaders {
  return {
    async event(eventId) {
      const core = createConfiguredEventCoreService();
      const event = core ? await core.getPublishedEvent(eventId).catch(() => null) : null;
      if (!event) return null;
      return { description: event.description, endsAt: event.endsAt, eventId: event.eventId, sourcePayload: event.sourcePayload, startsAt: event.startsAt, title: event.title, venue: event.venue };
    },
    async registrants(eventId) {
      // 复核：读失败不能当成「0 人」（之后读成功会误发「参加者リストが公開されました」）；记日志并抛出，由调用方跳过这一场。
      const entries = await listRuntimeEventRosterEntries({ eventId, fields: "attendees" }).catch((error: unknown) => {
        console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_assessment_roster_read_failed", eventId }));
        throw error;
      });
      return entries
        .filter((entry) => entry.status !== "cancelled" && entry.status !== "withdrawn")
        .map((entry) => ({ name: entry.participantProfile?.displayName ?? null, org: entry.participantProfile?.answers.industry ?? null, role: entry.participantProfile?.answers.positioning ?? null }));
    },
  };
}

export interface ConfiguredEventAssessmentRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  repository: EventAssessmentRepository;
  service: EventAssessmentService;
  /** 每次请求把 Next `after()` 放进来（处理器在响应之后立即跑一次）。 */
  setScheduler(schedule: (job: () => Promise<void>) => void): void;
  orbitEvents: ReturnType<typeof createOrbitEventFactsReader>;
  plan: AssessmentPlanPort;
}

const holder = globalThis as typeof globalThis & { __orbitEventAssessments?: { runtime: ConfiguredEventAssessmentRuntime; migrated: Promise<void> | null } };

/** live 装配（非 live 或库未配置 → null，接口 503）。 */
export function getConfiguredEventAssessmentRuntime(): ConfiguredEventAssessmentRuntime | null {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const cached = holder.__orbitEventAssessments;
  if (cached && cached.runtime.client === runtime.client && cached.runtime.workspaceId === runtime.workspaceId) return cached.runtime;
  const entry = { migrated: null as Promise<void> | null, runtime: null as unknown as ConfiguredEventAssessmentRuntime };
  const ready = () => {
    entry.migrated ??= runEventAssessmentMigrations(runtime.client).catch((error) => { entry.migrated = null; throw error; });
    return entry.migrated;
  };
  const query: Query = (sql, values) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  const repository = createPostgresEventAssessmentRepository({ client: runtime.client, ready, workspaceId: runtime.workspaceId });
  const ledger = createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId });
  const provider = createConfiguredEventFactsProvider();
  const plan = createLivePlanPort({ query, workspaceId: runtime.workspaceId });
  const orbitEvents = createOrbitEventFactsReader(createLiveOrbitEventReaders());
  let scheduler: (job: () => Promise<void>) => void = (job) => { void job().catch(() => undefined); };
  const service = createEventAssessmentService({
    ai: {
      available: () => eventAssessmentAiEnabled() && provider !== null,
      dailyLimit: EVENT_ASSESSMENT_DAILY_LIMIT,
      gate: ledger,
      monthlyLimit: AI_QUOTA_MONTHLY_LIMITS.event_assessment ?? 10,
      provider,
      usage: async (actorId, now) => ({ dailyUsed: (await ledger.readUsageToday(actorId, now)).eventAssessment, monthlyUsed: await ledger.countMonthly(actorId, "event_assessment", now) }),
    },
    convertHeic: async (bytes) => {
      const { default: convert } = await import("heic-convert");
      return Buffer.from(await convert({ buffer: bytes, format: "JPEG", quality: 0.85 }));
    },
    fetchPage: (url) => fetchEventPage(url),
    orbitEvents,
    plan,
    repository,
    schedule: (job) => scheduler(job),
  });
  entry.runtime = { client: runtime.client, orbitEvents, plan, repository, service, setScheduler: (schedule) => { scheduler = schedule; }, workspaceId: runtime.workspaceId };
  holder.__orbitEventAssessments = entry;
  return entry.runtime;
}
