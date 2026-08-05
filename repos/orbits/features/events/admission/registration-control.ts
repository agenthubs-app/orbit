import { createConfiguredEventAdmissionJourneyService } from "./journey-runtime";

export type EventAdmissionRegistrationControl =
  | "admission"
  | "legacy"
  | "unavailable";

export type ResolveEventAdmissionRegistrationControl = (
  actorId: string,
  eventReference: string,
) => Promise<EventAdmissionRegistrationControl>;

/**
 * Fail-closed production selector used by legacy registration endpoints. It
 * never turns an admission read failure into permission to write directly to
 * canonical membership.
 */
export const resolveConfiguredEventAdmissionRegistrationControl:
  ResolveEventAdmissionRegistrationControl = async (
    actorId,
    eventReference,
  ) => {
    const journey = createConfiguredEventAdmissionJourneyService();
    if (!journey) return "unavailable";
    try {
      const state = await journey.getState({ actorId, eventReference });
      return state.admissionControlled ? "admission" : "legacy";
    } catch {
      return "unavailable";
    }
  };
