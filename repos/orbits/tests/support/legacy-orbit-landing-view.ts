import { getOrbitLandingViewModelFromCatalogue } from "../../app/(app)/app/orbit-landing-route-view-model";
import { readPublicEventCatalogue } from "../../features/events/public-catalogue";

/** Test-only bridge for the retired visual fixture catalogue. */
export function getOrbitLandingViewModel() {
  return getOrbitLandingViewModelFromCatalogue(readPublicEventCatalogue());
}
