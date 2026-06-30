import { getOrbitContactsViewModel } from "./orbit-contacts-route-view-model";
import { getOrbitLandingViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";
import { getOrbitProfileViewModel } from "./orbit-profile-route-view-model";

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

export function getOrbitHomeViewModel(): OrbitHomeViewModel {
  const landing = getOrbitLandingViewModel();
  const contacts = getOrbitContactsViewModel();
  const profile = getOrbitProfileViewModel();
  const events = landing.events.filter((event) => event.stats.youRsvped);

  return {
    account: {
      fullName: landing.account.fullName,
      headline: profile.profile.headline,
      initial: landing.account.fullName.slice(0, 1) || "O",
    },
    events,
    stats: {
      events: events.length,
      people: contacts.connections.length,
      inProgress: contacts.connections.filter((contact) => contact.stage === "在推进").length,
    },
  };
}
