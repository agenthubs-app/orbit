/**
 * R37a 计划主页 v3 的纯函数（plan-draft-v5-proposal.html v16「计划主页 · 执行」）。界面只渲染这里算好的东西；
 * R37b（App 主页）可直接照搬这几个函数。
 */
import type { PlanHomeAction, PlanHomeSeat, PlanHomeView, PlanPrepCardView, PlanPrepRow, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { flowTypeTone } from "./plan-model";

/** 当前阶段（0 起）：第一个没完成的阶段；全部完成 = 最后一个。 */
export function currentStepIndex(detail: Pick<PlanV2Detail, "content">): number {
  const steps = detail.content.steps;
  const index = steps.findIndex((step) => !step.completedAt);
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}

export interface HomeHeader {
  stepIndex: number;
  stepCount: number;
  stepTitle: string;
  /** 人脉里已有的人（每类封顶到需要人数）/ 需要的人数（跳过的类型不算）。 */
  found: number;
  need: number;
  score: number;
  total: number;
  /** 进度条宽度（0–100）= 分数 / 满分。 */
  barPercent: number;
}

export function seatOf(home: Pick<PlanHomeView, "seats"> | null | undefined, typeKey: string): PlanHomeSeat | null {
  return home?.seats?.find((seat) => seat.typeKey === typeKey) ?? null;
}

/** 头部：阶段在前、分数退后（字段表：系统算）。 */
export function homeHeader(detail: Pick<PlanV2Detail, "content" | "score" | "home">): HomeHeader {
  const stepIndex = currentStepIndex(detail);
  const types = detail.content.personTypes.filter((type) => !type.skipped);
  const need = types.reduce((sum, type) => sum + type.targetCount, 0);
  const found = types.reduce((sum, type) => sum + Math.min(type.targetCount, seatOf(detail.home, type.key)?.people.length ?? 0), 0);
  const total = detail.content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + detail.content.event.allocation;
  const score = detail.score.total;
  return { barPercent: total > 0 ? Math.max(0, Math.min(100, Math.round((score / total) * 100))) : 0, found, need, score, stepCount: detail.content.steps.length, stepIndex, stepTitle: detail.content.steps[stepIndex]?.title ?? "", total, };
}

/** 类型在方案里的序号（1 起，底色轮转用；R36a：从蓝开始 = `flowTypeTone(index - 1)`）。 */
export function typeToneOf(detail: Pick<PlanV2Detail, "content">, typeKey: string | null): ReturnType<typeof flowTypeTone> | "pink" {
  if (!typeKey) return "pink";
  const index = detail.content.personTypes.findIndex((type) => type.key === typeKey);
  return index >= 0 ? flowTypeTone(index - 1) : "blue";
}

/** 准备卡的行（原型顺序）：他是谁 / 怎么认识 / 上次联系 / 你的备注（每条用到的事实一行）/ 共同点；活动：时间地点 / 介绍 / 和你的计划。 */
export type PrepLine = { kind: "row"; row: PlanPrepRow } | { kind: "fact"; fact: PlanPrepCardView["usedFacts"][number] };

const ROW_ORDER: PlanPrepRow["key"][] = ["who", "met", "last_contact"];
const TAIL_ORDER: PlanPrepRow["key"][] = ["common", "when_where", "about", "plan_fit"];

export function prepLines(prep: PlanPrepCardView): PrepLine[] {
  const pick = (keys: PlanPrepRow["key"][]) => keys.flatMap((key) => prep.rows.filter((row) => row.key === key).map((row): PrepLine => ({ kind: "row", row })));
  return [...pick(ROW_ORDER), ...prep.usedFacts.map((fact): PrepLine => ({ fact, kind: "fact" })), ...pick(TAIL_ORDER)];
}

/** 开场白的画线：`refs` 的范围就是下划线（`MarkedText` 的 `marks`）。 */
export function draftMarked(prep: PlanPrepCardView) {
  return { marks: prep.draft.refs.map((span) => ({ end: span.end, start: span.start })), refs: [], text: prep.draft.text };
}

/** 「月/日」（事实日期的角标）。 */
export function monthDay(date: string | null): string {
  if (!date) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[2]}/${match[3]}` : "";
}

/** 勾选的乐观更新（回应到达前先改界面）。 */
export function withDone(home: PlanHomeView, actionKey: string, done: boolean): PlanHomeView {
  return { ...home, actions: home.actions.map((action) => (action.actionKey === actionKey ? { ...action, done } : action)) };
}

/** 勾选 / 重新生成的回应没有 `seats`：沿用上次的。 */
export function mergeHome(previous: PlanHomeView | null | undefined, next: PlanHomeView): PlanHomeView {
  return next.seats ? next : { ...next, ...(previous?.seats ? { seats: previous.seats } : {}) };
}

export const isEventAction = (action: Pick<PlanHomeAction, "kind">) => action.kind === "event";
