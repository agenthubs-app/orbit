/**
 * iOrbit 对话里的计划回答卡片：页面自有的视图模型 + 从已保存计划的映射（W0008，RW-08）。
 *
 * 呈现组件（`iorbit-plan-card.tsx`）只吃这里的 `IOrbitPlanCardView`，不碰 `features/plans`
 * 的 DTO；映射 `planCardViewFromSnapshot` 由服务端页面（`agent/page.tsx`）调用。
 * 本文件不 import React，node 测试直接用。
 *
 * 揭示节奏（「生成中 → 已完成」）也定义在这里：同一份已保存的计划，按确定的顺序分段出现——
 * 先是一句话回答、3 个关键数字和阶段骨架（第 1 阶段带内容，后面的是骨架／排队中），
 * 然后每隔 `PLAN_REVEAL_STEP_MS` 补齐一个阶段，最后出现其余各块与「已保存为你的计划 v1」。
 */
import type { PlanItem, PlanSnapshot } from "../../../../../features/plans/contract";
import type { PlanAnalysisV1 } from "../../../../../features/plans/generator";

export interface IOrbitPlanCardPhase {
  key: string;
  n: number;
  startWeek: number;
  endWeek: number;
  granularity: "week" | "quarter";
  title: string;
  summary: string | null;
  who: string[];
  current: boolean;
  detailed: boolean;
  actions: Array<{ week: number | null; title: string }>;
  infos: string[];
  events: Array<{ title: string; date: string | null }>;
  followups: string[];
}

export interface IOrbitPlanCardView {
  planId: string;
  version: number;
  horizon: "month" | "quarter" | "year";
  totalWeeks: number;
  question: string;
  supplement: string | null;
  read: { contacts: number; events: number };
  answer: Array<{ text: string; emphasis: boolean }>;
  figures: Array<{ value: string; unit: string; label: string }>;
  phases: IOrbitPlanCardPhase[];
  thisWeek: Array<{ title: string; why: string }>;
  allies: Array<{ initial: string; name: string; subtitle: string | null; help: string }>;
  gaps: string[];
  risk: string;
  pitch: { setting: string; text: string };
}

/** 对话消息上的卡片（`AgentMessage.planCard`）：`reveal` = 刚生成完，按节奏揭示一次。 */
export interface IOrbitPlanCardMessage {
  view: IOrbitPlanCardView;
  reveal: boolean;
}

/** 揭示节奏：每一步的间隔。 */
export const PLAN_REVEAL_STEP_MS = 700;

/**
 * 揭示进度 0…N：0 = 只有结论与骨架（第 1 阶段已填），k = 前 k+1 个阶段已填，
 * `planRevealDoneStage(view)` = 全部完成（出现其余各块与保存卡片）。
 */
export function planRevealDoneStage(view: Pick<IOrbitPlanCardView, "phases">): number {
  return Math.max(1, view.phases.length);
}

function eventDate(startsAt: unknown): string | null {
  if (typeof startsAt !== "string") return null;
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return null;
  const tokyo = new Date(ms + 9 * 3_600_000);
  return `${tokyo.getUTCMonth() + 1}/${tokyo.getUTCDate()}`;
}

function isBootstrapAnalysis(value: Record<string, unknown>): value is Record<string, unknown> & PlanAnalysisV1 {
  return value.kind === "plan_bootstrap" && value.version === 1 && Array.isArray(value.answer) && Array.isArray(value.figures);
}

const byWeek = (a: PlanItem, b: PlanItem) =>
  (a.suggestedWeek ?? Number.MAX_SAFE_INTEGER) - (b.suggestedWeek ?? Number.MAX_SAFE_INTEGER) || a.sortKey - b.sortKey;

/** 已保存的计划 → 卡片。不是由第一份计划生成（没有回答卡片数据）的计划返回 null。 */
export function planCardViewFromSnapshot(snapshot: PlanSnapshot): IOrbitPlanCardView | null {
  const { plan, items } = snapshot;
  if (!isBootstrapAnalysis(plan.analysis)) return null;
  const analysis = plan.analysis;
  const analysisPhases = new Map((analysis.phases ?? []).map((phase) => [phase.key, phase]));

  const phases = plan.phases.map((phase, index): IOrbitPlanCardPhase => {
    const own = items.filter((item) => item.phaseKey === phase.key);
    const extra = analysisPhases.get(phase.key);
    return {
      actions: own.filter((item) => item.kind === "action").sort(byWeek).map((item) => ({ title: item.title, week: item.suggestedWeek })),
      current: index === 0,
      detailed: extra?.detailed ?? phase.granularity === "week",
      endWeek: phase.endWeek,
      events: own
        .filter((item) => item.kind === "event")
        .sort(byWeek)
        .map((item) => ({ date: eventDate(item.meta.startsAt), title: item.title })),
      followups: extra?.followups ?? [],
      granularity: phase.granularity,
      infos: own.filter((item) => item.kind === "info").map((item) => item.title),
      key: phase.key,
      n: index + 1,
      startWeek: phase.startWeek,
      summary: phase.summary,
      title: phase.title,
      who: extra?.who ?? own.filter((item) => item.kind === "network_need").map((item) => item.title),
    };
  });

  return {
    allies: analysis.allies.map((ally) => ({
      help: ally.help,
      initial: Array.from(ally.name.trim())[0] ?? "·",
      name: ally.name,
      subtitle: ally.subtitle,
    })),
    answer: analysis.answer.map((segment) => ({ emphasis: segment.emphasis === true, text: segment.text })),
    figures: analysis.figures.slice(0, 3),
    gaps: analysis.gaps,
    horizon: plan.horizon,
    phases,
    pitch: analysis.pitch,
    planId: plan.id,
    question: analysis.request?.question ?? "",
    read: { contacts: analysis.read?.contacts ?? 0, events: analysis.read?.events ?? 0 },
    risk: analysis.risk,
    supplement: analysis.request?.supplement ?? null,
    thisWeek: analysis.thisWeek.map((action) => ({ title: action.title, why: action.why })),
    totalWeeks: plan.phases[plan.phases.length - 1]?.endWeek ?? 0,
    version: plan.version,
  };
}
