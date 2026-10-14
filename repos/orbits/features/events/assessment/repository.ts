/**
 * R26 `event_assessments` / `event_assessment_posters` 的读写（内存 + PostgreSQL）。Owner: 甲 (R26).
 * 所有读写都带 actor（只本人可见，复核 S1）；处理器的认领 / 回收是唯一跨 actor 的入口（只回 id 与 actor）。
 */
import type {
  EventAssessmentFactBasis,
  EventAssessmentFacts,
  EventAssessmentFailureReason,
  EventAssessmentPageCandidate,
  EventAssessmentScoreItem,
  EventAssessmentSourceKind,
  EventAssessmentStatus,
  EventAssessmentVerdict,
} from "../../../shared/contract/event-assessment";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

export interface AssessmentRow {
  id: string;
  actorId: string;
  sourceKind: EventAssessmentSourceKind;
  sourceUrl: string | null;
  sourceHost: string | null;
  sourceDigest: string;
  posterAssetIds: string[];
  eventId: string | null;
  facts: EventAssessmentFacts;
  factBasis: Partial<Record<keyof EventAssessmentFacts, EventAssessmentFactBasis>>;
  scoreBreakdown: EventAssessmentScoreItem[];
  /** 生成时的说明快照（读时会按当前计划重算，这里只给重算任务与列表兜底）。 */
  view: Record<string, unknown>;
  total: number;
  totalMin: number | null;
  totalMax: number | null;
  verdict: EventAssessmentVerdict;
  rubricVersion: string;
  status: EventAssessmentStatus;
  failureReason: EventAssessmentFailureReason | null;
  missingFields: (keyof EventAssessmentFacts)[];
  userFilledFields: (keyof EventAssessmentFacts)[];
  pageCandidates: EventAssessmentPageCandidate[] | null;
  userDecision: "added" | "dismissed" | null;
  planItemId: string | null;
  idempotencyKey: string;
  promptVersion: string | null;
  aiOperationId: string | null;
  readMs: number | null;
  leaseUntil: string | null;
  attempts: number;
  attendeeSignature: string | null;
  createdAt: string;
  updatedAt: string;
  factsRefreshedAt: string | null;
}

export type AssessmentPatch = Partial<Omit<AssessmentRow, "id" | "actorId" | "createdAt" | "idempotencyKey" | "sourceKind" | "sourceDigest">>;

export interface PosterAsset {
  id: string;
  actorId: string;
  mimeType: string;
  byteSize: number;
  digest: string;
  bytes: Buffer;
  createdAt: string;
}

export interface EventAssessmentRepository {
  findByKey(actorId: string, idempotencyKey: string): Promise<AssessmentRow | null>;
  findBySource(actorId: string, sourceDigest: string, rubricVersion: string): Promise<AssessmentRow | null>;
  /** 插入；幂等键或来源冲突时返回已有行（`created: false`）。 */
  insert(row: AssessmentRow): Promise<{ row: AssessmentRow; created: boolean }>;
  get(actorId: string, id: string): Promise<AssessmentRow | null>;
  list(actorId: string, limit: number): Promise<AssessmentRow[]>;
  update(actorId: string, id: string, patch: AssessmentPatch): Promise<AssessmentRow | null>;
  /** 认领 `reading` 且租约为空 / 过期的行（`attempts + 1`）；`id` 给定时只认领这一行。 */
  claimReading(input: { now: string; leaseMs: number; limit: number; id?: string }): Promise<AssessmentRow[]>;
  /** `reading` 超过 `olderThan` 的行（回收为 timeout）。 */
  listStaleReading(input: { olderThan: string; limit: number }): Promise<AssessmentRow[]>;
  /** 最近 `since` 之后 URL 评估的条数（每人 / 每主机限速）。 */
  countUrlFetchesSince(input: { since: string; actorId?: string; host?: string }): Promise<number>;
  /** 加入计划的外部评估（本人；计划事实「我的外部评估」一路）。 */
  listAddedExternal(actorId: string, input: { from: string; until: string; limit: number }): Promise<AssessmentRow[]>;
  /** 重算任务：未来 30 天内 ready 的库内活动评估（≤ limit）。 */
  listRecomputeCandidates(input: { from: string; until: string; limit: number }): Promise<AssessmentRow[]>;
  putPoster(asset: PosterAsset): Promise<void>;
  getPosters(actorId: string, ids: readonly string[]): Promise<PosterAsset[]>;
  deletePosters(actorId: string, ids: readonly string[]): Promise<void>;
  purgePostersBefore(cutoff: string): Promise<number>;
}

// ── memory ───────────────────────────────────────────────────────────────

export function createMemoryEventAssessmentRepository(): EventAssessmentRepository & { rows: Map<string, AssessmentRow>; posters: Map<string, PosterAsset> } {
  const rows = new Map<string, AssessmentRow>();
  const posters = new Map<string, PosterAsset>();
  const clone = (row: AssessmentRow): AssessmentRow => structuredClone(row);
  const startsAt = (row: AssessmentRow) => row.facts.startsAt ?? "";
  return {
    posters,
    rows,
    async findByKey(actorId, key) {
      const found = [...rows.values()].find((row) => row.actorId === actorId && row.idempotencyKey === key);
      return found ? clone(found) : null;
    },
    async findBySource(actorId, digest, rubric) {
      const found = [...rows.values()].find((row) => row.actorId === actorId && row.sourceDigest === digest && row.rubricVersion === rubric);
      return found ? clone(found) : null;
    },
    async insert(row) {
      const existing = [...rows.values()].find((item) => item.actorId === row.actorId && (item.idempotencyKey === row.idempotencyKey || (item.sourceDigest === row.sourceDigest && item.rubricVersion === row.rubricVersion)));
      if (existing) return { created: false, row: clone(existing) };
      rows.set(row.id, clone(row));
      return { created: true, row: clone(row) };
    },
    async get(actorId, id) {
      const row = rows.get(id);
      return row && row.actorId === actorId ? clone(row) : null;
    },
    async list(actorId, limit) {
      return [...rows.values()].filter((row) => row.actorId === actorId).sort((a, b) => b.total - a.total || b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
    },
    async update(actorId, id, patch) {
      const row = rows.get(id);
      if (!row || row.actorId !== actorId) return null;
      const next = { ...row, ...structuredClone(patch) } as AssessmentRow;
      rows.set(id, next);
      return clone(next);
    },
    async claimReading({ now, leaseMs, limit, id }) {
      const out: AssessmentRow[] = [];
      for (const row of rows.values()) {
        if (out.length >= limit) break;
        if (id && row.id !== id) continue;
        if (row.status !== "reading" || (row.leaseUntil && row.leaseUntil > now)) continue;
        row.leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
        row.attempts += 1;
        out.push(clone(row));
      }
      return out;
    },
    async listStaleReading({ olderThan, limit }) {
      return [...rows.values()].filter((row) => row.status === "reading" && row.createdAt < olderThan).slice(0, limit).map(clone);
    },
    async countUrlFetchesSince({ since, actorId, host }) {
      return [...rows.values()].filter((row) => row.sourceKind === "url" && row.createdAt >= since && (!actorId || row.actorId === actorId) && (!host || row.sourceHost === host)).length;
    },
    async listAddedExternal(actorId, { from, until, limit }) {
      return [...rows.values()]
        .filter((row) => row.actorId === actorId && row.userDecision === "added" && row.eventId === null && startsAt(row) >= from && startsAt(row) < until)
        .sort((a, b) => startsAt(a).localeCompare(startsAt(b))).slice(0, limit).map(clone);
    },
    async listRecomputeCandidates({ from, until, limit }) {
      return [...rows.values()].filter((row) => row.status === "ready" && row.eventId !== null && startsAt(row) >= from && startsAt(row) < until).slice(0, limit).map(clone);
    },
    async putPoster(asset) { posters.set(asset.id, { ...asset }); },
    async getPosters(actorId, ids) { return ids.flatMap((id) => { const asset = posters.get(id); return asset && asset.actorId === actorId ? [asset] : []; }); },
    async deletePosters(actorId, ids) { for (const id of ids) if (posters.get(id)?.actorId === actorId) posters.delete(id); },
    async purgePostersBefore(cutoff) {
      let n = 0;
      for (const [id, asset] of posters) if (asset.createdAt < cutoff) { posters.delete(id); n += 1; }
      return n;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>;
const iso = (value: unknown): string | null => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString());

function fromDb(row: DbRow): AssessmentRow {
  return {
    actorId: String(row.actor_id),
    aiOperationId: (row.ai_operation_id as string | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    attendeeSignature: (row.attendee_signature as string | null) ?? null,
    createdAt: iso(row.created_at)!,
    eventId: (row.event_id as string | null) ?? null,
    factBasis: (row.fact_basis as AssessmentRow["factBasis"]) ?? {},
    facts: (row.facts as EventAssessmentFacts) ?? {},
    factsRefreshedAt: iso(row.facts_refreshed_at),
    failureReason: (row.failure_reason as EventAssessmentFailureReason | null) ?? null,
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    leaseUntil: iso(row.lease_until),
    missingFields: (row.missing_fields as AssessmentRow["missingFields"]) ?? [],
    pageCandidates: (row.page_candidates as EventAssessmentPageCandidate[] | null) ?? null,
    planItemId: (row.plan_item_id as string | null) ?? null,
    posterAssetIds: (row.poster_asset_ids as string[]) ?? [],
    promptVersion: (row.prompt_version as string | null) ?? null,
    readMs: row.read_ms === null || row.read_ms === undefined ? null : Number(row.read_ms),
    rubricVersion: String(row.rubric_version),
    scoreBreakdown: (row.score_breakdown as EventAssessmentScoreItem[]) ?? [],
    sourceDigest: String(row.source_digest),
    sourceHost: (row.source_host as string | null) ?? null,
    sourceKind: row.source_kind as EventAssessmentSourceKind,
    sourceUrl: (row.source_url as string | null) ?? null,
    status: row.status as EventAssessmentStatus,
    total: Number(row.total ?? 0),
    totalMax: row.total_max === null || row.total_max === undefined ? null : Number(row.total_max),
    totalMin: row.total_min === null || row.total_min === undefined ? null : Number(row.total_min),
    updatedAt: iso(row.updated_at)!,
    userDecision: (row.user_decision as AssessmentRow["userDecision"]) ?? null,
    userFilledFields: (row.user_filled_fields as AssessmentRow["userFilledFields"]) ?? [],
    verdict: row.verdict as EventAssessmentVerdict,
    view: (row.view as Record<string, unknown>) ?? {},
  };
}

/** 驼峰字段 → 列名与值（jsonb 用 ::jsonb）。 */
const COLUMNS: Record<keyof AssessmentPatch, [string, "json" | "plain"]> = {
  aiOperationId: ["ai_operation_id", "plain"],
  attempts: ["attempts", "plain"],
  attendeeSignature: ["attendee_signature", "plain"],
  eventId: ["event_id", "plain"],
  factBasis: ["fact_basis", "json"],
  facts: ["facts", "json"],
  factsRefreshedAt: ["facts_refreshed_at", "plain"],
  failureReason: ["failure_reason", "plain"],
  leaseUntil: ["lease_until", "plain"],
  missingFields: ["missing_fields", "plain"],
  pageCandidates: ["page_candidates", "json"],
  planItemId: ["plan_item_id", "plain"],
  posterAssetIds: ["poster_asset_ids", "plain"],
  promptVersion: ["prompt_version", "plain"],
  readMs: ["read_ms", "plain"],
  rubricVersion: ["rubric_version", "plain"],
  scoreBreakdown: ["score_breakdown", "json"],
  sourceHost: ["source_host", "plain"],
  sourceUrl: ["source_url", "plain"],
  status: ["status", "plain"],
  total: ["total", "plain"],
  totalMax: ["total_max", "plain"],
  totalMin: ["total_min", "plain"],
  updatedAt: ["updated_at", "plain"],
  userDecision: ["user_decision", "plain"],
  userFilledFields: ["user_filled_fields", "plain"],
  verdict: ["verdict", "plain"],
  view: ["view", "json"],
};

export function createPostgresEventAssessmentRepository(input: { client: TransactionalPostgresClient; workspaceId: string; ready?: () => Promise<void> }): EventAssessmentRepository {
  const { client, workspaceId } = input;
  const ready = input.ready ?? (async () => undefined);
  const q = async (sql: string, values: unknown[]) => { await ready(); return client.query<DbRow>(sql, values); };
  const one = async (sql: string, values: unknown[]) => { const rows = (await q(sql, values)).rows; return rows[0] ? fromDb(rows[0]) : null; };
  return {
    findByKey: (actorId, key) => one("select * from event_assessments where workspace_id = $1 and actor_id = $2 and idempotency_key = $3", [workspaceId, actorId, key]),
    findBySource: (actorId, digest, rubric) => one("select * from event_assessments where workspace_id = $1 and actor_id = $2 and source_digest = $3 and rubric_version = $4", [workspaceId, actorId, digest, rubric]),
    async insert(row) {
      const inserted = await one(
        `insert into event_assessments (workspace_id, id, actor_id, source_kind, source_url, source_host, source_digest, poster_asset_ids, event_id, facts, fact_basis, score_breakdown, view,
           total, total_min, total_max, verdict, rubric_version, status, failure_reason, missing_fields, user_filled_fields, page_candidates, user_decision, plan_item_id,
           idempotency_key, prompt_version, ai_operation_id, read_ms, lease_until, attempts, attendee_signature, created_at, updated_at, facts_refreshed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25,
           $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
         on conflict do nothing
         returning *`,
        [workspaceId, row.id, row.actorId, row.sourceKind, row.sourceUrl, row.sourceHost, row.sourceDigest, row.posterAssetIds, row.eventId, JSON.stringify(row.facts), JSON.stringify(row.factBasis),
          JSON.stringify(row.scoreBreakdown), JSON.stringify(row.view), row.total, row.totalMin, row.totalMax, row.verdict, row.rubricVersion, row.status, row.failureReason, row.missingFields,
          row.userFilledFields, row.pageCandidates === null ? null : JSON.stringify(row.pageCandidates), row.userDecision, row.planItemId, row.idempotencyKey, row.promptVersion, row.aiOperationId,
          row.readMs, row.leaseUntil, row.attempts, row.attendeeSignature, row.createdAt, row.updatedAt, row.factsRefreshedAt],
      );
      if (inserted) return { created: true, row: inserted };
      const existing = await one(
        "select * from event_assessments where workspace_id = $1 and actor_id = $2 and (idempotency_key = $3 or (source_digest = $4 and rubric_version = $5)) order by (idempotency_key = $3) desc limit 1",
        [workspaceId, row.actorId, row.idempotencyKey, row.sourceDigest, row.rubricVersion],
      );
      if (!existing) throw new Error("Event assessment insert conflicted without an existing row.");
      return { created: false, row: existing };
    },
    get: (actorId, id) => one("select * from event_assessments where workspace_id = $1 and actor_id = $2 and id = $3", [workspaceId, actorId, id]),
    async list(actorId, limit) {
      return (await q("select * from event_assessments where workspace_id = $1 and actor_id = $2 order by total desc, created_at desc limit $3", [workspaceId, actorId, limit])).rows.map(fromDb);
    },
    async update(actorId, id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [workspaceId, actorId, id];
      for (const [key, value] of Object.entries(patch) as [keyof AssessmentPatch, unknown][]) {
        const column = COLUMNS[key];
        if (!column) continue;
        values.push(column[1] === "json" ? (value === null ? null : JSON.stringify(value)) : value);
        sets.push(`${column[0]} = $${values.length}${column[1] === "json" ? "::jsonb" : ""}`);
      }
      if (!("updatedAt" in patch)) sets.push("updated_at = now()");
      return one(`update event_assessments set ${sets.join(", ")} where workspace_id = $1 and actor_id = $2 and id = $3 returning *`, values);
    },
    async claimReading({ now, leaseMs, limit, id }) {
      const result = await q(
        `with picked as (
           select id from event_assessments
           where workspace_id = $1 and status = 'reading' and (lease_until is null or lease_until <= $2::timestamptz) and ($5::text is null or id = $5)
           order by created_at limit $4 for update skip locked)
         update event_assessments a set lease_until = $2::timestamptz + make_interval(secs => $3::double precision / 1000), attempts = a.attempts + 1
         from picked where a.workspace_id = $1 and a.id = picked.id returning a.*`,
        [workspaceId, now, leaseMs, limit, id ?? null],
      );
      return result.rows.map(fromDb);
    },
    async listStaleReading({ olderThan, limit }) {
      return (await q("select * from event_assessments where workspace_id = $1 and status = 'reading' and created_at < $2::timestamptz order by created_at limit $3", [workspaceId, olderThan, limit])).rows.map(fromDb);
    },
    async countUrlFetchesSince({ since, actorId, host }) {
      const row = (await q(
        "select count(*)::int as n from event_assessments where workspace_id = $1 and source_kind = 'url' and created_at >= $2::timestamptz and ($3::text is null or actor_id = $3) and ($4::text is null or source_host = $4)",
        [workspaceId, since, actorId ?? null, host ?? null],
      )).rows[0];
      return Number(row?.n ?? 0);
    },
    async listAddedExternal(actorId, { from, until, limit }) {
      return (await q(
        `select * from event_assessments where workspace_id = $1 and actor_id = $2 and user_decision = 'added' and event_id is null
           and (facts->>'startsAt') >= $3 and (facts->>'startsAt') < $4 order by facts->>'startsAt' limit $5`,
        [workspaceId, actorId, from, until, limit],
      )).rows.map(fromDb);
    },
    async listRecomputeCandidates({ from, until, limit }) {
      return (await q(
        `select * from event_assessments where workspace_id = $1 and status = 'ready' and event_id is not null
           and (facts->>'startsAt') >= $2 and (facts->>'startsAt') < $3 order by updated_at limit $4`,
        [workspaceId, from, until, limit],
      )).rows.map(fromDb);
    },
    async putPoster(asset) {
      await q("insert into event_assessment_posters (workspace_id, id, actor_id, mime_type, byte_size, digest, bytes, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing",
        [workspaceId, asset.id, asset.actorId, asset.mimeType, asset.byteSize, asset.digest, asset.bytes, asset.createdAt]);
    },
    async getPosters(actorId, ids) {
      if (ids.length === 0) return [];
      return (await q("select * from event_assessment_posters where workspace_id = $1 and actor_id = $2 and id = any($3::text[])", [workspaceId, actorId, [...ids]])).rows.map((row) => ({
        actorId: String(row.actor_id), byteSize: Number(row.byte_size), bytes: row.bytes as Buffer, createdAt: iso(row.created_at)!, digest: String(row.digest), id: String(row.id), mimeType: String(row.mime_type),
      }));
    },
    async deletePosters(actorId, ids) {
      if (ids.length) await q("delete from event_assessment_posters where workspace_id = $1 and actor_id = $2 and id = any($3::text[])", [workspaceId, actorId, [...ids]]);
    },
    async purgePostersBefore(cutoff) {
      return (await q("delete from event_assessment_posters where workspace_id = $1 and created_at < $2::timestamptz returning id", [workspaceId, cutoff])).rows.length;
    },
  };
}
