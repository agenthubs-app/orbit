import type {
  ContactHandlesContract,
  ManualProfileContract,
  ProfileSaveConcurrencyContract,
} from "../api/contract/profile";

export interface ProfileEditSessionScope {
  actorId: string;
  apiOrigin: string;
}

export type ProfileEditStatus = "editing" | "saving" | "conflict" | "failure";
export type ProfileSuggestionDecision = "accepted" | "dismissed";

export interface ProfileEditDraft {
  bio: string;
  birthDate?: string | null;
  displayName: string;
  handles: ContactHandlesContract;
  headline: string;
  homeMarket: string;
  industry?: string;
  offering: string[];
  organization: string;
  preferredFollowUpWindow: string;
  preferredIntroChannels: string[];
  preferredLanguage: ManualProfileContract["preferredLanguage"];
  primaryIndustryId?: ManualProfileContract["primaryIndustryId"];
  relationshipGoal: string;
  role: string;
  secondaryIndustryId?: ManualProfileContract["secondaryIndustryId"];
  seeking: string[];
  seniorityLevel?: ManualProfileContract["seniorityLevel"];
  spokenLanguages: string[];
  targetRelationshipTypes: string[];
  topics: string[];
}

export type ProfileEditSaveBody = Omit<ProfileEditDraft, "bio"> &
  Partial<Pick<ProfileEditDraft, "bio">> &
  ProfileSaveConcurrencyContract;

export interface ProfileEditSaveAttempt {
  body: ProfileEditSaveBody & { mutationId: string };
  intentFingerprint: string;
}

export interface ProfileEditSession {
  bioUsesHeadlineFallback: boolean;
  dirtyFields: string[];
  draft: ProfileEditDraft;
  errorMessage: string | null;
  expectedUpdatedAt: string;
  pendingSave: ProfileEditSaveAttempt | null;
  profileId: string;
  status: ProfileEditStatus;
  suggestionDecisions: Readonly<Record<string, ProfileSuggestionDecision>>;
}

interface StoredProfileEditSession extends Omit<ProfileEditSession, "dirtyFields"> {
  dirtyFields: Set<string>;
}

const sessions = new Map<string, StoredProfileEditSession>();
const suggestionMutations = new Map<string, string>();

function cleanScope(scope: ProfileEditSessionScope): { actorId: string; apiOrigin: string } {
  const actorId = scope.actorId.trim();
  const apiOrigin = scope.apiOrigin.trim().replace(/\/+$/u, "");
  if (!actorId || !apiOrigin) {
    throw new Error("A canonical actor id and API origin are required for profile editing.");
  }
  return { actorId, apiOrigin };
}

function scopeKey(scope: ProfileEditSessionScope): string {
  const clean = cleanScope(scope);
  return JSON.stringify([clean.apiOrigin, clean.actorId]);
}

function suggestionMutationKey(scope: ProfileEditSessionScope, suggestionId: string, decision: ProfileSuggestionDecision): string {
  return JSON.stringify([scopeKey(scope), suggestionId, decision]);
}

function clearSuggestionMutations(scope: ProfileEditSessionScope): void {
  const prefix = `[${JSON.stringify(scopeKey(scope))},`;
  for (const key of suggestionMutations.keys()) {
    if (key.startsWith(prefix)) suggestionMutations.delete(key);
  }
}

function copyList(value: readonly string[] | undefined): string[] {
  return value ? [...value] : [];
}

export function normalizeProfileTagValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const clean = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }
  return normalized;
}

export function profileVisibleCharacterCount(value: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => {
      segment(input: string): Iterable<unknown>;
    };
  }).Segmenter;
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length
    : Array.from(value).length;
}

export function validateProfileEditDraft(
  draft: ProfileEditDraft,
): Array<"bio" | "displayName" | "offering" | "seeking"> {
  const invalid: Array<"bio" | "displayName" | "offering" | "seeking"> = [];
  if (!draft.displayName.trim()) invalid.push("displayName");
  if (profileVisibleCharacterCount(draft.bio) > 80) invalid.push("bio");
  if (normalizeProfileTagValues(draft.offering).length > 5) invalid.push("offering");
  if (normalizeProfileTagValues(draft.seeking).length > 5) invalid.push("seeking");
  return invalid;
}

function profileToDraft(profile: ManualProfileContract): {
  bioUsesHeadlineFallback: boolean;
  draft: ProfileEditDraft;
} {
  const hasBio = profile.bio !== undefined && profile.bio.length > 0;
  return {
    bioUsesHeadlineFallback: !hasBio && profile.headline.length > 0,
    draft: {
      bio: hasBio ? profile.bio ?? "" : profile.headline,
      ...(profile.birthDate === undefined ? {} : { birthDate: profile.birthDate }),
      displayName: profile.displayName,
      handles: { ...profile.handles },
      headline: profile.headline,
      homeMarket: profile.homeMarket,
      ...(profile.industry === undefined ? {} : { industry: profile.industry }),
      offering: copyList(profile.offering),
      organization: profile.organization,
      preferredFollowUpWindow: profile.preferredFollowUpWindow,
      preferredIntroChannels: copyList(profile.preferredIntroChannels),
      preferredLanguage: profile.preferredLanguage,
      ...(profile.primaryIndustryId === undefined
        ? {}
        : { primaryIndustryId: profile.primaryIndustryId }),
      relationshipGoal: profile.relationshipGoal,
      role: profile.role,
      ...(profile.secondaryIndustryId === undefined
        ? {}
        : { secondaryIndustryId: profile.secondaryIndustryId }),
      seeking: copyList(profile.seeking),
      ...(profile.seniorityLevel === undefined
        ? {}
        : { seniorityLevel: profile.seniorityLevel }),
      spokenLanguages: copyList(profile.spokenLanguages),
      targetRelationshipTypes: copyList(profile.targetRelationshipTypes),
      topics: copyList(profile.topics),
    },
  };
}

function cloneDraft(draft: ProfileEditDraft): ProfileEditDraft {
  return {
    ...draft,
    handles: { ...draft.handles },
    offering: [...draft.offering],
    preferredIntroChannels: [...draft.preferredIntroChannels],
    seeking: [...draft.seeking],
    spokenLanguages: [...draft.spokenLanguages],
    targetRelationshipTypes: [...draft.targetRelationshipTypes],
    topics: [...draft.topics],
  };
}

function snapshot(session: StoredProfileEditSession): ProfileEditSession {
  return {
    ...session,
    dirtyFields: [...session.dirtyFields],
    draft: cloneDraft(session.draft),
    pendingSave: session.pendingSave
      ? { ...session.pendingSave, body: { ...session.pendingSave.body } }
      : null,
    suggestionDecisions: { ...session.suggestionDecisions },
  };
}

function saveFields(session: StoredProfileEditSession): Omit<ProfileEditSaveBody, keyof ProfileSaveConcurrencyContract> & Partial<Pick<ProfileEditDraft, "bio">> {
  const draft = cloneDraft(session.draft);
  draft.offering = normalizeProfileTagValues(draft.offering);
  draft.seeking = normalizeProfileTagValues(draft.seeking);
  draft.topics = normalizeProfileTagValues(draft.topics);
  draft.spokenLanguages = normalizeProfileTagValues(draft.spokenLanguages);
  const { bio, ...fields } = draft;
  return session.bioUsesHeadlineFallback && !session.dirtyFields.has("bio")
    ? fields
    : { ...fields, bio };
}

function intentFingerprint(session: StoredProfileEditSession): string {
  return JSON.stringify({
    expectedUpdatedAt: session.expectedUpdatedAt,
    fields: saveFields(session),
  });
}

export function openProfileEditSession(
  scope: ProfileEditSessionScope,
  profile: ManualProfileContract,
): ProfileEditSession {
  const key = scopeKey(scope);
  const existing = sessions.get(key);
  if (existing?.profileId === profile.id) {
    return snapshot(existing);
  }

  const initial = profileToDraft(profile);
  const session: StoredProfileEditSession = {
    ...initial,
    dirtyFields: new Set(),
    errorMessage: null,
    expectedUpdatedAt: profile.updatedAt,
    pendingSave: null,
    profileId: profile.id,
    status: "editing",
    suggestionDecisions: {},
  };
  sessions.set(key, session);
  return snapshot(session);
}

export function getProfileEditSession(scope: ProfileEditSessionScope): ProfileEditSession | null {
  const session = sessions.get(scopeKey(scope));
  return session ? snapshot(session) : null;
}

export function updateProfileEditDraft(
  scope: ProfileEditSessionScope,
  patch: Partial<ProfileEditDraft>,
): ProfileEditSession | null {
  const session = sessions.get(scopeKey(scope));
  if (!session) return null;

  for (const field of Object.keys(patch) as (keyof ProfileEditDraft)[]) {
    const value = patch[field];
    if (value === undefined) continue;
    session.dirtyFields.add(field);
    if (field === "handles") {
      session.draft.handles = { ...(value as ContactHandlesContract) };
    } else if (Array.isArray(value)) {
      (session.draft[field] as string[]) = [...value];
    } else {
      (session.draft as unknown as Record<string, unknown>)[field] = value;
    }
  }
  session.status = "editing";
  session.errorMessage = null;
  return snapshot(session);
}

export function applyProfileSuggestionToDraft(
  scope: ProfileEditSessionScope,
  suggestion: {
    field: "bio" | "offering" | "seeking";
    id: string;
    value: string | string[];
  },
): ProfileEditSession | null {
  const value = suggestion.field === "bio"
    ? (typeof suggestion.value === "string" ? suggestion.value : suggestion.value.join(" "))
    : (Array.isArray(suggestion.value) ? suggestion.value : [suggestion.value]);
  const updated = updateProfileEditDraft(scope, { [suggestion.field]: value });
  if (!updated) return null;
  const session = sessions.get(scopeKey(scope));
  if (!session) return null;
  session.suggestionDecisions = {
    ...session.suggestionDecisions,
    [suggestion.id]: "accepted",
  };
  return snapshot(session);
}

export function profileSuggestionDecisionMutationId(
  scope: ProfileEditSessionScope,
  suggestionId: string,
  decision: ProfileSuggestionDecision,
  createMutationId: () => string,
): string {
  const key = suggestionMutationKey(scope, suggestionId, decision);
  const existing = suggestionMutations.get(key);
  if (existing) return existing;
  const generated = createMutationId().trim();
  if (!generated) throw new Error("Profile suggestion mutation id cannot be empty.");
  const mutationId = `ios:profile-suggestion:${generated}`;
  suggestionMutations.set(key, mutationId);
  return mutationId;
}

export function recordProfileSuggestionDecision(
  scope: ProfileEditSessionScope,
  suggestionId: string,
  decision: ProfileSuggestionDecision,
  mutationId: string,
): boolean {
  const session = sessions.get(scopeKey(scope));
  const key = suggestionMutationKey(scope, suggestionId, decision);
  if (!session || suggestionMutations.get(key) !== mutationId) return false;
  suggestionMutations.delete(key);
  session.suggestionDecisions = { ...session.suggestionDecisions, [suggestionId]: decision };
  return true;
}

export function prepareProfileEditSave(
  scope: ProfileEditSessionScope,
  createMutationId: () => string,
): ProfileEditSaveAttempt | null {
  const session = sessions.get(scopeKey(scope));
  if (!session) return null;
  const fingerprint = intentFingerprint(session);
  if (session.pendingSave?.intentFingerprint === fingerprint) {
    session.status = "saving";
    session.errorMessage = null;
    return { ...session.pendingSave, body: { ...session.pendingSave.body } };
  }

  const generatedId = createMutationId().trim();
  if (!generatedId) throw new Error("Profile save mutation id cannot be empty.");
  const pendingSave: ProfileEditSaveAttempt = {
    body: {
      ...saveFields(session),
      expectedUpdatedAt: session.expectedUpdatedAt,
      mutationId: `ios:profile:${generatedId}`,
    },
    intentFingerprint: fingerprint,
  };
  session.pendingSave = pendingSave;
  session.status = "saving";
  session.errorMessage = null;
  return { ...pendingSave, body: { ...pendingSave.body } };
}

export function recordProfileEditSaveFailure(
  scope: ProfileEditSessionScope,
  mutationId: string,
  statusCode: number,
  message: string,
): boolean {
  const session = sessions.get(scopeKey(scope));
  if (!session || session.pendingSave?.body.mutationId !== mutationId) return false;
  session.status = statusCode === 409 ? "conflict" : "failure";
  session.errorMessage = message;
  return true;
}

export function completeProfileEditSave(
  scope: ProfileEditSessionScope,
  mutationId: string,
): boolean {
  const key = scopeKey(scope);
  const session = sessions.get(key);
  if (!session || session.pendingSave?.body.mutationId !== mutationId) return false;
  clearSuggestionMutations(scope);
  sessions.delete(key);
  return true;
}

export function clearProfileEditSession(scope: ProfileEditSessionScope): void {
  clearSuggestionMutations(scope);
  sessions.delete(scopeKey(scope));
}

export function resetProfileEditSessionsForTests(): void {
  sessions.clear();
  suggestionMutations.clear();
}
