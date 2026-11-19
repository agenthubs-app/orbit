import { createAgentMemoryRouteHandlers } from "../route-handlers";

export const dynamic = "force-dynamic";

const handlers = createAgentMemoryRouteHandlers();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handlers.update(request, (await context.params).id);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handlers.remove(request, (await context.params).id);
}
