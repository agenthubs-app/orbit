export interface IOrbitEntityDraft {
  draftId: string;
  fields: Readonly<Record<string, string>>;
  kind: "task" | "note" | "schedule" | "event";
  state: "pending_confirmation" | "created" | "cancelled" | "superseded" | "failed";
}

/** A server card is actionable only after its small public shape is checked. */
export function readIOrbitEntityDraft(value: unknown): IOrbitEntityDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (typeof draft.draftId !== "string" || !draft.draftId.trim() || draft.draftId.length > 160
    || !["task", "note", "schedule", "event"].includes(String(draft.kind))
    || !["pending_confirmation", "created", "cancelled", "superseded", "failed"].includes(String(draft.state))
    || !draft.fields || typeof draft.fields !== "object" || Array.isArray(draft.fields)) return null;
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(draft.fields)) {
    if (key.length <= 80 && typeof item === "string" && item.trim() && item.length <= 2000) fields[key] = item.trim();
  }
  if (!Object.keys(fields).length) return null;
  return { draftId: draft.draftId, fields, kind: draft.kind as IOrbitEntityDraft["kind"], state: draft.state as IOrbitEntityDraft["state"] };
}
