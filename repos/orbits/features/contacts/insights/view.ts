/**
 * W0051：洞察行 → 只读视图（纯函数；列表、详情、洞察标签、待唤醒共用）。读取路径不 import 生成器或配额。
 *
 * 状态：当前没有关系目标 → no_goal（W51-6）；没有行 → none；ready／pending（含「明天更新」顺延）／failed。
 * 过期：行被标待更新（dirty）或生成时的目标哈希与当前目标不同（W51-1「目标已更新」角标）。
 * 「重新生成」只在过期或失败时可用（W51-2），正在生成时不可用。
 */
import {
  type ContactInsightEvidence,
  type ContactInsightState,
  type ContactInsightText,
} from "../../../shared/contract/contact-insight";
import { CONTACT_INSIGHT_PREVIEW_LIMIT } from "./limits";
import { contactInsightGoalHash, type ContactInsightRow } from "./repository";

export interface ContactInsightView {
  contactId: string;
  state: ContactInsightState;
  goalRelation: ContactInsightText | null;
  nextStep: ContactInsightText | null;
  evidence: ContactInsightEvidence[];
  relevance: number | null;
  generatedAt: string | null;
  /** 数据变了（待更新）或目标已更新。 */
  stale: boolean;
  goalUpdated: boolean;
  /** 后台额度用尽、顺延到的时间（「明天更新」）。 */
  deferredUntil: string | null;
  inProgress: boolean;
  canRegenerate: boolean;
}

export function contactInsightView(row: ContactInsightRow | null | undefined, input: { contactId: string; goal: string | null; now: Date; goalKnown?: boolean }): ContactInsightView {
  const goal = (input.goal ?? "").trim();
  const base: ContactInsightView = {
    canRegenerate: false,
    contactId: input.contactId,
    deferredUntil: null,
    evidence: [],
    generatedAt: null,
    goalRelation: null,
    goalUpdated: false,
    inProgress: false,
    nextStep: null,
    relevance: null,
    stale: false,
    state: "none",
  };
  if (!row && input.goalKnown === false) return base;
  if (!goal) return { ...base, state: "no_goal" };
  if (!row) return base;
  const nowMs = input.now.getTime();
  const inProgress = row.aiState === "started" && row.leaseExpiresAt !== null && Date.parse(row.leaseExpiresAt) > nowMs;
  const goalUpdated = row.goalHash !== null && row.goalHash !== contactInsightGoalHash(goal);
  const deferredUntil = row.deferredUntil && Date.parse(row.deferredUntil) > nowMs ? row.deferredUntil : null;
  const view: ContactInsightView = {
    ...base,
    deferredUntil,
    evidence: row.evidence,
    generatedAt: row.generatedAt,
    goalRelation: row.goalRelation,
    goalUpdated,
    inProgress,
    nextStep: row.nextStep,
    relevance: row.relevance,
    stale: row.dirtyAt !== null || goalUpdated,
  };
  if (row.status === "blocked_no_goal") {
    // 生成时没有目标，现在有了：等下一次重新分析统一标记，或手动重新生成。
    return { ...view, canRegenerate: !inProgress, goalUpdated: true, stale: true, state: "none" };
  }
  const state: ContactInsightState = row.status === "ready" ? "ready" : row.status === "failed" ? "failed" : "pending";
  const canRegenerate = !inProgress && (state === "failed" || (state === "ready" && view.stale));
  return { ...view, canRegenerate, state };
}

function clip(value: string, limit: number): string {
  const chars = Array.from(value.trim());
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : chars.join("");
}

/** 列表里的洞察一句：「和你目标的关系」中英各截 60 字；没有文字时不给。 */
export function contactInsightPreview(row: Pick<ContactInsightRow, "goalRelation"> | null | undefined): ContactInsightText | undefined {
  if (!row?.goalRelation) return undefined;
  return { en: clip(row.goalRelation.en, CONTACT_INSIGHT_PREVIEW_LIMIT), zh: clip(row.goalRelation.zh, CONTACT_INSIGHT_PREVIEW_LIMIT) };
}
