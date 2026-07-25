import { auth } from "../../../../../auth";
import { createEventRegistrationRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

const handlers = createEventRegistrationRouteHandlers({
  async resolveActor() {
    const session = await auth();
    return session?.user?.id
      ? { id: session.user.id, name: session.user.name }
      : null;
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
