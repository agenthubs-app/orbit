import { createScheduleMeetingDetailsHandlers } from "../../meeting-details-handler";

export const dynamic = "force-dynamic";
export const { GET, PATCH } = createScheduleMeetingDetailsHandlers();
