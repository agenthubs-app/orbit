import { createHash } from "node:crypto";

import {
  EVENT_ORGANIZER_ACCOUNT_MANIFEST,
  validateEventOrganizerManifest,
  type OrganizerAccountDefinition,
} from "./manifest";
import type { AuthUserService } from "../../auth/service";
import type { AuthAccountProvisioningProvider } from "../../auth/storage/auth-account-provisioning-provider";
import type { AuthUserStorageProvider, StoredAuthUser } from "../../auth/storage/auth-user-live-record-provider";
import type { ContactActorLinkProvider } from "../../contacts/contact-actor-links/contract";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export const EVENT_ORGANIZER_BOOTSTRAP_MANIFEST_VERSION = "event-organizers-v1" as const;
export const XIAOYU_AUTH_USER_ID = "user_mry5y200_58jpi8";
export const XIAOYU_ACCOUNT_ID = "account_orbit_generated";
export const XIAOYU_PUBLIC_PROFILE_ID = "profile_orbit_generated_operator";
export const XIAOYU_AUTH_MEMBERSHIP_EVIDENCE_ID = "evidence:organizer-account-manifest:v1";

const XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP = "2026-08-19T00:00:00.000Z";
const XIAOYU_DISPLAY_NAME = "agenthubs";

export interface OrganizerAccountBootstrapDependencies {
  accountProvisioner: AuthAccountProvisioningProvider;
  authUserProvider: AuthUserStorageProvider;
  authUserService: AuthUserService;
  contactActorLinkProvider: ContactActorLinkProvider;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export type OrganizerAccountBootstrapItem =
  | {
    accountKey: string;
    displayName: string;
    email: string;
    kind: "organizer-identity";
  }
  | {
    contactId: string;
    kind: "contact-actor-link";
    organizerKey: string;
  }
  | {
    accountId: typeof XIAOYU_ACCOUNT_ID;
    authUserId: string;
    kind: "xiaoyu-auth-membership";
    profileId: typeof XIAOYU_PUBLIC_PROFILE_ID;
  };

export interface OrganizerAccountBootstrapPlan {
  readonly accountCount: 13;
  readonly contactLinkCount: 6;
  readonly hash: string;
  readonly items: readonly OrganizerAccountBootstrapItem[];
  readonly manifestVersion: "event-organizers-v1";
  readonly xiaoyuIdentityBindingCount: 1;
}

export interface OrganizerAccountBootstrapVerification {
  readonly accountCount: 13;
  readonly contactLinkCount: 6;
  readonly hash: string;
  readonly newAccountCount: number;
  readonly newContactLinkCount: number;
  readonly newXiaoyuIdentityBindingCount: number;
  readonly xiaoyuIdentityBindingCount: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function planHash(items: readonly OrganizerAccountBootstrapItem[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({
      items: [...items],
      manifestVersion: EVENT_ORGANIZER_BOOTSTRAP_MANIFEST_VERSION,
    })))
    .digest("hex");
}

function membershipRecordId(authUserId: string): string {
  return `profile:auth-membership:${authUserId}`;
}

function membershipSourceId(authUserId: string): string {
  return `auth-membership:${authUserId}`;
}

function expectedMembershipRecord(
  user: StoredAuthUser,
  workspaceId: string,
): LiveRecord<Record<string, unknown>> {
  const recordId = membershipRecordId(user.id);
  const sourceId = membershipSourceId(user.id);
  const payload = {
    id: user.id,
    accountId: XIAOYU_ACCOUNT_ID,
    displayName: user.displayName,
    timezone: "Asia/Tokyo",
    createdAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
    updatedAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
  };

  return {
    workspaceId,
    collectionName: "profiles",
    recordId,
    userId: XIAOYU_ACCOUNT_ID,
    sourceType: "manual",
    sourceId,
    sourceLabel: "Reviewed Xiaoyu auth membership",
    provider: "event-organizer-account-bootstrap",
    providerRecordId: user.id,
    evidenceIds: [XIAOYU_AUTH_MEMBERSHIP_EVIDENCE_ID],
    targetType: null,
    targetId: null,
    occurredAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
    createdAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
    updatedAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
    deletedAt: null,
    lifecycleState: "active",
    searchText: `${user.displayName} ${user.email}`,
    payload,
  };
}

function sameMembershipRecord(
  actual: LiveRecord<Record<string, unknown>>,
  expected: LiveRecord<Record<string, unknown>>,
): boolean {
  return JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected));
}

function accountItems(): readonly OrganizerAccountBootstrapItem[] {
  return [...EVENT_ORGANIZER_ACCOUNT_MANIFEST]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item) => ({
      accountKey: item.key,
      displayName: item.displayName,
      email: item.email,
      kind: "organizer-identity" as const,
    }));
}

function contactLinkItems(): readonly OrganizerAccountBootstrapItem[] {
  return EVENT_ORGANIZER_ACCOUNT_MANIFEST
    .filter((item) => item.relationship === "existing_contact")
    .sort((left, right) => left.contactId!.localeCompare(right.contactId!))
    .map((item) => ({
      contactId: item.contactId!,
      kind: "contact-actor-link" as const,
      organizerKey: item.key,
    }));
}

function buildItems(): readonly OrganizerAccountBootstrapItem[] {
  return [
    ...accountItems(),
    ...contactLinkItems(),
    {
      accountId: XIAOYU_ACCOUNT_ID,
      authUserId: XIAOYU_AUTH_USER_ID,
      kind: "xiaoyu-auth-membership",
      profileId: XIAOYU_PUBLIC_PROFILE_ID,
    },
  ];
}

function expectedPlan(): OrganizerAccountBootstrapPlan {
  const items = buildItems();
  return {
    accountCount: 13,
    contactLinkCount: 6,
    hash: planHash(items),
    items,
    manifestVersion: EVENT_ORGANIZER_BOOTSTRAP_MANIFEST_VERSION,
    xiaoyuIdentityBindingCount: 1,
  };
}

function authUserFromRecord(record: LiveRecord<Record<string, unknown>>): StoredAuthUser | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.email) ||
    !nonEmptyString(payload.displayName) ||
    (payload.provider !== "credentials" && payload.provider !== "google") ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    provider: payload.provider,
    passwordHash: typeof payload.passwordHash === "string" ? payload.passwordHash : null,
    providerAccountId: typeof payload.providerAccountId === "string" ? payload.providerAccountId : null,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

async function resolveXiaoyuUser(
  dependencies: OrganizerAccountBootstrapDependencies,
  xiaoyuAuthUserId: string,
): Promise<StoredAuthUser> {
  if (xiaoyuAuthUserId !== XIAOYU_AUTH_USER_ID) {
    throw new Error("Use the reviewed Xiaoyu auth user ID.");
  }

  const records = await dependencies.store.listRecords({
    workspaceId: dependencies.workspaceId,
    collectionName: "auth_users",
  });
  const candidateRecords = records.filter(
    (record) => record.payload.id === xiaoyuAuthUserId,
  );
  const user = candidateRecords[0] ? authUserFromRecord(candidateRecords[0]) : null;

  if (
    candidateRecords.length !== 1 ||
    !user ||
    user.displayName !== XIAOYU_DISPLAY_NAME ||
    user.provider !== "google"
  ) {
    throw new Error("Expected one Google agenthubs Xiaoyu auth identity.");
  }

  return user;
}

async function assertXiaoyuCanonicalChain(
  dependencies: OrganizerAccountBootstrapDependencies,
): Promise<void> {
  const [account, profile] = await Promise.all([
    dependencies.store.getRecord({
      workspaceId: dependencies.workspaceId,
      collectionName: "accounts",
      recordId: XIAOYU_ACCOUNT_ID,
      includeDeleted: true,
    }),
    dependencies.store.getRecord({
      workspaceId: dependencies.workspaceId,
      collectionName: "profiles",
      recordId: XIAOYU_PUBLIC_PROFILE_ID,
      includeDeleted: true,
    }),
  ]);

  if (
    account?.lifecycleState !== "active" ||
    account.userId !== XIAOYU_ACCOUNT_ID ||
    account.payload.id !== XIAOYU_ACCOUNT_ID ||
    profile?.lifecycleState !== "active" ||
    profile.userId !== XIAOYU_ACCOUNT_ID ||
    profile.payload.id !== XIAOYU_PUBLIC_PROFILE_ID ||
    profile.payload.accountId !== XIAOYU_ACCOUNT_ID
  ) {
    throw new Error("Xiaoyu canonical account/profile chain is incomplete or conflicting.");
  }
}

async function ensureXiaoyuMembership(
  dependencies: OrganizerAccountBootstrapDependencies,
  user: StoredAuthUser,
): Promise<boolean> {
  const expected = expectedMembershipRecord(user, dependencies.workspaceId);
  const deterministic = await dependencies.store.getRecord({
    workspaceId: dependencies.workspaceId,
    collectionName: "profiles",
    recordId: expected.recordId,
    includeDeleted: true,
  });
  if (deterministic && !sameMembershipRecord(deterministic, expected)) {
    throw new Error("Xiaoyu auth membership conflicts with the reviewed binding.");
  }
  const profiles = await dependencies.store.listRecords({
    workspaceId: dependencies.workspaceId,
    collectionName: "profiles",
  });
  const matching = profiles.filter(
    (profile) => profile.recordId !== expected.recordId && profile.payload.id === user.id,
  );

  if (matching.length > 0) {
    throw new Error("Xiaoyu auth membership is ambiguous.");
  }
  if (deterministic) {
    return false;
  }

  await dependencies.store.upsertRecord(expected);
  return true;
}

function isValidOrganizerAccount(
  account: LiveRecord<Record<string, unknown>>,
  user: StoredAuthUser,
): boolean {
  return (
    account.lifecycleState === "active" &&
    account.userId === user.id &&
    isRecord(account.payload) &&
    account.payload.id === user.id
  );
}

function isValidOrganizerProfile(
  profile: LiveRecord<Record<string, unknown>>,
  definition: OrganizerAccountDefinition,
  user: StoredAuthUser,
): boolean {
  return (
    profile.lifecycleState === "active" &&
    profile.userId === user.id &&
    isRecord(profile.payload) &&
    profile.payload.id === `profile:${user.id}` &&
    profile.payload.accountId === user.id &&
    profile.payload.displayName === definition.displayName
  );
}

async function organizerChainState(
  dependencies: OrganizerAccountBootstrapDependencies,
  definition: OrganizerAccountDefinition,
  user: StoredAuthUser,
): Promise<"complete" | "repairable"> {
  if (
    user.displayName !== definition.displayName ||
    user.provider !== "credentials"
  ) {
    throw new Error(`Conflicting organizer identity for ${definition.email}.`);
  }

  const [account, profile] = await Promise.all([
    dependencies.store.getRecord({
      workspaceId: dependencies.workspaceId,
      collectionName: "accounts",
      recordId: user.id,
      includeDeleted: true,
    }),
    dependencies.store.getRecord({
      workspaceId: dependencies.workspaceId,
      collectionName: "profiles",
      recordId: `profile:${user.id}`,
      includeDeleted: true,
    }),
  ]);
  if (
    (account !== null && !isValidOrganizerAccount(account, user)) ||
    (profile !== null && !isValidOrganizerProfile(profile, definition, user))
  ) {
    throw new Error(`Conflicting organizer account/profile chain for ${definition.email}.`);
  }

  return account && profile ? "complete" : "repairable";
}

async function assertReviewedContacts(
  dependencies: OrganizerAccountBootstrapDependencies,
): Promise<void> {
  const contactDefinitions = EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter(
    (definition) => definition.relationship === "existing_contact",
  );
  const contacts = await Promise.all(contactDefinitions.map(async (definition) => ({
    definition,
    record: await dependencies.store.getRecord({
      workspaceId: dependencies.workspaceId,
      collectionName: "contacts",
      recordId: definition.contactId!,
    }),
  })));

  for (const { definition, record } of contacts) {
    if (
      record?.userId !== XIAOYU_ACCOUNT_ID ||
      record.payload.id !== definition.contactId
    ) {
      throw new Error(`Reviewed Xiaoyu contact is missing or owned by another account: ${definition.contactId}.`);
    }
  }
}

function assertPlan(input: {
  expectedCount: number;
  expectedPlanHash: string;
  plan: OrganizerAccountBootstrapPlan;
}): void {
  const expected = expectedPlan();
  if (
    input.expectedCount !== 20 ||
    input.expectedPlanHash !== expected.hash ||
    JSON.stringify(canonicalize(input.plan)) !== JSON.stringify(canonicalize(expected))
  ) {
    throw new Error("Reviewed organizer account plan mismatch.");
  }
}

export async function buildOrganizerAccountBootstrapPlan(input: {
  dependencies: OrganizerAccountBootstrapDependencies;
  xiaoyuAuthUserId: string;
}): Promise<OrganizerAccountBootstrapPlan> {
  const manifest = validateEventOrganizerManifest();
  if (manifest.state !== "valid") {
    throw new Error(`Organizer account manifest is invalid: ${manifest.errors.join(" ")}`);
  }
  const user = await resolveXiaoyuUser(input.dependencies, input.xiaoyuAuthUserId);
  await assertXiaoyuCanonicalChain(input.dependencies);

  for (const definition of EVENT_ORGANIZER_ACCOUNT_MANIFEST) {
    const existing = await input.dependencies.authUserProvider.getUserByEmail(definition.email);
    if (existing) {
      await organizerChainState(input.dependencies, definition, existing);
    }
  }

  return expectedPlan();
}

export async function applyOrganizerAccountBootstrapPlan(input: {
  expectedCount: number;
  expectedPlanHash: string;
  password: string;
  plan: OrganizerAccountBootstrapPlan;
}, dependencies: OrganizerAccountBootstrapDependencies): Promise<OrganizerAccountBootstrapVerification> {
  if (typeof input.password !== "string" || input.password.length < 8) {
    throw new Error("Organizer bootstrap password must contain at least 8 characters.");
  }
  assertPlan(input);
  const membershipItem = input.plan.items.find(
    (item): item is Extract<OrganizerAccountBootstrapItem, { kind: "xiaoyu-auth-membership" }> => item.kind === "xiaoyu-auth-membership",
  );
  if (!membershipItem) {
    throw new Error("Reviewed organizer account plan has no Xiaoyu membership.");
  }
  const xiaoyuUser = await resolveXiaoyuUser(dependencies, membershipItem.authUserId);
  await assertXiaoyuCanonicalChain(dependencies);

  const newXiaoyuIdentityBindingCount = await ensureXiaoyuMembership(dependencies, xiaoyuUser) ? 1 : 0;
  await dependencies.accountProvisioner.ensureAccountForUser(xiaoyuUser);

  let newAccountCount = 0;
  const organizerUsers = new Map<string, StoredAuthUser>();
  for (const definition of EVENT_ORGANIZER_ACCOUNT_MANIFEST) {
    let user = await dependencies.authUserProvider.getUserByEmail(definition.email);
    if (!user) {
      const registered = await dependencies.authUserService.registerUser({
        email: definition.email,
        displayName: definition.displayName,
        password: input.password,
      });
      if (registered.state !== "success") {
        throw new Error(`Could not register organizer ${definition.email}: ${registered.error.code}.`);
      }
      user = await dependencies.authUserProvider.getUserByEmail(definition.email);
      newAccountCount += 1;
    }
    if (!user) {
      throw new Error(`Organizer registration did not persist ${definition.email}.`);
    }
    await dependencies.accountProvisioner.ensureAccountForUser(user);
    if (await organizerChainState(dependencies, definition, user) !== "complete") {
      throw new Error(`Organizer account/profile chain is incomplete for ${definition.email}.`);
    }
    organizerUsers.set(definition.key, user);
  }

  await assertReviewedContacts(dependencies);
  let newContactLinkCount = 0;
  for (const definition of EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter(
    (item) => item.relationship === "existing_contact",
  )) {
    const user = organizerUsers.get(definition.key);
    if (!user || !definition.contactId) {
      throw new Error(`Reviewed contact organizer is incomplete: ${definition.key}.`);
    }
    const result = await dependencies.contactActorLinkProvider.ensureActive({
      ownerActorId: XIAOYU_ACCOUNT_ID,
      contactId: definition.contactId,
      linkedActorId: user.id,
      linkedAt: XIAOYU_AUTH_MEMBERSHIP_TIMESTAMP,
      evidenceIds: [XIAOYU_AUTH_MEMBERSHIP_EVIDENCE_ID],
    });
    if (result.state === "created") newContactLinkCount += 1;
  }

  await assertXiaoyuCanonicalChain(dependencies);
  await dependencies.accountProvisioner.ensureAccountForUser(xiaoyuUser);
  await assertReviewedContacts(dependencies);
  const activeLinks = await dependencies.contactActorLinkProvider.listActiveForOwner(XIAOYU_ACCOUNT_ID);
  if (activeLinks.length !== 6) {
    throw new Error("Final organizer bootstrap contact-link cardinality check failed.");
  }
  for (const definition of EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter(
    (item) => item.relationship === "existing_contact",
  )) {
    const user = organizerUsers.get(definition.key);
    if (!activeLinks.some((link) => link.contactId === definition.contactId && link.linkedActorId === user?.id)) {
      throw new Error(`Final organizer bootstrap contact-link invariant failed: ${definition.key}.`);
    }
  }

  return {
    accountCount: 13,
    contactLinkCount: 6,
    hash: input.plan.hash,
    newAccountCount,
    newContactLinkCount,
    newXiaoyuIdentityBindingCount,
    xiaoyuIdentityBindingCount: 1,
  };
}
