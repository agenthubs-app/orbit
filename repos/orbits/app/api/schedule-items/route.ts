import { createScheduleItemsGetHandler } from "./handler";
import { withTotalServerTiming } from "../../../shared/performance/server-timing";

export const dynamic = "force-dynamic";
export const GET = withTotalServerTiming(createScheduleItemsGetHandler());

export { POST } from "./personal-route";
