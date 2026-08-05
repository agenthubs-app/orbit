import { readEventOperationsCatalogueSummaries } from "../event-operations/catalogue-summary";
import {
  createCanonicalPublicEventCatalogue,
  type CanonicalPublicEventCatalogue,
} from "./public-catalogue";
import { createConfiguredEventCoreService } from "./runtime";

/**
 * Production-only composition root for the canonical public event catalogue.
 * It has no legacy catalogue fallback: an unavailable or incomplete Event
 * Core remains an explicit runtime failure at the caller boundary.
 */
export function createConfiguredCanonicalPublicEventCatalogue(input: {
  now?: Date;
} = {}): CanonicalPublicEventCatalogue | null {
  const eventCoreService = createConfiguredEventCoreService();
  if (!eventCoreService) return null;

  return createCanonicalPublicEventCatalogue({
    eventCoreService,
    now: input.now ?? new Date(),
    readParticipantSummaries: readEventOperationsCatalogueSummaries,
  });
}
