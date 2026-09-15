import { createConfiguredEventAdmissionJourneyService } from "./journey-runtime";
import type { EventAdmissionApplication, EventAdmissionPolicy } from "./contract";

export type EventAdmissionRegistrationControl =
  | "admission"
  | "legacy"
  | "unavailable";

export type ResolveEventAdmissionRegistrationControl = (
  actorId: string,
  eventReference: string,
) => Promise<EventAdmissionRegistrationControl>;

export type EventAdmissionRegistrationState =
  | { state: "legacy" }
  | {
      application: EventAdmissionApplication | null;
      policy: EventAdmissionPolicy;
      state: "admission";
    }
  | { state: "unavailable" };

export type ResolveEventAdmissionRegistrationState = (
  actorId: string,
  eventReference: string,
) => Promise<EventAdmissionRegistrationState>;

export const resolveConfiguredEventAdmissionRegistrationState:
  ResolveEventAdmissionRegistrationState = async (actorId, eventReference) => {
    const journey = createConfiguredEventAdmissionJourneyService();
    if (!journey) return { state: "unavailable" };
    try {
      const result = await journey.getState({ actorId, eventReference });
      if (!result.admissionControlled || !result.policy) {
        return { state: "legacy" };
      }
      return {
        application: result.application,
        policy: result.policy,
        state: "admission",
      };
    } catch {
      return { state: "unavailable" };
    }
  };

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
    const state = await resolveConfiguredEventAdmissionRegistrationState(
      actorId,
      eventReference,
    );
    return state.state;
  };
