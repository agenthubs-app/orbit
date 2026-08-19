import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../_shared/authenticated-actor";
import { createEventRegistrationOpeningReminderHandlers } from "./handler";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

function authenticated(method: "GET" | "POST" | "DELETE"): Handler {
  return auth(async (request, context) => {
    const handlers = createEventRegistrationOpeningReminderHandlers({
      resolveActor: async () => request.auth?.user?.id
        ? resolveAuthenticatedApiActorFromSession({
            email: request.auth.user.email,
            name: request.auth.user.name,
            userId: request.auth.user.id,
          })
        : null,
    });
    return handlers[method](request, context as Context);
  }) as unknown as Handler;
}

const authenticatedGET = authenticated("GET");
const authenticatedPOST = authenticated("POST");
const authenticatedDELETE = authenticated("DELETE");

export function GET(request: Request, context: Context): Promise<Response> {
  return authenticatedGET(request, context);
}

export function POST(request: Request, context: Context): Promise<Response> {
  return authenticatedPOST(request, context);
}

export function DELETE(request: Request, context: Context): Promise<Response> {
  return authenticatedDELETE(request, context);
}
