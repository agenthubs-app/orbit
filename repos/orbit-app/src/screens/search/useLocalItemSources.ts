// Simulator QA G1: the person's notes, to-dos and schedule items for the global search, read from the device's
// mirrors (the same records the notes list, the to-do list and the calendar read), with changes still waiting to
// upload laid over them. No request: the coordinator keeps the mirrors current; this only reads.
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import type { PersonalScheduleContract, TaskItemContract } from "../../api/contract/tasks";
import type { LocalSyncQueuedMutation } from "../../data/sync/local-sync-repository";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import { useOfflineScheduleOutbox } from "../../data/sync/useOfflineScheduleOutbox";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { NoteView } from "../../view-models/notes";
import { notesFromMirror, overlayQueuedNotes } from "../../view-models/notes-mirror";
import { personalScheduleSeriesFromMirror } from "../../view-models/personal-schedule-occurrences";
import { overlayQueuedScheduleSeries } from "../../view-models/personal-schedule-overlay";
import { readTaskListItems } from "../../view-models/task-list-scope";
import { overlayQueuedTasks } from "../../view-models/tasks-mirror";

export interface LocalItemSources {
  notes: readonly NoteView[];
  tasks: readonly TaskItemContract[];
  schedule: readonly PersonalScheduleContract[];
}

export function useLocalItemSources(actorId: string): LocalItemSources {
  const { language } = useOrbitLocale();
  const ready = Boolean(actorId);
  const native = Platform.OS !== "web" && ready;
  const noteState = useSyncedCollection<Record<string, unknown>>({ kind: "note" });
  const taskState = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const scheduleState = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const taskOutbox = useOfflineTaskOutbox(taskState, native);
  const scheduleOutbox = useOfflineScheduleOutbox(scheduleState, native);
  const [queuedNotes, setQueuedNotes] = useState<LocalSyncQueuedMutation[]>([]);
  const noteSession = noteState.currentSession;
  useEffect(() => {
    let live = true;
    const session = noteSession();
    if (!session) { setQueuedNotes((previous) => previous.length ? [] : previous); return; }
    void session.readOutboxOverlay("note").then((overlay) => { if (live) setQueuedNotes([...(overlay?.queuedMutations ?? [])]); }).catch(() => undefined);
    return () => { live = false; };
  }, [noteSession, noteState.lastSyncedAt, noteState.records, noteState.status]);

  const notesReadable = mirrorFreshness(noteState, ready).readable;
  const tasksReadable = mirrorFreshness(taskState, ready).readable;
  const scheduleReadable = mirrorFreshness(scheduleState, ready).readable;
  const notes = useMemo(() => {
    const server = notesReadable ? notesFromMirror(noteState.records, actorId, language) : null;
    return (server ? overlayQueuedNotes(server, queuedNotes, actorId, language) : null) ?? [];
  }, [actorId, language, noteState.records, notesReadable, queuedNotes]);
  const tasks = useMemo(() => {
    const server = tasksReadable ? readTaskListItems({ tasks: taskState.records.map((record) => record.payload) }, actorId) : null;
    return (server ? overlayQueuedTasks(server, taskOutbox.queuedMutations, actorId) : null) ?? [];
  }, [actorId, taskOutbox.queuedMutations, taskState.records, tasksReadable]);
  const schedule = useMemo(() => {
    const series = scheduleReadable ? personalScheduleSeriesFromMirror(scheduleState.records, actorId) : null;
    if (!series) return [];
    const queued = scheduleOutbox?.queuedMutations ?? [];
    return (queued.length ? overlayQueuedScheduleSeries(series, queued, actorId).series : series).map((entry) => entry.item);
  }, [actorId, scheduleOutbox?.queuedMutations, scheduleReadable, scheduleState.records]);
  return useMemo(() => ({ notes, tasks, schedule }), [notes, schedule, tasks]);
}
