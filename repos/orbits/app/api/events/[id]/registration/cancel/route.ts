import { resolveAuthenticatedApiActor } from "../../../../../../app/api/_shared/authenticated-actor";
import { createEventRegistrationCancelRouteHandler } from "./route-handler";
import { resolveConfiguredEventAdmissionRegistrationControl } from "../../../../../../features/events/admission/registration-control";

export const dynamic = "force-dynamic";

export const POST = createEventRegistrationCancelRouteHandler({
  resolveAdmissionControl: resolveConfiguredEventAdmissionRegistrationControl,
  async resolveActor() {
    return resolveAuthenticatedApiActor();
  },
});
