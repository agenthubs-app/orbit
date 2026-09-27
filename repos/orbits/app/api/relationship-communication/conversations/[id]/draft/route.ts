import {
  createConversationDraftGetHandler,
  createConversationDraftPutHandler,
} from "../../../handler";

export const dynamic = "force-dynamic";
export const GET = createConversationDraftGetHandler();
export const PUT = createConversationDraftPutHandler();
