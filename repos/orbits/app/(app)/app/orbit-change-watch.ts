/**
 * The Web's change cursor client (GET /api/changes, shared/storage/change-tokens.ts): instead of every list
 * re-reading itself on a timer, the shell asks one small question — "which of my areas moved?" — while a page
 * is visible and the person has used it in the last 5 minutes (every X-Poll-Interval seconds, default 60), when the
 * tab comes back to the front, when the network returns and on the first input after an idle spell. A tab left open
 * and untouched stops asking, so the database can go to sleep (Neon suspends after 5 idle minutes). Unchanged answers are a 304 the browser revalidates on its own (ETag), so JavaScript just
 * sees the same tokens. When an area's token moved, only that area's cached answers are marked stale and the
 * mounted readers of it (useAreaChanges) read again behind what they show.
 *
 * A write made on this page already marks everything stale (orbit-write-watch); the next answer after it is
 * taken as the new baseline without notifying again, so the page that wrote does not read twice.
 * Memory only; tokens belong to the account they were read for (reset when it changes or on sign-out).
 */
"use client";

import { useEffect, useRef } from "react";

import type { ChangeArea } from "../../../shared/storage/change-tokens";
import { markAreaAnswersStale } from "./orbit-last-answer";
import { getSharedReadAccount } from "./orbit-shared-read";

type Tokens = Record<ChangeArea, string>;

const DEFAULT_POLL_SECONDS = 60;
/** No pointer / key / scroll / focus for this long → stop background reads until the next input. */
export const IDLE_AFTER_MS = 5 * 60_000;
/**
 * A list that can change without any row being written (an inbox reminder that comes due at its time) also reads
 * itself on this slow fallback while visible; everything else comes from the cursor, focus and the page's own writes.
 */
export const AREA_FALLBACK_MS = 120_000;
const MIN_POLL_SECONDS = 10;
const FOREGROUND_THROTTLE_MS = 2_000;

let installed = false;
let baseline: { account: string; tokens: Tokens } | null = null;
let adoptNext = false;
let inFlight: Promise<void> | null = null;
let lastAskedAt = 0;
let lastInputAt = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;
let pollSeconds = DEFAULT_POLL_SECONDS;
const listeners = new Set<(areas: readonly ChangeArea[]) => void>();

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function idle(): boolean {
  return Date.now() - lastInputAt > IDLE_AFTER_MS;
}

/** Timers that re-read in the background (inbox fallbacks) check this: visible and used recently. */
export function shouldRefreshInBackground(): boolean {
  return visible() && !idle();
}

async function ask(): Promise<void> {
  const account = getSharedReadAccount();
  if (!account || !visible()) return;
  lastAskedAt = Date.now();
  try {
    const response = await fetch("/api/changes", { cache: "no-cache", headers: { accept: "application/json" } });
    const interval = Number(response.headers.get("x-poll-interval"));
    if (Number.isFinite(interval) && interval >= MIN_POLL_SECONDS) pollSeconds = interval;
    if (!response.ok) return;
    const body = await response.json() as { success?: boolean; data?: { tokens?: Partial<Tokens> } };
    const tokens = body.success ? body.data?.tokens : undefined;
    if (!tokens || getSharedReadAccount() !== account) return;
    const previous = baseline && baseline.account === account ? baseline.tokens : null;
    baseline = { account, tokens: tokens as Tokens };
    if (!previous || adoptNext) { adoptNext = false; return; }
    const moved = (Object.keys(tokens) as ChangeArea[]).filter((area) => previous[area] !== tokens[area]);
    if (!moved.length) return;
    markAreaAnswersStale(moved);
    for (const listener of listeners) listener(moved);
  } catch { /* offline or signed out: the next tick or focus asks again */ }
}

function askNow(): Promise<void> {
  inFlight ??= ask().finally(() => { inFlight = null; });
  return inFlight;
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    // Idle: stop the loop; the next input (onInput) asks at once and restarts it.
    if (idle()) { timer = null; return; }
    void askNow().finally(schedule);
  }, pollSeconds * 1000);
}

/** Installed once by the shell for a signed-in person. */
export function installChangeWatch(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onForeground = () => {
    lastInputAt = Date.now();
    if (visible() && Date.now() - lastAskedAt > FOREGROUND_THROTTLE_MS) void askNow().finally(schedule);
  };
  const onInput = () => {
    const wasIdle = idle() || timer === null;
    lastInputAt = Date.now();
    if (wasIdle) onForeground();
  };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"] as const) window.addEventListener(type, onInput, { passive: true });
  window.addEventListener("focus", onForeground);
  window.addEventListener("online", onForeground);
  document.addEventListener("visibilitychange", onForeground);
  void askNow().finally(schedule);
}

/** After this page's own write: take the next answer as the baseline (the write already marked everything stale). */
export function adoptNextChanges(): void {
  if (!installed) return;
  adoptNext = true;
  void askNow();
}

/** Sign-out: forget the tokens. */
export function resetChangeWatch(): void {
  baseline = null;
  adoptNext = false;
}

/** Tests: stop the timer and allow a fresh install. */
export function stopChangeWatchForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  installed = false;
  lastInputAt = Date.now();
  resetChangeWatch();
}

/** Read again when one of these areas moved elsewhere (another device, a message from someone). */
export function useAreaChanges(areas: readonly ChangeArea[], onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  const key = areas.join(",");
  useEffect(() => {
    const wanted = new Set(key.split(",") as ChangeArea[]);
    const listener = (moved: readonly ChangeArea[]) => { if (moved.some((area) => wanted.has(area))) latest.current(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [key]);
}
