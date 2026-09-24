import type { OrbitLandingEventView } from "./orbit-landing-route-view-model";

export type OrbitOrganizerEventView = OrbitLandingEventView & {
  participantCount: number;
};

export interface OrbitOrganizerPublicViewModel {
  events: OrbitOrganizerEventView[];
  handle: string;
  initial: string;
  name: string;
}
