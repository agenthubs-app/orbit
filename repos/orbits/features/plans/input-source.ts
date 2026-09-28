/**
 * 生成器的真实数据来源（W0008）：本人的已确认联系人 + 真实活动目录。
 *
 * - 联系人：`orbit_records` 的 contacts，归属谓词与 `progress.ts` 的已确认联系人计数、
 *   `reference-validator.ts` 的联系人校验一致（user_id 是本人，payload.accountId 为空或是本人，
 *   排除初始化中与已删除的）；只读生成需要的几个轻字段。最后互动取本人的
 *   `contact_detail_states.lastInteraction.occurredAt`。
 *   200 位规则的两条保留条件（近 90 天有互动／交换名片、与目标相关）**在 SQL 里先筛**，同时返回
 *   本人联系人总数：本人 ≤ 200 位时全部返回；超过时只返回满足条件的。保险上限
 *   `PLAN_INPUT_READ_LIMIT` 只作用在筛过的结果上（按最近活动倒序），所以老联系人只要近期有互动
 *   就不会被上限挤掉。`input-selector.ts` 用同样的规则再判一次（纯函数，便于测试）。
 * - 活动：canonical 活动目录里已发布、还没开始的活动（id 是 canonical event id，
 *   与引用校验器 `getPublishedEvent` 同一口径），按开始时间取前 `PLAN_INPUT_EVENT_LIMIT` 场。
 */
import { isIndustryIdCode, sanitizeIndustryPair } from "../../shared/domain/industries";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createConfiguredEventCoreService } from "../events/core/runtime";
import type { EventCoreService } from "../events/core/service";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import type { PlanInputContact, PlanInputEvent } from "./generator";
import { goalArchetype } from "./goal-signals";
import { PLAN_INPUT_CONTACT_LIMIT, PLAN_INPUT_RECENT_DAYS } from "./input-selector";

export const PLAN_INPUT_READ_LIMIT = 5000;
export const PLAN_INPUT_EVENT_LIMIT = 20;

export interface PlanContactQuery {
  /** 目标原文（含补充）：决定「与目标相关」的行业与职位关键词。 */
  goalText: string;
  now: Date;
}

export interface PlanContactRead {
  contacts: PlanInputContact[];
  /** 本人已确认联系人总数（筛选前）。 */
  total: number;
}

export interface PlanInputSource {
  listContacts(actorId: string, query: PlanContactQuery): Promise<PlanContactRead>;
  listEvents(now: Date): Promise<PlanInputEvent[]>;
}

/**
 * $1 workspace，$2 actor，$3 全部返回的人数上限（200），$4 近期起点（timestamptz），$5 近期起点（ISO 文本，
 * 与 occurredAt 文本比较），$6 与目标相关的一级行业（可空），$7 职位／公司关键词的 like 模式，$8 保险上限。
 * `counted left join own`：即使一条都没筛中也返回一行，带上总数。
 */
export const PLAN_INPUT_CONTACTS_SQL = `with own as materialized (
  select
    c.record_id,
    c.user_id,
    c.created_at,
    c.payload->>'displayName' as display_name,
    c.payload->>'organization' as organization,
    c.payload->>'role' as role,
    c.payload->>'primaryIndustryId' as primary_industry_id,
    c.payload->>'secondaryIndustryId' as secondary_industry_id,
    (select max(d.payload->'lastInteraction'->>'occurredAt')
       from orbit_records d
      where d.workspace_id = c.workspace_id
        and d.collection_name = 'contact_detail_states'
        and d.lifecycle_state <> 'deleted'
        and d.user_id = $2
        and d.payload->>'actorId' = $2
        and d.payload->>'contactId' = c.record_id
        and d.payload->'lastInteraction'->>'occurredAt' ~ '^\\d{4}-\\d{2}-\\d{2}T') as last_interaction_at
  from orbit_records c
  where c.workspace_id = $1
    and c.collection_name = 'contacts'
    and c.lifecycle_state <> 'deleted'
    and c.user_id = $2
    and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
    and jsonb_typeof(c.payload->'id') = 'string'
    and c.payload->>'lifecycleInitialization' is distinct from 'pending'
    and coalesce(trim(c.payload->>'displayName'), '') <> ''
), counted as (
  select count(*)::integer as total from own
)
select own.*, counted.total
from counted
left join own on (
  counted.total <= $3
  or own.created_at >= $4::timestamptz
  or own.last_interaction_at >= $5
  or ($6::text is not null and own.primary_industry_id = $6::text)
  or lower(coalesce(own.role, '') || ' ' || coalesce(own.organization, '')) like any($7::text[])
)
order by greatest(to_char(own.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), own.last_interaction_at) desc nulls last,
  own.record_id asc
limit $8`;

function likePattern(keyword: string): string {
  return `%${keyword.toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

interface ContactRow {
  record_id: string | null;
  user_id: string | null;
  created_at: Date | string | null;
  total: number | string;
  display_name: string | null;
  organization: string | null;
  role: string | null;
  primary_industry_id: string | null;
  secondary_industry_id: string | null;
  last_interaction_at: string | null;
}

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function createPostgresPlanContactReader(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): PlanInputSource["listContacts"] {
  return async (actorId, query) => {
    const id = actorId.trim();
    if (!id) throw new Error("PLAN_INPUT_ACTOR_REQUIRED");
    const archetype = goalArchetype(query.goalText);
    const recentSince = new Date(query.now.getTime() - PLAN_INPUT_RECENT_DAYS * 86_400_000);
    const result = await input.client.query<ContactRow>(PLAN_INPUT_CONTACTS_SQL, [
      input.workspaceId,
      id,
      PLAN_INPUT_CONTACT_LIMIT,
      recentSince.toISOString(),
      recentSince.toISOString(),
      archetype.primaryIndustryId,
      archetype.titleKeywords.map(likePattern),
      PLAN_INPUT_READ_LIMIT,
    ]);
    const total = Number(result.rows[0]?.total ?? 0);
    const contacts = result.rows.flatMap((row): PlanInputContact[] => {
      const displayName = text(row.display_name);
      const createdAt = iso(row.created_at);
      if (!row.record_id || !row.user_id || !displayName || !createdAt) return [];
      const industry = sanitizeIndustryPair(
        isIndustryIdCode(row.primary_industry_id) ? row.primary_industry_id : null,
        row.secondary_industry_id,
      );
      return [
        {
          createdAt,
          displayName,
          id: row.record_id,
          lastInteractionAt: iso(row.last_interaction_at),
          organization: text(row.organization),
          ownerId: row.user_id,
          primaryIndustryId: industry.primaryIndustryId,
          role: text(row.role),
          secondaryIndustryId: industry.secondaryIndustryId,
        },
      ];
    });
    return { contacts, total: Number.isFinite(total) ? total : contacts.length };
  };
}

export function createEventCorePlanEventReader(
  eventCore: Pick<EventCoreService, "listPublishedEvents"> | null,
): PlanInputSource["listEvents"] {
  return async (now) => {
    if (!eventCore) return [];
    const events = await eventCore.listPublishedEvents(now);
    return events
      .filter((event) => event.phase === "upcoming" && Date.parse(event.startsAt) > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.eventId.localeCompare(b.eventId))
      .slice(0, PLAN_INPUT_EVENT_LIMIT)
      .map((event) => ({ id: event.eventId, startsAt: event.startsAt, title: event.title, venue: event.venue }));
  };
}

/** 联系人存储未配置时返回 null（路由按服务不可用 fail closed）。 */
export function createConfiguredPlanInputSource(): PlanInputSource | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const readContacts = createPostgresPlanContactReader({ client: configured.client, workspaceId: configured.workspaceId });
  let eventCore: EventCoreService | null | undefined;
  return {
    listContacts: async (actorId, query) => {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
      return readContacts(actorId, query);
    },
    listEvents: async (now) => {
      eventCore ??= createConfiguredEventCoreService();
      return createEventCorePlanEventReader(eventCore)(now);
    },
  };
}
