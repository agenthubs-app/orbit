import { createRelationshipLifecycleHandlers } from "./handler";
export const dynamic = "force-dynamic";
const handlers = createRelationshipLifecycleHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
