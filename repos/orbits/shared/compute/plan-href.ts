/**
 * R22（DESIGN §7、§8）计划 v2 的深链构造函数。两端同一份文件（`npm run sync:contract` 同步到 App）。
 *
 * - 路径段两端一致（`plans/...`）；Web 挂在 `/app/` 下，App 挂在根 `/` 下。
 * - Task 画面的「プラン」段两端写法不同：Web `/app/tasks?tab=plan&plan=<planId>`，App `/task?seg=plan&plan=<planId>`。
 * - 零 import 的纯函数；id 一律 `encodeURIComponent`。页面由 R23（生成流程、草稿编辑）和 R24（概要、类型、振り返り、完了、旧计划）落地。
 */
export type PlanHrefPlatform = "web" | "app";

const prefix = (platform: PlanHrefPlatform) => (platform === "web" ? "/app/" : "/");
const seg = (value: string) => encodeURIComponent(value);

/** 生成流程（问答 → 背景 → 草稿）：`plans/flow/<intakeId>`。 */
export function planFlowHref(platform: PlanHrefPlatform, intakeId: string): string {
  return `${prefix(platform)}plans/flow/${seg(intakeId)}`;
}

/** 草稿编辑：`plans/drafts/<draftId>/edit`。 */
export function planDraftEditHref(platform: PlanHrefPlatform, draftId: string): string {
  return `${prefix(platform)}plans/drafts/${seg(draftId)}/edit`;
}

/** 计划概要：`plans/<planId>`。 */
export function planOverviewHref(platform: PlanHrefPlatform, planId: string): string {
  return `${prefix(platform)}plans/${seg(planId)}`;
}

/** 人物类型详情：`plans/<planId>/types/<itemId>`。 */
export function planTypeHref(platform: PlanHrefPlatform, planId: string, itemId: string): string {
  return `${prefix(platform)}plans/${seg(planId)}/types/${seg(itemId)}`;
}

/** 振り返り：`plans/<planId>/review`。 */
export function planReviewHref(platform: PlanHrefPlatform, planId: string): string {
  return `${prefix(platform)}plans/${seg(planId)}/review`;
}

/** 目標達成：`plans/<planId>/done`。 */
export function planDoneHref(platform: PlanHrefPlatform, planId: string): string {
  return `${prefix(platform)}plans/${seg(planId)}/done`;
}

/** 旧计划（v1，只读）：`plans/legacy/<planId>`。 */
export function planLegacyHref(platform: PlanHrefPlatform, planId: string): string {
  return `${prefix(platform)}plans/legacy/${seg(planId)}`;
}

/** Task 画面「プラン」段；不给 planId 时打开最近打开的目标。 */
export function planTaskSegmentHref(platform: PlanHrefPlatform, planId?: string | null): string {
  const plan = planId ? `&plan=${seg(planId)}` : "";
  return platform === "web" ? `/app/tasks?tab=plan${plan}` : `/task?seg=plan${plan}`;
}

/** 新目标的目標入力（Task 画面「プラン」段直接打开输入）；v1 创建入口关闭后的落点（R25）。 */
export function planNewGoalHref(platform: PlanHrefPlatform): string {
  return platform === "web" ? "/app/tasks?tab=plan&new=1" : "/task?seg=plan&new=1";
}
