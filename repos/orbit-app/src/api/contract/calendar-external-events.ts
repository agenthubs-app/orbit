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
  connection: "connected" | "not_connected" | "needs_reconnect" | "unavailable";
  provider: "google_calendar";
  events: CalendarExternalEventContract[];
  asOf: string;
}
