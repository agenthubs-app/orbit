/**
 * agent-design AG19（获批视觉稿 2026-11-19，D1–D6）：两端渲染回答分块时共用的纯函数。
 *
 * - 一份结果文档该显示哪些块（显示了确认卡，就不再显示代表它的那一句）；
 * - 一组卡片先显示哪几张、「还有 N 条」收着哪几张（D2，点一下原地展开，不重新请求）；
 * - 卡片左边的小图标块：活动用活动页同一个 emoji，联系人用名字的第一个字，其余按类型取固定图标和颜色；
 * - 记录是否「已不在」的核对要发给服务端的那一份清单（和 @ 选择器用同一个接口）。
 *
 * 去哪个页面由两端各自的链接表决定（网页和 App 的路由不同），不在这里。
 */
import type { AgentAnswerBlockContract, AgentAnswerRecordContract, AgentAnswerRecordKind, AgentResultDocument } from "../contract/agent-v1";
import { eventEmoji } from "./event-emoji";

export type AnswerBlock = AgentAnswerBlockContract;
export type AnswerRecordsBlock = Extract<AgentAnswerBlockContract, { type: "records" }>;

/** 这份结果文档要显示的块；没有分块信息（以前的对话）时返回 null，两端照旧显示文字。 */
export function answerBlocksOf(result: Pick<AgentResultDocument, "answer">, showsCard: boolean): AnswerBlock[] | null {
  const blocks = result.answer?.blocks;
  if (!blocks?.length) return null;
  const line = result.answer?.cardLine?.trim();
  const shown = blocks.filter((block) => !(showsCard && line && block.type === "paragraph" && block.text.trim() === line));
  return shown;
}

/** 这组卡片现在显示的几张，和收起来的张数。 */
export function recordsShown(block: AnswerRecordsBlock, expanded: boolean): { items: readonly AgentAnswerRecordContract[]; hidden: number; foldable: boolean } {
  const first = Math.max(0, Math.min(block.shown, block.items.length));
  const foldable = block.items.length > first && Boolean(block.moreLabel);
  if (!foldable) return { foldable: false, hidden: 0, items: block.items };
  return expanded ? { foldable, hidden: 0, items: block.items } : { foldable, hidden: block.items.length - first, items: block.items.slice(0, first) };
}

export type AnswerTileTone = "lav" | "pink" | "blue" | "teal" | "apricot" | "plum";
const AVATAR_TONES: readonly AnswerTileTone[] = ["lav", "pink", "blue", "teal", "apricot"];
const KIND_TONE: Record<Exclude<AgentAnswerRecordKind, "contact" | "event">, AnswerTileTone> = { attendance: "plum", memo: "apricot", schedule: "teal", todo: "blue" };

/** 卡片左边的小图标块：emoji（活动）、头像字（联系人，圆形，颜色按在这组里的位置轮换）或类型图标。 */
export type AnswerTile =
  | { shape: "emoji"; emoji: string; tone: AnswerTileTone }
  | { shape: "avatar"; letter: string; tone: AnswerTileTone }
  | { shape: "icon"; icon: "todo" | "memo" | "schedule" | "attendance"; tone: AnswerTileTone };

export function answerTileOf(record: Pick<AgentAnswerRecordContract, "kind" | "title">, index: number): AnswerTile {
  if (record.kind === "event") return { emoji: eventEmoji({ title: record.title }), shape: "emoji", tone: "lav" };
  if (record.kind === "contact") return { letter: [...record.title.trim()][0]?.toUpperCase() ?? "?", shape: "avatar", tone: AVATAR_TONES[index % AVATAR_TONES.length] ?? "lav" };
  return { icon: record.kind, shape: "icon", tone: KIND_TONE[record.kind] };
}

/** 一条记录的键（同一条记录在两端的状态表里用它）。 */
export const answerRecordKey = (record: Pick<AgentAnswerRecordContract, "kind" | "id">) => `${record.kind}:${record.id}`;

/** 这些块里的全部记录卡片（不重复）。 */
export function answerRecordsIn(blocks: readonly AnswerBlock[] | null | undefined): AgentAnswerRecordContract[] {
  const seen = new Set<string>();
  const out: AgentAnswerRecordContract[] = [];
  for (const block of blocks ?? []) {
    if (block.type !== "records") continue;
    for (const item of block.items) {
      const key = answerRecordKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * 核对「还打不打得开」时发给 POST /api/agent/references/check 的清单（每次最多 20 条）。
 * 服务端标了 gone 的不再核对。
 */
export function answerRecordCheckInput(records: readonly AgentAnswerRecordContract[]): { type: AgentAnswerRecordKind; id: string; eventKind?: "platform" | "private" }[] {
  return records.filter((record) => !record.gone).slice(0, 20).map((record) => ({ id: record.id, type: record.kind, ...(record.kind === "event" && record.eventKind ? { eventKind: record.eventKind } : {}) }));
}
