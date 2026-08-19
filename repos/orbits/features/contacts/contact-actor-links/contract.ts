import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export type ContactActorLinkState = "active" | "revoked";

export interface ContactActorLink {
  ownerActorId: string;
  contactId: string;
  linkedActorId: string;
  state: ContactActorLinkState;
  linkedAt: string;
  evidenceIds: readonly string[];
  revokedAt?: string;
}

export interface EnsureActiveContactActorLinkInput {
  ownerActorId: string;
  contactId: string;
  linkedActorId: string;
  linkedAt: string;
  evidenceIds: readonly string[];
}

export interface ContactActorLinkProviderResult {
  state: "created" | "replayed";
  link: ContactActorLink;
}

export interface ContactActorLinkProvider {
  ensureActive(
    input: EnsureActiveContactActorLinkInput,
  ): Promise<ContactActorLinkProviderResult>;
  listActiveForOwner(ownerActorId: string): Promise<readonly ContactActorLink[]>;
}

export interface StorageContactActorLinkProviderOptions {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}
