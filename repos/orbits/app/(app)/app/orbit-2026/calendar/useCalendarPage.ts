"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calendarWindow, type CalendarMode } from "./calendar-range";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { CalendarReadError, createCalendarReadClient, type CalendarInternalRead, type CalendarExternalRead } from "./calendar-read-client";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { useAreaChanges } from "../../orbit-change-watch";

export type CalendarPart<T> = { state: "idle" | "loading" | "ready" | "failed"; data: T | null };
interface Snapshot { scope: string; denied: boolean; internal: CalendarPart<CalendarInternalRead>; external: CalendarPart<CalendarExternalRead> }
const empty = (scope: string, state: "idle" | "loading" | "failed"): Snapshot => ({ scope, denied: false, internal: { state, data: null }, external: { state, data: null } });

/** In-memory display only. A denied source invalidates both account snapshots. */
export function useCalendarPage(zone: string, date: string, mode: CalendarMode, language: OrbitLanguage, enabled = true) {
  const { account, ready } = useSharedReadAccount();
  const window = useMemo(() => { try { return calendarWindow(date, mode, zone); } catch { return null; } }, [date, mode, zone]);
  const scope = JSON.stringify([account, ready, date, zone, mode, language, enabled]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(scope, enabled ? "loading" : "idle"));
  const client = useMemo(() => createCalendarReadClient(), []);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { generation.current++; request.current?.abort(); request.current = null; }, []);
  const refresh = useCallback(async () => {
    if (activeScope.current !== scope) return;
    cancel();
    if (!enabled || !ready) { setSnapshot(empty(scope, enabled ? "loading" : "idle")); return; }
    if (!window) { setSnapshot(empty(scope, "failed")); return; }
    const epoch = generation.current;
    const controller = new AbortController();
    request.current = controller;
    // Entries already on screen for this range stay while it is read again (after a write): the answers replace
    // them in place. A new range, zone or account (another scope) still starts from loading.
    setSnapshot(previous => previous.scope === scope && !previous.denied && previous.internal.state === "ready" && previous.external.state !== "loading" ? previous : empty(scope, "loading"));
    const active = () => !controller.signal.aborted && generation.current === epoch && activeScope.current === scope;
    const fail = (part: "internal" | "external", error: unknown) => {
      if (!active()) return;
      if (error instanceof CalendarReadError && error.code === "denied") { cancel(); setSnapshot({ ...empty(scope, "failed"), denied: true }); }
      else setSnapshot(previous => ({ ...previous, [part]: { state: "failed", data: null } }));
    };
    await Promise.all([
      client.internal(window, language, controller.signal).then(data => { if (active()) setSnapshot(previous => ({ ...previous, internal: { state: "ready", data } })); }).catch(error => fail("internal", error)),
      client.external(window.externalRanges, controller.signal).then(data => { if (active()) setSnapshot(previous => ({ ...previous, external: { state: "ready", data } })); }).catch(error => fail("external", error)),
    ]);
    if (active()) request.current = null;
  }, [cancel, client, enabled, language, ready, scope, window]);
  useEffect(() => { void refresh(); return cancel; }, [cancel, refresh]);
  // Schedule items or tasks changed elsewhere: read the range again behind the entries on screen.
  useAreaChanges(["calendar"], () => { void refresh(); });
  const visible = snapshot.scope === scope ? snapshot : empty(scope, enabled ? "loading" : "idle");
  return { internal: visible.internal, external: visible.external, denied: visible.denied, window, refresh };
}
