export function decodeScheduleEventRouteId(value: string): string {
  const routeId = value.trim();

  try {
    return decodeURIComponent(routeId);
  } catch {
    return routeId;
  }
}
