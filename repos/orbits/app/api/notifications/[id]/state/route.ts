import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../_shared/authenticated-actor";
import { createNotificationStatePostHandler } from "./handler";

export const dynamic = "force-dynamic";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const authenticatedPOST = auth(async (request, context) => createNotificationStatePostHandler({
  resolveActor: async () => request.auth?.user?.id ? resolveAuthenticatedApiActorFromSession({ email: request.auth.user.email, name: request.auth.user.name, userId: request.auth.user.id }) : null,
})(request, context as { params: Promise<{ id: string }> })) as unknown as Handler;

export function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return authenticatedPOST(request, context);
}
