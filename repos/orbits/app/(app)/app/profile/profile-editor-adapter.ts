import type {
  ContactHandlesContract,
  ProfileOnboardingContract,
} from "../../../../shared/contract/profile";
import type {
  ManualProfileUpdateInput,
  ProfilePayload,
} from "../../../../features/profile/contract";
import type {
  OrbitProfileView,
  OrbitProfileViewModel,
} from "../orbit-profile-route-view-model";
import {
  profileRouteToOrbitProfileViewModel,
} from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import type { AppProfileRouteViewModel } from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";

export type ProfileEditorField =
  | "bio"
  | "birthDate"
  | "displayName"
  | "handles"
  | "offering"
  | "organization"
  | "primaryIndustryId"
  | "role"
  | "secondaryIndustryId"
  | "seeking"
  | "topics";

export type ProfileEditorSaveScope = "basic" | "matching";
export type ProfileEditorVisibleHandleKey = "lineId" | "wechatId";

export interface OrbitProfileEditorView extends OrbitProfileView {
  birthDate: string | null;
  expectedUpdatedAt: string | null;
  handles?: ContactHandlesContract;
  hasPersistedProfile: boolean;
  onboarding: ProfileOnboardingContract;
}

export interface OrbitProfileEditorViewModel
  extends Omit<OrbitProfileViewModel, "profile"> {
  profile: OrbitProfileEditorView;
}

function cloneHandles(
  handles: ContactHandlesContract | undefined,
): ContactHandlesContract | undefined {
  return handles ? { ...handles } : undefined;
}

export function profileRouteToOrbitProfileEditorViewModel(
  routeModel: Extract<AppProfileRouteViewModel, { state: "success" }>,
): OrbitProfileEditorViewModel {
  const base = profileRouteToOrbitProfileViewModel(routeModel);
  const source = routeModel.profile.profile;

  return {
    ...base,
    profile: {
      ...base.profile,
      birthDate: source.birthDate ?? null,
      company: source.organization ?? "",
      expectedUpdatedAt: routeModel.profile.expectedUpdatedAt,
      handles: cloneHandles(source.handles),
      hasPersistedProfile: routeModel.profile.hasPersistedProfile,
      title: source.role ?? "",
      onboarding: routeModel.profile.onboarding,
    },
  };
}

function normalizedHandleValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function handlesForSave(profile: OrbitProfileEditorView): ContactHandlesContract {
  const handles: ContactHandlesContract = {
    ...(profile.handles ?? {}),
  };

  const visibleHandles: readonly (readonly [keyof ContactHandlesContract, string])[] = [
    ["email", profile.email],
    ["lineId", profile.lineId],
    ["wechatId", profile.wechatName],
  ];

  for (const [key, value] of visibleHandles) {
    const normalized = normalizedHandleValue(value);
    if (normalized) {
      handles[key] = normalized;
    } else {
      delete handles[key];
    }
  }

  return handles;
}

export function profileEditorHandlesWithVisibleDraft(
  serverProfile: OrbitProfileEditorView,
  draftProfile: OrbitProfileEditorView,
  dirtyVisibleHandles?: ReadonlySet<ProfileEditorVisibleHandleKey>,
): ContactHandlesContract | undefined {
  const handles: ContactHandlesContract = {
    ...(serverProfile.handles ?? {}),
  };
  const visibleHandles: readonly (readonly [keyof ContactHandlesContract, string])[] = [
    ["lineId", draftProfile.lineId],
    ["wechatId", draftProfile.wechatName],
  ];

  for (const [key, value] of visibleHandles) {
    if (dirtyVisibleHandles && !dirtyVisibleHandles.has(key as ProfileEditorVisibleHandleKey)) {
      continue;
    }
    const normalized = normalizedHandleValue(value);
    if (normalized) {
      handles[key] = normalized;
    } else {
      delete handles[key];
    }
  }

  return Object.keys(handles).length ? handles : undefined;
}

export function profileEditorUpdateInput(input: {
  expectedUpdatedAt: string | null;
  mutationId: string;
  profile: OrbitProfileEditorView;
  dirtyFields: ReadonlySet<ProfileEditorField>;
  scope: ProfileEditorSaveScope;
}): ManualProfileUpdateInput {
  const { dirtyFields, expectedUpdatedAt, mutationId, profile, scope } = input;
  const update: ManualProfileUpdateInput = {
    expectedUpdatedAt,
    mutationId,
  };

  if (scope === "basic") {
    if (dirtyFields.has("displayName")) update.displayName = profile.fullName;
    if (dirtyFields.has("organization")) update.organization = profile.company;
    if (dirtyFields.has("role")) update.role = profile.title;
    if (dirtyFields.has("birthDate")) update.birthDate = profile.birthDate || null;
    if (dirtyFields.has("bio")) update.bio = profile.bio;
    if (
      dirtyFields.has("primaryIndustryId") &&
      profile.primaryIndustryId !== undefined
    ) {
      update.primaryIndustryId = profile.primaryIndustryId;
    }
    if (
      dirtyFields.has("secondaryIndustryId") &&
      profile.secondaryIndustryId !== undefined
    ) {
      update.secondaryIndustryId = profile.secondaryIndustryId;
    }
    if (dirtyFields.has("handles")) update.handles = handlesForSave(profile);
  }

  if (scope === "matching") {
    if (dirtyFields.has("offering")) update.offering = [...profile.offering];
    if (dirtyFields.has("seeking")) update.seeking = [...profile.seeking];
    if (dirtyFields.has("topics")) update.topics = [...profile.topics];
  }

  return update;
}

function own<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function sameList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return JSON.stringify((left ?? []).map((item) => item.trim())) ===
    JSON.stringify((right ?? []).map((item) => item.trim()));
}

function sameHandles(
  expected: ContactHandlesContract,
  saved: ContactHandlesContract | undefined,
): boolean {
  const keys = new Set([
    ...Object.keys(expected),
    ...Object.keys(saved ?? {}),
  ]);

  return [...keys].every((key) =>
    normalizedText(saved?.[key as keyof ContactHandlesContract]) ===
      normalizedText(expected[key as keyof ContactHandlesContract]),
  );
}

export function profileEditorReadbackMatches(
  expected: ManualProfileUpdateInput,
  payload: ProfilePayload,
): boolean {
  const saved = payload.profile;
  if (!saved) return false;

  if (own(expected, "displayName") && saved.displayName !== normalizedText(expected.displayName)) {
    return false;
  }
  if (own(expected, "birthDate") && (saved.birthDate ?? null) !== (expected.birthDate ?? null)) {
    return false;
  }
  if (own(expected, "headline") && saved.headline !== normalizedText(expected.headline)) {
    return false;
  }
  if (own(expected, "organization") && saved.organization !== normalizedText(expected.organization)) {
    return false;
  }
  if (own(expected, "role") && saved.role !== normalizedText(expected.role)) {
    return false;
  }
  if (own(expected, "homeMarket") && saved.homeMarket !== normalizedText(expected.homeMarket)) {
    return false;
  }
  if (own(expected, "relationshipGoal") && saved.relationshipGoal !== normalizedText(expected.relationshipGoal)) {
    return false;
  }
  if (own(expected, "preferredFollowUpWindow") && saved.preferredFollowUpWindow !== normalizedText(expected.preferredFollowUpWindow)) {
    return false;
  }
  if (own(expected, "industry") && normalizedText(saved.industry) !== normalizedText(expected.industry)) {
    return false;
  }
  if (own(expected, "primaryIndustryId") && (saved.primaryIndustryId ?? null) !== (expected.primaryIndustryId ?? null)) {
    return false;
  }
  if (own(expected, "secondaryIndustryId") && (saved.secondaryIndustryId ?? null) !== (expected.secondaryIndustryId ?? null)) {
    return false;
  }
  if (own(expected, "bio") && normalizedText(saved.bio) !== normalizedText(expected.bio)) {
    return false;
  }
  if (own(expected, "seniorityLevel") && saved.seniorityLevel !== expected.seniorityLevel) {
    return false;
  }
  if (own(expected, "handles") && !sameHandles(expected.handles ?? {}, saved.handles)) {
    return false;
  }
  if (
    own(expected, "targetRelationshipTypes") &&
    !sameList(saved.targetRelationshipTypes, expected.targetRelationshipTypes)
  ) {
    return false;
  }
  if (
    own(expected, "preferredIntroChannels") &&
    !sameList(saved.preferredIntroChannels, expected.preferredIntroChannels)
  ) {
    return false;
  }
  if (own(expected, "offering") && !sameList(saved.offering, expected.offering)) {
    return false;
  }
  if (own(expected, "seeking") && !sameList(saved.seeking, expected.seeking)) {
    return false;
  }
  if (own(expected, "topics") && !sameList(saved.topics, expected.topics)) {
    return false;
  }

  return true;
}

export function profileEditorViewFromPayload(
  previous: OrbitProfileEditorView,
  payload: ProfilePayload,
): OrbitProfileEditorView {
  const source = payload.profile;
  if (!source) return previous;
  return {
    ...previous,
    birthDate: source.birthDate ?? null,
    bio: source.bio ?? "",
    company: source.organization ?? "",
    email: source.handles?.email ?? "",
    expectedUpdatedAt: source.updatedAt,
    fullName: source.displayName,
    handles: cloneHandles(source.handles),
    hasPersistedProfile: true,
    headline: source.headline,
    industry: source.industry ?? source.homeMarket,
    intro: source.relationshipGoal ?? "",
    lineId: source.handles?.lineId ?? "",
    offering: [...(source.offering ?? [])],
    primaryIndustryId: source.primaryIndustryId,
    secondaryIndustryId: source.secondaryIndustryId,
    seeking: [...(source.seeking ?? [])],
    title: source.role ?? "",
    topics: [...(source.topics ?? [])],
    wechatName: source.handles?.wechatId ?? "",
    ...(payload.onboarding ? { onboarding: payload.onboarding } : {}),
  };
}
