"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";

import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../../../../shared/api-schema/home-layout";
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../../../../shared/contract/home-layout";

type LoadState = "loading" | "ready" | "fallback" | "error";
type SaveResult = { kind: "saved"; layout: HomeLayoutContract } | { kind: "conflict"; layout: HomeLayoutContract | null } | { kind: "error" };

function mutationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function conflictLayout(body: unknown): HomeLayoutContract | null {
  const raw = body && typeof body === "object" ? (body as { error?: { context?: { currentLayout?: string } } }).error?.context?.currentLayout : null;
  if (typeof raw !== "string") return null;
  try {
    const parsed = homeLayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

type Read = { layout: HomeLayoutContract; state: Exclude<LoadState, "loading"> };

// The last layout read (in the site's read cache: per account, cleared on sign-out, stale after a write)
// and the read in flight: back on Home the grid draws at once; it is read again only once older than
// FRESH.list on mount (FRESH.focus on a focus) or after a write; a mount, a focus and a visibilitychange together ask once.
const LAYOUT_KEY = "home:layout";
let inFlight: Promise<Read> | undefined;
const remembered = () => lastAnswer<Read>(LAYOUT_KEY);

async function readLayout(): Promise<Read> {
  try {
    const response = await fetch("/api/home/layout", { cache: "no-store" });
    const body = await response.json() as { success?: boolean; data?: unknown; error?: { context?: { reason?: string } } };
    if (response.status === 503 && body.error?.context?.reason === "NOT_IMPLEMENTED") return { layout: DEFAULT_HOME_LAYOUT, state: "fallback" };
    const parsed = homeLayoutSchema.safeParse(body.data);
    if (!response.ok || !body.success || !parsed.success) return { layout: remembered()?.layout ?? DEFAULT_HOME_LAYOUT, state: "error" };
    return { layout: parsed.data, state: "ready" };
  } catch { return { layout: remembered()?.layout ?? DEFAULT_HOME_LAYOUT, state: "error" }; }
}

function sharedRead(): Promise<Read> {
  inFlight ??= readLayout().then((read) => {
    inFlight = undefined;
    // A failed refresh keeps a good layout on screen (and is never remembered as fresh).
    const last = remembered();
    if (read.state === "error") return last && last.state !== "error" ? last : read;
    rememberAnswer(LAYOUT_KEY, read);
    return read;
  });
  return inFlight;
}

export function useHomeLayout() {
  const [layout, setLayout] = useState<HomeLayoutContract>(() => remembered()?.layout ?? DEFAULT_HOME_LAYOUT);
  const [state, setState] = useState<LoadState>(() => remembered()?.state ?? "loading");
  const [saving, setSaving] = useState(false);
  const layoutRef = useRef(layout);
  const requestRef = useRef<{ fingerprint: string; mutationId: string } | null>(null);
  const savingRef = useRef(false);
  layoutRef.current = layout;

  const reload = useCallback(async () => {
    const read = await sharedRead();
    setLayout(read.layout); setState(read.state);
  }, []);

  useEffect(() => {
    if (!answerFresh(LAYOUT_KEY, FRESH.list)) void reload();
    const onFocus = () => { if (document.visibilityState === "visible" && !answerFresh(LAYOUT_KEY, FRESH.focus)) void reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload]);

  const save = useCallback(async (change: { web?: HomeLayoutContract["web"]; hintDismissedAt?: string }, expectedRevision?: number): Promise<SaveResult> => {
    if (savingRef.current) return { kind: "error" };
    savingRef.current = true; setSaving(true);
    const base = layoutRef.current;
    if (expectedRevision !== undefined && expectedRevision !== base.revision) {
      savingRef.current = false; setSaving(false);
      return { kind: "conflict", layout: base };
    }
    const input: Omit<HomeLayoutUpdateInput, "mutationId"> = {
      expectedRevision: base.revision, app: base.app, web: change.web ?? base.web,
      ...(change.hintDismissedAt ?? base.hintDismissedAt ? { hintDismissedAt: change.hintDismissedAt ?? base.hintDismissedAt } : {}),
    };
    const fingerprint = JSON.stringify(input);
    const id = requestRef.current?.fingerprint === fingerprint ? requestRef.current.mutationId : mutationId();
    requestRef.current = { fingerprint, mutationId: id };
    try {
      const response = await fetch("/api/home/layout", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, mutationId: id }) });
      const body = await response.json() as { success?: boolean; data?: unknown };
      if (response.status === 409) {
        const current = conflictLayout(body);
        if (current) { rememberAnswer<Read>(LAYOUT_KEY, { layout: current, state: "ready" }); setLayout(current); setState("ready"); }
        requestRef.current = null;
        return { kind: "conflict", layout: current };
      }
      const parsed = homeLayoutSchema.safeParse(body.data);
      if (!response.ok || !body.success || !parsed.success) return { kind: "error" };
      requestRef.current = null;
      rememberAnswer<Read>(LAYOUT_KEY, { layout: parsed.data, state: "ready" });
      setLayout(parsed.data); setState("ready");
      return { kind: "saved", layout: parsed.data };
    } catch { return { kind: "error" }; }
    finally { savingRef.current = false; setSaving(false); }
  }, []);

  return { layout, reload, save, saving, state };
}
