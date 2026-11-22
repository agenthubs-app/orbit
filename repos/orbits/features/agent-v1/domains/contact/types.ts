/**
 * agent-design AG12: the five contact operations a conversation card carries (设计稿附录 B「联系人」四行) — what an
 * intent holds before it is frozen, and what the runtime reads at freeze and at the click.
 */
import type { LiveRecord } from "../../../../shared/storage/live-record-store";

export const CONTACT_CREATE = "contact.create";
export const CONTACT_UPDATE = "contact.update";
export const CONTACT_DELETE = "contact.delete";
export const CONTACT_RESTORE = "contact.restore";
export const CONTACT_IMPORT = "contact.import";
export const CONTACT_CAPABILITIES = [CONTACT_CREATE, CONTACT_UPDATE, CONTACT_DELETE, CONTACT_RESTORE, CONTACT_IMPORT] as const;
export type ContactCapability = (typeof CONTACT_CAPABILITIES)[number];

export const isContactCapability = (value: unknown): value is ContactCapability => (CONTACT_CAPABILITIES as readonly unknown[]).includes(value);

/** The five basic fields a card may set (the field writer's names; 附录 B). Others stay with the contact's own pages this version. */
export type ContactFieldName = "displayName" | "organization" | "role" | "email" | "phone";
export const CONTACT_FIELDS: readonly ContactFieldName[] = ["displayName", "organization", "role", "email", "phone"];

export interface ContactCreateIntent {
  capability: typeof CONTACT_CREATE;
  set: Partial<Record<ContactFieldName, string>> & { displayName: string };
}

export interface ContactUpdateIntent {
  capability: typeof CONTACT_UPDATE;
  targetId: string;
  set: Partial<Record<ContactFieldName, string | null>>;
}

/** A note or to-do linked to the contact: listed on a delete card as kept (设计稿 §4「删除保留关联笔记、任务」). */
export interface ContactEffect {
  ref: string;
  kind: "memo" | "todo";
  title: string;
}

export interface ContactDeleteIntent {
  capability: typeof CONTACT_DELETE;
  targetId: string;
  effects: ContactEffect[];
  /** Linked records beyond the ones listed (the read is paged). */
  moreEffects?: number;
}

export interface ContactRestoreIntent {
  capability: typeof CONTACT_RESTORE;
  targetId: string;
}

/** The user's own word on one row (1-based, header not counted): new contact anyway, or leave it out. */
export type ImportRowOverride = "create" | "skip";

export interface ContactImportIntent {
  capability: typeof CONTACT_IMPORT;
  /** The pasted table as the user wrote it (code parses it; the model never sees rows). */
  text: string;
  overrides: Record<string, ImportRowOverride>;
}

export type ContactOperationIntent = ContactCreateIntent | ContactUpdateIntent | ContactDeleteIntent | ContactRestoreIntent | ContactImportIntent;

/** A contact as the card code reads it (contact methods included: code renders the card; the model never sees this). */
export interface ContactSnapshot {
  id: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
  active: boolean;
}

/** What the card code and the graph read of contacts (account-scoped; one per deployment, the actor is passed). */
export interface ContactAccess {
  read(actorId: string, contactId: string, options?: { includeDeleted?: boolean }): Promise<ContactSnapshot | null>;
  /** The account's active contacts as stored (duplicate checks and import review). */
  listActive(actorId: string): Promise<readonly LiveRecord<Record<string, unknown>>[]>;
  /** Contacts deleted within the restore window whose name is in the words or contains them. */
  findDeleted(actorId: string, words: string): Promise<ContactSnapshot[]>;
}

/** The runtime's reader for contact items of a card: the access bound to the card's actor. */
export interface ContactCardReader {
  /** The card's account (import review matches its contacts only). */
  actorId: string;
  read(contactId: string, options?: { includeDeleted?: boolean }): Promise<ContactSnapshot | null>;
  listActive(): Promise<readonly LiveRecord<Record<string, unknown>>[]>;
}

export function boundContactReader(access: ContactAccess, actorId: string): ContactCardReader {
  return { actorId, listActive: () => access.listActive(actorId), read: (contactId, options) => access.read(actorId, contactId, options) };
}
