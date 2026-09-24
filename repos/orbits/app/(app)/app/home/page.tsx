/**
 * 个人 Home hub 页 route adapter — iOrbit 工作台合并后收窄成纯重定向。
 *
 * hub 的内容（身份、统计、活动、行动建议）已并入 /app/agent 的 iOrbit 概览屏
 * （`agent/iorbit-0918/iorbit-home.tsx`，数据仍来自同一个
 * `loadAppHomeRouteViewModel`）。这里只保留深链重定向，把旧书签/登录回跳带到
 * 工作台。原 hub 组件与 home route view model 留在原处不删除：`/app/home/events`
 * 子页与 agent 页仍在使用。（旧文案里的 `agent/orbit-agent-dashboard.tsx` 与
 * 「followups → today 的先例」都指向任务 6a 已删除的东西，2026-09-23 改正。）
 */
import { redirect } from "next/navigation";

export default function AppPersonalHomePage() {
  redirect("/app/agent");
}
