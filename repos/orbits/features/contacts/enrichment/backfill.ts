/**
 * W0045 SC-05：联系人补全回填（行业／职级／规范地区）。只补空、可复核、可重放；本 Sprint 只在本机库演练。
 *
 * 规则（W45-3，对标 HubSpot Breeze／Clearbit「只填空、不覆盖」）：
 *   - 已有值无来源记录（存量）一律按 `user` 保护，不改值；
 *   - 旧的 `publicProfile.seniorityLevel` 只补记来源 `card`（via legacy_profile），值不动；
 *   - 原始 location 经别名表直接命中的地区记 `card`（via rule）；
 *   - 其余空栏可选地交给按文字补全（`ai`，via text_enrichment）：每次 ≤20 人、串行、间隔 ≥1 秒、
 *     单次运行最多 maxCalls 次调用（默认 50）；不占用户配额，调用方记 `system` 成本子账。
 *
 * 计划 → 哈希 → apply(复核哈希)：计划只含记录 id、预期版本、写入前 payload 摘要与要写的值，不含 payload 原文。
 * apply 在一个事务里先持同步提交顺序锁，逐条 `select … for update` + 条件更新；期间被改过的记录跳过，
 * 已经按本计划写过的记录计为 alreadyApplied（重复 apply 0 变化）。
 */
import { createHash } from "node:crypto";

import { acquireSyncCommitOrderLock } from "../../sync/commit-order-lock";
import { readStoredEnrichment, withEnrichmentProvenance } from "../../../shared/domain/enrichment";
import { regionFromLocationText } from "../../../shared/domain/regions";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import {
  applyEnrichedValues,
  enrichedFieldHasValue,
  type CardEnrichmentField,
  type EnrichedValue,
} from "./apply-enrichment";
import {
  TEXT_ENRICHMENT_MAX_CONTACTS,
  type TextEnricher,
  type TextEnrichmentContactInput,
  type TextEnrichmentUsage,
} from "./text-enrichment";

export const BACKFILL_DEFAULT_MAX_CALLS = 50;
export const BACKFILL_MIN_INTERVAL_MS = 1_000;

export interface EnrichmentBackfillRecord {
  recordId: string;
  userId: string | null;
  updatedAt: string;
  payload: Record<string, unknown>;
}

/** 只补来源、不改值（旧 seniorityLevel → card/legacy_profile）。 */
export interface ProvenanceMark {
  field: CardEnrichmentField;
  origin: "card";
  via: "legacy_profile";
}

export interface EnrichmentBackfillEntry {
  recordId: string;
  userId: string | null;
  expectedUpdatedAt: string;
  beforePayloadSha256: string;
  values: EnrichedValue[];
  marks: ProvenanceMark[];
}

export interface EnrichmentBackfillPlan {
  workspaceId: string;
  appliedAt: string;
  entries: EnrichmentBackfillEntry[];
  counts: { contacts: number; entries: number; cardValues: number; aiValues: number; provenanceMarks: number; aiCandidates: number; aiDeferred: number };
  ai: { calls: number; usage: TextEnrichmentUsage[]; model: string | null };
  hash: string;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, (item as Record<string, unknown>)[key]]))
    : item);
}

export function payloadSha256(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function enrichmentBackfillPlanHash(plan: Pick<EnrichmentBackfillPlan, "workspaceId" | "appliedAt" | "entries">): string {
  return createHash("sha256").update(canonicalJson({ appliedAt: plan.appliedAt, entries: plan.entries, workspaceId: plan.workspaceId })).digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const FIELDS: readonly CardEnrichmentField[] = ["industry", "seniorityLevel", "region"];

function aiInputFor(record: EnrichmentBackfillRecord): TextEnrichmentContactInput | null {
  const payload = record.payload;
  const input = {
    contactId: record.recordId,
    organization: text(payload.organization),
    role: text(payload.role),
    location: text(payload.location),
    cardNotes: text(payload.notes),
  };
  return input.organization || input.role || input.location || input.cardNotes ? input : null;
}

export interface BuildEnrichmentBackfillPlanInput {
  workspaceId: string;
  appliedAt: string;
  records: readonly EnrichmentBackfillRecord[];
  /** 不传或 null：只做确定规则（card），不调用模型。 */
  enricher?: TextEnricher | null;
  maxCalls?: number;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function buildContactEnrichmentBackfillPlan(input: BuildEnrichmentBackfillPlanInput): Promise<EnrichmentBackfillPlan> {
  if (!input.workspaceId.trim() || !Number.isFinite(Date.parse(input.appliedAt))) throw new Error("Explicit workspace and appliedAt are required.");
  const maxCalls = Math.max(0, Math.floor(input.maxCalls ?? BACKFILL_DEFAULT_MAX_CALLS));
  const minIntervalMs = Math.max(BACKFILL_MIN_INTERVAL_MS, input.minIntervalMs ?? BACKFILL_MIN_INTERVAL_MS);
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const drafts = new Map<string, { record: EnrichmentBackfillRecord; values: EnrichedValue[]; marks: ProvenanceMark[]; working: Record<string, unknown> }>();

  for (const record of input.records) {
    if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) continue;
    const working = structuredClone(record.payload);
    const values: EnrichedValue[] = [];
    const marks: ProvenanceMark[] = [];
    const enrichment = readStoredEnrichment(working.enrichment);
    if (enrichedFieldHasValue(working, "seniorityLevel") && !enrichment?.fields.seniorityLevel) {
      marks.push({ field: "seniorityLevel", origin: "card", via: "legacy_profile" });
    }
    const region = regionFromLocationText(working.location);
    // 回填只补空：地址规则同样不替换已有地区（包括 ai 来源的地区）。
    if (region && !enrichedFieldHasValue(working, "region")) {
      values.push({ field: "region", value: region, origin: "card", via: "rule" });
    }
    applyEnrichedValues(working, values, input.appliedAt);
    drafts.set(record.recordId, { record, values, marks, working });
  }

  const candidates = [...drafts.values()]
    .filter((draft) => FIELDS.some((field) => !enrichedFieldHasValue(draft.working, field)))
    .map((draft) => aiInputFor(draft.record))
    .filter((entry): entry is TextEnrichmentContactInput => entry !== null);
  const usage: TextEnrichmentUsage[] = [];
  let calls = 0;
  let deferred = 0;
  if (input.enricher) {
    for (let start = 0; start < candidates.length; start += TEXT_ENRICHMENT_MAX_CONTACTS) {
      const batch = candidates.slice(start, start + TEXT_ENRICHMENT_MAX_CONTACTS);
      if (calls >= maxCalls) {
        deferred += batch.length;
        continue;
      }
      if (calls > 0) await sleep(minIntervalMs);
      calls += 1;
      const result = await input.enricher.enrich({ contacts: batch });
      usage.push(result.usage);
      for (const proposal of result.proposals) {
        const draft = drafts.get(proposal.contactId);
        if (!draft) continue;
        const proposed: EnrichedValue[] = [];
        if (proposal.primaryIndustryId) {
          proposed.push({ field: "industry", value: { primaryIndustryId: proposal.primaryIndustryId, secondaryIndustryId: proposal.secondaryIndustryId }, origin: "ai", via: "text_enrichment" });
        }
        if (proposal.seniorityLevel) proposed.push({ field: "seniorityLevel", value: proposal.seniorityLevel, origin: "ai", via: "text_enrichment" });
        if (proposal.region) proposed.push({ field: "region", value: proposal.region, origin: "ai", via: "text_enrichment" });
        // 回填只补空：不替换任何已有值（包括 ai 来源的值）。
        const empty = proposed.filter((entry) => !enrichedFieldHasValue(draft.working, entry.field));
        const written = applyEnrichedValues(draft.working, empty, input.appliedAt);
        draft.values.push(...empty.filter((entry) => written.includes(entry.field)));
      }
    }
  } else {
    deferred = candidates.length;
  }

  const entries: EnrichmentBackfillEntry[] = [...drafts.values()]
    .filter((draft) => draft.values.length || draft.marks.length)
    .map((draft) => ({
      recordId: draft.record.recordId,
      userId: draft.record.userId,
      expectedUpdatedAt: draft.record.updatedAt,
      beforePayloadSha256: payloadSha256(draft.record.payload),
      values: draft.values,
      marks: draft.marks,
    }))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const plan = {
    workspaceId: input.workspaceId,
    appliedAt: input.appliedAt,
    entries,
    counts: {
      contacts: drafts.size,
      entries: entries.length,
      cardValues: entries.reduce((sum, entry) => sum + entry.values.filter((value) => value.origin === "card").length, 0),
      aiValues: entries.reduce((sum, entry) => sum + entry.values.filter((value) => value.origin === "ai").length, 0),
      provenanceMarks: entries.reduce((sum, entry) => sum + entry.marks.length, 0),
      aiCandidates: candidates.length,
      aiDeferred: deferred,
    },
    ai: { calls, usage, model: input.enricher?.model ?? null },
  };
  return { ...plan, hash: enrichmentBackfillPlanHash(plan) };
}

/** 把一条计划写到 payload 上（只补空 + 补来源），返回是否有变化。 */
export function applyBackfillEntry(payload: Record<string, unknown>, entry: EnrichmentBackfillEntry, appliedAt: string): boolean {
  const written = applyEnrichedValues(payload, entry.values, appliedAt).length;
  let marked = 0;
  for (const mark of entry.marks) {
    const enrichment = readStoredEnrichment(payload.enrichment);
    if (!enrichedFieldHasValue(payload, mark.field) || enrichment?.fields[mark.field]) continue;
    payload.enrichment = withEnrichmentProvenance(enrichment, mark.field, { origin: mark.origin, updatedAt: appliedAt, via: mark.via });
    marked += 1;
  }
  return written + marked > 0;
}

function alreadyApplied(payload: Record<string, unknown>, entry: EnrichmentBackfillEntry, appliedAt: string): boolean {
  const fields = readStoredEnrichment(payload.enrichment)?.fields ?? {};
  return [...entry.values.map((value) => value.field), ...entry.marks.map((mark) => mark.field)]
    .every((field) => fields[field]?.updatedAt === appliedAt);
}

export interface EnrichmentBackfillApplyResult {
  applied: number;
  alreadyApplied: number;
  skippedChanged: number;
  skippedMissing: number;
}

/** 调用方负责连接（只连复核过的库）；本函数不解析环境变量。 */
export async function applyContactEnrichmentBackfillPlan(
  client: Pick<TransactionalPostgresClient, "transaction">,
  plan: EnrichmentBackfillPlan,
  reviewedHash: string,
): Promise<EnrichmentBackfillApplyResult> {
  if (reviewedHash !== plan.hash || enrichmentBackfillPlanHash(plan) !== reviewedHash) {
    throw new Error("ENRICHMENT_BACKFILL_REFUSED: the plan does not match the reviewed hash.");
  }
  return client.transaction(async (sql) => {
    // contacts 是同步集合：第一次写之前先持提交顺序锁。
    await acquireSyncCommitOrderLock(sql);
    const result: EnrichmentBackfillApplyResult = { applied: 0, alreadyApplied: 0, skippedChanged: 0, skippedMissing: 0 };
    for (const entry of plan.entries) {
      // 只写计划时的所有者：SELECT 与条件 UPDATE 都绑定 user_id（owner-backfill 可能只改 user_id 而不动 payload）。
      const scope = "workspace_id = $1 and collection_name = 'contacts' and record_id = $2 and lifecycle_state = 'active' and deleted_at is null";
      const owner = "user_id is not distinct from $3";
      // updated_at 是微秒精度、计划里是毫秒 ISO：比较按毫秒截断；条件更新用同一事务锁住的原值文本，精确相等。
      const current = await sql.query<{ payload: Record<string, unknown>; updated_at: string | Date; version_text: string }>(
        `select payload, updated_at, updated_at::text as version_text from orbit_records where ${scope} and ${owner} for update`,
        [plan.workspaceId, entry.recordId, entry.userId],
      );
      const row = current.rows[0];
      if (!row) {
        const exists = await sql.query(`select 1 from orbit_records where ${scope}`, [plan.workspaceId, entry.recordId]);
        if (exists.rows.length) result.skippedChanged += 1;
        else result.skippedMissing += 1;
        continue;
      }
      const version = row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString();
      if (version !== new Date(entry.expectedUpdatedAt).toISOString() || payloadSha256(row.payload) !== entry.beforePayloadSha256) {
        if (alreadyApplied(row.payload, entry, plan.appliedAt)) result.alreadyApplied += 1;
        else result.skippedChanged += 1;
        continue;
      }
      const payload = structuredClone(row.payload);
      if (!applyBackfillEntry(payload, entry, plan.appliedAt)) {
        result.alreadyApplied += 1;
        continue;
      }
      const updatedAt = new Date(Math.max(Date.parse(plan.appliedAt), Date.parse(version) + 1)).toISOString();
      payload.updatedAt = updatedAt;
      const updated = await sql.query(
        `update orbit_records set payload = $4::jsonb, updated_at = $5::timestamptz where ${scope} and ${owner} and updated_at = $6::timestamptz returning record_id`,
        [plan.workspaceId, entry.recordId, entry.userId, JSON.stringify(payload), updatedAt, row.version_text],
      );
      if (updated.rows.length === 1) result.applied += 1;
      else result.skippedChanged += 1;
    }
    return result;
  });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** 非 localhost 库：没有 `--confirm-remote=<host>/<database>` 一律拒绝（dry-run 也拒绝，避免读生产数据与付费调用）。 */
export function assertEnrichmentBackfillTarget(connectionString: string, confirmRemote: string | null): { host: string; database: string; remote: boolean } {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("ENRICHMENT_BACKFILL_REFUSED: the database connection configuration is invalid.");
  }
  const host = url.hostname;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const remote = !LOCAL_HOSTS.has(host);
  if (remote && confirmRemote !== `${host}/${database}`) {
    throw new Error(`ENRICHMENT_BACKFILL_REFUSED: remote database; production execution needs separate approval and --confirm-remote=${host}/${database}.`);
  }
  return { host, database, remote };
}
