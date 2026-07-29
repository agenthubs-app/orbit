import type { OrbitLandingEventView } from "./orbit-landing-route-view-model";

export interface OrbitOrganizerPublicViewModel {
  events: OrbitLandingEventView[];
  handle: string;
  initial: string;
  name: string;
}
