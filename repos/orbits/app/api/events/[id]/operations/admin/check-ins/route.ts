import {
  createEventOperationsLimitedCheckInRosterGetHandler,
  createEventOperationsManualCheckInPostHandler,
} from "../../handlers";

export const dynamic = "force-dynamic";
export const GET = createEventOperationsLimitedCheckInRosterGetHandler();
export const POST = createEventOperationsManualCheckInPostHandler();
