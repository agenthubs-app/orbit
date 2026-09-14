import type {
  EventAdmissionApplication,
  EventAdmissionPolicy,
} from "../admission/contract";
import type { EventStatus } from "../event-crud-and-import/contract";
import type {
  EventRegistration,
  EventRegistrationAction,
  EventRegistrationEligibility,
  EventRegistrationEligibilityState,
} from "./contract";
import type { EventRegistrationAvailability } from "./deadline-gated-service";

interface EligibilityEvent {
  endsAt: string;
  startsAt: string;
  status: EventStatus;
}

interface AdmissionEligibilityInput {
  activeRegistrationCount: number | null;
  application: EventAdmissionApplication | null;
  policy: EventAdmissionPolicy;
}

interface ResolveEventRegistrationEligibilityInput {
  admission?: AdmissionEligibilityInput | null;
  evaluatedAt: string;
  event: EligibilityEvent;
  legacyAvailability: EventRegistrationAvailability;
  registration: EventRegistration | null;
}

function snapshot(
  input: ResolveEventRegistrationEligibilityInput,
  state: EventRegistrationEligibilityState,
  allowedActions: readonly EventRegistrationAction[] = [],
): EventRegistrationEligibility {
  return {
    allowedActions,
    applicationVersion: input.admission?.application?.applicationVersion ?? null,
    evaluatedAt: input.evaluatedAt,
    policyVersion: input.admission?.policy.policyVersion ?? null,
    reason: state,
    registrationVersion: input.registration?.updatedAt ?? null,
    state,
  };
}

function admissionEligibility(
  input: ResolveEventRegistrationEligibilityInput & {
    admission: AdmissionEligibilityInput;
  },
): EventRegistrationEligibility {
  const { application, policy } = input.admission;
  if (application) {
    if (application.status === "admitted") {
      return snapshot(input, "registered", ["withdraw"]);
    }
    if (application.status === "pending_review") {
      return snapshot(input, "pending_review", ["withdraw"]);
    }
    if (application.status === "waitlisted") {
      return snapshot(input, "waitlisted", ["withdraw"]);
    }
    if (application.status === "rejected") {
      return snapshot(input, "rejected");
    }
    return snapshot(input, "withdrawn");
  }

  const nowMs = Date.parse(input.evaluatedAt);
  const opensAtMs = Date.parse(policy.registrationOpensAt);
  const closesAtMs = Date.parse(policy.registrationClosesAt);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(opensAtMs) ||
    !Number.isFinite(closesAtMs) ||
    opensAtMs >= closesAtMs
  ) {
    return snapshot(input, "unavailable");
  }
  if (nowMs < opensAtMs) return snapshot(input, "not_open");
  if (nowMs >= closesAtMs) return snapshot(input, "registration_closed");

  if (policy.capacity !== null) {
    const count = input.admission.activeRegistrationCount;
    if (!Number.isSafeInteger(count) || count < 0) {
      return snapshot(input, "unavailable");
    }
    if (count >= policy.capacity && !policy.waitlistEnabled) {
      return snapshot(input, "full");
    }
  }

  // Admission submission uses its existing signed-response endpoint. The
  // legacy registration route never receives permission to write here.
  return snapshot(input, "open");
}

export function resolveEventRegistrationEligibility(
  input: ResolveEventRegistrationEligibilityInput,
): EventRegistrationEligibility {
  const nowMs = Date.parse(input.evaluatedAt);
  const startsAtMs = Date.parse(input.event.startsAt);
  const endsAtMs = Date.parse(input.event.endsAt);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    startsAtMs >= endsAtMs
  ) {
    return snapshot(input, "unavailable");
  }
  if (input.event.status === "cancelled") {
    return snapshot(input, "event_cancelled");
  }
  if (nowMs >= endsAtMs) return snapshot(input, "event_ended");

  if (input.admission) return admissionEligibility({ ...input, admission: input.admission });

  if (input.registration?.status === "rsvped") {
    if (nowMs >= startsAtMs) return snapshot(input, "registered");
    return snapshot(
      input,
      "registered",
      input.legacyAvailability === "open"
        ? ["update", "cancel"]
        : ["cancel"],
    );
  }
  if (nowMs >= startsAtMs) return snapshot(input, "registration_closed");
  if (input.legacyAvailability === "unavailable") {
    return snapshot(input, "unavailable");
  }
  if (
    input.legacyAvailability === "registration_closed" ||
    input.legacyAvailability === "profile_edit_closed"
  ) {
    return snapshot(input, "registration_closed");
  }
  if (input.registration?.status === "cancelled") {
    return snapshot(input, "registration_cancelled", ["reactivate"]);
  }
  return snapshot(input, "open", ["register"]);
}
