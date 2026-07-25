/**
 * 跟进日程页 route adapter — T3（today-schedule 合并）后收窄成纯重定向。
 *
 * 这个页面的内容已经并入 /app/today 左栏时间脊柱（T1，
 * `today/orbit-today-time-spine.tsx`）；这里只保留一个深链重定向，把旧书签
 * /外链带到合并页的当日视图。原组件
 * （`loadAppFollowupsRouteViewModel` / `followupsRouteToOrbitScheduleViewModel`
 * / `OrbitRealSchedule`）仍留在原处不删除——前两者仍被
 * `today/compose-app-today-from-agent-ledger/today-merged-view-model.ts`
 * 复用；`OrbitRealSchedule` 目前没有其它调用方了。
 */
import { redirect } from "next/navigation";

export default function AppFollowupsPage() {
  redirect("/app/today?view=day");
}
