import {
  createContactDetailGetHandler,
  createContactDetailPatchHandler,
} from "./handler";

export const dynamic = "force-dynamic";

export const GET = createContactDetailGetHandler();
export const PATCH = createContactDetailPatchHandler();
