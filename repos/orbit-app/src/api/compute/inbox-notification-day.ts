const DEFAULT_ZONE = 'Asia/Tokyo';

export function notificationDisplayZone(value: unknown): string {
  if (typeof value !== 'string' || !value) return DEFAULT_ZONE;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return value; }
  catch { return DEFAULT_ZONE; }
}

export function notificationLocalDay(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: notificationDisplayZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant));
  const field = (kind: string) => parts.find(part => part.type === kind)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
