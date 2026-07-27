import type { EventDTO } from "../../shared/domain/contracts";
import { createOrbitLocalRemoteDatabase } from "../../shared/local-remote-store/orbit-database";

export interface PublicEventCatalogueSnapshot {
  events: readonly EventDTO[];
  generatedAt: string;
}

/**
 * Feature-owned read boundary for the approved public event catalogue.
 *
 * The current local/remote database is seeded with the approved test catalogue.
 * Callers depend on this boundary rather than importing fixture files directly,
 * so a live catalogue provider can replace the backing store without changing
 * registration or route authorization.
 */
export function readPublicEventCatalogue(): PublicEventCatalogueSnapshot {
  const state = createOrbitLocalRemoteDatabase().getState();

  return {
    events: state.events,
    generatedAt: state.generatedAt,
  };
}
