import { auth } from "../../../../../auth";
import { createEventRegistrationRouteHandlers } from "./route-handlers";
import {
  resolveConfiguredEventAdmissionRegistrationControl,
  resolveConfiguredEventAdmissionRegistrationState,
} from "../../../../../features/events/admission/registration-control";
import { readRuntimeEventRegistrationAvailability } from "../../../../../features/events/registration/runtime";

export const dynamic = "force-dynamic";

const handlers = createEventRegistrationRouteHandlers({
  readRegistrationAvailability: readRuntimeEventRegistrationAvailability,
  resolveAdmissionControl: resolveConfiguredEventAdmissionRegistrationControl,
  resolveAdmissionState: resolveConfiguredEventAdmissionRegistrationState,
  async resolveActor() {
    const session = await auth();
    return session?.user?.id
      ? { id: session.user.id, name: session.user.name }
      : null;
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
