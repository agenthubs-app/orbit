import type { OrbitLandingEventView } from "./orbit-landing-route-view-model";

export interface OrbitHomeAccountView {
  fullName: string;
  headline: string;
  initial: string;
}

export interface OrbitHomeStatsView {
  events: number;
  inProgress: number;
  people: number;
}

export interface OrbitHomeViewModel {
  account: OrbitHomeAccountView;
  events: OrbitLandingEventView[];
  stats: OrbitHomeStatsView;
}
