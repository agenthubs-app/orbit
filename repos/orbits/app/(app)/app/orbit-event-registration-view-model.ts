import type { EventRegistrationAvailability } from "../../../features/events/registration/deadline-gated-service";

export type { EventRegistrationAvailability };

// The public journey writes profile answers; it cannot start after they lock.
// Missing configuration is a separate state, never an implied open window.
export function eventRegistrationIsOpen(availability: EventRegistrationAvailability): boolean {
  return availability === "open";
}

export function eventRegistrationLabel(availability: EventRegistrationAvailability) {
  if (eventRegistrationIsOpen(availability)) return { en: "Registration open", zh: "报名开放" };
  if (availability === "profile_edit_closed") return { en: "Registration profile locked", zh: "报名资料已锁定" };
  if (availability === "registration_closed") return { en: "Registration closed", zh: "报名已结束" };
  return { en: "Registration status unavailable", zh: "暂时无法确认报名状态" };
}
