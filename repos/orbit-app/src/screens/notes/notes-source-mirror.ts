import { useCallback, useEffect, useMemo, useState } from "react";

import type { SyncRecord } from "../../api/contract/sync";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { LocalSyncQueuedMutation } from "../../data/sync/local-sync-repository";
import type { OfflineNoteMutationInput } from "../../data/sync/sync-coordinator";
import type { MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { NoteView } from "../../view-models/notes";
import { mirrorNote, notesFromMirror, overlayQueuedNotes, selectMirrorNotes, type NoteAssociationFilter } from "../../view-models/notes-mirror";

/**
 * Mirror-backed notes list, detail and write status (sprint 0108), shared by
 * native and — since sprint 0125, when the browser mirror is active — the
 * browser build. Opening the list or a note reads the mirror immediately and
 * the coordinator pulls only what changed in the background.
 *
 * `enabled` only gates the open-time probe: the browser runs these hooks
 * unconditionally (fixed hook order) and must not probe while the network is
 * its source.
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
  /** Mirror freshness label; null where the source is the network (browser without a mirror). */
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
  conflictMutation: LocalSyncQueuedMutation | null;
  /** Opaque device mirror revision; distinct from the note API's expectedVersion. */
  baseRevision: string | null;
  loading: boolean;
  failure: string | null;
  missing: boolean;
  refreshing: boolean;
  refresh(): void;
  /** After a write receipt: pull the change and confirm the mirror holds at least this version. */
  confirmSaved(noteId: string, version: number): Promise<boolean>;
  resolveConflict(input: { mutationId: string; resolution: "server" | "replace"; replacement?: OfflineNoteMutationInput }): Promise<void>;
  /** Sprint 0136: the latest write of this note the server refused (「未能保存」), with 重试 / 放弃. Absent in the browser. */
  failedMutation?: LocalSyncQueuedMutation | null;
  retryFailed?(mutationId: string): Promise<void>;
  discardFailed?(mutationId: string): Promise<void>;
}

export interface NotesWriteStatus extends NotesMirrorStatus {
  queuedCount: number;
  enqueueOfflineMutation(mutation: OfflineNoteMutationInput): Promise<void>;
  confirmSaved(noteId: string, version: number): Promise<boolean>;
}

type Synced = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

function useNotesMirror(actorId: string, enabled: boolean) {
  const locale = useOrbitLocale();
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  useMirrorProbe(state.refresh, enabled && Boolean(actorId));
  const freshness = mirrorFreshness(state, Boolean(actorId));
  const [queuedMutations, setQueuedMutations] = useState<LocalSyncQueuedMutation[]>([]);
  const [queueFailure, setQueueFailure] = useState<string | null>(null);
  const refreshQueued = useCallback(async () => {
    const session = state.currentSession();
    if (!session) { setQueuedMutations([]); return; }
    try {
      const overlay = await session.readOutboxOverlay("note");
      setQueuedMutations([...(overlay?.queuedMutations ?? [])]);
      setQueueFailure(null);
    } catch {
      setQueueFailure("本机待同步笔记暂时无法读取。");
    }
  }, [state.currentSession]);
  useEffect(() => { void refreshQueued(); }, [refreshQueued, state.lastSyncedAt, state.records, state.status]);
  const enqueueOfflineMutation = useCallback(async (mutation: OfflineNoteMutationInput) => {
    const session = state.currentSession();
    if (!session) throw new Error("本机同步范围尚未就绪。");
    await session.enqueueOfflineNoteMutation(mutation);
    await refreshQueued();
  }, [refreshQueued, state.currentSession]);
  const serverNotes = useMemo(() => freshness.readable ? notesFromMirror(state.records, actorId, locale.language) : null, [actorId, freshness.readable, locale.language, state.records]);
  const notes = useMemo(() => serverNotes ? overlayQueuedNotes(serverNotes, queuedMutations, actorId, locale.language) : null,
    [actorId, locale.language, queuedMutations, serverNotes]);
  return { state, freshness, notes, queuedMutations, queueFailure, enqueueOfflineMutation, refreshQueued };
}

async function confirmSaved(state: Synced, actorId: string, language: Parameters<typeof notesFromMirror>[2], noteId: string, version: number): Promise<boolean> {
  const mirror = await state.invalidate();
  if (!mirror || mirror.status !== "fresh") return false;
  const note = mirrorNote(notesFromMirror(mirror.records as readonly SyncRecord<unknown>[], actorId, language), noteId);
  return Boolean(note && note.version >= version);
}

export function useMirrorNotesList(input: NotesListSourceInput, enabled = true): NotesListSource {
  const { state, freshness, notes, queueFailure } = useNotesMirror(input.actorId, enabled);
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
    failure: freshness.failure ?? queueFailure,
    invalid: freshness.readable && notes === null,
    refreshing: freshness.refreshing,
    refresh: state.refresh,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
  };
}

export function useMirrorNoteDetail(input: { actorId: string; noteId: string; scopeKey: string }, enabled = true): NoteDetailSource {
  const locale = useOrbitLocale();
  const { state, freshness, notes, queuedMutations, queueFailure, refreshQueued } = useNotesMirror(input.actorId, enabled);
  const [resolvedNoteId, setResolvedNoteId] = useState(input.noteId);
  const [aliasFailure, setAliasFailure] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setResolvedNoteId(input.noteId);
    setAliasFailure(null);
    if (!input.noteId.startsWith("local:")) return () => { current = false; };
    const session = state.currentSession();
    if (!session) return () => { current = false; };
    void session.resolveNoteAlias(input.noteId).then((canonicalId) => {
      if (current && canonicalId) setResolvedNoteId(canonicalId);
    }).catch(() => {
      if (current) setAliasFailure(locale.t("sync.failure"));
    });
    return () => { current = false; };
  }, [input.noteId, locale, state.currentSession, state.lastSyncedAt, state.records, state.status]);
  const note = mirrorNote(notes, resolvedNoteId);
  const conflictMutation = queuedMutations.find(mutation => mutation.kind === "note" && mutation.id === resolvedNoteId && mutation.state === "conflict") ?? null;
  const baseRevision = state.records.find(record => record.id === resolvedNoteId)?.revision ?? null;
  const failedMutation = queuedMutations.filter(mutation => mutation.kind === "note" && mutation.id === resolvedNoteId && mutation.state === "failed").at(-1) ?? null;
  return {
    note,
    conflictMutation,
    failedMutation,
    async retryFailed(mutationId) {
      const session = state.currentSession();
      if (!session?.retryOfflineWrite) throw new Error("本机重试暂不可用。");
      await session.retryOfflineWrite("note", mutationId);
      await refreshQueued();
    },
    async discardFailed(mutationId) {
      const session = state.currentSession();
      if (!session?.discardOfflineWrite) throw new Error("本机放弃操作暂不可用。");
      await session.discardOfflineWrite("note", mutationId);
      await refreshQueued();
    },
    baseRevision,
    loading: freshness.loading,
    failure: freshness.failure ?? queueFailure ?? aliasFailure ?? (freshness.readable && notes === null ? locale.t("notes.invalidPayload") : null),
    missing: freshness.readable && notes !== null && !note,
    refreshing: freshness.refreshing,
    refresh: state.refresh,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    confirmSaved: (noteId, version) => confirmSaved(state, input.actorId, locale.language, noteId, version),
    async resolveConflict(resolution) {
      const session = state.currentSession();
      if (!session?.resolveNoteConflict) throw new Error("本机冲突操作暂不可用。");
      if (!conflictMutation || conflictMutation.mutationId !== resolution.mutationId) throw new Error("笔记冲突已变化，请刷新后重试。");
      await session.resolveNoteConflict(resolution);
      await refreshQueued();
      if (resolution.resolution === "replace") state.refresh();
    },
  };
}

export function useMirrorNotesWriteStatus(actorId: string, enabled = true): NotesWriteStatus {
  const locale = useOrbitLocale();
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  useMirrorProbe(state.refresh, enabled && Boolean(actorId));
  const freshness = mirrorFreshness(state, Boolean(actorId));
  const [queuedCount, setQueuedCount] = useState(0);
  const refreshQueued = useCallback(async () => {
    const session = state.currentSession();
    if (!session) { setQueuedCount(0); return; }
    try {
      const overlay = await session.readOutboxOverlay("note");
      setQueuedCount(overlay?.queuedMutations.length ?? 0);
    } catch {
      setQueuedCount(0);
    }
  }, [state.currentSession]);
  useEffect(() => { void refreshQueued(); }, [refreshQueued, state.lastSyncedAt, state.records, state.status]);
  const enqueueOfflineMutation = useCallback(async (mutation: OfflineNoteMutationInput) => {
    const session = state.currentSession();
    if (!session) throw new Error("本机同步范围尚未就绪。");
    await session.enqueueOfflineNoteMutation(mutation);
    await refreshQueued();
  }, [refreshQueued, state.currentSession]);
  return {
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    queuedCount,
    enqueueOfflineMutation,
    confirmSaved: (noteId, version) => confirmSaved(state, actorId, locale.language, noteId, version),
  };
}
