import { createScheduleItemsGetHandler } from "./handler";

export const dynamic = "force-dynamic";
export const GET = createScheduleItemsGetHandler();

export { POST } from "./personal-route";
