/**
 * W0048a：快照输出解析与校验（W48-7；mock 与 DeepSeek 两个生成器共用同一个出口）。
 *
 * - 只认契约字段（kind、zh／en 文字、依据 id、needId）；模型多给的字段（分数、覆盖度……）一律丢弃；
 * - 依据里不在本次输入中的联系人／记录 id（编造的）丢弃；剔完依据为空的块丢弃（处处有据）；
 * - 同一次调用必须产出 zh 与 en，任一语言为空的块丢弃；
 * - 每种块按上限截取（diagnosis 1、insight 3、gap 6、plan 1）；gap 的 needId 只认本次输入里的需求；
 * - 关键块不足（没有 diagnosis，或 insight 少于 2 条）→ 整份失败（不写库）。
 * - 文字里出现原始 id（本次输入的任何 id、`前缀:值` 形式的记录引用、UUID）或模型别名（C1／R2／N3）的块丢弃
 *   （review P2-3）；
 * - 文字里出现统计数字的块丢弃（review P2-4，统计一律实时规则算）：百分比、score／分数／评分、「数字 + 位／名／人」、
 *   「数字 + contacts／people／connections」。比对前先去掉本次输入里的目标原文与需求标题（它们本身可能含人数）。
 * 块的 key 由校验器按顺序生成（不信任模型给的 key）。
 */
import {
  SNAPSHOT_BLOCK_KINDS,
  SNAPSHOT_BLOCK_LIMITS,
  SNAPSHOT_EVIDENCE_LIMIT,
  SNAPSHOT_MIN_INSIGHTS,
  SNAPSHOT_TEXT_LIMIT,
  type SnapshotBlock,
  type SnapshotBlockKind,
} from "./contract";

export class SnapshotValidationError extends Error {
  constructor(readonly code: "INVALID_OUTPUT" | "MISSING_KEY_BLOCKS", message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

export interface SnapshotAllowedReferences {
  contactIds: ReadonlySet<string>;
  recordIds: ReadonlySet<string>;
  needIds: ReadonlySet<string>;
  /** 允许原样出现在文字里的输入短语（目标原文、需求标题）：检查统计数字前先去掉。 */
  phrases?: readonly string[];
}

/** `plan:…`、`note:note:…`、`contact:business-card:…` 这类记录引用（英文前缀 + 冒号 + 无空格的值）。 */
const RECORD_REFERENCE = /\b[a-z][a-z_-]*:[A-Za-z0-9][A-Za-z0-9:_.-]{2,}/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** DeepSeek 输入用的短期别名（见 deepseek-snapshot-generator）。 */
export const SNAPSHOT_ALIAS_PATTERN = /\b[CRN]\d{1,4}\b/;
const STATISTICS = [
  /\d+(?:\.\d+)?\s*[%％]/,
  /百分之/,
  /\bscores?\b|分数|得分|评分/i,
  /\d+\s*(?:位|名|个人|人)/,
  /\b\d+\s+(?:contacts?|people|persons|connections|members)\b/i,
];

/** 文字是否带原始 id／别名（不可展示）。 */
export function snapshotTextLeaksIds(text: string, allowed: Pick<SnapshotAllowedReferences, "contactIds" | "recordIds" | "needIds">): boolean {
  if (RECORD_REFERENCE.test(text) || UUID.test(text) || SNAPSHOT_ALIAS_PATTERN.test(text)) return true;
  for (const ids of [allowed.contactIds, allowed.recordIds, allowed.needIds]) {
    for (const id of ids) if (id.length >= 4 && text.includes(id)) return true;
  }
  return false;
}

/** 文字是否带统计数字（先去掉允许的输入短语）。 */
export function snapshotTextHasStatistics(text: string, phrases: readonly string[] = []): boolean {
  let rest = text;
  for (const phrase of [...phrases].filter((entry) => entry.trim().length > 0).sort((a, b) => b.length - a.length)) rest = rest.split(phrase.trim()).join(" ");
  return STATISTICS.some((pattern) => pattern.test(rest));
}

export interface SnapshotValidationResult {
  blocks: SnapshotBlock[];
  /** 被丢弃的块与 id 数（REPORT／日志用，不含内容）。 */
  dropped: { blocks: number; contactIds: number; recordIds: number; needIds: number; unsafeText: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > SNAPSHOT_TEXT_LIMIT ? `${trimmed.slice(0, SNAPSHOT_TEXT_LIMIT - 1)}…` : trimmed;
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function kindOf(value: unknown): SnapshotBlockKind | null {
  return typeof value === "string" && (SNAPSHOT_BLOCK_KINDS as readonly string[]).includes(value) ? (value as SnapshotBlockKind) : null;
}

/** 解析 JSON 文本或已解析的对象；顶层要有 blocks 数组。 */
function rawBlocks(content: unknown): unknown[] {
  let parsed: unknown = content;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new SnapshotValidationError("INVALID_OUTPUT", "The snapshot output is not valid JSON.");
    }
  }
  const blocks = isRecord(parsed) ? parsed.blocks : undefined;
  if (!Array.isArray(blocks)) throw new SnapshotValidationError("INVALID_OUTPUT", "The snapshot output has no blocks array.");
  return blocks;
}

export function validateSnapshotOutput(content: unknown, allowed: SnapshotAllowedReferences): SnapshotValidationResult {
  const dropped = { blocks: 0, contactIds: 0, needIds: 0, recordIds: 0, unsafeText: 0 };
  const kept: Record<SnapshotBlockKind, SnapshotBlock[]> = { diagnosis: [], gap: [], insight: [], plan: [] };
  for (const raw of rawBlocks(content)) {
    if (!isRecord(raw)) {
      dropped.blocks += 1;
      continue;
    }
    const kind = kindOf(raw.kind);
    const textSource = isRecord(raw.text) ? raw.text : raw;
    const zh = cleanText(textSource.zh);
    const en = cleanText(textSource.en);
    const evidenceSource = isRecord(raw.evidence) ? raw.evidence : raw;
    const contactCandidates = idList(evidenceSource.contactIds);
    const recordCandidates = idList(evidenceSource.recordIds);
    const contactIds = [...new Set(contactCandidates.filter((id) => allowed.contactIds.has(id)))].slice(0, SNAPSHOT_EVIDENCE_LIMIT);
    const recordIds = [...new Set(recordCandidates.filter((id) => allowed.recordIds.has(id)))].slice(0, SNAPSHOT_EVIDENCE_LIMIT);
    dropped.contactIds += contactCandidates.filter((id) => !allowed.contactIds.has(id)).length;
    dropped.recordIds += recordCandidates.filter((id) => !allowed.recordIds.has(id)).length;
    const rawNeed = typeof raw.needId === "string" ? raw.needId.trim() : "";
    const needId = kind === "gap" && rawNeed && allowed.needIds.has(rawNeed) ? rawNeed : undefined;
    if (rawNeed && !needId) dropped.needIds += 1;
    if (!kind || !zh || !en || contactIds.length + recordIds.length === 0 || kept[kind].length >= SNAPSHOT_BLOCK_LIMITS[kind]) {
      dropped.blocks += 1;
      continue;
    }
    if ([zh, en].some((text) => snapshotTextLeaksIds(text, allowed) || snapshotTextHasStatistics(text, allowed.phrases))) {
      dropped.blocks += 1;
      dropped.unsafeText += 1;
      continue;
    }
    kept[kind].push({
      evidence: { contactIds, recordIds },
      key: `${kind}-${kept[kind].length + 1}`,
      kind,
      ...(needId ? { needId } : {}),
      text: { en, zh },
    });
  }
  if (kept.diagnosis.length < 1 || kept.insight.length < SNAPSHOT_MIN_INSIGHTS) {
    throw new SnapshotValidationError("MISSING_KEY_BLOCKS", "The snapshot lacks a diagnosis or at least two insights.");
  }
  return { blocks: [...kept.diagnosis, ...kept.insight, ...kept.gap, ...kept.plan], dropped };
}
