import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { OrbitApiClient } from "../../api/client";
import type { HomeLayoutContract, HomeWidgetSlot } from "../../api/contract/home-layout";
import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../api/schema/home-layout";
import { homeLayoutStorage, type HomeLayoutDraft, type StoredHomeLayout } from "./home-layout-storage";
import { reconcileHomeLayoutDraft } from "./home-layout-sync";

type State = "loading" | "ready" | "stale" | "fallback" | "error";
type SaveResult = "saved" | "queued" | "conflict" | "error";
const empty = (): StoredHomeLayout => ({ snapshot: null, fetchedAt: null, draft: null });
const newId = () => `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const withDraft = (base: HomeLayoutContract, draft: HomeLayoutDraft | null): HomeLayoutContract => draft
  ? { ...base, app: draft.app, ...(draft.hintDismissedAt ? { hintDismissedAt: draft.hintDismissedAt } : {}) } : base;

function conflictLayout(context: Readonly<Record<string, string>> | undefined): HomeLayoutContract | null {
  try { const parsed = homeLayoutSchema.safeParse(JSON.parse(context?.currentLayout ?? "")); return parsed.success ? parsed.data : null; }
  catch { return null; }
}

/** Actor+server scoped layout cache and offline draft; a server conflict always wins. */
export function useHomeLayout({ actorId, baseUrl, client, onConflict }: {
  actorId: string; baseUrl: string; client: OrbitApiClient; onConflict: () => void;
}) {
  const [layout, setLayout] = useState<HomeLayoutContract>(DEFAULT_HOME_LAYOUT);
  const [state, setState] = useState<State>("loading");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const record = useRef<StoredHomeLayout>(empty());
  const active = useRef(true);
  const busy = useRef(false);

  const publish = useCallback(async (next: StoredHomeLayout, nextState: State) => {
    await homeLayoutStorage.write(actorId, baseUrl, next);
    record.current = next;
    if (!active.current) return;
    const source = next.snapshot ?? DEFAULT_HOME_LAYOUT;
    setLayout(withDraft(source, next.draft));
    setPending(Boolean(next.draft)); setState(nextState);
  }, [actorId, baseUrl]);

  const read = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const cached = await homeLayoutStorage.read(actorId, baseUrl);
      if (!active.current) return;
      record.current = cached;
      if (cached.snapshot || cached.draft) {
        setLayout(withDraft(cached.snapshot ?? DEFAULT_HOME_LAYOUT, cached.draft));
        setPending(Boolean(cached.draft)); setState("stale");
      }
      const result = await client.get<unknown>("/api/home/layout");
      if (!active.current) return;
      if (!result.success) {
        if (result.status === 503 && result.error.context?.reason === "NOT_IMPLEMENTED") { setState("fallback"); return; }
        setState(cached.snapshot || cached.draft ? "stale" : "error"); return;
      }
      const parsed = homeLayoutSchema.safeParse(result.data);
      if (!parsed.success) { setState(cached.snapshot ? "stale" : "error"); return; }
      const server = parsed.data;
      const draft = cached.draft;
      if (!draft) { await publish({ snapshot: server, fetchedAt: new Date().toISOString(), draft: null }, "ready"); return; }
      const resolved = await reconcileHomeLayoutDraft(server, draft, client);
      if (!active.current) return;
      await publish({ snapshot: resolved.layout, fetchedAt: new Date().toISOString(), draft: resolved.kind === "pending" ? draft : null }, resolved.kind === "pending" ? "stale" : "ready");
      if (resolved.kind === "conflict") onConflict();
    } catch { if (active.current) setState(record.current.snapshot ? "stale" : "error"); }
    finally { busy.current = false; }
  }, [actorId, baseUrl, client, onConflict, publish]);

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useFocusEffect(useCallback(() => { void read(); return () => undefined; }, [read]));
  useEffect(() => { const event = AppState.addEventListener("change", next => { if (next === "active") void read(); }); return () => event.remove(); }, [read]);

  const save = useCallback(async (app: readonly HomeWidgetSlot[], hintDismissedAt?: string, expectedRevision?: number): Promise<SaveResult> => {
    if (busy.current) return "error";
    busy.current = true; setSaving(true);
    try {
      const stored = record.current;
      const base = stored.snapshot ?? DEFAULT_HOME_LAYOUT;
      if (expectedRevision !== undefined && expectedRevision !== base.revision) { onConflict(); return "conflict"; }
      const id = stored.draft && JSON.stringify(stored.draft.app) === JSON.stringify(app)
        && stored.draft.hintDismissedAt === hintDismissedAt ? stored.draft.mutationId : newId();
      const input = { expectedRevision: base.revision, mutationId: id, app, web: base.web,
        ...(hintDismissedAt ?? base.hintDismissedAt ? { hintDismissedAt: hintDismissedAt ?? base.hintDismissedAt } : {}) };
      const result = await client.put<unknown>("/api/home/layout", { body: input });
      if (result.success) {
        const parsed = homeLayoutSchema.safeParse(result.data);
        if (!parsed.success) return "error";
        await publish({ snapshot: parsed.data, fetchedAt: new Date().toISOString(), draft: null }, "ready");
        return "saved";
      }
      if (result.status === 409) {
        const current = conflictLayout(result.error.context);
        if (!current) { setState("error"); return "error"; }
        await publish({ snapshot: current, fetchedAt: new Date().toISOString(), draft: null }, "ready");
        onConflict(); return "conflict";
      }
      if (result.status !== 0) return "error";
      const draft: HomeLayoutDraft = { baseRevision: base.revision, app, mutationId: id, savedAt: new Date().toISOString(),
        ...(hintDismissedAt ? { hintDismissedAt } : {}) };
      await publish({ snapshot: base, fetchedAt: stored.fetchedAt, draft }, "stale");
      return "queued";
    } catch { return "error"; }
    finally { busy.current = false; setSaving(false); }
  }, [client, onConflict, publish]);

  return { layout, state, saving, pending, fetchedAt: record.current.fetchedAt, reload: read, save };
}
