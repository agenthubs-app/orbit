import { createConfiguredEventCoreService } from "../core/runtime";
import { createConfiguredEventAdmissionService } from "./runtime";
import {
  createEventAdmissionJourneyService,
  type EventAdmissionJourneyService,
} from "./journey-service";

export function createConfiguredEventAdmissionJourneyService(): EventAdmissionJourneyService | null {
  const admissionService = createConfiguredEventAdmissionService();
  const eventCoreService = createConfiguredEventCoreService();
  if (!admissionService || !eventCoreService) return null;
  return createEventAdmissionJourneyService({
    admissionService,
    eventCoreService,
  });
}
