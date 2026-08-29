import { createTaskDetailHandlers } from "./handler";

export const dynamic = "force-dynamic";

const handlers = createTaskDetailHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
