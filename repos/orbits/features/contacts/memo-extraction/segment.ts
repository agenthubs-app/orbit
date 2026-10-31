/**
 * R33：超长备注的切段（plan-v3/DESIGN.md §2.4）。`MEMO_EXTRACTION_LIMITS.memoChars`（2000）不变，超过的备注在作业层
 * 切成 ≤2000 字的段分别抽取、结果合并；每段一次 provider 调用、各占一次后台池配额。
 *
 * 切在段落边界（空行 / 换行），段落太长再切在句子边界（。．！？.!? 后），只有一句话就超长时才硬切。
 * 各段拼回来等于原文（不丢字、不改字），所以不会把一句话从中间切开。
 */
import { MEMO_EXTRACTION_LIMITS } from "./provider";

const chars = (text: string) => Array.from(text).length;

function splitKeeping(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const end = (match.index ?? 0) + match[0].length;
    out.push(text.slice(last, end));
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.filter((part) => part.length > 0);
}

function hardSplit(text: string, max: number): string[] {
  const points = Array.from(text);
  const out: string[] = [];
  for (let at = 0; at < points.length; at += max) out.push(points.slice(at, at + max).join(""));
  return out;
}

/** 把 units 贪心装进 ≤max 字的段；单个 unit 超长时用 `fallback` 再拆。 */
function pack(units: readonly string[], max: number, fallback: (unit: string) => string[]): string[] {
  const segments: string[] = [];
  let current = "";
  for (const unit of units) {
    if (chars(unit) > max) {
      if (current) { segments.push(current); current = ""; }
      segments.push(...fallback(unit));
      continue;
    }
    if (current && chars(current) + chars(unit) > max) { segments.push(current); current = unit; } else current += unit;
  }
  if (current) segments.push(current);
  return segments;
}

export function segmentMemo(body: string, maxChars: number = MEMO_EXTRACTION_LIMITS.memoChars): string[] {
  if (chars(body) <= maxChars) return [body];
  const paragraphs = splitKeeping(body, /\n+/gu);
  const bySentence = (paragraph: string) => pack(splitKeeping(paragraph, /[。．！？!?](?=\s|$|[^。．！？!?])|\.(?=\s|$)/gu), maxChars, (sentence) => hardSplit(sentence, maxChars));
  return pack(paragraphs, maxChars, bySentence);
}
