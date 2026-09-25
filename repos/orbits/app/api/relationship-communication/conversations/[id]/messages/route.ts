import { createConversationMessagesPostHandler } from "../../../handler";
import { createRelationshipPageGetHandler } from "../../../read-handler";

export const dynamic = "force-dynamic";
export const POST = createConversationMessagesPostHandler();
export const GET = createRelationshipPageGetHandler("messages");
