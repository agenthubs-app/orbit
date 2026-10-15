/**
 * R17（host/DESIGN.md §2.6「受付番号」、§3.3）：受付番号 `A-001`…`A-999`、`B-001`…。Owner: 甲 (R17).
 * 序号按活动计数、从 1 开始；取消不回收（计数器只往前）。服务端在变成 admitted 的同一事务里分配。
 */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PER_LETTER = 999;

/** 第 n 个（1 起）受付番号。超过 24 × 999 之后字母部分变成两位（实际不会到）。 */
export function receptionNumberFor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("reception sequence starts at 1");
  const block = Math.floor((sequence - 1) / PER_LETTER);
  const within = ((sequence - 1) % PER_LETTER) + 1;
  const prefix = block < LETTERS.length ? LETTERS[block]! : `${LETTERS[Math.floor(block / LETTERS.length) - 1] ?? "Z"}${LETTERS[block % LETTERS.length]}`;
  return `${prefix}-${String(within).padStart(3, "0")}`;
}
