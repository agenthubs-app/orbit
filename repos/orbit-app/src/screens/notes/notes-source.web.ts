import { useEffect, useMemo, useRef, useState } from "react";

import { notePath, notesSearchPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { mergeNotePages } from "../../view-models/note-history-pagination";
import { noteFromPayload, notesPageFromPayload, type NoteView } from "../../view-models/notes";
import type { NoteDetailSource, NotesListSource, NotesListSourceInput, NotesWriteStatus } from "./notes-source";

/**
 * Browser notes source: online-only. Notes are not written to the browser
 * mirror (PLANNER 0077 whitelist: tasks and personal-schedule only), so the
 * page keeps the server search with cursor pages it had before sprint 0108.
 */
const OFFLINE_STATUS = { offline: false, lastSyncedAt: null, syncLabelKey: null } as const;

export function useNotesListSource(input: NotesListSourceInput): NotesListSource {
  const locale = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey: input.scopeKey });
  const query = { association: input.association, ...(input.contactId ? { contactId: input.contactId } : {}), q: input.q, limit: 20 };
  const path = notesSearchPath(query);
  const state = useApiResource<unknown>(path, () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only" });
  const basePage = state.kind === "success" || state.kind === "empty" ? notesPageFromPayload(state.data, input.actorId, locale.language) : null;
  const [extraNotes, setExtraNotes] = useState<NoteView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  const sourceKey = JSON.stringify([input.scopeKey, input.actorId, path, basePage?.total, basePage?.nextCursor, basePage?.notes.map(({ id, version, updatedAt }) => [id, version, updatedAt])]);
  const activeSource = useRef(sourceKey);
  const flight = useRef<AbortController | null>(null);
  activeSource.current = sourceKey;
  useEffect(() => {
    flight.current?.abort();
    flight.current = null;
    setExtraNotes([]);
    setNextCursor(basePage?.nextCursor ?? null);
    setPageError("");
    setLoadingMore(false);
    return () => { flight.current?.abort(); };
  }, [sourceKey]);
  const notes = useMemo(() => basePage ? mergeNotePages(basePage.notes, extraNotes) : null, [basePage, extraNotes]);

  async function loadMore() {
    if (!nextCursor || flight.current) return;
    const controller = new AbortController();
    const requestedSource = sourceKey;
    flight.current = controller;
    const owns = () => !controller.signal.aborted && activeSource.current === requestedSource && flight.current === controller;
    setLoadingMore(true);
    setPageError("");
    try {
      const result = await client.get<unknown>(notesSearchPath({ ...query, cursor: nextCursor }), { signal: controller.signal });
      if (!owns()) return;
      if (result.success && result.status >= 200 && result.status < 300) {
        const page = notesPageFromPayload(result.data, input.actorId, locale.language);
        if (page && page.total === basePage?.total) {
          setExtraNotes((items) => mergeNotePages(items, page.notes));
          setNextCursor(page.nextCursor);
        } else {
          setPageError(locale.t("notes.nextPageInvalid"));
        }
      } else {
        setPageError(result.success ? locale.t("notes.nextPageInvalid") : result.error.message);
      }
    } catch {
      if (owns()) setPageError(locale.t("notes.nextPageInvalid"));
    } finally {
      if (owns()) { flight.current = null; setLoadingMore(false); }
    }
  }

  return {
    notes,
    total: basePage?.total ?? null,
    hasMore: Boolean(nextCursor),
    loadingMore,
    pageError,
    loadMore: () => { void loadMore(); },
    loading: state.kind === "loading",
    failure: state.kind === "offline" || state.kind === "failure" ? state.error.message : null,
    invalid: (state.kind === "success" || state.kind === "empty") && notes === null,
    refreshing: state.refreshing,
    refresh: state.refresh,
    ...OFFLINE_STATUS,
  };
}

export function useNoteDetailSource(input: { actorId: string; noteId: string; scopeKey: string }): NoteDetailSource {
  const locale = useOrbitLocale();
  const state = useApiResource<unknown>(notePath(input.noteId), () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only" });
  const loaded = state.kind === "success" || state.kind === "empty";
  const note = loaded ? noteFromPayload(state.data, input.actorId, input.noteId, locale.language) : null;
  return {
    note,
    loading: state.kind === "loading",
    failure: state.kind === "failure" || state.kind === "offline" ? state.error.message : null,
    missing: loaded && !note,
    refreshing: state.refreshing,
    refresh: state.refresh,
    ...OFFLINE_STATUS,
    // The network source is the authority: re-read it and accept the receipt.
    async confirmSaved() { state.refresh(); return true; },
  };
}

export function useNotesWriteStatus(_actorId: string): NotesWriteStatus {
  return { ...OFFLINE_STATUS, async confirmSaved() { return true; } };
}
