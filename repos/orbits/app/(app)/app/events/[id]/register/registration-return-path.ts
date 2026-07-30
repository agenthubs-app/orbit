export function eventRegistrationReturnPath(
  eventId: string,
  preferredLanguage?: string,
): string {
  const path = `/app/events/${encodeURIComponent(eventId)}/register`;

  if (!preferredLanguage) {
    return path;
  }

  const query = new URLSearchParams({ language: preferredLanguage });

  return `${path}?${query.toString()}`;
}
