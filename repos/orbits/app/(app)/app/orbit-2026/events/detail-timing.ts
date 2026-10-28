import { useEffect, useState } from "react";

type Timing = { endsAt?: string | null; registrationClosesAt?: string | null };

/** Same end boundary as canonical event phase; counts remain registrations, not check-ins. */
export function detailTiming(data: Timing | null, now: number) {
  const end = Date.parse(data?.endsAt ?? "");
  const closes = Date.parse(data?.registrationClosesAt ?? "");
  const ended = Number.isFinite(end) && now >= end;
  return { ended, canRegister: Boolean(data) && !ended && (!Number.isFinite(closes) || now < closes) };
}

/** Re-evaluate only at a local time boundary / foreground return. Never poll the API. */
export function useDetailTiming(data: Timing | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const next = [data?.endsAt, data?.registrationClosesAt].map((value) => Date.parse(value ?? "")).filter((value) => Number.isFinite(value) && value > now).sort((a, b) => a - b)[0];
    const timer = next === undefined ? undefined : window.setTimeout(refresh, Math.min(next - now + 1, 2_147_483_647));
    window.addEventListener("focus", refresh);
    return () => { if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [data?.endsAt, data?.registrationClosesAt, now]);
  return detailTiming(data, now);
}
