/**
 * agent-design AG12 `applyApproved` for contacts (设计稿附录 B「联系人」, §5.2): runs only in the executor after the user's
 * click, through the existing contact services, each with the item's own operation key.
 *
 * - create: the manual-entry service with "another person" (the user chose it in the question; never merged).
 * - update: the field writer with the expected version (the one read at the click); a different version is a
 *   permanent failure — nothing overwritten, never retried. A replay finds its own values and returns.
 * - delete / restore: the soft delete and the 30-day restore — only the contact's own row changes; its notes and
 *   to-dos stay as they are. Restore brings back the same id.
 * - import: upload → decisions as the card said → commit, the operation key as the batch's key and the
 *   confirmation's id; a possible duplicate is never merged.
 */
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { applyContactFieldValues, ContactFieldWriteError } from "../../../contacts/contact-field-write";
import type { ContactDeleteService } from "../../../contacts/delete/service";
import type { ContactImportService } from "../../../contacts/import/service";
import type { ManualContactV2Service } from "../../../contacts/manual-contact-v2/service";
import type { LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import { AppError } from "../../../../shared/errors/app-error";
import { importBytesOf, withHeader } from "./import-preview";
import { CONTACT_CREATE, CONTACT_DELETE, CONTACT_FIELDS, CONTACT_IMPORT, CONTACT_RESTORE, CONTACT_UPDATE, type ContactAccess, type ContactFieldName } from "./types";

export interface ContactWriteDeps {
  actorId: string;
  workspaceId: string;
  store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord" | "updateRecordIfCurrent">;
  access: ContactAccess;
  manual: Pick<ManualContactV2Service, "create"> | null;
  deletes: ContactDeleteService | null;
  imports: Pick<ContactImportService, "upload" | "listRows" | "setDecisions" | "commit"> | null;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const changed = (what: string) => new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${what}; nothing was written.`);

export function contactWriteExecutors(deps: ContactWriteDeps): AgentActionExecutor[] {
  return [
    { execute: (payload, context) => applyApprovedContactCreate(deps, payload, context), key: CONTACT_CREATE, riskLevel: "write" },
    { execute: (payload, context) => applyApprovedContactUpdate(deps, payload, context), key: CONTACT_UPDATE, riskLevel: "write" },
    { execute: (payload) => applyApprovedContactDelete(deps, payload), key: CONTACT_DELETE, riskLevel: "write" },
    { execute: (payload) => applyApprovedContactRestore(deps, payload), key: CONTACT_RESTORE, riskLevel: "write" },
    { execute: (payload, context) => applyApprovedContactImport(deps, payload, context), key: CONTACT_IMPORT, riskLevel: "write" },
  ];
}

export async function applyApprovedContactCreate(deps: ContactWriteDeps, payload: Readonly<Record<string, unknown>>, context: { idempotencyKey: string }) {
  if (!deps.manual) throw new AgentExecutionPermanentError("Contact creation is not configured.");
  const displayName = text(payload.displayName);
  if (!displayName) throw new AgentExecutionPermanentError("displayName is required.");
  const result = await deps.manual.create(deps.actorId, {
    allowDuplicate: true,
    displayName,
    idempotencyKey: context.idempotencyKey,
    ...(text(payload.organization) ? { organization: text(payload.organization) } : {}),
    ...(text(payload.role) ? { role: text(payload.role) } : {}),
    ...(text(payload.email) ? { email: text(payload.email) } : {}),
    ...(text(payload.phone) ? { phone: text(payload.phone) } : {}),
  });
  if (result.outcome !== "created" || !result.contactId) throw new AgentExecutionPermanentError(`The contact was not created (${result.outcome}).`);
  return { resultRef: `contacts:${result.contactId}`, summary: "Contact created in Orbit." };
}

export async function applyApprovedContactUpdate(deps: ContactWriteDeps, payload: Readonly<Record<string, unknown>>, context: { idempotencyKey: string; now: string }) {
  const contactId = text(payload.contactId);
  const expectedVersion = typeof payload.expectedVersion === "number" ? payload.expectedVersion : Number.NaN;
  const values = (payload.values ?? {}) as Partial<Record<ContactFieldName, string | null>>;
  const before = (payload.before ?? {}) as Partial<Record<ContactFieldName, string | null>>;
  if (!contactId || !Number.isInteger(expectedVersion) || !Object.keys(values).length) throw new AgentExecutionPermanentError("contactId, expectedVersion and values are required.");
  const current = await deps.access.read(deps.actorId, contactId);
  if (!current) throw changed("the contact is no longer there");
  const now = (field: ContactFieldName) => (field === "displayName" ? current.displayName : current[field]) ?? null;
  const fields = Object.keys(values).filter((field): field is ContactFieldName => (CONTACT_FIELDS as readonly string[]).includes(field));
  // A replay after a lost receipt: our own write already holds every new value, one version on.
  if (current.version === expectedVersion + 1 && fields.every((field) => now(field) === (values[field] ?? null))) return { resultRef: `contacts:${contactId}`, summary: "Contact updated in Orbit." };
  for (const field of fields) if ((before[field] ?? null) !== now(field)) throw changed(`${field} changed since the card was shown`);
  try {
    await applyContactFieldValues({ actorId: deps.actorId, contactId, expectedVersion, now: () => new Date(context.now), source: "manual", store: deps.store, values, workspaceId: deps.workspaceId });
  } catch (error) {
    if (error instanceof ContactFieldWriteError && (error.code === "CONFLICT" || error.code === "NOT_FOUND" || error.code === "INVALID")) throw changed(error.message);
    throw error;
  }
  return { resultRef: `contacts:${contactId}`, summary: "Contact updated in Orbit." };
}

export async function applyApprovedContactDelete(deps: ContactWriteDeps, payload: Readonly<Record<string, unknown>>) {
  if (!deps.deletes) throw new AgentExecutionPermanentError("Contact deletion is not configured.");
  const contactId = text(payload.contactId);
  if (!contactId) throw new AgentExecutionPermanentError("contactId is required.");
  const current = await deps.access.read(deps.actorId, contactId, { includeDeleted: true });
  if (!current) throw changed("the contact is no longer there");
  // Deleted already: a replay of this key (the service returns the first deletion).
  if (current.active && typeof payload.expectedVersion === "number" && current.version !== payload.expectedVersion) throw changed("the contact changed since the card was shown");
  try {
    await deps.deletes.remove(deps.actorId, contactId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") throw changed("the contact was not found");
    throw error;
  }
  return { resultRef: `contacts:${contactId}`, summary: "Contact deleted in Orbit (restorable for 30 days)." };
}

export async function applyApprovedContactRestore(deps: ContactWriteDeps, payload: Readonly<Record<string, unknown>>) {
  if (!deps.deletes) throw new AgentExecutionPermanentError("Contact restore is not configured.");
  const contactId = text(payload.contactId);
  if (!contactId) throw new AgentExecutionPermanentError("contactId is required.");
  try {
    await deps.deletes.restore(deps.actorId, contactId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") throw changed("the contact can no longer be restored (past 30 days or not found)");
    throw error;
  }
  return { resultRef: `contacts:${contactId}`, summary: "Contact restored in Orbit." };
}

export async function applyApprovedContactImport(deps: ContactWriteDeps, payload: Readonly<Record<string, unknown>>, context: { idempotencyKey: string }) {
  if (!deps.imports) throw new AgentExecutionPermanentError("Contact import is not configured.");
  const table = text(payload.text);
  const outcomes = (payload.outcomes ?? {}) as Record<string, "create" | "skip">;
  if (!table) throw new AgentExecutionPermanentError("text is required.");
  // AG20b (R12): the same header code gave the card (the card's text has it already; an older card's text gets it the same way).
  const uploaded = await deps.imports.upload({ actorId: deps.actorId, bytes: importBytesOf(withHeader(table)), fileName: "conversation-import.csv", idempotencyKey: context.idempotencyKey, kind: "csv" });
  let batch = uploaded.batch;
  if (batch.status === "reviewing") {
    const rows: { seq: number; decision: string | null; issues: readonly string[] }[] = [];
    let after: number | undefined;
    for (;;) {
      const page = await deps.imports.listRows(deps.actorId, batch.id, after === undefined ? {} : { afterSeq: after });
      rows.push(...page.rows.map((row) => ({ decision: row.decision, issues: row.issues, seq: row.seq })));
      if (page.nextCursor === null) break;
      after = page.nextCursor;
    }
    if (rows.length !== Object.keys(outcomes).length) throw changed("the table no longer reads as the card showed it");
    // What the card said, row by row: create or leave out; a possible duplicate is never merged.
    const decisions = rows.filter((row) => (outcomes[String(row.seq)] ?? "skip") !== row.decision).map((row) => ({ decision: outcomes[String(row.seq)] ?? "skip", seq: row.seq })) as { seq: number; decision: "create" | "skip" }[];
    if (decisions.length) batch = (await deps.imports.setDecisions(deps.actorId, batch.id, decisions)).batch;
  }
  const committed = await deps.imports.commit(deps.actorId, batch.id, { confirmationIntentId: context.idempotencyKey, mergeConfirmations: [] });
  // AG21c (R54): the receipt counts each row by the outcome the card showed — a row the card left out (a row without a
  // name included) is skipped, never "failed"; only a row the card said to create that was not created is a failure.
  const shownSkips = Object.values(outcomes).filter((outcome) => outcome === "skip").length;
  const counts = committed.batch.counts;
  const receipt = counts ? { created: counts.created, failed: Math.max(0, Object.keys(outcomes).length - counts.created - counts.merged - shownSkips), merged: counts.merged, skipped: shownSkips } : null;
  return { resultRef: `contact_imports:${committed.batch.id}`, summary: `Contacts imported in Orbit (${receipt ? JSON.stringify(receipt) : "done"}).` };
}
