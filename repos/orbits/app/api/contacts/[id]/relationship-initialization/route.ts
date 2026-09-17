import { createRelationshipInitializationHandlers } from "./handler";
export const dynamic = "force-dynamic";
const handlers = createRelationshipInitializationHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
