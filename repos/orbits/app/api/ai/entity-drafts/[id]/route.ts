import { createEntityDraftRouteHandlers } from "../handler";

export const dynamic = "force-dynamic";

const handlers = createEntityDraftRouteHandlers();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handlers.POST(request, id);
}
