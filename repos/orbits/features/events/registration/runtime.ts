import { mockManualProfile } from "../../profile/fixtures";
import { createEventRegistrationService } from "./service";
import { createConfiguredEventRegistrationProvider } from "./storage/live-record-provider";

export const CURRENT_EVENT_REGISTRATION_USER_ID = mockManualProfile.id;
export const CURRENT_EVENT_REGISTRATION_PROFILE = {
  displayName: mockManualProfile.displayName,
  headline: mockManualProfile.headline,
} as const;

const runtimeProvider = createConfiguredEventRegistrationProvider();

export const eventRegistrationRuntimeService = createEventRegistrationService({
  provider: runtimeProvider,
});
