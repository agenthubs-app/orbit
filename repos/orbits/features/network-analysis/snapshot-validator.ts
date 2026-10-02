/**
 * W0048a：快照输出解析与校验（W48-7；mock 与 DeepSeek 两个生成器共用同一个出口）。
 *
 * - 只认契约字段（kind、zh／en 文字、依据 id、needId）；模型多给的字段（分数、覆盖度……）一律丢弃；
 * - 依据里不在本次输入中的联系人／记录 id（编造的）丢弃；剔完依据为空的块丢弃（处处有据）；
 * - 同一次调用必须产出 zh 与 en，任一语言为空的块丢弃；
 * - 每种块按上限截取（diagnosis 1、insight 3、gap 6、plan 1）；gap 的 needId 只认本次输入里的需求；
 * - 关键块不足（没有 diagnosis，或 insight 少于 2 条）→ 整份失败（不写库）。
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
}

export interface SnapshotValidationResult {
  blocks: SnapshotBlock[];
  /** 被丢弃的块与 id 数（REPORT／日志用，不含内容）。 */
  dropped: { blocks: number; contactIds: number; recordIds: number; needIds: number };
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
  const dropped = { blocks: 0, contactIds: 0, needIds: 0, recordIds: 0 };
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
