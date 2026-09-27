import { useEffect, useMemo, useRef, useState } from "react";

import { notePath, notesSearchPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { mergeNotePages } from "../../view-models/note-history-pagination";
import { noteFromPayload, notesPageFromPayload, type NoteView } from "../../view-models/notes";
import {
  useMirrorNoteDetail,
  useMirrorNotesList,
  useMirrorNotesWriteStatus,
  type NoteDetailSource,
  type NotesListSource,
  type NotesListSourceInput,
  type NotesWriteStatus,
} from "./notes-source-mirror";

export { NOTES_PAGE_SIZE } from "./notes-source-mirror";
export type { NoteDetailSource, NotesListSource, NotesListSourceInput, NotesMirrorStatus, NotesWriteStatus } from "./notes-source-mirror";

/**
 * Browser notes source, the tasks-page pattern of sprint 0078: since sprint
 * 0125 notes are on the browser mirror whitelist, so the page reads the same
 * mirror hooks as native (「截至」 offline, writes need the network) whenever
 * the browser mirror is available. Without it (non-secure context, missing
 * OPFS/IndexedDB/Web Crypto, open failure) the page keeps the server search
 * with cursor pages. Both sources always run so the hook order never changes;
 * each is inert while the other is authoritative.
 */
const ONLINE_STATUS = { offline: false, lastSyncedAt: null, syncLabelKey: null } as const;

export function useNotesListSource(input: NotesListSourceInput): NotesListSource {
  const mirrorActive = useWebMirrorStatus().mode === "local-mirror";
  const fromMirror = useMirrorNotesList(input, mirrorActive);
  const fromNetwork = useNetworkNotesList(input, !mirrorActive);
  return mirrorActive ? fromMirror : fromNetwork;
}

export function useNoteDetailSource(input: { actorId: string; noteId: string; scopeKey: string }): NoteDetailSource {
  const mirrorActive = useWebMirrorStatus().mode === "local-mirror";
  const fromMirror = useMirrorNoteDetail(input, mirrorActive);
  const fromNetwork = useNetworkNoteDetail(input, !mirrorActive);
  return mirrorActive ? fromMirror : fromNetwork;
}

export function useNotesWriteStatus(actorId: string): NotesWriteStatus {
  const mirrorActive = useWebMirrorStatus().mode === "local-mirror";
  const fromMirror = useMirrorNotesWriteStatus(actorId, mirrorActive);
  return mirrorActive ? fromMirror : { ...ONLINE_STATUS, async confirmSaved() { return true; } };
}

function useNetworkNotesList(input: NotesListSourceInput, enabled: boolean): NotesListSource {
  const locale = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey: input.scopeKey });
  const query = { association: input.association, ...(input.contactId ? { contactId: input.contactId } : {}), q: input.q, limit: 20 };
  const path = notesSearchPath(query);
  const state = useApiResource<unknown>(path, () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only", enabled });
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
    ...ONLINE_STATUS,
  };
}

function useNetworkNoteDetail(input: { actorId: string; noteId: string; scopeKey: string }, enabled: boolean): NoteDetailSource {
  const locale = useOrbitLocale();
  const state = useApiResource<unknown>(notePath(input.noteId), () => false, { scopeKey: input.scopeKey, cachePolicy: "network-only", enabled });
  const loaded = state.kind === "success" || state.kind === "empty";
  const note = loaded ? noteFromPayload(state.data, input.actorId, input.noteId, locale.language) : null;
  return {
    note,
    loading: state.kind === "loading",
    failure: state.kind === "failure" || state.kind === "offline" ? state.error.message : null,
    missing: loaded && !note,
    refreshing: state.refreshing,
    refresh: state.refresh,
    ...ONLINE_STATUS,
    // The network source is the authority: re-read it and accept the receipt.
    async confirmSaved() { state.refresh(); return true; },
  };
}
