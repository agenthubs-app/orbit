/**
 * 日程安排页 route adapter — T3（today-schedule 合并）后收窄成纯重定向。
 *
 * "可复核安排" 已并入 /app/today 右栏（T1，`OrbitTodayArrangements`，容器带
 * `id="arrangements"`）；这里只保留一个深链重定向。原组件
 * （`schedule-route-view-model.ts` / `orbit-real-schedule-page.tsx`）仍留在
 * 原处不删除——前者仍被
 * `today/compose-app-today-from-agent-ledger/today-merged-view-model.ts`
 * 复用；`orbit-real-schedule-page.tsx` 目前没有其它调用方了。
 * `schedule/events/[id]/` 详情页不受影响，继续独立工作。
 */
import { redirect } from "next/navigation";

export default function AppSchedulePage() {
  redirect("/app/today#arrangements");
}
