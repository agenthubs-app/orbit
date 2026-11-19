import { createAgentMemoryRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";

const handlers = createAgentMemoryRouteHandlers();

export async function PATCH(request: Request): Promise<Response> {
  return handlers.updateSettings(request);
}
