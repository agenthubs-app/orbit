import { createConfiguredCanonicalPublicEventCatalogue } from "../../../features/events/core/public-catalogue-runtime";
import {
  getOrbitLandingViewModelFromCatalogue,
  type OrbitLandingEventView,
  type OrbitLandingViewModel,
} from "./orbit-landing-route-view-model";

export class CanonicalPublicEventViewUnavailableError extends Error {
  constructor(message = "Canonical Event Core public catalogue is unavailable.") {
    super(message);
    this.name = "CanonicalPublicEventViewUnavailableError";
  }
}

export async function loadCanonicalPublicLandingView(): Promise<OrbitLandingViewModel> {
  const catalogue = createConfiguredCanonicalPublicEventCatalogue();
  if (!catalogue) throw new CanonicalPublicEventViewUnavailableError();
  return getOrbitLandingViewModelFromCatalogue(await catalogue.read());
}

export async function resolveCanonicalPublicEventView(
  routeId: string,
): Promise<OrbitLandingEventView | null> {
  const normalizedRouteId = routeId.trim();
  if (!normalizedRouteId) return null;
  const landing = await loadCanonicalPublicLandingView();
  return landing.events.find(
    (event) => event.id === normalizedRouteId || event.code === normalizedRouteId,
  ) ?? null;
}
