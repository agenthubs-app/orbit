import {
  createContactDetailGetHandler,
  createContactDetailPatchHandler,
} from "./handler";

export const dynamic = "force-dynamic";

export const GET = createContactDetailGetHandler();
export const PATCH = createContactDetailPatchHandler();

// R11a：软删除（30 天内可恢复，见 restore/route.ts）。
import { createContactDeleteHandlers } from "./delete-handler";
export const DELETE = createContactDeleteHandlers().DELETE;
