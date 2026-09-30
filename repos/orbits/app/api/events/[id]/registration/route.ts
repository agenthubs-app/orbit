import { resolveAuthenticatedApiActor } from "../../../../../app/api/_shared/authenticated-actor";
import { createEventRegistrationRouteHandlers } from "./route-handlers";
import {
  resolveConfiguredEventAdmissionRegistrationControl,
  resolveConfiguredEventAdmissionRegistrationState,
} from "../../../../../features/events/admission/registration-control";
import { readRuntimeEventRegistrationWindow } from "../../../../../features/events/registration/runtime";
import { syncPlanEventRegistrationForActor } from "../../../../../features/plans/event-attribution-runtime";
import { createConfiguredEventOperationsPostgresRuntime } from "../../../../../features/events/event-operations/storage/postgres-client";

export const dynamic = "force-dynamic";

const handlers = createEventRegistrationRouteHandlers({
  questionCacheRuntime: () => createConfiguredEventOperationsPostgresRuntime(),
  readRegistrationWindow: readRuntimeEventRegistrationWindow,
  resolveAdmissionControl: resolveConfiguredEventAdmissionRegistrationControl,
  resolveAdmissionState: resolveConfiguredEventAdmissionRegistrationState,
  async resolveActor() {
    return resolveAuthenticatedApiActor();
  },
  syncPlanRegistration: syncPlanEventRegistrationForActor,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
