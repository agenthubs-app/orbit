import { createAgentMemoryRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

const handlers = createAgentMemoryRouteHandlers();

export async function GET(): Promise<Response> {
  return handlers.list();
}

export async function POST(request: Request): Promise<Response> {
  return handlers.create(request);
}
