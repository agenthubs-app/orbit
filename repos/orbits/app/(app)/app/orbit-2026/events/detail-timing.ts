import { useEffect, useState } from "react";

type Timing = { endsAt?: string | null; registrationClosesAt?: string | null; capacity?: number | null; remaining?: number | null; waitlistEnabled?: boolean };

/**
 * Same end boundary as canonical event phase; counts remain registrations, not check-ins.
 * `canRegister` = the registration window is open (time only; the cover's 受付終了 chip and the public invite card read it).
 * 2026-11-27 seats: `full` = no seat left and no waitlist (show 満席, no register entry); `waitlist` = no seat left but the
 * organizer keeps a waitlist (the entry reads キャンセル待ちに並ぶ). A register entry needs `canRegister && !full`.
 */
export function detailTiming(data: Timing | null, now: number) {
  const end = Date.parse(data?.endsAt ?? "");
  const closes = Date.parse(data?.registrationClosesAt ?? "");
  const ended = Number.isFinite(end) && now >= end;
  const soldOut = typeof data?.capacity === "number" && data.capacity > 0 && data.remaining === 0;
  return { ended, canRegister: Boolean(data) && !ended && (!Number.isFinite(closes) || now < closes), full: soldOut && !data?.waitlistEnabled, waitlist: soldOut && Boolean(data?.waitlistEnabled) };
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

/**
 * 2026-11-21 開催中（开始了、还没结束）：封面 chip「開催中」、议程高亮当前项、参加卡换「会場モード」。
 * 没有结束时间就不算「開催中」（不猜结束）。开始前只在开始那一刻重算；进行中每分钟本地重算一次（只为议程高亮，不请求接口）。
 */
export function liveAt(data: { startsAt?: string | null; endsAt?: string | null } | null, now: number): boolean {
  const start = Date.parse(data?.startsAt ?? "");
  const end = Date.parse(data?.endsAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
}

export function useLiveClock(data: { startsAt?: string | null; endsAt?: string | null } | null) {
  const [now, setNow] = useState(() => Date.now());
  const live = liveAt(data, now);
  const start = Date.parse(data?.startsAt ?? "");
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = live ? window.setTimeout(refresh, 60_000) : Number.isFinite(start) && start > now ? window.setTimeout(refresh, Math.min(start - now + 1, 2_147_483_647)) : undefined;
    window.addEventListener("focus", refresh);
    return () => { if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [live, start, now]);
  return { live, now };
}
