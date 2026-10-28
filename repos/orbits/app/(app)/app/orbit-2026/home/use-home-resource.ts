"use client";

import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";

export type HomeResource<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: T; readAt: string };

/**
 * Shared per path across every mounted card, in the stale-while-revalidate manner of SWR: cards
 * asking for the same path at once share one request, a card mounting again (back to Home) shows
 * the last answer at once and refreshes it behind, and a focus refreshes each path once.
 * Mounts reuse an answer for SWR's default dedupingInterval (2 s); a focus always asks again.
 */
const DEDUPE_MS = 2_000;

type Body = { ok: boolean; body: { success?: boolean; data?: unknown } | null; readAt: string };
type Entry = { last?: Body; startedAt: number; inFlight?: Promise<Body>; listeners: Set<(answer: Body) => void> };

const entries = new Map<string, Entry>();

function entryFor(path: string): Entry {
  let entry = entries.get(path);
  if (!entry) { entry = { startedAt: 0, listeners: new Set() }; entries.set(path, entry); }
  return entry;
}

async function fetchBody(path: string): Promise<Body> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    const body = await response.json() as Body["body"];
    return { ok: response.ok, body, readAt: new Date().toISOString() };
  } catch { return { ok: false, body: null, readAt: new Date().toISOString() }; }
}

/** One request per path at a time; `within` skips it when the last one started that recently. */
function revalidate(path: string, within: number): void {
  const entry = entryFor(path);
  if (entry.inFlight || Date.now() - entry.startedAt < within) return;
  entry.startedAt = Date.now();
  const request = fetchBody(path);
  entry.inFlight = request;
  void request.then((answer) => {
    entry.inFlight = undefined;
    // A failed refresh keeps the last good answer on screen.
    if (!answer.ok && entry.last?.ok) return;
    entry.last = answer;
    for (const listener of entry.listeners) listener(answer);
  });
}

function toResource<T>(answer: Body, schema: ZodType<T>): HomeResource<T> {
  const parsed = schema.safeParse(answer.body?.data);
  return answer.ok && answer.body?.success && parsed.success
    ? { kind: "ready", data: parsed.data, readAt: answer.readAt } : { kind: "error" };
}

let focusWired = false;
function wireFocusRefresh(): void {
  if (focusWired) return;
  focusWired = true;
  const onFocus = () => {
    if (document.visibilityState !== "visible") return;
    for (const [path, entry] of entries) if (entry.listeners.size > 0) revalidate(path, 0);
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
}

/** Mounted cards alone subscribe to their domain. A failed domain leaves other cards alone. */
export function useHomeResource<T>(path: string, schema: ZodType<T>): HomeResource<T> & { retry: () => void } {
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState<HomeResource<T>>(() => {
    const last = typeof window === "undefined" ? undefined : entries.get(path)?.last;
    return last ? toResource(last, schema) : { kind: "loading" };
  });
  const retry = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    // No window (server render / Node test renderers): read once, unshared, no focus refresh.
    if (typeof window === "undefined") {
      void fetchBody(path).then((answer) => { if (active) setResource(toResource(answer, schema)); });
      return () => { active = false; };
    }
    const entry = entryFor(path);
    const listener = (answer: Body) => { if (active) setResource(toResource(answer, schema)); };
    entry.listeners.add(listener);
    if (entry.last) setResource(toResource(entry.last, schema));
    // A retry always asks again; a mount reuses an answer that is only a moment old.
    revalidate(path, version > 0 ? 0 : DEDUPE_MS);
    wireFocusRefresh();
    return () => { active = false; entry.listeners.delete(listener); };
  }, [path, schema, version]);
  return { ...resource, retry };
}
