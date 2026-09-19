/**
 * 跟进日程页 route adapter — iOrbit 工作台合并后第二次收窄成纯重定向。
 *
 * T3（today-schedule 合并）后本页已收窄为 /app/today?view=day 重定向；
 * Orbit_0918 批次 5a 起 /app/today 本身重定向到 iOrbit home，跟进能力由
 * plan 屏（/app/agent/plan，本周重点任务 = followups.current + 执行中
 * 账本项）承载，这里同步改指 plan 屏。原组件
 * （loadAppFollowupsRouteViewModel / followupsRouteToOrbitScheduleViewModel
 * / OrbitRealSchedule）仍留在原处不删除——前两者仍被
 * today/compose-app-today-from-agent-ledger/today-merged-view-model.ts
 * 复用；OrbitRealSchedule 目前没有其它调用方了。
 */
import { redirect } from "next/navigation";

export default function AppFollowupsPage() {
  redirect("/app/agent/plan");
}
