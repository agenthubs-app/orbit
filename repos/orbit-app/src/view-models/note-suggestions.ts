import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator } from "../i18n/messages";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function buildNoteSuggestionNavigation(note: { id: string; version: number }, language: OrbitLanguage = "zh") {
  return {
    pathname: "/ai/[id]" as const,
    params: {
      id: "new",
      initialMessage: createTranslator(language)("notes.aiTaskPrompt"),
      sourceNoteId: note.id,
      sourceNoteVersion: String(note.version),
    },
  };
}

export function noteSourceFromParams(params: {
  sourceNoteId?: string | string[] | undefined;
  sourceNoteVersion?: string | string[] | undefined;
}): { id: string; version: number } | null {
  const id = first(params.sourceNoteId).trim();
  const rawVersion = first(params.sourceNoteVersion).trim();
  const version = Number(rawVersion);
  return id && rawVersion && Number.isSafeInteger(version) && version >= 1
    ? { id, version }
    : null;
}

export interface NoteSourceTaskView {
  id: string;
  title: string;
  sourceNoteVersion: number;
}

export function noteSourceTasksFromPayload(
  payload: unknown,
  actorId: string,
  noteId: string,
): NoteSourceTaskView[] {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { tasks?: unknown }).tasks)) return [];
  return (payload as { tasks: unknown[] }).tasks.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const task = value as Record<string, unknown>;
    return task.accountId === actorId && task.ownerUserId === actorId && task.sourceNoteId === noteId
      && typeof task.id === "string" && task.id.trim()
      && typeof task.title === "string" && task.title.trim()
      && Number.isSafeInteger(task.sourceNoteVersion) && Number(task.sourceNoteVersion) >= 1
      ? [{ id: task.id, title: task.title, sourceNoteVersion: Number(task.sourceNoteVersion) }]
      : [];
  });
}
