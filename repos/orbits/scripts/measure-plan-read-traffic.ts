/**
 * W0017 SC-04／W0021 SC-04：改版新增读取路径的单次返回字节（本机实测）。
 *
 * W0021：同一数据集上把每条用户路径的「改前」（95e39adb 的实现，逐字复现）与「改后」各测一次，三列分开
 * （数据库返回字节／语句数、HTTP 响应体字节、每日次数），并按 1000 位活跃用户折算月出站；活动归属走完整的
 * `resolveEventAttribution`（含报名读取，与 `listRuntimeEventRegistrationsForUser` 同样的三路读取）；
 * 另测两个场景：窗口外多 100 场大字段活动、进展记录到 50 条。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库（非回环直接失败），在一个随机临时 schema 里建表、
 * 造一个测试账号（30 位联系人、1 份计划、5 场活动、两批各 5 张名片），测完删除 schema；不读写库里已有的数据，
 * 不调用任何 AI（匹配 worker 不配模型）。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：每条语句返回行的 JSON 字节之和（近似 Neon 出站，
 * 不含协议开销）。拦截 `pg.Client.prototype.query`，所以事务里的语句也算在内。
 *
 * 运行：ORBIT_EVENT_DATABASE_URL=postgres://…@localhost:5432/orbit_test npx tsx scripts/measure-plan-read-traffic.ts
 */
import { Client, type Pool } from "pg";

import { createEventCoreService } from "../features/events/core/service";
import { createPostgresEventStartWindowReader } from "../features/events/core/start-window";
import { createPostgresEventCoreRepository } from "../features/events/core/storage/postgres-repository";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import type { EventRegistration } from "../features/events/registration/contract";
import { createEventOperationsRegistrationWindowProvider } from "../features/events/registration/storage/event-operations-window-provider";
import { createEventRegistrationLiveRecordProvider } from "../features/events/registration/storage/live-record-provider";
import { attributionCardsFromItems, resolveEventAttribution, type EventAttributionSource } from "../features/plans/event-attribution";
import { createEventAttributionSource } from "../features/plans/event-attribution-runtime";
import { runEventOperationsMigrations } from "../features/events/event-operations/storage/migrations";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { runMaintenancePass, type MaintenanceTask } from "../features/operations/maintenance/pass";
import { createPlanEventAttendanceMaintenanceTask } from "../features/plans/event-attendance-reconcile";
import { createPlanEventRegistrationMaintenanceTask } from "../features/plans/event-registration-reconcile";
import { createPlanDailyRunGate, createPostgresPlanDailyRunStore } from "../features/plans/maintenance-daily-gate";
import { createPlanMatchMaintenanceTask } from "../features/plans/match-maintenance-task";
import { runDueMatchJobs } from "../features/plans/match-worker";
import { createPlanMatchingService } from "../features/plans/matching-service";
import { createPlanPhaseMaintenanceTask, phaseEnteredKey, phaseToEnter } from "../features/plans/phase-refinement";
import { createAllowListPlanReferenceValidator } from "../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../features/plans/repository";
import { createPlanService } from "../features/plans/service";
import { planTokyoDate } from "../features/plans/week";
import { createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";
import { planInput } from "../tests/support/plan-fixture";
import { ALICE, confirmItem, extractedBatch, withMatchingDatabase, WORKSPACE } from "../tests/support/plan-matching-harness";

interface Meter {
  statements: number;
  rows: number;
  bytes: number;
}

let active: Meter | null = null;

function rowBytes(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const row of rows) total += Buffer.byteLength(JSON.stringify(row) ?? "", "utf8");
  return total;
}

function record(result: unknown) {
  if (!active || !result || typeof result !== "object") return;
  const results = Array.isArray(result) ? result : [result];
  for (const entry of results) {
    const rows = (entry as { rows?: unknown }).rows;
    active.statements += 1;
    active.rows += Array.isArray(rows) ? rows.length : 0;
    active.bytes += rowBytes(rows);
  }
}

// 计量所有经过 pg 的语句（promise 与 callback 两种调用）。
const originalQuery = Client.prototype.query as (...args: unknown[]) => unknown;
(Client.prototype as unknown as { query: (...args: unknown[]) => unknown }).query = function patched(this: Client, ...args: unknown[]) {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    args[args.length - 1] = (error: unknown, result: unknown) => {
      if (!error) record(result);
      (last as (error: unknown, result: unknown) => void)(error, result);
    };
    return originalQuery.apply(this, args);
  }
  const returned = originalQuery.apply(this, args);
  if (returned && typeof (returned as Promise<unknown>).then === "function") {
    return (returned as Promise<unknown>).then((result) => {
      record(result);
      return result;
    });
  }
  return returned;
};

async function measure<T>(run: () => Promise<T>): Promise<{ meter: Meter; value: T }> {
  const meter: Meter = { bytes: 0, rows: 0, statements: 0 };
  active = meter;
  try {
    return { meter, value: await run() };
  } finally {
    active = null;
  }
}

const EVENT_IDS = ["event:tokyo-saas-night", "event:mixer", "event:founders", "event:ai-meetup", "event:vc-office-hours"];

/** 每位活跃用户每天的次数（沿用 W0017 的保守假设；计划 GET 的 4 次全部按带进展记录的计划页读取计）。 */
const DAILY = { attribution: 1, cards: 2, matches: 4, plan: 4, weekly: 1 };
/** W0017 在 95e39adb 上的实测（进入新阶段的那一次读取，不在每日预算内）。 */
const W0017_BASE = { enteringPlanRead: { bytes: 12_241, rows: 0, statements: 16 } };
const MONTH_USERS = 30 * 1000;

/** 95e39adb 的 `listPendingCandidates`（`select c.*` + event_linked），逐字复现用于「改前」。 */
const LEGACY_PENDING_CANDIDATES_SQL = `select c.*, exists (
     select 1
     from plan_items n
     join plan_items e on e.workspace_id = n.workspace_id and e.actor_id = n.actor_id and e.plan_id = n.plan_id
       and e.kind = 'event' and n.phase is not null and e.phase = n.phase
     join orbit_records r on r.workspace_id = c.workspace_id and r.collection_name = 'contacts'
       and r.record_id = c.contact_id and r.user_id = c.actor_id and r.lifecycle_state <> 'deleted'
     where n.workspace_id = c.workspace_id and n.actor_id = c.actor_id and n.id = c.need_item_id
       and e.linked_event_id = r.payload->>'metEventId'
   ) as event_linked
 from plan_match_candidates c
 where c.workspace_id = $1 and c.actor_id = $2 and c.status = 'pending'
   and ($3::text is null or exists (
     select 1 from plan_match_job_contacts jc
     where jc.workspace_id = c.workspace_id and jc.actor_id = c.actor_id
       and jc.batch_id = $3 and jc.contact_id = c.contact_id
   ))
 order by event_linked desc, c.created_at desc, case c.strength when 'strong' then 0 else 1 end, c.id
 limit $4`;

function httpBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify({ success: true, data }), "utf8");
}

interface Comparison {
  path: string;
  before: Meter;
  after: Meter;
  beforeHttp: number | null;
  afterHttp: number | null;
  daily: number;
  note?: string;
}
const comparisons: Comparison[] = [];
function compare(path: string, input: Omit<Comparison, "path">) {
  comparisons.push({ path, ...input });
}

/**
 * 与 `listRuntimeEventRegistrationsForUser` 同样的三路读取（投影报名、canonical 报名、每场活动的报名窗口），
 * 但连到这里的临时 schema（运行时单例在模块加载时按环境变量装配，不能指向临时 schema）。
 */
async function registrationReader(pool: import("pg").Pool) {
  const client = createEventOperationsPostgresClient({ connectionString: "postgres://measure@localhost/unused", pool: pool as never });
  const canonical = createPostgresEventOperationsRepository({ client, workspaceId: WORKSPACE });
  const windowProvider = createEventOperationsRegistrationWindowProvider({ client, workspaceId: WORKSPACE });
  const projected = createEventRegistrationLiveRecordProvider({
    store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: { query: async (text, values) => ({ rows: (await pool.query(text, values as unknown[])).rows }) } as never }),
    workspaceId: WORKSPACE,
  });
  const read = async (input: { eventIds: readonly string[]; userId: string }) => {
    const eventIds = [...new Set(input.eventIds.filter(Boolean))];
    if (eventIds.length === 0) return [];
    const [projectedRows, canonicalRows, enrollments] = await Promise.all([
      projected.listRegistrationsForUser(input.userId, eventIds),
      canonical.listCanonicalRegistrationsForUser(input.userId, eventIds),
      Promise.all(eventIds.map(async (eventId) => [eventId, await windowProvider.getEnrollment(eventId)] as const)),
    ]);
    const projectedById = new Map<string, EventRegistration>(projectedRows.map((row) => [row.eventId, row] as const));
    const canonicalById = new Map<string, EventRegistration>(canonicalRows.map((row: EventRegistration) => [row.eventId, row] as const));
    const enrollmentById = new Map(enrollments);
    return eventIds.flatMap((eventId) => {
      const enrollment = enrollmentById.get(eventId);
      const row = enrollment?.state === "legacy_unenrolled" || enrollment?.state === "legacy_importing"
        ? projectedById.get(eventId)
        : canonicalById.get(eventId);
      return row ? [{ eventId: row.eventId, status: row.status }] : [];
    });
  };
  return { label: "报名读取按运行时三路读取实测", read };
}
const NOW = "2026-10-26T01:00:00.000Z"; // 周一 10:00 JST，计划第 5 周（第 2 阶段）

/**
 * 写 orbit_records 的同步集合（contacts）和带 sync_revision 的活动表时，按 0108/0113 的约定在同一事务里
 * 先取 commit-order 锁（严格触发器下不取锁的写入会被拒绝）。只用于本脚本的临时 schema。
 */
async function lockedWrite(pool: Pool, text: string, values: unknown[] = []): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await acquireSyncCommitOrderLock(client);
    await client.query(text, values);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const results: Array<{ path: string; statements: number; rows: number; bytes: number; note: string }> = [];
  const push = (path: string, meter: Meter, note = "") => results.push({ ...meter, note, path });

  await withMatchingDatabase(async ({ ingest, matches, pool }) => {
    // ── 测试账号：30 位联系人（夹具已有 5 位 alice 的），1 份计划（含 5 场活动），5 场已发布活动 ──
    for (let index = 0; index < 25; index += 1) {
      const payload = {
        displayName: `联系人 ${index + 1}`,
        email: `person${index + 1}@example.test`,
        id: `contact:extra-${index + 1}`,
        notes: "在展会上交换过名片，关注企业 SaaS 采购与渠道合作，约了下个月再聊。",
        organization: `Example Corp ${index + 1}`,
        phone: "+81-3-0000-0000",
        primaryIndustryId: index < 5 ? "trade_logistics" : "technology_internet",
        role: index < 5 ? "渠道 BD 经理" : "事业开发部 部长",
        secondaryIndustryId: index < 5 ? null : "technology_internet.enterprise_software",
      };
      await lockedWrite(pool,
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id,
           lifecycle_state, payload, created_at, updated_at)
         values ($1, 'contacts', $2, $3, 'manual', 'traffic-measure', 'active', $4::jsonb, now(), now())`,
        [WORKSPACE, payload.id, ALICE, JSON.stringify(payload)],
      );
    }
    const plans = createPlanService({
      now: () => NOW,
      references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository: createPostgresPlanRepository({ pool }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    const base = planInput();
    await plans.createVersion(
      planInput({
        items: [
          ...(base.items ?? []),
          ...EVENT_IDS.slice(1).map((eventId, index) => ({
            kind: "event" as const,
            linkedEventId: eventId,
            phaseKey: index % 2 ? "p2" : "p3",
            title: `活动 ${index + 2}`,
          })),
        ],
      }),
    );
    await runEventOperationsMigrations(pool);
    for (const [index, eventId] of EVENT_IDS.entries()) {
      const startsAt = new Date(Date.parse("2026-10-20T09:00:00.000Z") + index * 86_400_000);
      await lockedWrite(pool,
        `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
           description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload)
         values ($1, $2, 'actor:organizer', now(), now(), $3, $4, $5, 'Shibuya, Tokyo', 'Asia/Tokyo', $6, $7, 'published', $8::jsonb)`,
        [
          WORKSPACE,
          eventId,
          `CODE${index}`,
          `活动 ${index + 1}`,
          "面向在日本拓展业务的创业者与企业开发负责人，分三轮交流。",
          startsAt,
          new Date(startsAt.getTime() + 3 * 3_600_000),
          JSON.stringify({ agenda: ["开场", "第一轮", "第二轮", "自由交流"], capacity: 80, language: "ja/en", organizer: "Orbit", tags: ["saas", "startup", "bd"] }),
        ],
      );
    }

    // W0021：一场刚开始不久的已发布活动（按数据库时钟），让活动归属真的圈出窗口内的活动并读报名状态。
    await lockedWrite(pool,
      `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
         description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload)
       values ($1, 'event:tonight', 'actor:organizer', now(), now(), 'CODE-TONIGHT', '今晚的交流会', $2, 'Shibuya, Tokyo',
         'Asia/Tokyo', now() - interval '2 hours', now() + interval '1 hour', 'published', $3::jsonb)`,
      [WORKSPACE, "面向在日本拓展业务的创业者与企业开发负责人，分三轮交流。", JSON.stringify({ capacity: 80, tags: ["saas"] })],
    );

    // 一批已确认的名片（产生匹配任务与候选），一批待确认的名片（首页「确认 N 张新名片」读它）。
    const confirmed = await extractedBatch(ingest, ALICE, 5);
    // 这 5 位（渠道 BD、物流贸易）会命中计划里「日本市场的渠道伙伴」这条需求，产生 5 条待确认候选。
    const contactIds = [1, 2, 3, 4, 5].map((index) => `contact:extra-${index}`);
    for (const [index, item] of confirmed.items.entries()) {
      await confirmItem(ingest, { actorId: ALICE, batchId: confirmed.batch.id, contactId: contactIds[index]!, itemId: item.id });
    }
    await pool.query(`update plan_match_jobs set not_before = now() - interval '1 second'`);
    await runDueMatchJobs({ aiMatcher: null, repository: matches }, { deadline: Date.now() + 30_000, limit: 5 });
    const pending = await extractedBatch(ingest, ALICE, 5);
    await lockedWrite(pool,
      `update orbit_records set payload = payload || '{"metEventId":"event:tokyo-saas-night"}'::jsonb where record_id = 'contact:saas'`,
    );

    // ── 用户路径（W0021：同一数据集上「改前」「改后」各测一次）──
    // 「改前」按 95e39adb 的实现逐字复现（仓储里仍保留的整行读取方法 + 下面内联的旧 SQL），
    // 「改后」走本 Sprint 的新入口。字节 = 数据库返回行的 JSON 字节（W0017 口径）；
    // HTTP = 响应体 `{"success":true,"data":…}` 的 UTF-8 字节。
    const scope = { actorId: ALICE, workspaceId: WORKSPACE };
    const planRepository = createPostgresPlanRepository({ pool });
    const legacyPlanRead = async () => {
      // 旧 GET_CURRENT：enterCurrentPhase 的只读判定（整行读计划 + 整行读幂等键记录），再 getCurrent。
      await planRepository.read(scope, async (reader) => {
        const plan = await reader.activePlan();
        const target = plan ? phaseToEnter(plan, new Date(NOW)) : null;
        if (plan && target) await reader.logByIdempotencyKey(phaseEnteredKey(plan.id, target.phase.key));
      });
      return plans.getCurrent();
    };
    // 进入新阶段的那一次读取（每个阶段每人一次，不计入每日预算）。
    const entering = await measure(() => plans.getCurrentView({ includeLog: true }));
    compare("计划：进入新阶段的第一次读取（每阶段一次）", { after: entering.meter, afterHttp: httpBytes(entering.value), before: W0017_BASE.enteringPlanRead, beforeHttp: null, daily: 0 });
    const planBefore = await measure(legacyPlanRead);
    const planPage = await measure(() => plans.getCurrentView({ includeLog: true }));
    const planHome = await measure(() => plans.getCurrentView({ includeLog: false }));
    compare("计划 GET：计划页 SSR／API 默认（含进展记录）", { after: planPage.meter, afterHttp: httpBytes(planPage.value), before: planBefore.meter, beforeHttp: httpBytes(planBefore.value), daily: DAILY.plan });
    compare("计划 GET：首页 ?view=home（不含进展记录）", { after: planHome.meter, afterHttp: httpBytes(planHome.value), before: planBefore.meter, beforeHttp: httpBytes(planBefore.value), daily: 0, note: "预算按保守口径把 4 次都记为计划页读取；本行只作对照" });
    const weekly = await measure(() => plans.weeklySummary());
    compare("周一小结（/api/agent/plans/weekly-summary）", { after: weekly.meter, afterHttp: httpBytes(weekly.value), before: weekly.meter, beforeHttp: httpBytes(weekly.value), daily: DAILY.weekly, note: "未改动" });
    const cardsBefore = await measure(() => ingest.getBatch({ actorId: ALICE, batchId: pending.batch.id }));
    const cardsAfter = await measure(() => ingest.getBatchCardStates({ actorId: ALICE, batchId: pending.batch.id }));
    compare("待确认名片（每个本机进行中批次；改后 ?view=cards）", { after: cardsAfter.meter, afterHttp: httpBytes(cardsAfter.value), before: cardsBefore.meter, beforeHttp: httpBytes(cardsBefore.value), daily: DAILY.cards });

    // 活动归属：批次 + 活动 + 报名读取（完整 resolveEventAttribution）。
    const eventCore = createPostgresEventCoreRepository({ client: pool as never, workspaceId: WORKSPACE });
    const legacyCore = createEventCoreService(eventCore);
    const registrations = await registrationReader(pool);
    const legacySource: EventAttributionSource = {
      async listEventsStartingBetween(fromIso, toIso) {
        const from = Date.parse(fromIso);
        const to = Date.parse(toIso);
        return (await legacyCore.listPublishedEvents())
          .filter((event) => Date.parse(event.startsAt) >= from && Date.parse(event.startsAt) < to)
          .map((event) => ({ eventId: event.eventId, startsAt: event.startsAt, title: event.title }));
      },
      async registeredEventIds({ eventIds, userId }) {
        const rows = await registrations.read({ eventIds, userId });
        return new Set(rows.filter((row) => row.status === "rsvped").map((row) => row.eventId));
      },
    };
    const windowSource = createEventAttributionSource({
      readRegistrations: registrations.read,
      window: createPostgresEventStartWindowReader({ client: pool as never, workspaceId: WORKSPACE }),
    });
    const attributionBefore = await measure(async () => {
      const detail = await ingest.getBatch({ actorId: ALICE, batchId: pending.batch.id });
      const result = await resolveEventAttribution(legacySource, { cards: attributionCardsFromItems(detail!.items), userId: ALICE });
      return { cards: result.byCard, events: result.events };
    });
    const attributionAfter = await measure(async () => {
      const detail = await ingest.getBatchCardStates({ actorId: ALICE, batchId: pending.batch.id });
      const result = await resolveEventAttribution(windowSource, { cards: attributionCardsFromItems(detail!.items), userId: ALICE });
      return { cards: result.byCard, events: result.events };
    });
    if (JSON.stringify(attributionBefore.value) !== JSON.stringify(attributionAfter.value)) throw new Error("attribution before/after differ");
    compare(`活动归属候选（批次 + 活动 + 报名读取；${registrations.label}）`, { after: attributionAfter.meter, afterHttp: httpBytes(attributionAfter.value), before: attributionBefore.meter, beforeHttp: httpBytes(attributionBefore.value), daily: DAILY.attribution });

    const legacyMatches = await measure(async () => {
      const [candidates] = await Promise.all([
        pool.query(LEGACY_PENDING_CANDIDATES_SQL, [WORKSPACE, ALICE, null, 100]),
        matches.readActiveNeeds(ALICE),
      ]);
      return matches.readContacts(ALICE, [...new Set(candidates.rows.map((row) => String(row.contact_id)))]);
    });
    const matching = createPlanMatchingService({
      planServiceFor: () => plans,
      repository: matches,
      worker: { aiMatcher: null, repository: matches },
    });
    const listed = await measure(() => matching.listPending({ actorId: ALICE }));
    compare(`匹配候选（GET /api/agent/plans/candidates，待确认 ${listed.value.candidates.length} 条）`, { after: listed.meter, afterHttp: httpBytes(listed.value), before: legacyMatches.meter, beforeHttp: httpBytes(listed.value), daily: DAILY.matches, note: "响应形状未变，HTTP 改前改后相同" });

    // ── 场景：窗口外多 100 场大字段活动（published／draft／archived／cancelled）──
    const states = ["published", "draft", "archived", "cancelled"] as const;
    for (let index = 0; index < 100; index += 1) {
      const startsAt = new Date(Date.parse("2026-06-01T01:00:00.000Z") + index * 86_400_000);
      const state = states[index % states.length]!;
      await lockedWrite(pool,
        `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, public_code, title,
           description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload, cancelled_at, archived_at)
         values ($1, $2, 'actor:organizer', now(), now(), $3, $4, $5, 'Shibuya, Tokyo', 'Asia/Tokyo', $6, $7, $8, $9::jsonb, $10, $11)`,
        [
          WORKSPACE, `event:noise-${index}`, `NOISE${index}`, `旧活动 ${index}`, "很长的活动说明。".repeat(60), startsAt,
          new Date(startsAt.getTime() + 3 * 3_600_000), state,
          JSON.stringify({ agenda: Array.from({ length: 20 }, (_, n) => `议程 ${n}`), capacity: 80, tags: ["noise"] }),
          state === "cancelled" ? new Date() : null, state === "archived" ? new Date() : null,
        ],
      );
    }
    const noisyBefore = await measure(async () => {
      const detail = await ingest.getBatch({ actorId: ALICE, batchId: pending.batch.id });
      return resolveEventAttribution(legacySource, { cards: attributionCardsFromItems(detail!.items), userId: ALICE });
    });
    const noisyAfter = await measure(async () => {
      const detail = await ingest.getBatchCardStates({ actorId: ALICE, batchId: pending.batch.id });
      return resolveEventAttribution(windowSource, { cards: attributionCardsFromItems(detail!.items), userId: ALICE });
    });
    compare("场景：活动归属，workspace 里多 100 场窗口外活动", { after: noisyAfter.meter, afterHttp: null, before: noisyBefore.meter, beforeHttp: null, daily: 0, note: `改后与上面的活动归属行字节${noisyAfter.meter.bytes === attributionAfter.meter.bytes ? "相同" : "不同"}` });

    // ── 场景：进展记录到 50 条（计划页每次读 50 条；首页不读）──
    for (let index = 0; index < 48; index += 1) {
      await plans.addManualLog({ body: `和联系人 ${index + 1} 聊了渠道合作，下周跟进报价。`, idempotencyKey: `measure-log-${index}` });
    }
    const fullLogBefore = await measure(legacyPlanRead);
    const fullLogPage = await measure(() => plans.getCurrentView({ includeLog: true }));
    const fullLogHome = await measure(() => plans.getCurrentView({ includeLog: false }));
    compare("场景：进展记录 50 条，计划页读取", { after: fullLogPage.meter, afterHttp: httpBytes(fullLogPage.value), before: fullLogBefore.meter, beforeHttp: httpBytes(fullLogBefore.value), daily: 0 });
    compare("场景：进展记录 50 条，首页读取", { after: fullLogHome.meter, afterHttp: httpBytes(fullLogHome.value), before: fullLogBefore.meter, beforeHttp: httpBytes(fullLogBefore.value), daily: 0 });

    // ── 4 个维护任务 ──
    const gate = createPlanDailyRunGate({
      resolveStore: () => createPostgresPlanDailyRunStore({ pool, workspaceId: WORKSPACE }),
      taskNames: ["plan-event-attendance", "plan-phase", "plan-event-registration"],
      tokyoDate: planTokyoDate,
    });
    const planServiceFor = () => plans;
    const tasks: Record<string, MaintenanceTask> = {
      "plan-match": createPlanMatchMaintenanceTask({ resolveWorker: () => ({ aiMatcher: null, repository: matches }) }),
      "plan-event-attendance": createPlanEventAttendanceMaintenanceTask({ gate, resolve: () => ({ planServiceFor, repository: matches }) }),
      "plan-phase": createPlanPhaseMaintenanceTask({
        gate,
        resolve: () => ({ listActorsEnteringPhase: (input) => matches.listActorsEnteringPhase(input), planServiceFor }),
        tokyoDate: planTokyoDate,
      }),
      "plan-event-registration": createPlanEventRegistrationMaintenanceTask({
        gate,
        resolve: () => ({
          listActiveEventItems: (input) => matches.listActiveEventItems(input),
          planServiceFor,
          readRegistrations: async () => [],
        }),
      }),
    };
    const at = new Date(NOW);
    for (const [name, task] of Object.entries(tasks)) {
      const run = await measure(() => runMaintenancePass({ log: () => undefined, now: () => at, tasks: [task] }));
      push(`维护任务 ${name}：当天第一次真正执行`, run.meter, JSON.stringify(run.value.tasks[0]?.summary ?? run.value.tasks[0]?.reason));
    }
    const later = new Date(at.getTime() + 600_000);
    const idle = await measure(() => runMaintenancePass({ log: () => undefined, now: () => later, tasks: Object.values(tasks) }));
    push("一轮 pass（当天已完成）：plan-match 空闲 + 3 个日任务", idle.meter, idle.value.tasks.map((task) => `${task.name}=${task.reason ?? task.status}`).join(" "));
    const matchIdle = await measure(() => runMaintenancePass({ log: () => undefined, now: () => later, tasks: [tasks["plan-match"]!] }));
    push("  └ 其中 plan-match 空闲（一条 due-claim）", matchIdle.meter);
    const explain = await pool.query(
      `explain select workspace_id, id from plan_match_jobs
        where workspace_id = $1 and not_before <= now() and attempt_count < 3
          and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
        order by not_before, created_at limit 5`,
      [WORKSPACE],
    );
    await pool.query("set enable_seqscan = off");
    const explainNoSeq = await pool.query(
      `explain select workspace_id, id from plan_match_jobs
        where workspace_id = $1 and not_before <= now() and attempt_count < 3
          and (status = 'pending' or (status = 'running' and lease_expires_at < now()))
        order by not_before, created_at limit 5`,
      [WORKSPACE],
    );
    console.log(JSON.stringify({
      explain: explain.rows.map((row) => row["QUERY PLAN"]),
      explainWithoutSeqscan: explainNoSeq.rows.map((row) => row["QUERY PLAN"]),
    }, null, 2));
  });

  console.log(JSON.stringify(results, null, 2));

  // ── W0021 对照表（Markdown）──
  const mb = (bytesPerDay: number) => (bytesPerDay * MONTH_USERS) / 1e6;
  const lines = [
    "| 路径 | 改前 DB 字节／语句 | 改后 DB 字节／语句 | 改前 HTTP | 改后 HTTP | 每日次数 | 改前 1000 人／月 | 改后 1000 人／月 | 说明 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  let beforeTotal = 0;
  let afterTotal = 0;
  for (const row of comparisons) {
    beforeTotal += row.before.bytes * row.daily;
    afterTotal += row.after.bytes * row.daily;
    lines.push(
      `| ${row.path} | ${row.before.bytes.toLocaleString("en-US")} / ${row.before.statements} | ${row.after.bytes.toLocaleString("en-US")} / ${row.after.statements} | ${row.beforeHttp?.toLocaleString("en-US") ?? "—"} | ${row.afterHttp?.toLocaleString("en-US") ?? "—"} | ${row.daily} | ${row.daily ? `${mb(row.before.bytes * row.daily).toFixed(0)} MB` : "—"} | ${row.daily ? `${mb(row.after.bytes * row.daily).toFixed(0)} MB` : "—"} | ${row.note ?? ""} |`,
    );
  }
  lines.push(`| 用户路径合计（每人每天 ${beforeTotal.toLocaleString("en-US")} B → ${afterTotal.toLocaleString("en-US")} B） | | | | | | ${mb(beforeTotal).toFixed(0)} MB | ${mb(afterTotal).toFixed(0)} MB | 目标 ≤ 1,000 MB |`);
  console.log(lines.join("\n"));
  console.log(JSON.stringify({ comparisons, perUserDay: { after: afterTotal, before: beforeTotal }, monthly1000MB: { after: mb(afterTotal), before: mb(beforeTotal) } }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
