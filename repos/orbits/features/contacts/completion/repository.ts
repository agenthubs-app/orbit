/**
 * R16 每天一问的读写（DESIGN add-and-invite §2.8、§3.3）。Owner: 甲 (R16). Used by: `service.ts`。
 *
 * - 问题存 `orbit_records` 的集合 `contactCompletionQuestions`（不建表）；记录 id 由「人 + 东京日」决定
 *   （`completionQuestionRecordId`），所以同一个人同一个东京日最多一条：并发生成时 `insertRecordIfAbsent` 只有一个成功。
 *   当天没有可问的人时也写一条 `status = 'none'` 的记录，当天不再重复读人脈。
 * - 出题事实按需读（R16 复核 M4：不再全量读人脈、不读备注全文）——`CompletionContactSource`：
 *   - `recentContacts`：只读最近约 30 天加入的人（东京日窗口再留 2 天余量，精确判断在纯函数里），备注只带两个布尔
 *     （有没有「出会い」行、有没有「LinkedIn:」行，PostgreSQL 里用正则算好再返回）；
 *   - `peers`：选定目标之后，只读与对方同公司（比较键相同）或同邮箱域名的人的公司与邮箱；
 *   - `events`：我的联系人里记着的活动，每场一行（最早录入时间与那一行的活动名），只返回目标加入时间前后的；
 *   - `addedSince`：某个时间之后有没有新加的人（「今天没有可问的人」之后又导入了人时用，复核 m6）。
 *   PostgreSQL 版本直接查 `orbit_records`（归属谓词与 `ownedByActor` 一致）；内存版本在 `LiveRecordStoreLike` 上过滤（测试用）。
 *   往来信号读候选人的 `contact_detail_states`（按 record id 精确读，只读候选人）。
 * - 内存与 PostgreSQL 都走 `LiveRecordStoreLike`（同一套代码，两种存储都有测试）。
 */
import { createHash } from "node:crypto";

import type { ContactCompletionQuestionKind } from "../../../shared/contract/contact-completion";
import { completionOrganizationKey, hasMeetingNote, type CompletionEventFact, type CompletionOption, type CompletionPeerFacts } from "../../../shared/compute/completion-question-rules";
import { emailDomain } from "../../../shared/compute/work-contact-likelihood";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { ownedByActor } from "../business-card-contact-match";

export const COMPLETION_QUESTION_COLLECTION = "contactCompletionQuestions";
/**
 * 出题时读的问题记录条数（新的在前）。能被问的人都是近 30 天加入的，关于他们的问题最多约 30 条（一天一条），留余量。
 */
export const COMPLETION_HISTORY_READ_LIMIT = 64;
/** 问题记录只读判断需要的字段（不读题面与选项）。 */
const QUESTION_HISTORY_FIELDS = ["id", "actorId", "askedOn", "status", "contactId", "kind", "skipCount"] as const;
/** 近期加入的人最多读这么多（新的在前；一个月导入几千人时只看最新的这些）。 */
export const COMPLETION_RECENT_READ_LIMIT = 500;
/** 同公司 / 同域名的人最多读这么多（只用来推选项）。 */
export const COMPLETION_PEER_READ_LIMIT = 200;
/** 目标前后的活动最多读这么多。 */
export const COMPLETION_EVENT_READ_LIMIT = 50;
/** 内存版本（测试）一次读本人联系人的上限。 */
const MEMORY_CONTACT_READ_LIMIT = 20_000;
/** SQL 预筛的时间余量（东京日与 UTC 的差、时间写法的差），精确判断在纯函数里。 */
const PREFILTER_MARGIN_DAYS = 2;

export type CompletionQuestionStatus = "open" | "answered" | "skipped" | "none";

/** 问题记录的 payload（答案的写入结果也记在这里）。 */
export interface CompletionQuestionRecord extends Record<string, unknown> {
  id: string;
  actorId: string;
  /** 东京日（YYYY-MM-DD）。 */
  askedOn: string;
  status: CompletionQuestionStatus;
  contactId?: string;
  kind?: ContactCompletionQuestionKind;
  question?: string;
  options?: CompletionOption[];
  skipCount?: number;
  contactName?: string;
  contactSubtitle?: string;
  sourceChip?: "meishi" | "linkedin" | "phone" | "manual" | "self";
  answer?: string;
  answeredAt?: string;
  answerKey?: string;
  /** 答案实际写到了哪里：event / note / organization / forgot。 */
  answerEffect?: string;
  densityAfter?: 1 | 2 | 3;
  /** `status = none`：上次确认「没有可问的人」的时间（之后新加了人就再出一次题，复核 m6）。 */
  checkedAt?: string;
  skippedAt?: string;
  skipKey?: string;
  createdAt: string;
  updatedAt: string;
}

export function completionQuestionRecordId(actorId: string, askedOn: string): string {
  return `contact-completion:${createHash("sha256").update(JSON.stringify([actorId, askedOn])).digest("hex").slice(0, 24)}`;
}

type Store = LiveRecordStoreLike<Record<string, unknown>>;

function asQuestion(record: LiveRecord<Record<string, unknown>> | null, actorId: string): CompletionQuestionRecord | null {
  if (!record || record.lifecycleState !== "active" || record.userId !== actorId) return null;
  const payload = record.payload as Partial<CompletionQuestionRecord>;
  return payload.actorId === actorId && typeof payload.id === "string" && typeof payload.askedOn === "string" ? (payload as CompletionQuestionRecord) : null;
}

export async function getCompletionQuestion(store: Store, workspaceId: string, actorId: string, recordId: string): Promise<CompletionQuestionRecord | null> {
  return asQuestion(await store.getRecord({ collectionName: COMPLETION_QUESTION_COLLECTION, recordId, userId: actorId, workspaceId }), actorId);
}

export async function listCompletionQuestions(store: Store, workspaceId: string, actorId: string): Promise<CompletionQuestionRecord[]> {
  const records = await store.listRecords({
    collectionName: COMPLETION_QUESTION_COLLECTION,
    lifecycleState: "active",
    limit: COMPLETION_HISTORY_READ_LIMIT,
    omitSearchText: true,
    payloadFields: QUESTION_HISTORY_FIELDS,
    userId: actorId,
    workspaceId,
  });
  return records.flatMap((record) => {
    const question = asQuestion(record, actorId);
    return question ? [question] : [];
  });
}

function toLiveRecord(workspaceId: string, question: CompletionQuestionRecord): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: COMPLETION_QUESTION_COLLECTION,
    createdAt: question.createdAt,
    evidenceIds: [],
    lifecycleState: "active",
    payload: question,
    recordId: question.id,
    sourceId: "contact-completion",
    sourceType: "system",
    targetId: question.contactId ?? null,
    targetType: question.contactId ? "contact" : null,
    updatedAt: question.updatedAt,
    userId: question.actorId,
    workspaceId,
  };
}

/** 新建当天的问题；已经有了（并发的另一个请求先写了）返回 null。 */
export async function insertCompletionQuestion(store: Store, workspaceId: string, question: CompletionQuestionRecord): Promise<boolean> {
  if (store.insertRecordIfAbsent) return (await store.insertRecordIfAbsent(toLiveRecord(workspaceId, question))) !== null;
  const existing = await store.getRecord({ collectionName: COMPLETION_QUESTION_COLLECTION, includeDeleted: true, recordId: question.id, workspaceId });
  if (existing) return false;
  await store.upsertRecord(toLiveRecord(workspaceId, question));
  return true;
}

/** 回答 / 跳过后保存（调用方持有本人的写锁）。 */
export async function saveCompletionQuestion(store: Store, workspaceId: string, question: CompletionQuestionRecord): Promise<void> {
  await store.upsertRecord(toLiveRecord(workspaceId, question));
}

/** 出题需要的联系人字段（内存版本的 payload 投影）。 */
const CONTACT_FIELDS = [
  "id", "accountId", "displayName", "organization", "role", "primaryEmail", "primaryPhone", "notes", "metEventId", "metEventTitle", "source", "createdAt",
] as const;

export interface CompletionContactRow {
  contactId: string;
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  /** 备注里有「出会い：…」一行（不带备注全文）。 */
  hasMeetingNote: boolean;
  /** 备注里有「LinkedIn: …」一行（LinkedIn 导入写的）。 */
  hasLinkedinNote: boolean;
  metEventId: string;
  metEventTitle: string;
  sourceType: string;
  sourceLabel: string;
  createdAt: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasLinkedinLine(notes: string): boolean {
  return /^LinkedIn:/mu.test(notes);
}

function toContactRow(record: LiveRecord<Record<string, unknown>>): CompletionContactRow {
  const payload = record.payload;
  const source = (typeof payload.source === "object" && payload.source !== null ? payload.source : {}) as Record<string, unknown>;
  const notes = typeof payload.notes === "string" ? payload.notes : "";
  return {
    contactId: record.recordId,
    createdAt: text(payload.createdAt) || record.createdAt,
    displayName: text(payload.displayName),
    email: text(payload.primaryEmail),
    hasLinkedinNote: hasLinkedinLine(notes),
    hasMeetingNote: hasMeetingNote(notes),
    metEventId: text(payload.metEventId),
    metEventTitle: text(payload.metEventTitle),
    organization: text(payload.organization),
    phone: text(payload.primaryPhone),
    role: text(payload.role),
    sourceLabel: text(source.label),
    sourceType: text(source.type) || text(record.sourceType),
  };
}

/** 一个联系人（活跃、归本人）；不在了返回 null。 */
export async function getCompletionContact(store: Store, workspaceId: string, actorId: string, contactId: string): Promise<CompletionContactRow | null> {
  const record = await store.getRecord({ collectionName: "contacts", recordId: contactId, userId: actorId, workspaceId });
  return record && record.lifecycleState === "active" && ownedByActor(record, actorId) ? toContactRow(record) : null;
}

/** 出题时按需读联系人（见文件头）。 */
export interface CompletionContactSource {
  /** `since` 之后（含余量）加入的人，新的在前，最多 `COMPLETION_RECENT_READ_LIMIT` 个。 */
  recentContacts(actorId: string, since: string): Promise<CompletionContactRow[]>;
  /** 与目标同公司（比较键）或同邮箱域名（任一）的其他人，最多 `COMPLETION_PEER_READ_LIMIT` 个。 */
  peers(actorId: string, input: { excludeContactId: string; organizationKey: string; domains: readonly string[] }): Promise<CompletionPeerFacts[]>;
  /** 我的联系人里记着的活动（每场取最早录入的那一行），只返回时间落在 [from, to] 的。 */
  events(actorId: string, input: { from: string; to: string }): Promise<CompletionEventFact[]>;
  /** `since` 之后有没有新加的人。 */
  addedSince(actorId: string, since: string): Promise<boolean>;
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

/** 内存 / 任意 `LiveRecordStoreLike` 上的实现（读本人全部联系人再过滤；只用于测试与内存存储）。 */
export function createStoreCompletionContactSource(store: Store, workspaceId: string): CompletionContactSource {
  async function all(actorId: string): Promise<{ row: CompletionContactRow; recordCreatedAt: string }[]> {
    const records = await store.listRecords({
      collectionName: "contacts",
      lifecycleState: "active",
      limit: MEMORY_CONTACT_READ_LIMIT,
      omitSearchText: true,
      payloadFields: CONTACT_FIELDS,
      userId: actorId,
      workspaceId,
    });
    return records.filter((record) => ownedByActor(record, actorId)).map((record) => ({ recordCreatedAt: record.createdAt, row: toContactRow(record) }));
  }
  return {
    async addedSince(actorId, since) {
      return (await all(actorId)).some(({ recordCreatedAt }) => Date.parse(recordCreatedAt) > Date.parse(since));
    },
    async events(actorId, { from, to }) {
      const byEvent = new Map<string, CompletionEventFact>();
      for (const { row } of await all(actorId)) {
        if (!row.metEventId || !row.metEventTitle) continue;
        const existing = byEvent.get(row.metEventId);
        if (!existing || row.createdAt < existing.at) byEvent.set(row.metEventId, { at: row.createdAt, eventId: row.metEventId, title: row.metEventTitle });
      }
      return [...byEvent.values()].filter((event) => event.at >= from && event.at <= to).slice(0, COMPLETION_EVENT_READ_LIMIT);
    },
    async peers(actorId, { domains, excludeContactId, organizationKey }) {
      const wanted = new Set(domains);
      return (await all(actorId))
        .filter(({ row }) => row.contactId !== excludeContactId
          && ((organizationKey.length > 0 && completionOrganizationKey(row.organization) === organizationKey) || (row.email ? wanted.has(emailDomain(row.email) ?? "") : false)))
        .slice(0, COMPLETION_PEER_READ_LIMIT)
        .map(({ row }) => ({ emails: row.email ? [row.email] : [], organization: row.organization }));
    },
    async recentContacts(actorId, since) {
      const floor = shiftDays(since, -PREFILTER_MARGIN_DAYS);
      return (await all(actorId))
        .filter(({ recordCreatedAt, row }) => row.createdAt >= floor.slice(0, 10) || recordCreatedAt >= floor)
        .sort((left, right) => (left.row.createdAt < right.row.createdAt ? 1 : left.row.createdAt > right.row.createdAt ? -1 : 0))
        .slice(0, COMPLETION_RECENT_READ_LIMIT)
        .map(({ row }) => row);
    },
  };
}

export interface CompletionSqlClient {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

/** 联系人归属谓词（与 `ownedByActor` 一致）：$1 = workspace、$2 = 本人。 */
const OWNED_CONTACTS = `c.workspace_id = $1
   and c.collection_name = 'contacts'
   and c.lifecycle_state = 'active'
   and c.user_id = $2
   and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))`;

export const COMPLETION_RECENT_CONTACTS_SQL = `select c.record_id,
       c.created_at,
       c.source_type,
       c.payload->>'createdAt' as payload_created_at,
       c.payload->>'displayName' as display_name,
       c.payload->>'organization' as organization,
       c.payload->>'role' as role,
       c.payload->>'primaryEmail' as email,
       c.payload->>'primaryPhone' as phone,
       c.payload->>'metEventId' as met_event_id,
       c.payload->>'metEventTitle' as met_event_title,
       case when jsonb_typeof(c.payload->'source') = 'object' then c.payload->'source'->>'type' end as payload_source_type,
       case when jsonb_typeof(c.payload->'source') = 'object' then c.payload->'source'->>'label' end as payload_source_label,
       coalesce(c.payload->>'notes', '') ~ '(^|\n)[[:space:]　]*出会い[[:space:]　]*[：:]' as has_meeting_note,
       coalesce(c.payload->>'notes', '') ~ '(^|\n)LinkedIn:' as has_linkedin_note
  from orbit_records c
 where ${OWNED_CONTACTS}
   and (c.created_at >= $3::timestamptz or coalesce(c.payload->>'createdAt', '') >= $4)
 order by coalesce(c.payload->>'createdAt', '') desc, c.created_at desc
 limit $5`;

export const COMPLETION_PEERS_SQL = `select c.payload->>'organization' as organization,
       c.payload->>'primaryEmail' as email
  from orbit_records c
 where ${OWNED_CONTACTS}
   and c.record_id <> $3
   and (($4 <> '' and btrim(lower(regexp_replace(normalize(coalesce(c.payload->>'organization', ''), NFKC), '[[:space:]]+', ' ', 'g'))) = $4)
        or lower(substring(btrim(coalesce(c.payload->>'primaryEmail', '')) from '@([^@]+)$')) = any($5::text[]))
 limit $6`;

export const COMPLETION_EVENTS_SQL = `select event_id, title, at
  from (select distinct on (event_id) event_id, title, at
          from (select btrim(c.payload->>'metEventId') as event_id,
                       btrim(c.payload->>'metEventTitle') as title,
                       coalesce(nullif(btrim(c.payload->>'createdAt'), ''), to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as at
                  from orbit_records c
                 where ${OWNED_CONTACTS}
                   and coalesce(btrim(c.payload->>'metEventId'), '') <> ''
                   and coalesce(btrim(c.payload->>'metEventTitle'), '') <> '') rows
         order by event_id, at asc) firsts
 where at >= $3 and at <= $4
 order by at desc
 limit $5`;

export const COMPLETION_ADDED_SINCE_SQL = `select 1 as found
  from orbit_records c
 where ${OWNED_CONTACTS}
   and c.created_at > $3::timestamptz
 limit 1`;

interface RecentRow {
  record_id: string;
  created_at: Date | string;
  source_type: string | null;
  payload_created_at: string | null;
  display_name: string | null;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  met_event_id: string | null;
  met_event_title: string | null;
  payload_source_type: string | null;
  payload_source_label: string | null;
  has_meeting_note: boolean | null;
  has_linkedin_note: boolean | null;
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** PostgreSQL 实现：只查需要的行与列（复核 M4）。 */
export function createPostgresCompletionContactSource(client: CompletionSqlClient, workspaceId: string): CompletionContactSource {
  return {
    async addedSince(actorId, since) {
      return (await client.query(COMPLETION_ADDED_SINCE_SQL, [workspaceId, actorId, since])).rows.length > 0;
    },
    async events(actorId, { from, to }) {
      const result = await client.query<{ event_id: string; title: string; at: string }>(COMPLETION_EVENTS_SQL, [workspaceId, actorId, from, to, COMPLETION_EVENT_READ_LIMIT]);
      return result.rows.map((row) => ({ at: row.at, eventId: row.event_id, title: row.title }));
    },
    async peers(actorId, { domains, excludeContactId, organizationKey }) {
      if (!organizationKey && !domains.length) return [];
      const result = await client.query<{ organization: string | null; email: string | null }>(COMPLETION_PEERS_SQL, [
        workspaceId, actorId, excludeContactId, organizationKey, [...domains], COMPLETION_PEER_READ_LIMIT,
      ]);
      return result.rows.map((row) => ({ emails: text(row.email) ? [text(row.email)] : [], organization: text(row.organization) }));
    },
    async recentContacts(actorId, since) {
      const floor = shiftDays(since, -PREFILTER_MARGIN_DAYS);
      const result = await client.query<RecentRow>(COMPLETION_RECENT_CONTACTS_SQL, [workspaceId, actorId, floor, floor.slice(0, 10), COMPLETION_RECENT_READ_LIMIT]);
      return result.rows.map((row) => ({
        contactId: row.record_id,
        createdAt: text(row.payload_created_at) || isoOf(row.created_at),
        displayName: text(row.display_name),
        email: text(row.email),
        hasLinkedinNote: row.has_linkedin_note === true,
        hasMeetingNote: row.has_meeting_note === true,
        metEventId: text(row.met_event_id),
        metEventTitle: text(row.met_event_title),
        organization: text(row.organization),
        phone: text(row.phone),
        role: text(row.role),
        sourceLabel: text(row.payload_source_label),
        sourceType: text(row.payload_source_type) || text(row.source_type),
      }));
    },
  };
}

function detailStateRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

/**
 * 有往来的人（D-10 的 ●●● 之一）：联系人详情里记过笔记或最近互动（`contact_detail_states`，与人物页同一份数据）。
 * 只按候选人的 record id 精确读。
 */
export async function listInteractedContactIds(store: Store, workspaceId: string, actorId: string, contactIds: readonly string[]): Promise<Set<string>> {
  if (!contactIds.length) return new Set();
  const byRecordId = new Map(contactIds.map((contactId) => [detailStateRecordId(actorId, contactId), contactId]));
  const records = await store.listRecords({
    collectionName: "contact_detail_states",
    limit: byRecordId.size,
    omitSearchText: true,
    payloadFields: ["actorId", "contactId", "notes", "lastInteraction"],
    recordIds: [...byRecordId.keys()],
    userId: actorId,
    workspaceId,
  });
  const interacted = new Set<string>();
  for (const record of records) {
    const contactId = byRecordId.get(record.recordId);
    if (!contactId || record.lifecycleState === "deleted" || record.payload.actorId !== actorId) continue;
    const notes = Array.isArray(record.payload.notes) ? record.payload.notes : [];
    if (notes.length > 0 || (typeof record.payload.lastInteraction === "object" && record.payload.lastInteraction !== null)) interacted.add(contactId);
  }
  return interacted;
}
