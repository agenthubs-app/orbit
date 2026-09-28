/**
 * W0016 验收测试账号种子（只写本机开发库）。
 *
 *   node --import tsx scripts/seed-verify-accounts.ts                 # 造全部测试账号与场景（可重复执行）
 *   node --import tsx scripts/seed-verify-accounts.ts --reset verify-plan   # 只把一个账号重置到初始状态
 *   node --import tsx scripts/seed-verify-accounts.ts --summary       # 只读：各账号当前状态
 *   node --import tsx scripts/seed-verify-accounts.ts --fingerprint   # 只读：非 verify-* 行的指纹
 *   node --import tsx scripts/seed-verify-accounts.ts --assert-only   # 只做本机库断言（verify-server.sh 用）
 *
 * 边界：
 * - 开头三重断言：连接串 host 是 localhost/127.0.0.1、库名精确等于 orbit_newui_events_20260922、
 *   workspace 精确等于本机开发 workspace；任一不符即退出，不连库。
 * - 只增改 verify-* 账号的数据：账号 id 固定为 `user_verify_*`、邮箱 `verify-*@orbit.test`、活动 id
 *   `orbit-verify-*`。重置 = 删除 JSON 文本里带这些标记的行（全部 public 表），再按场景重新造。
 * - 每次写操作前后对「非 verify-* 行」做指纹（按表计数 + 内容哈希），不一致即以非零退出。
 * - 不调用任何识别／付费 AI：名片批次直接写成「已识别、待确认」，图片是本脚本合成的占位图。
 * - 不输出连接串、密码、cookie。
 */
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Client } from "pg";
import sharp from "sharp";

import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { resolveIngestDerivativeRootDir } from "../features/acquisition/business-card-ingest-v2/derivative-store";
import type { EventRegistration } from "../features/events/registration/contract";
import { eventRegistrationId } from "../features/events/registration/service";
import { createEventRegistrationLiveRecordProvider } from "../features/events/registration/storage/live-record-provider";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import type { NewPlanItemInput, PlanService } from "../features/plans/contract";
import { resolvePlanService } from "../features/plans/service-factory";
import { planTokyoDate, planWeekState } from "../features/plans/week";
import { buildAccountContactFixtures } from "../shared/mock/account-contact-fixtures";
import type { LiveRecordStoreLike } from "../shared/storage/live-record-store";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import {
  assertVerifyDatabaseTarget,
  VERIFY_EXPECTED_DATABASE_NAME,
  VERIFY_EXPECTED_WORKSPACE_ID,
} from "./lib/verify-database-target";

/* ── 账号与场景定义 ─────────────────────────────────────────────────── */

export const VERIFY_ACCOUNT_NAMES = [
  "verify-new",
  "verify-legacy",
  "verify-plan",
  "verify-expired",
  "verify-event",
] as const;
export type VerifyAccountName = (typeof VERIFY_ACCOUNT_NAMES)[number];
type AnyAccountName = VerifyAccountName | "verify-host";

interface AccountSpec {
  actorId: string;
  birthDate: string;
  /** 账号创建时间（与验收 server 的 ORBIT_GUIDE_DEMO_SINCE=2026-09-01 比较）。 */
  createdAt: string;
  displayName: string;
  /** 从联系人夹具里取哪几位（下标）；空 = 0 联系人。 */
  contactFixtureIndexes: readonly number[];
  email: string;
  /** 这个账号独占的活动 id（重置时一起删除重建）。 */
  eventIds: readonly string[];
  primaryIndustryId: "technology_internet" | "finance_investment" | "professional_services";
  relationshipGoal: string | null;
  secondaryIndustryId:
    | "technology_internet.enterprise_software"
    | "finance_investment.fintech"
    | "professional_services.startup_services";
}

const EVENT_TODAY_ID = "orbit-verify-event-today";
const EVENT_UPCOMING_ID = "orbit-verify-event-upcoming";
const HOST_ACTOR_ID = "user_verify_host";

const ACCOUNTS: Readonly<Record<AnyAccountName, AccountSpec>> = {
  "verify-host": {
    actorId: HOST_ACTOR_ID,
    birthDate: "1985-02-11",
    contactFixtureIndexes: [],
    createdAt: "2026-05-01T01:00:00.000Z",
    displayName: "验收·主办方",
    email: "verify-host@orbit.test",
    eventIds: [],
    primaryIndustryId: "professional_services",
    relationshipGoal: null,
    secondaryIndustryId: "professional_services.startup_services",
  },
  "verify-new": {
    actorId: "user_verify_new",
    birthDate: "1996-07-03",
    contactFixtureIndexes: [],
    // 晚于验收 server 的 ORBIT_GUIDE_DEMO_SINCE（2026-09-01）→ 不是老用户。固定值让重复执行结果一致。
    createdAt: "2026-09-20T01:00:00.000Z",
    displayName: "验收·新用户",
    email: "verify-new@orbit.test",
    eventIds: [],
    primaryIndustryId: "technology_internet",
    relationshipGoal: null,
    secondaryIndustryId: "technology_internet.enterprise_software",
  },
  "verify-legacy": {
    actorId: "user_verify_legacy",
    birthDate: "1988-11-20",
    contactFixtureIndexes: [0, 1, 2, 3],
    createdAt: "2026-06-01T01:00:00.000Z",
    displayName: "验收·老用户",
    email: "verify-legacy@orbit.test",
    eventIds: [],
    primaryIndustryId: "technology_internet",
    relationshipGoal: "三个月内认识 3 位做跨境支付的产品负责人，找到一个愿意试点的合作方。",
    secondaryIndustryId: "technology_internet.enterprise_software",
  },
  "verify-plan": {
    actorId: "user_verify_plan",
    birthDate: "1991-04-12",
    contactFixtureIndexes: [0, 1, 2, 3, 7],
    createdAt: "2026-03-01T01:00:00.000Z",
    displayName: "验收·计划中",
    email: "verify-plan@orbit.test",
    eventIds: [EVENT_UPCOMING_ID],
    primaryIndustryId: "technology_internet",
    relationshipGoal: "三个月内为企业软件新产品找到 2 位早期投资人和 3 家试点客户。",
    secondaryIndustryId: "technology_internet.enterprise_software",
  },
  "verify-expired": {
    actorId: "user_verify_expired",
    birthDate: "1983-09-30",
    contactFixtureIndexes: [0, 2, 4, 5],
    createdAt: "2025-06-01T01:00:00.000Z",
    displayName: "验收·计划到期",
    email: "verify-expired@orbit.test",
    eventIds: [],
    primaryIndustryId: "finance_investment",
    relationshipGoal: "一年内在东京建立金融科技圈的核心人脉，完成两次合作落地。",
    secondaryIndustryId: "finance_investment.fintech",
  },
  "verify-event": {
    actorId: "user_verify_event",
    birthDate: "1993-01-25",
    contactFixtureIndexes: [2, 3, 4, 7],
    createdAt: "2026-04-01T01:00:00.000Z",
    displayName: "验收·活动当天",
    email: "verify-event@orbit.test",
    eventIds: [EVENT_TODAY_ID],
    primaryIndustryId: "finance_investment",
    relationshipGoal: "三个月内在活动上认识 3 位金融科技方向的合作伙伴，推进一个联合方案。",
    secondaryIndustryId: "finance_investment.fintech",
  },
};

/** 所有 verify-* 行的标记（用于「非 verify-* 行」指纹）。 */
const GLOBAL_VERIFY_MARKER = "(user_verify_|verify-[a-z]+@orbit\\.test|orbit-verify-)";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function accountMarker(spec: AccountSpec): string {
  const parts = [spec.actorId, spec.email, ...spec.eventIds].map(escapeRegex);
  return `(${parts.join("|")})`;
}

/* ── 时间 ───────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

function tokyoDateOffset(now: Date, days: number): string {
  return planTokyoDate(new Date(now.getTime() + days * DAY_MS));
}

/** 东京某日某时（整点）→ ISO。 */
function tokyoAt(date: string, hour: number): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

/* ── 运行时 ─────────────────────────────────────────────────────────── */

interface Runtime {
  now: Date;
  sql: Client;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  closeStore: () => Promise<void>;
  operations: ReturnType<typeof createEventOperationsPostgresClient>;
  workspaceId: string;
}

async function listPublicTables(sql: Client): Promise<string[]> {
  const result = await sql.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/gu, '""')}"`;
}

export interface VerifyFingerprint {
  digest: string;
  tables: Record<string, { rows: number; hash: string }>;
  verifyRows: Record<string, number>;
}

/**
 * 非 verify-* 行：按表计数 + 内容哈希（逐行 md5 排序后再 md5）。另记每表 verify-* 行数。
 * 名片条目（bc_ingest_items）行里只有批次 id，没有账号标记：在页面上真实上传产生的批次 id 是随机的，
 * 所以条目按所属批次判定——批次属于 verify-* 账号，条目也算 verify-* 行（W0018：否则重置时级联删除
 * 这些条目会被误报为「非 verify-* 行变化」）。
 */
async function fingerprint(sql: Client): Promise<VerifyFingerprint> {
  const tables: VerifyFingerprint["tables"] = {};
  const verifyRows: VerifyFingerprint["verifyRows"] = {};
  for (const table of await listPublicTables(sql)) {
    const marked =
      table === "bc_ingest_items"
        ? `(row_to_json(t)::text ~ $1 or exists (
             select 1 from bc_ingest_batches b
              where b.workspace_id = t.workspace_id and b.id = t.batch_id and row_to_json(b)::text ~ $1))`
        : "row_to_json(t)::text ~ $1";
    const result = await sql.query<{ rows: string; hash: string | null; verify_rows: string }>(
      `select
         count(*) filter (where not marked)::text as rows,
         md5(coalesce(string_agg(row_hash, '' order by row_hash) filter (where not marked), '')) as hash,
         count(*) filter (where marked)::text as verify_rows
       from (
         select md5(row_to_json(t)::text) as row_hash, ${marked} as marked
         from ${quoteIdent(table)} t
       ) rows`,
      [GLOBAL_VERIFY_MARKER],
    );
    const row = result.rows[0]!;
    tables[table] = { hash: row.hash ?? "", rows: Number(row.rows) };
    if (Number(row.verify_rows) > 0) verifyRows[table] = Number(row.verify_rows);
  }
  const digest = createHash("sha256")
    .update(
      Object.entries(tables)
        .map(([table, value]) => `${table}:${value.rows}:${value.hash}`)
        .join("\n"),
    )
    .digest("hex");
  return { digest, tables, verifyRows };
}

function diffFingerprints(before: VerifyFingerprint, after: VerifyFingerprint): string[] {
  const names = new Set([...Object.keys(before.tables), ...Object.keys(after.tables)]);
  const changed: string[] = [];
  for (const name of names) {
    const a = before.tables[name];
    const b = after.tables[name];
    if (!a || !b || a.rows !== b.rows || a.hash !== b.hash) changed.push(name);
  }
  return changed.sort();
}

/* ── 清理 ───────────────────────────────────────────────────────────── */

const DERIVATIVE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/u;

/**
 * 删除一个账号的全部数据：所有 public 表里 JSON 文本匹配该账号标记的行。外键顺序未知，所以按表逐个在
 * savepoint 里删，被外键挡住的下一轮再删，直到删干净（最多 8 轮）；整个过程在一个事务里。
 */
async function purgeAccount(runtime: Runtime, spec: AccountSpec): Promise<Record<string, number>> {
  const marker = accountMarker(spec);
  const { sql } = runtime;
  const derivatives = await sql.query<{ key: string }>(
    `select i.derivative_object_key as key
       from bc_ingest_items i
       join bc_ingest_batches b on b.workspace_id = i.workspace_id and b.id = i.batch_id
      where i.derivative_object_key is not null
        and (row_to_json(b)::text ~ $1 or row_to_json(i)::text ~ $1)`,
    [marker],
  );
  const tables = await listPublicTables(sql);
  const deleted: Record<string, number> = {};
  await sql.query("begin");
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      let blocked = false;
      for (const table of tables) {
        await sql.query("savepoint verify_purge");
        try {
          const result = await sql.query(
            `delete from ${quoteIdent(table)} t where row_to_json(t)::text ~ $1`,
            [marker],
          );
          await sql.query("release savepoint verify_purge");
          if (result.rowCount) deleted[table] = (deleted[table] ?? 0) + result.rowCount;
        } catch (error) {
          await sql.query("rollback to savepoint verify_purge");
          if ((error as { code?: string }).code !== "23503") throw error;
          blocked = true;
        }
      }
      if (!blocked) break;
      if (pass === 7) throw new Error(`清理 ${spec.email} 时外键依赖无法解开。`);
    }
    await sql.query("commit");
  } catch (error) {
    await sql.query("rollback");
    throw error;
  }
  const root = resolve(process.cwd(), resolveIngestDerivativeRootDir());
  for (const { key } of derivatives.rows) {
    if (DERIVATIVE_KEY.test(key)) await rm(join(root, key), { force: true });
  }
  return deleted;
}

/* ── 账号 ───────────────────────────────────────────────────────────── */

async function ensureAccount(runtime: Runtime, spec: AccountSpec): Promise<void> {
  const { store, workspaceId } = runtime;
  const createdAt = spec.createdAt;
  const provider = createStorageAuthUserProvider({ store, workspaceId });
  const existing = await provider.getUserByEmail(spec.email);
  if (existing && existing.id !== spec.actorId) {
    throw new Error(`${spec.email} 已存在但 id 不是 ${spec.actorId}，拒绝覆盖。`);
  }
  const user = {
    createdAt: existing?.createdAt ?? createdAt,
    displayName: spec.displayName,
    email: spec.email,
    id: spec.actorId,
    passwordHash: null,
    provider: "credentials" as const,
    providerAccountId: null,
    updatedAt: existing?.updatedAt ?? createdAt,
  };
  if (!existing) await provider.saveUser(user);
  await createStorageAuthAccountProvisioningProvider({ store, workspaceId }).ensureAccountForUser({
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    provider: user.provider,
    updatedAt: user.updatedAt,
  });

  // 资料补齐到「引导已完成」（显示名、行业、生日），目标按场景填。
  const profileId = `profile:${spec.actorId}`;
  const profile = await store.getRecord({ collectionName: "profiles", recordId: profileId, workspaceId });
  if (!profile) throw new Error(`${spec.email} 的资料记录没有建出来。`);
  const publicProfile = {
    bio: "",
    industry: "",
    offering: [],
    primaryIndustryId: spec.primaryIndustryId,
    secondaryIndustryId: spec.secondaryIndustryId,
    seeking: [],
    topics: [],
  };
  await store.upsertRecord({
    ...profile,
    payload: {
      ...profile.payload,
      birthDate: spec.birthDate,
      displayName: spec.displayName,
      displayNameConfirmed: true,
      primaryIndustryId: spec.primaryIndustryId,
      publicProfile,
      secondaryIndustryId: spec.secondaryIndustryId,
      ...(spec.relationshipGoal ? { relationshipGoal: spec.relationshipGoal } : {}),
    },
    searchText: `${spec.displayName} ${spec.email}`,
  });
}

/** 已确认联系人：复用 `buildAccountContactFixtures`（与主测试账号同一套夹具），按下标取几位。 */
async function seedContacts(runtime: Runtime, spec: AccountSpec): Promise<string[]> {
  const { store, workspaceId } = runtime;
  const fixtures = buildAccountContactFixtures(spec.actorId);
  const ids: string[] = [];
  for (const index of spec.contactFixtureIndexes) {
    const entry = fixtures[index];
    if (!entry) throw new Error(`联系人夹具下标 ${index} 不存在。`);
    const { contact, connection, evidenceRecords, fixture } = entry;
    for (const evidence of evidenceRecords) {
      await store.upsertRecord({
        collectionName: "evidence",
        createdAt: evidence.occurredAt,
        evidenceIds: [evidence.id],
        lifecycleState: "active",
        occurredAt: evidence.occurredAt,
        payload: evidence as unknown as Record<string, unknown>,
        recordId: evidence.id,
        searchText: `${fixture.displayName} ${evidence.summary}`,
        sourceId: evidence.sourceId,
        sourceLabel: fixture.sourceLabel,
        sourceType: evidence.sourceType,
        updatedAt: evidence.occurredAt,
        userId: spec.actorId,
        workspaceId,
      });
    }
    await store.upsertRecord({
      collectionName: "contacts",
      createdAt: contact.createdAt,
      evidenceIds: [...contact.evidenceIds],
      lifecycleState: "active",
      occurredAt: contact.createdAt,
      payload: { ...(contact as unknown as Record<string, unknown>), accountId: spec.actorId },
      provider: "orbit-verify-seed",
      providerRecordId: contact.id,
      recordId: contact.id,
      searchText: [fixture.displayName, fixture.organization, fixture.role, fixture.industry].join(" "),
      sourceId: contact.source.id,
      sourceLabel: fixture.sourceLabel,
      sourceType: fixture.sourceType,
      targetId: contact.id,
      targetType: "contact",
      updatedAt: contact.updatedAt,
      userId: spec.actorId,
      workspaceId,
    });
    await store.upsertRecord({
      collectionName: "connections",
      createdAt: connection.createdAt,
      evidenceIds: [...connection.evidenceIds],
      lifecycleState: "active",
      occurredAt: connection.createdAt,
      payload: connection as unknown as Record<string, unknown>,
      provider: "orbit-verify-seed",
      providerRecordId: connection.id,
      recordId: connection.id,
      searchText: `${fixture.displayName} ${fixture.summary}`,
      sourceId: contact.source.id,
      sourceLabel: fixture.sourceLabel,
      sourceType: fixture.sourceType,
      targetId: connection.id,
      targetType: "connection",
      updatedAt: connection.updatedAt,
      userId: spec.actorId,
      workspaceId,
    });
    ids.push(contact.id);
  }
  return ids;
}

/* ── 活动（canonical 已发布 + 报名） ────────────────────────────────── */

interface VerifyEventSpec {
  description: string;
  endsAt: string;
  eventId: string;
  publicCode: string;
  startsAt: string;
  title: string;
  venue: string;
}

/**
 * 建一场 canonical 已发布活动（主办方是 verify-host）并让一个测试账号报名。写法与
 * `features/events/event-operations/seed.ts` 相同：活动行 → 配置（`saveConfiguration`）→ 报名影子记录
 * （`saveRegistration`）→ 激活 canonical 报名（`activateCanonicalRegistrations`）。
 */
async function seedEvent(
  runtime: Runtime,
  event: VerifyEventSpec,
  registrant: AccountSpec,
): Promise<EventRegistration> {
  const { sql, store, workspaceId } = runtime;
  const seededAt = runtime.now.toISOString();
  const evidenceId = `evidence:orbit-verify:${event.eventId}`;
  const sourcePayload = {
    sources: [
      {
        name: "orbit-verify-seed",
        payload: { evidenceIds: [evidenceId], synthetic: true },
      },
    ],
  };
  const contentHash = createHash("sha256")
    .update(JSON.stringify([event, HOST_ACTOR_ID]))
    .digest("hex");
  await sql.query("begin");
  try {
    await sql.query(
      `insert into event_ops_events (
         workspace_id, event_id, organizer_actor_id, lifecycle_state, revision, created_at, updated_at,
         registration_migration_state, public_code, title, description, venue, timezone,
         starts_at, ends_at, lifecycle_state_v2, source_payload, event_version
       ) values ($1, $2, $3, 'active', 1, $4, $4, 'legacy', $5, $6, $7, $8, 'Asia/Tokyo', $9, $10,
         'published', $11::jsonb, 1)`,
      [
        workspaceId, event.eventId, HOST_ACTOR_ID, seededAt, event.publicCode, event.title,
        event.description, event.venue, event.startsAt, event.endsAt, JSON.stringify(sourcePayload),
      ],
    );
    await sql.query(
      `insert into event_event_versions (
         workspace_id, event_id, event_version, public_code, title, description, venue, timezone,
         starts_at, ends_at, lifecycle_state_v2, source_payload, organizer_actor_id, content_hash, created_at
       ) values ($1, $2, 1, $3, $4, $5, $6, 'Asia/Tokyo', $7, $8, 'published', $9::jsonb, $10, $11, $12)`,
      [
        workspaceId, event.eventId, event.publicCode, event.title, event.description, event.venue,
        event.startsAt, event.endsAt, JSON.stringify(sourcePayload), HOST_ACTOR_ID, contentHash, seededAt,
      ],
    );
    for (const [aliasType, aliasValue] of [
      ["event_id", event.eventId],
      ["public_code", event.publicCode],
    ] as const) {
      await sql.query(
        `insert into event_aliases (workspace_id, normalized_alias, alias_value, alias_type, event_id, source_payload, created_at)
         values ($1, lower(btrim($2)), $2, $3, $4, $5::jsonb, $6)`,
        [workspaceId, aliasValue, aliasType, event.eventId, JSON.stringify({ seed: "orbit-verify" }), seededAt],
      );
    }
    await sql.query("commit");
  } catch (error) {
    await sql.query("rollback");
    throw error;
  }

  const repository = createPostgresEventOperationsRepository({
    client: runtime.operations,
    workspaceId,
  });
  await repository.saveConfiguration({
    checkInOpensAt: addMinutes(event.startsAt, -60),
    eventEndsAt: event.endsAt,
    eventId: event.eventId,
    eventStartsAt: event.startsAt,
    maxAttemptsPerTask: 1,
    organizerActorId: HOST_ACTOR_ID,
    profileEditDeadlineAt: event.startsAt,
    recommendationCount: 1,
    registrationCutoffAt: event.startsAt,
    resultsAvailableAt: event.startsAt,
    roundOneStartsAt: addMinutes(event.startsAt, 30),
    roundTwoStartsAt: addMinutes(event.startsAt, 120),
    shardSize: 4,
    tableSize: 2,
    updatedAt: seededAt,
  });

  const registeredAt = addMinutes(event.startsAt, -2 * 24 * 60);
  const participantProfileId = `event-participant-profile:${encodeURIComponent(event.eventId)}:${encodeURIComponent(registrant.actorId)}`;
  const registration: EventRegistration = {
    cancelledAt: null,
    eventId: event.eventId,
    id: eventRegistrationId(event.eventId, registrant.actorId),
    participantProfile: {
      answers: {
        targetAttendees: "金融科技、企业软件方向的创业者与投资人",
        valueOffered: "企业客户落地经验与试点资源",
      },
      createdAt: registeredAt,
      displayName: registrant.displayName,
      eventId: event.eventId,
      id: participantProfileId,
      updatedAt: registeredAt,
      userId: registrant.actorId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: registeredAt,
    userId: registrant.actorId,
  };
  const registrationProvider = createEventRegistrationLiveRecordProvider({
    now: () => seededAt,
    source: "orbit-verify-seed",
    store,
    workspaceId,
  });
  const saved = await registrationProvider.saveRegistration(registration);
  await repository.activateCanonicalRegistrations(event.eventId, [saved]);
  return saved;
}

/* ── 计划 ───────────────────────────────────────────────────────────── */

function planServiceFor(actorId: string): PlanService {
  const resolution = resolvePlanService({ actorId, mode: "live" });
  if (resolution.success === false) {
    throw new Error(`计划服务不可用：${resolution.error.message}`);
  }
  return resolution.service;
}

function itemId(snapshot: { items: readonly { id: string; title: string }[] }, title: string): string {
  const found = snapshot.items.find((item) => item.title === title);
  if (!found) throw new Error(`计划里找不到条目「${title}」。`);
  return found.id;
}

/** verify-plan：3 个月计划处于第 2 周；1 条已延后行动、已关联的人脉需求、1 个已报名活动。 */
async function seedPlanInProgress(runtime: Runtime, spec: AccountSpec, contactIds: string[], registration: EventRegistration, event: VerifyEventSpec) {
  const service = planServiceFor(spec.actorId);
  const items: NewPlanItemInput[] = [
    { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "给 3 位旧同事发近况更新，说明新产品方向" },
    { kind: "action", phaseKey: "p1", suggestedWeek: 2, title: "准备 30 秒自我介绍和一页产品说明" },
    { kind: "action", phaseKey: "p1", suggestedWeek: 2, title: "列出 10 家潜在试点客户" },
    {
      criteria: {
        description: "关注企业软件、愿意投种子轮的早期投资人",
        primaryIndustryId: "finance_investment",
        secondaryIndustryId: "finance_investment.venture_capital",
        titleKeywords: ["投资", "合伙人"],
      },
      kind: "network_need",
      phaseKey: "p1",
      title: "认识 2 位关注企业软件的早期投资人",
    },
    { kind: "info", phaseKey: "p1", title: "目标客户明年的采购预算周期" },
    {
      kind: "event",
      linkedEventId: EVENT_UPCOMING_ID,
      // 与生成器写法一致（mock-generator：标题即活动名，meta 带开始时间与地点），计划页才显示日期（W0018）。
      meta: { startsAt: event.startsAt, venue: event.venue },
      phaseKey: "p1",
      status: "recommended",
      suggestedWeek: 3,
      title: event.title,
    },
  ];
  const snapshot = await service.createVersion({
    basePlanId: null,
    goalSnapshot: spec.relationshipGoal ?? "",
    horizon: "quarter",
    items,
    phases: [
      { endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "打基础：梳理人脉与介绍材料" },
      { endWeek: 9, granularity: "week", key: "p2", startWeek: 5, title: "扩展：活动与引荐" },
      { endWeek: 13, granularity: "week", key: "p3", startWeek: 10, title: "收口：推进试点与投资沟通" },
    ],
    startsOn: tokyoDateOffset(runtime.now, -8),
  });
  await service.markEventRegistration({
    eventId: EVENT_UPCOMING_ID,
    registered: true,
    registrationVersion: registration.updatedAt,
  });
  await service.linkNeedContact({
    contactId: contactIds[0]!,
    contactName: "林玫",
    needItemId: itemId(snapshot, "认识 2 位关注企业软件的早期投资人"),
  });
}

/** verify-expired：一年期计划已过最后一周（第 55 周左右）→ 到期回顾。 */
async function seedExpiredPlan(runtime: Runtime, spec: AccountSpec, contactIds: string[]) {
  const service = planServiceFor(spec.actorId);
  const actions = [
    { phaseKey: "q1", suggestedWeek: 2, title: "整理现有金融科技圈联系人名单" },
    { phaseKey: "q1", suggestedWeek: 8, title: "每月参加一场金融科技主题活动" },
    { phaseKey: "q2", suggestedWeek: 18, title: "约 2 位支付公司产品负责人喝咖啡" },
    { phaseKey: "q3", suggestedWeek: 30, title: "与一家合作方完成联合方案初稿" },
    { phaseKey: "q4", suggestedWeek: 45, title: "复盘一年的合作落地情况" },
  ];
  const snapshot = await service.createVersion({
    basePlanId: null,
    goalSnapshot: spec.relationshipGoal ?? "",
    horizon: "year",
    items: [
      ...actions.map((action): NewPlanItemInput => ({ ...action, kind: "action" })),
      {
        criteria: {
          description: "支付、风控方向的产品或业务负责人",
          primaryIndustryId: "finance_investment",
          secondaryIndustryId: "finance_investment.fintech",
          titleKeywords: ["产品", "负责人"],
        },
        kind: "network_need",
        phaseKey: "q2",
        title: "认识 3 位支付公司的产品负责人",
      },
      { answer: "多数合作方在每年 4 月定预算。", kind: "info", phaseKey: "q1", title: "合作方的年度预算节奏" },
    ],
    phases: [
      { endWeek: 13, granularity: "quarter", key: "q1", startWeek: 1, title: "第一季度：盘点与起步" },
      { endWeek: 26, granularity: "quarter", key: "q2", startWeek: 14, title: "第二季度：扩展人脉" },
      { endWeek: 39, granularity: "quarter", key: "q3", startWeek: 27, title: "第三季度：推进合作" },
      { endWeek: 52, granularity: "quarter", key: "q4", startWeek: 40, title: "第四季度：落地与复盘" },
    ],
    startsOn: tokyoDateOffset(runtime.now, -380),
  });
  for (const title of actions.slice(0, 3).map((action) => action.title)) {
    await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: itemId(snapshot, title) });
  }
  await service.linkNeedContact({
    contactId: contactIds[0]!,
    contactName: "林玫",
    needItemId: itemId(snapshot, "认识 3 位支付公司的产品负责人"),
  });
}

/** verify-event：含今天这场已报名活动的计划 + 与名片行业对得上的人脉需求。 */
async function seedEventPlan(runtime: Runtime, spec: AccountSpec, registration: EventRegistration, event: VerifyEventSpec) {
  const service = planServiceFor(spec.actorId);
  await service.createVersion({
    basePlanId: null,
    goalSnapshot: spec.relationshipGoal ?? "",
    horizon: "quarter",
    items: [
      { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "活动前准备 3 个想问金融科技同行的问题" },
      { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "活动后 48 小时内给新认识的人发跟进消息" },
      {
        criteria: {
          description: "支付、结算方向的金融科技公司业务负责人",
          primaryIndustryId: "finance_investment",
          secondaryIndustryId: "finance_investment.fintech",
          titleKeywords: ["事業開発", "业务", "Business"],
        },
        kind: "network_need",
        phaseKey: "p1",
        title: "认识 3 位金融科技方向的合作伙伴",
      },
      {
        criteria: {
          description: "做 AI 数据产品、能一起做联合方案的人",
          primaryIndustryId: "technology_internet",
          secondaryIndustryId: "technology_internet.ai_data",
          titleKeywords: ["AI", "产品"],
        },
        kind: "network_need",
        phaseKey: "p2",
        title: "找到 1 位 AI 数据产品的合作者",
      },
      {
        kind: "event",
        linkedEventId: EVENT_TODAY_ID,
        meta: { startsAt: event.startsAt, venue: event.venue },
        phaseKey: "p1",
        status: "recommended",
        suggestedWeek: 1,
        title: event.title,
      },
    ],
    phases: [
      { endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "活动月：多认识人" },
      { endWeek: 9, granularity: "week", key: "p2", startWeek: 5, title: "跟进：把认识变成合作" },
      { endWeek: 13, granularity: "week", key: "p3", startWeek: 10, title: "收口：联合方案" },
    ],
    startsOn: tokyoDateOffset(runtime.now, -2),
  });
  await service.markEventRegistration({
    eventId: EVENT_TODAY_ID,
    registered: true,
    registrationVersion: registration.updatedAt,
  });
}

/* ── 名片批次（今天扫描、已识别、待确认） ─────────────────────────────── */

interface SyntheticCard {
  extraction: Record<string, unknown>;
  label: [string, string, string];
}

const SYNTHETIC_CARDS: readonly SyntheticCard[] = [
  {
    extraction: {
      addresses: [{ label: null, value: "東京都千代田区丸の内 1-1-1（合成数据）" }],
      certifications: [],
      contactPoints: [{ label: "Tel", type: "phone", value: "03-0000-0101" }],
      departments: ["事業開発部"],
      detectedLanguages: ["ja", "en"],
      emails: [{ label: null, value: "misaki.hayakawa@paybridge.example" }],
      fullName: "Misaki Hayakawa",
      nativeFullName: "早川 美咲",
      organization: "株式会社ペイブリッジ（合成）",
      primaryIndustryId: "finance_investment",
      romanizedFullName: "Misaki Hayakawa",
      secondaryIndustryId: "finance_investment.fintech",
      title: "事業開発マネージャー",
      website: null,
    },
    label: ["Misaki Hayakawa", "PayBridge (synthetic)", "Business Development Manager"],
  },
  {
    extraction: {
      addresses: [{ label: null, value: "上海市徐汇区示例路 88 号（合成数据）" }],
      certifications: [],
      contactPoints: [{ label: "Mobile", type: "mobile", value: "+86 100 0000 0202" }],
      departments: [],
      detectedLanguages: ["zh", "en"],
      emails: [{ label: null, value: "zihan.wang@lingxi-data.example" }],
      fullName: "王子涵",
      nativeFullName: "王子涵",
      organization: "灵析数据科技（合成）",
      primaryIndustryId: "technology_internet",
      romanizedFullName: "Wang Zihan",
      secondaryIndustryId: "technology_internet.ai_data",
      title: "AI 产品经理",
      website: null,
    },
    label: ["Wang Zihan", "Lingxi Data (synthetic)", "AI Product Manager"],
  },
  {
    extraction: {
      addresses: [{ label: null, value: "大阪府大阪市北区梅田 2-2-2（合成数据）" }],
      certifications: [],
      contactPoints: [{ label: "Tel", type: "phone", value: "06-0000-0303" }],
      departments: ["営業部"],
      detectedLanguages: ["ja", "en"],
      emails: [{ label: null, value: "k.morita@morita-robotics.example" }],
      fullName: "Kenji Morita",
      nativeFullName: "森田 健二",
      organization: "モリタロボティクス株式会社（合成）",
      primaryIndustryId: "manufacturing_supply_chain",
      romanizedFullName: "Kenji Morita",
      secondaryIndustryId: "manufacturing_supply_chain.robotics",
      title: "営業部長",
      website: null,
    },
    label: ["Kenji Morita", "Morita Robotics (synthetic)", "Sales Director"],
  },
];

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/gu, (char) => `&#${char.charCodeAt(0)};`);
}

async function cardImage(label: SyntheticCard["label"]): Promise<Buffer> {
  const [name, organization, title] = label.map(escapeXml);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
  <rect width="1200" height="700" fill="#f7f4ee"/>
  <rect x="40" y="40" width="1120" height="620" fill="none" stroke="#1f2937" stroke-width="4"/>
  <text x="90" y="250" font-family="Helvetica, Arial, sans-serif" font-size="72" fill="#111827">${name}</text>
  <text x="90" y="340" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#374151">${title}</text>
  <text x="90" y="420" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#374151">${organization}</text>
  <text x="90" y="600" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#9ca3af">SYNTHETIC CARD · ORBIT VERIFY SEED</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function seedCardBatch(runtime: Runtime, spec: AccountSpec): Promise<void> {
  const { sql, workspaceId } = runtime;
  const createdAt = runtime.now.toISOString();
  const batchId = "bcb2:orbit-verify-event-batch";
  const root = resolve(process.cwd(), resolveIngestDerivativeRootDir());
  await mkdir(root, { recursive: true });
  const images = await Promise.all(SYNTHETIC_CARDS.map((card) => cardImage(card.label)));
  const digests = images.map((bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  await sql.query("begin");
  try {
    await sql.query(
      `insert into bc_ingest_batches (
         workspace_id, id, actor_id, status, expected_items, version, review_generation, idempotency_key,
         manifest_fingerprint, ingest_version, created_at, updated_at, finalized_at, expires_at
       ) values ($1, $2, $3, 'ready_for_review', $4, 1, 0, $5, $6, 'v2', $7, $7, $7, $8)`,
      [
        workspaceId, batchId, spec.actorId, SYNTHETIC_CARDS.length, "orbit-verify-event-batch",
        createHash("sha256").update(digests.join("|")).digest("hex"), createdAt,
        new Date(runtime.now.getTime() + 7 * DAY_MS).toISOString(),
      ],
    );
    for (const [index, card] of SYNTHETIC_CARDS.entries()) {
      const seq = index + 1;
      const objectKey = `${deterministicUuid(`orbit-verify-event-card-${seq}`)}.jpg`;
      const bytes = images[index]!;
      await writeFile(join(root, objectKey), bytes);
      await sql.query(
        `insert into bc_ingest_items (
           workspace_id, id, batch_id, seq, status, version, source_file_name, raw_size, raw_mime_type,
           client_digest, image_digest, derivative_object_key, derivative_size, extraction,
           extraction_schema_version, review_issues, attempt_count, created_at, updated_at,
           card_id, card_side, card_identity_explicit
         ) values ($1, $2, $3, $4, 'extracted', 1, $5, $6, 'image/jpeg', $7, $7, $8, $6, $9::jsonb,
           2, '[]'::jsonb, 1, $10, $10, $11, 'front', true)`,
        [
          workspaceId, `bci2:orbit-verify-event-card-${seq}`, batchId, seq, `orbit-verify-card-${seq}.jpg`,
          bytes.length, digests[index], objectKey, JSON.stringify(card.extraction), createdAt,
          `card:orbit-verify-event-${seq}`,
        ],
      );
    }
    await sql.query("commit");
  } catch (error) {
    await sql.query("rollback");
    throw error;
  }
}

/* ── 场景 ───────────────────────────────────────────────────────────── */

async function seedAccount(runtime: Runtime, name: VerifyAccountName): Promise<void> {
  const spec = ACCOUNTS[name];
  await ensureAccount(runtime, spec);
  const contactIds = await seedContacts(runtime, spec);
  const today = planTokyoDate(runtime.now);
  switch (name) {
    case "verify-new":
    case "verify-legacy":
      return;
    case "verify-plan": {
      const eventDay = tokyoDateOffset(runtime.now, 10);
      const event: VerifyEventSpec = {
        description: "验收用合成活动：企业软件创业者与投资人的小型交流会。不是真实活动。",
        endsAt: tokyoAt(eventDay, 22),
        eventId: EVENT_UPCOMING_ID,
        publicCode: "ORBIT-VERIFY-UPCOMING",
        startsAt: tokyoAt(eventDay, 19),
        title: "验收用：企业软件创业者交流会",
        venue: "东京·涩谷（合成会场）",
      };
      const registration = await seedEvent(runtime, event, spec);
      await seedPlanInProgress(runtime, spec, contactIds, registration, event);
      return;
    }
    case "verify-expired":
      await seedExpiredPlan(runtime, spec, contactIds);
      return;
    case "verify-event": {
      const event: VerifyEventSpec = {
        description: "验收用合成活动：金融科技创业者之夜。不是真实活动。",
        endsAt: tokyoAt(tokyoDateOffset(runtime.now, 1), 0),
        eventId: EVENT_TODAY_ID,
        publicCode: "ORBIT-VERIFY-TODAY",
        startsAt: tokyoAt(today, 18),
        title: "验收用：金融科技创业者之夜",
        venue: "东京·丸之内（合成会场）",
      };
      const registration = await seedEvent(runtime, event, spec);
      await seedEventPlan(runtime, spec, registration, event);
      await seedCardBatch(runtime, spec);
      return;
    }
  }
}

/* ── 状态摘要（只读） ───────────────────────────────────────────────── */

async function summarize(runtime: Runtime, name: AnyAccountName) {
  const { sql, workspaceId } = runtime;
  const spec = ACCOUNTS[name];
  const one = async <T extends Record<string, unknown>>(text: string, values: unknown[]) =>
    (await sql.query<T>(text, values)).rows[0];
  const account = await one<{ created_at: string }>(
    `select payload->>'createdAt' as created_at from orbit_records
      where workspace_id = $1 and collection_name = 'accounts' and record_id = $2 and lifecycle_state = 'active'`,
    [workspaceId, spec.actorId],
  );
  const contacts = await one<{ total: string }>(
    `select count(*)::text as total from orbit_records
      where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and lifecycle_state <> 'deleted'`,
    [workspaceId, spec.actorId],
  );
  const goal = await one<{ goal: string | null }>(
    `select payload->>'relationshipGoal' as goal from orbit_records
      where workspace_id = $1 and collection_name = 'profiles' and record_id = $2`,
    [workspaceId, `profile:${spec.actorId}`],
  );
  const guide = await one<{ payload: Record<string, unknown> }>(
    `select payload from orbit_records where workspace_id = $1 and collection_name = 'guideState' and user_id = $2`,
    [`${workspaceId}:guide-actor:${spec.actorId}`, spec.actorId],
  );
  const plans = (
    await sql.query<{ horizon: string; phases: { endWeek: number; startWeek: number }[]; starts_on: string; status: string; items: string }>(
      `select p.horizon, p.phases, to_char(p.starts_on, 'YYYY-MM-DD') as starts_on, p.status,
              (select count(*)::text from plan_items i where i.workspace_id = p.workspace_id and i.plan_id = p.id) as items
         from plans p where p.workspace_id = $1 and p.actor_id = $2 order by p.version`,
      [workspaceId, spec.actorId],
    )
  ).rows.map((plan) => {
    const week = planWeekState({ phases: plan.phases, startsOn: plan.starts_on }, runtime.now);
    return {
      currentWeek: week.currentWeek,
      ended: week.ended,
      horizon: plan.horizon,
      items: Number(plan.items),
      startsOn: plan.starts_on,
      status: plan.status,
      totalWeeks: week.totalWeeks,
    };
  });
  const registrations = (
    await sql.query<{ event_id: string; status: string; starts_at: string }>(
      `select h.event_id, h.status, e.starts_at::text as starts_at
         from event_ops_membership_heads h
         join event_ops_events e on e.workspace_id = h.workspace_id and e.event_id = h.event_id
        where h.workspace_id = $1 and h.actor_id = $2 order by h.event_id`,
      [workspaceId, spec.actorId],
    )
  ).rows;
  const batches = (
    await sql.query<{ id: string; status: string; items: string; created_at: string }>(
      `select b.id, b.status, b.created_at::text as created_at,
              (select count(*)::text from bc_ingest_items i where i.workspace_id = b.workspace_id and i.batch_id = b.id) as items
         from bc_ingest_batches b where b.workspace_id = $1 and b.actor_id = $2 order by b.id`,
      [workspaceId, spec.actorId],
    )
  ).rows;
  return {
    account: name,
    accountCreatedAt: account?.created_at ?? null,
    contacts: Number(contacts?.total ?? 0),
    email: spec.email,
    goal: goal?.goal ?? null,
    guideState: guide ? { grandfathered: guide.payload.grandfathered ?? null } : null,
    plans,
    registrations,
    batches,
  };
}

/* ── 入口 ───────────────────────────────────────────────────────────── */

type Command =
  | { kind: "assert" }
  | { kind: "fingerprint" }
  | { kind: "summary" }
  | { kind: "seed" }
  | { kind: "reset"; account: VerifyAccountName };

function parseCommand(args: readonly string[]): Command {
  if (args.includes("--assert-only")) return { kind: "assert" };
  if (args.includes("--fingerprint")) return { kind: "fingerprint" };
  if (args.includes("--summary")) return { kind: "summary" };
  const resetIndex = args.indexOf("--reset");
  if (resetIndex >= 0) {
    const account = args[resetIndex + 1];
    if (!VERIFY_ACCOUNT_NAMES.includes(account as VerifyAccountName)) {
      throw new Error(`--reset 需要账号名：${VERIFY_ACCOUNT_NAMES.join(" / ")}`);
    }
    return { account: account as VerifyAccountName, kind: "reset" };
  }
  const unknown = args.filter((arg) => arg !== "seed");
  if (unknown.length > 0) throw new Error(`未知参数：${unknown.join(" ")}`);
  return { kind: "seed" };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const command = parseCommand(process.argv.slice(2));
  const target = assertVerifyDatabaseTarget();
  if (command.kind === "assert") {
    console.log(`本机库断言通过：localhost / ${VERIFY_EXPECTED_DATABASE_NAME} / ${VERIFY_EXPECTED_WORKSPACE_ID}`);
    return;
  }

  const sql = new Client({ connectionString: target.connectionString });
  await sql.connect();
  const storeClient = createPgLiveRecordSqlClient({ connectionString: target.connectionString, max: 2 });
  const runtime: Runtime = {
    closeStore: () => storeClient.close(),
    now: new Date(),
    operations: createEventOperationsPostgresClient({ connectionString: target.connectionString, max: 2 }),
    sql,
    store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: storeClient }),
    workspaceId: target.workspaceId,
  };
  try {
    if (command.kind === "fingerprint") {
      const fp = await fingerprint(sql);
      console.log(JSON.stringify({ digest: fp.digest, tables: Object.keys(fp.tables).length, verifyRows: fp.verifyRows }, null, 2));
      return;
    }
    if (command.kind === "summary") {
      const summaries = [];
      for (const name of VERIFY_ACCOUNT_NAMES) summaries.push(await summarize(runtime, name));
      console.log(JSON.stringify(summaries, null, 2));
      return;
    }

    const names: readonly VerifyAccountName[] = command.kind === "reset" ? [command.account] : VERIFY_ACCOUNT_NAMES;
    const before = await fingerprint(sql);
    await ensureAccount(runtime, ACCOUNTS["verify-host"]);
    const purged: Record<string, Record<string, number>> = {};
    for (const name of names) {
      purged[name] = await purgeAccount(runtime, ACCOUNTS[name]);
      await seedAccount(runtime, name);
    }
    const after = await fingerprint(sql);
    const changed = diffFingerprints(before, after);
    const summaries = [];
    for (const name of names) summaries.push(await summarize(runtime, name));
    console.log(
      JSON.stringify(
        {
          command: command.kind === "reset" ? `reset ${command.account}` : "seed",
          nonVerifyFingerprint: { after: after.digest, before: before.digest, changedTables: changed, identical: changed.length === 0 },
          purgedRows: purged,
          accounts: summaries,
        },
        null,
        2,
      ),
    );
    if (changed.length > 0) {
      throw new Error(`非 verify-* 行在执行前后不一致：${changed.join(", ")}`);
    }
  } finally {
    await sql.end();
    await runtime.closeStore();
    await runtime.operations.close();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "verify 种子执行失败。");
    process.exit(1);
  });
