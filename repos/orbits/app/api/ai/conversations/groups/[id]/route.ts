import { createOrbitAgentChatGroupHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createOrbitAgentChatGroupHandlers();

export const DELETE = handlers.DELETE;
export const PATCH = handlers.PATCH;
