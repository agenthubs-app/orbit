import type { EventProfileResponseSnapshot } from "../registration/interview-response-contract";

/**
 * Participant detail is a human-facing disclosure boundary. `matching_only`
 * answers are model input and must never cross this boundary, including when
 * the participant opens their own detail card.
 */
export function profileResponsesForParticipantDetail(
  responses: readonly EventProfileResponseSnapshot[],
  input: { viewerOwnsTarget: boolean },
): readonly EventProfileResponseSnapshot[] {
  return responses.filter((response) => {
    const visibility: string = response.visibility;
    if (visibility === "matching_only") return false;
    if (input.viewerOwnsTarget) return true;
    return visibility === "event_attendees" || visibility === "public";
  });
}

/**
 * Every registration answer is matching input by product policy. Callers still
 * have to bind the input to the requested event generation before sending it
 * to a provider; human disclosure is enforced by the detail function above.
 */
export function profileResponsesForAiGeneration(
  responses: readonly EventProfileResponseSnapshot[],
): readonly EventProfileResponseSnapshot[] {
  return responses;
}

/** Legacy `private` registration answers become matching-only. They remain
 * hidden from human attendee detail while still entering the event AI input. */
export function normalizeProfileResponseForStorage(
  response: EventProfileResponseSnapshot,
): EventProfileResponseSnapshot {
  return response.visibility === "private"
    ? { ...response, visibility: "matching_only" }
    : response;
}
