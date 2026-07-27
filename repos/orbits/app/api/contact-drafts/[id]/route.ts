import {
  createContactDraftGetHandler,
  createContactDraftPatchHandler,
} from "./handler";

export const dynamic = "force-dynamic";

export const GET = createContactDraftGetHandler();
export const PATCH = createContactDraftPatchHandler();
