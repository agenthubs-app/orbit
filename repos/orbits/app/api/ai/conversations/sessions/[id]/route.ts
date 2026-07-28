import { createOrbitAgentChatSessionHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createOrbitAgentChatSessionHandlers();

export const DELETE = handlers.DELETE;
export const GET = handlers.GET;
