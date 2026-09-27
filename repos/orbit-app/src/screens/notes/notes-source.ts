import { useEffect, useMemo, useState } from "react";

import type { SyncRecord } from "../../api/contract/sync";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { NoteView } from "../../view-models/notes";
import { mirrorNote, notesFromMirror, selectMirrorNotes, type NoteAssociationFilter } from "../../view-models/notes-mirror";

/**
 * Native notes source (sprint 0108): the lease-fed device mirror. Opening the
 * list or a note reads the mirror immediately and the coordinator pulls only
 * what changed in the background. The browser build resolves
 * notes-source.web.ts, which stays online-only (notes are not stored in the
 * browser mirror, PLANNER 0077).
 */
export const NOTES_PAGE_SIZE = 20;

export interface NotesListSourceInput {
  actorId: string;
  scopeKey: string;
  association: NoteAssociationFilter;
  contactId?: string | undefined;
  q: string;
}

export interface NotesMirrorStatus {
  /** The last sync attempt failed; the screen shows the mirror "as of" lastSyncedAt and disables writing. */
  offline: boolean;
  lastSyncedAt: string | null;
  /** Mirror freshness label; null where the source is the network (browser). */
  syncLabelKey: MessageKey | null;
}

export interface NotesListSource extends NotesMirrorStatus {
  notes: NoteView[] | null;
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  pageError: string;
  loadMore(): void;
  loading: boolean;
  failure: string | null;
  invalid: boolean;
  refreshing: boolean;
  refresh(): void;
}

export interface NoteDetailSource extends NotesMirrorStatus {
  note: NoteView | null;
  loading: boolean;
  failure: string | null;
  missing: boolean;
  refreshing: boolean;
  refresh(): void;
  /** After a write receipt: pull the change and confirm the mirror holds at least this version. */
  confirmSaved(noteId: string, version: number): Promise<boolean>;
}

export interface NotesWriteStatus extends NotesMirrorStatus {
  confirmSaved(noteId: string, version: number): Promise<boolean>;
}

type Synced = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

function useNotesMirror(actorId: string) {
  const locale = useOrbitLocale();
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  useMirrorProbe(state.refresh, Boolean(actorId));
  const freshness = mirrorFreshness(state, Boolean(actorId));
  const notes = useMemo(() => freshness.readable ? notesFromMirror(state.records, actorId, locale.language) : null, [actorId, freshness.readable, locale.language, state.records]);
  return { state, freshness, notes };
}

async function confirmSaved(state: Synced, actorId: string, language: Parameters<typeof notesFromMirror>[2], noteId: string, version: number): Promise<boolean> {
  const mirror = await state.invalidate();
  if (!mirror || mirror.status !== "fresh") return false;
  const note = mirrorNote(notesFromMirror(mirror.records as readonly SyncRecord<unknown>[], actorId, language), noteId);
  return Boolean(note && note.version >= version);
}

export function useNotesListSource(input: NotesListSourceInput): NotesListSource {
  const { state, freshness, notes } = useNotesMirror(input.actorId);
  const selected = useMemo(() => notes ? selectMirrorNotes(notes, input) : null, [notes, input.association, input.contactId, input.q]);
  const queryKey = JSON.stringify([input.scopeKey, input.association, input.contactId ?? "", input.q]);
  const [shown, setShown] = useState({ queryKey, count: NOTES_PAGE_SIZE });
  useEffect(() => { setShown({ queryKey, count: NOTES_PAGE_SIZE }); }, [queryKey]);
  const count = shown.queryKey === queryKey ? shown.count : NOTES_PAGE_SIZE;
  return {
    notes: selected ? selected.slice(0, count) : null,
    total: selected ? selected.length : null,
    hasMore: Boolean(selected && count < selected.length),
    loadingMore: false,
    pageError: "",
    // A local window over the mirror: no request, nothing to fail.
    loadMore: () => setShown({ queryKey, count: count + NOTES_PAGE_SIZE }),
    loading: freshness.loading,
    failure: freshness.failure,
    invalid: freshness.readable && notes === null,
    refreshing: freshness.refreshing,
    refresh: state.refresh,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
  };
}

export function useNoteDetailSource(input: { actorId: string; noteId: string; scopeKey: string }): NoteDetailSource {
  const locale = useOrbitLocale();
  const { state, freshness, notes } = useNotesMirror(input.actorId);
  const note = mirrorNote(notes, input.noteId);
  return {
    note,
    loading: freshness.loading,
    failure: freshness.failure ?? (freshness.readable && notes === null ? locale.t("notes.invalidPayload") : null),
    missing: freshness.readable && notes !== null && !note,
    refreshing: freshness.refreshing,
    refresh: state.refresh,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    confirmSaved: (noteId, version) => confirmSaved(state, input.actorId, locale.language, noteId, version),
  };
}

export function useNotesWriteStatus(actorId: string): NotesWriteStatus {
  const locale = useOrbitLocale();
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  useMirrorProbe(state.refresh, Boolean(actorId));
  const freshness = mirrorFreshness(state, Boolean(actorId));
  return {
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    confirmSaved: (noteId, version) => confirmSaved(state, actorId, locale.language, noteId, version),
  };
}
