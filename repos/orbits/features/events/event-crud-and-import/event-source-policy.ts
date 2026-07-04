import type { SourceType } from "../../../shared/domain/source-types";
import type { EventCaptureMethod } from "./contract";

const hiddenDemoEventProviderIds = new Set([
  "manual-event-form-fixture",
  "mock-calendar-sync-fixture",
  "mock-organizer-feed-fixture",
]);

export function eventCaptureMethodForSourceType(
  sourceType: SourceType,
): EventCaptureMethod {
  if (sourceType === "calendar_signal") {
    return "calendar_sync";
  }

  if (sourceType === "event_import") {
    return "organizer_feed";
  }

  return "manual_form";
}

export function isDemoEventProvider(provider: string): boolean {
  return hiddenDemoEventProviderIds.has(provider);
}
