/**
 * 个人 Home hub 页 route adapter — iOrbit 工作台合并后收窄成纯重定向。
 *
 * hub 的内容（身份、统计、活动、行动建议）已并入 /app/agent 的 dashboard 首屏
 * （`agent/orbit-agent-dashboard.tsx`，数据仍来自同一个
 * `loadAppHomeRouteViewModel`）。这里只保留深链重定向，把旧书签/登录回跳带到
 * 工作台——同 followups → today 的先例。原 hub 组件与 home route view model 留在原处
 * 不删除：`/app/home/events` 子页与 agent 页仍在使用。
 */
import { redirect } from "next/navigation";

export default function AppPersonalHomePage() {
  redirect("/app/agent");
}
