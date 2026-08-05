import { auth } from "../../../../../auth";
import { createEventRegistrationRouteHandlers } from "./route-handlers";
import { resolveConfiguredEventAdmissionRegistrationControl } from "../../../../../features/events/admission/registration-control";

export const dynamic = "force-dynamic";

const handlers = createEventRegistrationRouteHandlers({
  resolveAdmissionControl: resolveConfiguredEventAdmissionRegistrationControl,
  async resolveActor() {
    const session = await auth();
    return session?.user?.id
      ? { id: session.user.id, name: session.user.name }
      : null;
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
