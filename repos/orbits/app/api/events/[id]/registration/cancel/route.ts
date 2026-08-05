import { auth } from "../../../../../../auth";
import { createEventRegistrationCancelRouteHandler } from "./route-handler";
import { resolveConfiguredEventAdmissionRegistrationControl } from "../../../../../../features/events/admission/registration-control";

export const dynamic = "force-dynamic";

export const POST = createEventRegistrationCancelRouteHandler({
  resolveAdmissionControl: resolveConfiguredEventAdmissionRegistrationControl,
  async resolveActor() {
    const session = await auth();
    return session?.user?.id ? { id: session.user.id } : null;
  },
});
