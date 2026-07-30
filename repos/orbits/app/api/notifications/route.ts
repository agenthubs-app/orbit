import { auth } from "../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../_shared/authenticated-actor";
import { createNotificationsGetHandler } from "./handler";

export const dynamic = "force-dynamic";

type RequestScopedHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response>;

const authenticatedGET = auth(async (request) => {
  return createNotificationsGetHandler(async () => {
    const user = request.auth?.user;

    return user?.id
      ? resolveAuthenticatedApiActorFromSession({
          email: user.email,
          name: user.name,
          userId: user.id,
        })
      : null;
  })(request);
}) as unknown as RequestScopedHandler;

export function GET(
  request: Request,
  context?: unknown,
): Promise<Response> {
  return authenticatedGET(request, context);
}
