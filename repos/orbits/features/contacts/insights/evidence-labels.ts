/**
 * W0061（rev 2 G-5）：洞察「依据」的解析器——把 `evidence: {source, id}[]` 变成能写进「依据：…」的小签。
 *
 * 只认三种来源，其余（见面、笔记、日程、计划记录、跟进完成）与解析不到的条目一律丢弃；全部丢弃时不显示「依据」：
 * - `capture:<联系人 id>`：联系人的采集方式是名片扫描（`source.type = business_card_ocr`）才叫「名片」，否则「录入」。
 * - `memo:<noteId>`：`contact_detail_states.notes` 里那条 memo 的东京日期（用户选的日期，没有则取写入时间）→「memo 9/28」。
 * - `plan_need:<条目 id>`（id 本身就是计划条目 id）：本人计划里该人脉需求的标题 →「计划需求『…』」。
 *
 * 纯函数 `insightEvidenceLabels` 三处共用：首页与候选卡由服务端 `resolveInsightEvidenceLabels`（本人范围、一条语句批量）
 * 喂事实；详情直接用已读到的时间线与计划关联喂事实（0 次新增读取）。本文件不 import 运行时、生成器或配额，
 * 客户端可以直接引用。
 */
import type { ContactInsightEvidence } from "../../../shared/contract/contact-insight";

/**
 * 依据小签（紧凑字符串，D39 窄读：候选接口 20 人一次的增量要 ≤4 KB）：
 * `card`（名片扫描）／`entry`（录入）／`memo:YYYY-MM-DD`（东京日期）／`need:{需求标题}`。
 */
export type InsightEvidenceLabel = "card" | "entry" | `memo:${string}` | `need:${string}`;

export type InsightEvidenceKind = "card" | "entry" | "memo" | "need";

export function insightEvidenceKind(label: InsightEvidenceLabel): InsightEvidenceKind {
  return label.startsWith("memo:") ? "memo" : label.startsWith("need:") ? "need" : (label as "card" | "entry");
}

export interface ResolvedInsightEvidence {
  evidence: ContactInsightEvidence;
  label: InsightEvidenceLabel;
}

/** 解析依据用到的事实（都按本人范围读到；读不到的就缺席）。 */
export interface InsightEvidenceFacts {
  /** 联系人 id → 是否名片扫描建立（缺席 = 解析不到，丢弃）。 */
  captureIsCard: ReadonlyMap<string, boolean>;
  /** memo 证据 id（`memo:<noteId>`）→ 东京日期 `YYYY-MM-DD`。 */
  memoDays: ReadonlyMap<string, string>;
  /** 计划条目 id → 人脉需求标题。 */
  needTitles: ReadonlyMap<string, string>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NEED_TITLE_MAX = 40;
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 时刻或 `YYYY-MM-DD` → 东京日期 `YYYY-MM-DD`；无法解析返回 null。 */
export function tokyoDayOf(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (DAY.test(text)) return text;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

function clipTitle(title: string): string {
  const chars = Array.from(title.trim());
  return chars.length > NEED_TITLE_MAX ? `${chars.slice(0, NEED_TITLE_MAX - 1).join("")}…` : chars.join("");
}

/** 纯函数：按洞察给出的顺序解析依据；解析不到的丢弃，相同的小签只留一个。 */
export function insightEvidenceLabels(
  contactId: string,
  evidence: readonly ContactInsightEvidence[],
  facts: InsightEvidenceFacts,
): ResolvedInsightEvidence[] {
  const out: ResolvedInsightEvidence[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    let label: InsightEvidenceLabel | null = null;
    if (item.source === "capture") {
      if (item.id === `capture:${contactId}` && facts.captureIsCard.has(contactId)) {
        label = facts.captureIsCard.get(contactId) ? "card" : "entry";
      }
    } else if (item.source === "memo") {
      const day = facts.memoDays.get(item.id);
      if (day && DAY.test(day)) label = `memo:${day}`;
    } else if (item.source === "plan_need") {
      const title = facts.needTitles.get(item.id)?.trim();
      if (title) label = `need:${clipTitle(title)}`;
    }
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ evidence: item, label });
  }
  return out;
}

type Translate = (copy: { en: string; zh: string }) => string;

/** 小签文字（不含「依据」前缀）：名片／录入／memo 9/28／计划需求『…』。 */
export function insightEvidenceLabelText(label: InsightEvidenceLabel, t: Translate): string {
  switch (insightEvidenceKind(label)) {
    case "card": return t({ en: "Business card", zh: "名片" });
    case "entry": return t({ en: "Entered", zh: "录入" });
    case "memo": {
      const [, month, day] = label.slice("memo:".length).split("-").map(Number);
      return `memo ${month}/${day}`;
    }
    case "need": {
      const title = label.slice("need:".length);
      return t({ en: `Plan need “${title}”`, zh: `计划需求『${title}』` });
    }
  }
}

/* ── 服务端批量读取（本人范围、一条语句） ───────────────────────────────── */

export interface EvidenceSqlExecutor {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

const MEMO_PREFIX = "memo:";
const ID_MAX = 512;

function detailRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

/**
 * 一条语句、一行结果（D39 窄读：回传位置序号而不是长 id）：
 * - `cards`／`entries`：本人联系人里名片扫描建立／其他方式建立的（`$3` 中的位置，从 1 起）；
 * - `memos`：`{"<详情记录位置>:<noteId 位置>": "<选的日期或写入时间>"}`——本人 memo 的原始日期，在 TS 里用
 *   `tokyoDayOf` 安全换算成东京日期（不在 SQL 里强转，坏日期只丢弃这一条）；
 * - `needs`：`{"<条目位置>": "标题（截 80 字）"}`——本人计划的人脉需求。
 * 每段都按 workspace + 本人过滤；他人的 id 读不到（解析为丢弃）。
 * $1 workspace，$2 actor，$3 联系人 id[]，$4 详情状态记录 id[]，$5 noteId[]，$6 计划条目 id[]。
 */
const EVIDENCE_FACTS_SQL = `/* contact-insights:evidence-labels */
  with owned as (
    select array_position($3::text[], c.record_id) as pos, c.payload->'source'->>'type' = 'business_card_ocr' as card
      from orbit_records c
     where c.workspace_id = $1 and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted' and c.user_id = $2
       and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
       and c.record_id = any($3::text[])
  ), memos as (
    select array_position($4::text[], r.record_id) || ':' || array_position($5::text[], n->>'noteId') as key,
           coalesce(n->>'occurredAt', n->>'createdAt') as day
      from orbit_records r
      cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
     where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
       and r.lifecycle_state <> 'deleted' and r.record_id = any($4::text[]) and n->>'noteId' = any($5::text[])
  )
  select (select array_agg(pos) filter (where card) from owned) as cards,
         (select array_agg(pos) filter (where not coalesce(card, false)) from owned) as entries,
         (select jsonb_object_agg(key, day) from memos where day is not null) as memos,
         (select jsonb_object_agg(array_position($6::text[], i.id), left(i.title, 80)) from plan_items i
           where i.workspace_id = $1 and i.actor_id = $2 and i.kind = 'network_need' and i.id = any($6::text[])) as needs`;

function positions(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (typeof value === "string") return value.replace(/[{}]/g, "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return [];
}

function object(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })() : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * 批量解析：一次查询拿齐这些联系人依据所需的事实，再按 `insightEvidenceLabels` 逐人解析。
 * 没有可解析的依据时不发查询；表未迁移（42P01）按「都解析不到」处理。
 */
export async function resolveInsightEvidenceLabels(
  input: { actorId: string; items: readonly { contactId: string; evidence: readonly ContactInsightEvidence[] }[] },
  deps: { client: EvidenceSqlExecutor; workspaceId: string },
): Promise<Map<string, InsightEvidenceLabel[]>> {
  const result = new Map<string, InsightEvidenceLabel[]>();
  const actorId = input.actorId.trim();
  const captureIds: string[] = [];
  const details: { recordId: string; contactId: string }[] = [];
  const noteIds: string[] = [];
  const needIds: string[] = [];
  const push = <T>(list: T[], value: T, same: (entry: T) => boolean) => {
    if (!list.some(same)) list.push(value);
  };
  for (const { contactId, evidence } of input.items) {
    if (!contactId || contactId.length > ID_MAX) continue;
    for (const item of evidence) {
      if (!item.id || item.id.length > ID_MAX) continue;
      if (item.source === "capture" && item.id === `capture:${contactId}`) push(captureIds, contactId, (entry) => entry === contactId);
      else if (item.source === "memo" && item.id.startsWith(MEMO_PREFIX)) {
        const recordId = detailRecordId(actorId, contactId);
        push(details, { contactId, recordId }, (entry) => entry.recordId === recordId);
        const noteId = item.id.slice(MEMO_PREFIX.length);
        push(noteIds, noteId, (entry) => entry === noteId);
      } else if (item.source === "plan_need") push(needIds, item.id, (entry) => entry === item.id);
    }
  }
  const facts = { captureIsCard: new Map<string, boolean>(), memoDays: new Map<string, string>(), needTitles: new Map<string, string>() };
  if (actorId && (captureIds.length || noteIds.length || needIds.length)) {
    try {
      const rows = await deps.client.query<Record<string, unknown>>(EVIDENCE_FACTS_SQL, [
        deps.workspaceId,
        actorId,
        captureIds,
        details.map((entry) => entry.recordId),
        noteIds,
        needIds,
      ]);
      const row = rows.rows[0];
      if (row) {
        for (const pos of positions(row.cards)) if (captureIds[pos - 1]) facts.captureIsCard.set(captureIds[pos - 1]!, true);
        for (const pos of positions(row.entries)) if (captureIds[pos - 1]) facts.captureIsCard.set(captureIds[pos - 1]!, false);
        for (const [key, value] of Object.entries(object(row.memos))) {
          const [detailPos, notePos] = key.split(":").map(Number);
          const detail = details[(detailPos ?? 0) - 1];
          const noteId = noteIds[(notePos ?? 0) - 1];
          const day = tokyoDayOf(text(value));
          // memo 证据 id 只在所属联系人内有意义：按 (联系人, noteId) 记。
          if (detail && noteId && day) facts.memoDays.set(`${detail.contactId}\u0000${MEMO_PREFIX}${noteId}`, day);
        }
        for (const [key, value] of Object.entries(object(row.needs))) {
          const needId = needIds[Number(key) - 1];
          const title = text(value);
          if (needId && title) facts.needTitles.set(needId, title);
        }
      }
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "42P01") throw error;
    }
  }
  for (const { contactId, evidence } of input.items) {
    const memoDays = new Map<string, string>();
    for (const [key, day] of facts.memoDays) {
      const [owner, id] = key.split("\u0000");
      if (owner === contactId && id) memoDays.set(id, day);
    }
    result.set(
      contactId,
      insightEvidenceLabels(contactId, evidence, { captureIsCard: facts.captureIsCard, memoDays, needTitles: facts.needTitles }).map((entry) => entry.label),
    );
  }
  return result;
}
