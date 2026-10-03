import { createProfileRouteHandlers } from "./handlers";
import { withTotalServerTiming } from "../../../shared/performance/server-timing";

export const dynamic = "force-dynamic";
// W0057（review P2）：首次设置关系目标后在 `after()` 里即时生成洞察（合批 ≤3 s + 供应商 ≤45 s + 写回），需要容纳它的时长。
export const maxDuration = 120;

const profileRouteHandlers = createProfileRouteHandlers();

export const GET = withTotalServerTiming(profileRouteHandlers.GET);
export const PUT = profileRouteHandlers.PUT;
