/** R20a · D line. Consumers: Task calendar on Web/App; R18a settings connection entry. Read-only Google events never enter Orbit storage. */
export interface CalendarExternalEventContract {
  id: string;
  titlePreview: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  locationPreview?: string;
}

export interface CalendarExternalEventsContract {
  /**
   * "off" (2026-10-28, appended): this deployment does not offer Google Calendar at all (no integration key), so
   * clients show nothing about it — not a connect button, not an error. "unavailable" stays a real read failure.
   * Clients that predate "off" read it as "unavailable" (tolerantEnum fallback).
   */
  connection: "connected" | "not_connected" | "needs_reconnect" | "unavailable" | "off";
  provider: "google_calendar";
  events: CalendarExternalEventContract[];
  asOf: string;
}
