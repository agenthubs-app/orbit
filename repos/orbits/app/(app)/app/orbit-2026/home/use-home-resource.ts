"use client";

import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";

import type { ChangeArea } from "../../../../../shared/storage/change-tokens";
import { FRESH, onAnswersStale } from "../../orbit-last-answer";
import { getSharedReadAccount } from "../../orbit-shared-read";

export type HomeResource<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: T; readAt: string };

/**
 * Shared per path (and per account) across every mounted card, in the stale-while-revalidate manner of
 * SWR / TanStack Query and under the site's one cache rule (orbit-last-answer.ts): cards asking for the
 * same path at once share one request; a card mounting again (back to Home) shows the last answer at once
 * and asks again only once it is older than FRESH.list or a write has made it stale; a focus refreshes
 * the mounted paths (FRESH.focus: always, one request per path at a time); a write anywhere (orbit-write-watch) refreshes the mounted ones.
 * Memory only, keyed by account, cleared on sign-out (orbit-sign-out.ts).
 */

type Body = { ok: boolean; body: { success?: boolean; data?: unknown } | null; readAt: string };
type Entry = { last?: Body; startedAt: number; inFlight?: Promise<Body>; listeners: Set<(answer: Body) => void> };

const entries = new Map<string, Entry>();
let owner: string | null = null;

/** The account's own entry for a path; another account on this page drops every entry of the last one. */
function entryFor(path: string): Entry {
  const account = getSharedReadAccount();
  if (owner !== account) { entries.clear(); owner = account; }
  let entry = entries.get(path);
  if (!entry) { entry = { startedAt: 0, listeners: new Set() }; entries.set(path, entry); }
  return entry;
}

/** Sign-out: nothing of this account stays in memory. */
export function clearHomeResources(): void {
  entries.clear();
  owner = null;
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
  // A failed answer is never fresh: the next mount or focus asks again.
  if (entry.inFlight || (entry.last?.ok !== false && Date.now() - entry.startedAt < within)) return;
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

/** The home cards' reads behind each change-cursor area. */
const AREA_PATHS: Readonly<Record<ChangeArea, readonly string[]>> = {
  inbox: ["/api/inbox"],
  contacts: ["/api/contacts", "/api/home/guide-progress"],
  tasks: ["/api/todo"],
  calendar: ["/api/schedule-items", "/api/todo"],
  memo: ["/api/notes"],
  agent: ["/api/ai/conversations"],
};

let focusWired = false;
function wireFocusRefresh(): void {
  if (focusWired) return;
  focusWired = true;
  const onFocus = () => {
    if (document.visibilityState !== "visible") return;
    for (const [path, entry] of entries) if (entry.listeners.size > 0) revalidate(path, FRESH.focus);
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  // A write anywhere on the page (areas null), or an area moved elsewhere (the change cursor): the matching cards on
  // screen read again now (behind their content), the others on their next mount.
  onAnswersStale((areas) => {
    const prefixes = areas ? areas.flatMap((area) => AREA_PATHS[area]) : null;
    for (const [path, entry] of entries) {
      if (prefixes && !prefixes.some((prefix) => path.startsWith(prefix))) continue;
      entry.startedAt = 0;
      if (entry.listeners.size > 0) revalidate(path, 0);
    }
  });
}

/** Mounted cards alone subscribe to their domain. A failed domain leaves other cards alone. */
export function useHomeResource<T>(path: string, schema: ZodType<T>): HomeResource<T> & { retry: () => void } {
  const [version, setVersion] = useState(0);
  const [resource, setResource] = useState<HomeResource<T>>(() => {
    const last = typeof window === "undefined" ? undefined : entryFor(path).last;
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
    // A retry always asks again; a mount reuses an answer younger than the list freshness.
    revalidate(path, version > 0 ? 0 : FRESH.list);
    wireFocusRefresh();
    return () => { active = false; entry.listeners.delete(listener); };
  }, [path, schema, version]);
  return { ...resource, retry };
}
