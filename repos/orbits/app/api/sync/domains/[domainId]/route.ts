import { createSyncDomainHandlers } from "../../domain-handlers";

export const dynamic = "force-dynamic";

const handlers = createSyncDomainHandlers();

export async function GET(request: Request, context: { params: Promise<{ domainId: string }> }): Promise<Response> {
  const { domainId } = await context.params;
  return handlers.domain(request, domainId);
}
