/**
 * agent-design AG12: contact access for the conversation cards — the account's contacts from the record store, active
 * or (for restore) deleted within the 30-day window. Code only: the graph hands nothing of this to a model unchanged
 * (field-grants.ts drops contact methods; the exit withholds them).
 */
import { CONTACT_RESTORE_WINDOW_DAYS } from "../../../contacts/delete/service";
import { contactVersionOf } from "../../../contacts/contact-version";
import { ownedByActor } from "../../../contacts/business-card-contact-match";
import type { LiveRecord, LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import type { ContactAccess, ContactSnapshot } from "./types";

const LIST_LIMIT = 20_000;
const DAY_MS = 86_400_000;

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function contactSnapshotOf(record: LiveRecord<Record<string, unknown>>): ContactSnapshot | null {
  const payload = record.payload;
  const displayName = text(payload.displayName);
  if (!displayName) return null;
  return {
    active: record.lifecycleState === "active" && !record.deletedAt,
    deletedAt: record.deletedAt ?? null,
    displayName,
    email: text(payload.primaryEmail),
    id: record.recordId,
    organization: text(payload.organization),
    phone: text(payload.primaryPhone),
    role: text(payload.role),
    updatedAt: record.updatedAt,
    version: contactVersionOf(payload),
  };
}

const squash = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s·・.,，、\-_]/gu, "");

export function createStoreContactAccess(input: { store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "getRecord" | "listRecords">; workspaceId: string; now?: () => Date }): ContactAccess {
  const now = input.now ?? (() => new Date());
  return {
    async findDeleted(actorId, words) {
      const said = squash(words);
      if (!said) return [];
      const floor = now().getTime() - CONTACT_RESTORE_WINDOW_DAYS * DAY_MS;
      const records = await input.store.listRecords({ collectionName: "contacts", includeDeleted: true, lifecycleState: "deleted", limit: LIST_LIMIT, userId: actorId, workspaceId: input.workspaceId });
      return records
        .filter((record) => ownedByActor(record, actorId) && record.lifecycleState === "deleted" && record.deletedAt && Date.parse(record.deletedAt) > floor)
        .map(contactSnapshotOf)
        .filter((item): item is ContactSnapshot => item !== null)
        .filter((item) => {
          const name = squash(item.displayName);
          return name.length > 0 && (said.includes(name) || name.includes(said));
        })
        .sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? "") || left.id.localeCompare(right.id));
    },
    async listActive(actorId) {
      const records = await input.store.listRecords({ collectionName: "contacts", lifecycleState: "active", limit: LIST_LIMIT, omitSearchText: true, userId: actorId, workspaceId: input.workspaceId });
      return records.filter((record) => ownedByActor(record, actorId) && record.lifecycleState === "active");
    },
    async read(actorId, contactId, options = {}) {
      const record = await input.store.getRecord({ collectionName: "contacts", ...(options.includeDeleted ? { includeDeleted: true } : {}), recordId: contactId, workspaceId: input.workspaceId });
      if (!record || !ownedByActor(record, actorId)) return null;
      if (!options.includeDeleted && record.lifecycleState !== "active") return null;
      return contactSnapshotOf(record);
    },
  };
}
