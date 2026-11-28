/**
 * When registration and event-profile edits stop (2026-11-28 用户定：「资料填写到活动结束前都可以填写」，开场后来的人也能报名).
 *
 * - The admission policy stores a close that is never after the start: a host who picked no close gets the start itself.
 *   That default now means "until the event ends" — people still join on the day and fill in their answers.
 * - A close the host deliberately set before the start is kept for new registrations.
 * - Answers of people already registered stay editable until the event ends either way.
 *
 * Matching is unaffected: the generation snapshot still freezes at the configured cutoff; people who come later are added
 * on read (see late-joiner.ts) without changing anyone's published result.
 */
function ms(value: string | null | undefined): number {
  return value ? Date.parse(value) : Number.NaN;
}

export function effectiveRegistrationCloseAt(policyClosesAt: string | null | undefined, startsAt: string | null | undefined, endsAt: string | null | undefined): string | null {
  const close = ms(policyClosesAt);
  const start = ms(startsAt);
  const end = ms(endsAt);
  if (Number.isFinite(close) && Number.isFinite(start) && close < start) return new Date(close).toISOString();
  if (Number.isFinite(end)) return new Date(end).toISOString();
  return Number.isFinite(close) ? new Date(close).toISOString() : Number.isFinite(start) ? new Date(start).toISOString() : null;
}

/** Answers of registered people stay editable until the event ends (falls back to the start, then the policy close). */
export function profileEditCloseAt(endsAt: string | null | undefined, startsAt: string | null | undefined, policyClosesAt?: string | null): string | null {
  for (const value of [endsAt, startsAt, policyClosesAt]) {
    const at = ms(value);
    if (Number.isFinite(at)) return new Date(at).toISOString();
  }
  return null;
}
