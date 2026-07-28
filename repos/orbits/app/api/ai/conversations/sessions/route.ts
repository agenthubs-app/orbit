import { createOrbitAgentChatSessionsHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createOrbitAgentChatSessionsHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
