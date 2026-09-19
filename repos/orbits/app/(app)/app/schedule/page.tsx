/**
 * 日程安排页 route adapter — iOrbit 工作台合并后第二次收窄成纯重定向。
 *
 * T3（today-schedule 合并）后本页已收窄为 /app/today#arrangements 重定向；
 * Orbit_0918 批次 5a 起 /app/today 本身重定向到 iOrbit home，日程能力由
 * plan 屏（/app/agent/plan，本周日程 = home-facts appointments）承载，
 * 这里改为指向 plan 屏。原组件（schedule-route-view-model.ts /
 * orbit-real-schedule-page.tsx）仍留在原处不删除——前者仍被
 * today/compose-app-today-from-agent-ledger/today-merged-view-model.ts 复用；
 * 后者目前没有其它调用方了。`schedule/events/[id]/` 详情页不受影响，
 * 继续独立工作。
 */
import { redirect } from "next/navigation";

export default function AppSchedulePage() {
  redirect("/app/agent/plan");
}
