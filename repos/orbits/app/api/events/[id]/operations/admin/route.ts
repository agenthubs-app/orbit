import {
  createEventOperationsAdminGetHandler,
  createEventOperationsConfigurePutHandler,
} from "../handlers";

export const dynamic = "force-dynamic";
export const GET = createEventOperationsAdminGetHandler();
export const PUT = createEventOperationsConfigurePutHandler();
