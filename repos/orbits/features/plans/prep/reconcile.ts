/**
 * R37a 准备卡与「先做的事」的逐句对账（plan-v3/DESIGN.md §2.5、字段表「计划主页」）。纯函数，AI 输出进库前都过这里。
 *
 * - 挑选：编号对不上的那件丢掉；标题 / 理由超上限的那件丢掉；加粗不是理由子串就去掉加粗；`lead` 超上限不显示。
 * - 开场白：一句里的画线片段必须引用存在的事实 / 回答 / 字段，且和出处原文足够重合（最长公共子串 ≥ 片段的 60%，
 *   允许「他」→「您」这类改写人称）；任何一处不合格 → 删整句。整段删空 → 通用模板（`fallback: true`）。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanMarkedText, PlanPrepDraft, PlanPrepRef } from "../../../shared/contract/plan-v2";
import { PLAN_HOME_LIMITS, type PlanPickOutput, type PlanPrepCardOutput } from "./types";

const chars = (text: string) => Array.from(text).length;

/** 去空白与常见标点、转小写：对账只看内容字。 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 两串的最长公共子串长度（按码点）。 */
export function longestCommonSubstring(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let best = 0;
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const row = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        row[j] = prev[j - 1]! + 1;
        if (row[j]! > best) best = row[j]!;
      }
    }
    prev = row;
  }
  return best;
}

/** 画线片段与出处原文是否对得上：规范化后最长公共子串 ≥ 片段长度的 60%（且 ≥2 字）。 */
export function underlineMatches(underline: string, source: string): boolean {
  const u = normalizeForMatch(underline);
  const s = normalizeForMatch(source);
  if (chars(u) < 2 || !s) return false;
  if (s.includes(u)) return true;
  const need = Math.max(2, Math.ceil(chars(u) * 0.6));
  return longestCommonSubstring(u, s) >= need;
}

export interface DraftSources {
  facts: ReadonlyMap<string, string>;
  answers: ReadonlyMap<string, string>;
  fields: ReadonlyMap<string, string>;
}

function sourceText(sources: DraftSources, ref: PlanPrepRef): string | null {
  if (ref.kind === "fact") return sources.facts.get(ref.factId) ?? null;
  if (ref.kind === "answer") return sources.answers.get(ref.questionKey) ?? null;
  return sources.fields.get(ref.field) ?? null;
}

export interface ReconciledDraft {
  draft: PlanPrepDraft;
  /** 被删掉的句子数（日志用）。 */
  removed: number;
  /** 实际被保留句子引用到的事实 / 回答。 */
  factIds: string[];
  answerKeys: string[];
}

/**
 * 逐句对账并拼成 `PlanPrepDraft`（下标为 UTF-16，与 `PlanMarkedText` 一致）。超过 160 字时从句尾往前丢整句。
 * 片段在句中找不到（不是该句的子串）也算不合格。
 */
export function reconcileDraft(sentences: PlanPrepCardOutput["sentences"], sources: DraftSources): ReconciledDraft {
  const kept: Array<{ text: string; underlines: Array<{ start: number; end: number; ref: PlanPrepRef }> }> = [];
  let removed = 0;
  for (const sentence of sentences) {
    // R38 真调用：模型偶尔自己用 `{…}` 把画线片段括起来（「{3か月以内}の完了を…」）；正文里不该出现花括号，先去掉再对账。
    const text = sentence.text.replace(/[{}｛｝]/gu, "").trim();
    if (!text) continue;
    const spans: Array<{ start: number; end: number; ref: PlanPrepRef }> = [];
    let ok = true;
    let cursor = 0;
    for (const line of sentence.underlines) {
      const source = sourceText(sources, line.ref);
      const at = line.text ? text.indexOf(line.text, cursor) : -1;
      if (!source || at < 0 || !underlineMatches(line.text, source)) { ok = false; break; }
      spans.push({ end: at + line.text.length, ref: line.ref, start: at });
      cursor = at + line.text.length;
    }
    if (ok) kept.push({ text, underlines: spans });
    else removed += 1;
  }
  while (kept.length && chars(kept.map((sentence) => sentence.text).join("")) > PLAN_HOME_LIMITS.draftChars) {
    kept.pop();
    removed += 1;
  }
  let offset = 0;
  const refs: Array<{ start: number; end: number; ref: PlanPrepRef }> = [];
  for (const sentence of kept) {
    for (const span of sentence.underlines) refs.push({ end: span.end + offset, ref: span.ref, start: span.start + offset });
    offset += sentence.text.length;
  }
  const factIds = [...new Set(refs.flatMap((span) => (span.ref.kind === "fact" ? [span.ref.factId] : [])))];
  const answerKeys = [...new Set(refs.flatMap((span) => (span.ref.kind === "answer" ? [span.ref.questionKey] : [])))];
  return { answerKeys, draft: { refs, text: kept.map((sentence) => sentence.text).join("") }, factIds, removed };
}

const FALLBACK: Record<PlanCopyLanguage, { draft: (input: FallbackInput) => string; hook: { label: string; reason: string } }> = {
  en: {
    draft: ({ me, organization, name, goal }) => `Hello${name ? ` ${name}` : ""}, I'm ${me}${organization ? ` from ${organization}` : ""}. I'm working on ${goal}, and I'd value 20 minutes of your view on it. Any time that suits you works for me.`,
    hook: { label: "A small ask", reason: "Say who you are and keep the ask small." },
  },
  ja: {
    draft: ({ me, organization, name, goal }) => `${name ? `${name}さん、` : ""}はじめまして、${organization ? `${organization}の` : ""}${me}です。いま「${goal}」に取り組んでいて、ぜひ一度ご意見をうかがえればと思っています。20分ほど、ご都合のよい時間にお話しできませんか。`,
    hook: { label: "自己紹介と小さなお願い", reason: "情報が少ないときは距離を詰めすぎず、誰なのかをはっきり伝え、お願いを小さくして答えやすくします。" },
  },
  zh: {
    draft: ({ me, organization, name, goal }) => `${name ? `${name}，` : ""}您好，我是${organization ? `${organization}的` : ""}${me}。我们正在推进「${goal}」，很想听听您的看法。20 分钟就好，时间按您方便。`,
    hook: { label: "说清你是谁 + 小请求", reason: "信息不多时不套近乎：说清你是谁，再把请求压到最小，让对方答应起来不费力。" },
  },
};

export interface FallbackInput {
  me: string;
  organization: string | null;
  name: string | null;
  goal: string;
}

/** 通用模板「说清你是谁 + 很小的请求」（没有画线、没有引用）。 */
export function fallbackCard(language: PlanCopyLanguage, input: FallbackInput): { hook: { label: string; reason: string }; draft: PlanPrepDraft } {
  const copy = FALLBACK[language];
  return { draft: { refs: [], text: copy.draft(input) }, hook: { ...copy.hook } };
}

/** 切入点合格：名 ≤12 字、理由 ≤60 字、都非空。 */
export function hookValid(hook: { label: string; reason: string } | null | undefined): hook is { label: string; reason: string } {
  return Boolean(hook && hook.label.trim() && hook.reason.trim() && chars(hook.label.trim()) <= PLAN_HOME_LIMITS.hookLabelChars && chars(hook.reason.trim()) <= PLAN_HOME_LIMITS.hookReasonChars);
}

/** 理由 + 可选加粗 → `PlanMarkedText`（加粗不是子串或超 14 字就不加粗）。 */
export function markedReason(reason: string, bold: string | null): PlanMarkedText {
  const at = bold ? reason.indexOf(bold) : -1;
  const marks = bold && at >= 0 && chars(bold) <= PLAN_HOME_LIMITS.boldChars ? [{ end: at + bold.length, start: at }] : [];
  return { marks, refs: [], text: reason };
}

export interface ReconciledPicks {
  lead: string | null;
  picks: Array<{ index: number; title: string; reason: PlanMarkedText }>;
  dropped: number;
}

/** 挑选对账：编号 1…candidateCount、去重、≤3 件；标题 / 理由超限或为空的那件丢掉。 */
export function reconcilePicks(output: PlanPickOutput, candidateCount: number): ReconciledPicks {
  const seen = new Set<number>();
  const picks: ReconciledPicks["picks"] = [];
  let dropped = 0;
  for (const pick of output.picks) {
    const title = pick.title.trim();
    const reason = pick.reason.trim();
    const valid = Number.isInteger(pick.no) && pick.no >= 1 && pick.no <= candidateCount && !seen.has(pick.no)
      && title && reason && chars(title) <= PLAN_HOME_LIMITS.titleChars && chars(reason) <= PLAN_HOME_LIMITS.reasonChars;
    if (!valid || picks.length >= PLAN_HOME_LIMITS.actions) { dropped += 1; continue; }
    seen.add(pick.no);
    picks.push({ index: pick.no - 1, reason: markedReason(reason, pick.bold?.trim() || null), title });
  }
  const lead = output.lead?.trim() ?? "";
  return { dropped, lead: lead && chars(lead) <= PLAN_HOME_LIMITS.leadChars ? lead : null, picks };
}
