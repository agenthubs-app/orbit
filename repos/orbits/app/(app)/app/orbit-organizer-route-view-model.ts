import { getOrbitLandingViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";

export interface OrbitOrganizerPublicViewModel {
  events: OrbitLandingEventView[];
  handle: string;
  initial: string;
  name: string;
}

export function getOrbitOrganizerPublicViewModel(slug: string): OrbitOrganizerPublicViewModel {
  const landing = getOrbitLandingViewModel();
  const normalized = String(slug || "").toLowerCase();
  const fallbackEvent = landing.events[0];

  if (!fallbackEvent) {
    throw new Error("Orbit organizer public page requires at least one prototype event.");
  }

  const event = landing.events.find((item) => (item.code || "").toLowerCase() === normalized) ?? fallbackEvent;
  const name = event.organizer || event.host;
  const theirEvents = landing.events.filter((item) => item.organizer === name || item.host === name);
  const events = theirEvents.length ? theirEvents : landing.events.slice(0, 3);

  return {
    events,
    handle: "已举办 12 场 · 4,200+ 参会者",
    initial: (name || "O").slice(0, 1),
    name,
  };
}
