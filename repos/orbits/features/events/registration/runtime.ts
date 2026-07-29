import { createEventRegistrationService } from "./service";
import { createConfiguredEventRegistrationProvider } from "./storage/live-record-provider";

const runtimeProvider = createConfiguredEventRegistrationProvider();

export const eventRegistrationRuntimeService = createEventRegistrationService({
  provider: runtimeProvider,
});
