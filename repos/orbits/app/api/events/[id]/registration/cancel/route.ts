import { auth } from "../../../../../../auth";
import { createEventRegistrationCancelRouteHandler } from "./route-handler";

export const dynamic = "force-dynamic";

export const POST = createEventRegistrationCancelRouteHandler({
  async resolveActor() {
    const session = await auth();
    return session?.user?.id ? { id: session.user.id } : null;
  },
});
