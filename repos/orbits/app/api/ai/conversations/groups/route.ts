import { createOrbitAgentChatGroupsHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createOrbitAgentChatGroupsHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
