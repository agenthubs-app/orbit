/**
 * W0051：洞察三处（详情弹窗、洞察标签、待唤醒改读）共用的双语文案与依据链接（纯函数，客户端可用）。
 */
import type { ContactInsightEvidence } from "../../../../../shared/contract/contact-insight";
import type { NetworkCopy } from "../analysis/network-copy";
import { planNeedHref } from "../../agent/iorbit-0918/plan-anchors";

export const INSIGHT_EVIDENCE_LABEL: Readonly<Record<ContactInsightEvidence["source"], NetworkCopy>> = {
  capture: { en: "Added", zh: "添加" },
  encounter: { en: "Met", zh: "见面" },
  followup_done: { en: "Follow-up", zh: "跟进" },
  memo: { en: "Memo", zh: "备忘" },
  note: { en: "Note", zh: "笔记" },
  plan: { en: "Plan record", zh: "计划记录" },
  plan_need: { en: "Plan need", zh: "计划需求" },
  schedule: { en: "Meeting", zh: "日程" },
};

export const INSIGHT_EVIDENCE_ICON: Readonly<Record<ContactInsightEvidence["source"], string>> = {
  capture: "＋",
  encounter: "◎",
  followup_done: "✓",
  memo: "✎",
  note: "✎",
  plan: "◆",
  plan_need: "◆",
  schedule: "◷",
};

/** 「最近互动」里时间线条目的锚点 id（详情弹窗内跳到那条记录）。 */
export function timelineAnchorId(itemId: string): string {
  return `tl-${itemId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** 依据链接：计划需求去计划页；关系记录去联系人详情里的那条时间线。 */
export function insightEvidenceHref(evidence: ContactInsightEvidence, contactHref: string | null): string {
  if (evidence.source === "plan_need") return planNeedHref(evidence.id);
  return `${contactHref ?? ""}#${timelineAnchorId(evidence.id)}`;
}

export const INSIGHT_STATE_COPY = {
  deferred: { en: "Updates tomorrow — today's background AI quota is used up.", zh: "明天更新：今天的后台 AI 次数已用完。" },
  failed: { en: "The insight could not be generated.", zh: "洞察生成失败。" },
  goalUpdated: { en: "Goal updated", zh: "目标已更新" },
  inProgress: { en: "Generating…", zh: "正在生成…" },
  noGoal: { en: "Set a relationship goal to generate insights.", zh: "设置关系目标后生成洞察。" },
  none: { en: "No insight yet. It is generated after a memo, an enrichment or a plan link.", zh: "暂无洞察：写 memo、补全资料或在计划里关联 TA 后自动生成。" },
  pending: { en: "Waiting to be generated in the next background run.", zh: "等待生成：下一轮后台任务会生成。" },
  // W0057：详情面板——名片确认／重新分析后当场生成（≤60 秒）。洞察标签仍用上面的 pending（含后台积压）。
  generating: { en: "Generating — usually within a minute.", zh: "正在生成，通常 1 分钟内" },
  retrying: { en: "Generation failed. It will retry automatically shortly.", zh: "生成失败，稍后自动重试" },
  pollStopped: { en: "Still generating — refresh the page to check again.", zh: "仍在生成，请稍后刷新页面查看。" },
  quotaUsed: { en: "No AI actions left today. Available tomorrow.", zh: "今天次数已用完，明天可用" },
  regenerate: { en: "Regenerate", zh: "重新生成" },
  regenerating: { en: "Generating — refresh in a moment.", zh: "正在生成，稍后刷新查看。" },
  stale: { en: "Data changed", zh: "资料有更新" },
  unchanged: { en: "Nothing changed — the insight is up to date.", zh: "资料没有变化，洞察已是最新。" },
} as const satisfies Record<string, NetworkCopy>;
