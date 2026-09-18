import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { profileSignalReviewQueueServiceFactory, profileServiceFactory } from "../../features/profile/service-factory";
import type { ManualProfile, ProfilePayload } from "../../features/profile/contract";
import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { OrbitRealProfile } from "../../app/(app)/app/profile/orbit-real-profile";
import {
  profileEditorReadbackMatches,
  profileEditorUpdateInput,
  type OrbitProfileEditorView,
} from "../../app/(app)/app/profile/profile-editor-adapter";

function editorProfile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return {
    bio: "A short introduction",
    birthDate: "1990-01-02",
    company: "Orbit",
    email: "owner@example.invalid",
    expectedUpdatedAt: "2026-09-17T00:00:00.000Z",
    fullName: "Owner",
    handles: {
      email: "owner@example.invalid",
      linkedinUrl: "https://linkedin.example/owner",
      phone: "+1 555 0100",
      wechatId: "owner-wechat",
    },
    headline: "Existing headline",
    hasPersistedProfile: true,
    industry: "Existing industry text",
    intro: "Existing relationship goal",
    lineId: "owner-line",
    offering: ["Product strategy"],
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    seeking: ["Design partners"],
    title: "Founder",
    topics: ["Product"],
    wechatName: "owner-wechat",
    onboarding: {
      policyVersion: 1,
      status: "complete",
      missingFields: [],
    },
    ...overrides,
  };
}

function profilePayload(overrides: Partial<ManualProfile> = {}): ProfilePayload {
  const profile: ManualProfile = {
    birthDate: "1990-01-02",
    displayName: "Owner",
    headline: "Existing headline",
    homeMarket: "Tokyo",
    id: "profile:owner",
    industry: "Existing industry text",
    offering: ["Product strategy"],
    organization: "Orbit",
    preferredFollowUpWindow: "48 hours",
    preferredIntroChannels: [],
    preferredLanguage: "en",
    relationshipGoal: "Existing relationship goal",
    role: "Founder",
    seeking: ["Design partners"],
    targetRelationshipTypes: ["founders"],
    topics: ["Product"],
    updatedAt: "2026-09-17T00:00:00.000Z",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    handles: {
      email: "owner@example.invalid",
      linkedinUrl: "https://linkedin.example/owner",
      phone: "+1 555 0100",
      wechatId: "owner-wechat",
      lineId: "owner-line",
    },
    ...overrides,
  };

  return {
    completeness: {
      completedFields: [],
      missingFields: [],
      nextBestField: null,
      score: 100,
      status: "ready",
    },
    editor: {
      canSave: true,
      dirtyFields: [],
      lastSavedAt: profile.updatedAt,
      validationMessages: [],
    },
    nextAction: "",
    onboarding: {
      missingFields: [],
      policyVersion: 1,
      status: "complete",
    },
    profile,
    provenance: {
      collectedAt: profile.updatedAt,
      evidenceIds: ["evidence:profile:owner"],
      privacy: "actor-scoped-profile",
      source: "test",
      sourceLabel: "Test profile",
    },
    state: "success",
  };
}

test("basic and matching saves stay narrow while retaining hidden handles", () => {
  const profile = editorProfile({
    bio: "New intro",
    company: "New company",
    fullName: "New owner",
    title: "New role",
    wechatName: "",
  });
  const basic = profileEditorUpdateInput({
    dirtyFields: new Set(["bio", "displayName", "handles"]),
    expectedUpdatedAt: profile.expectedUpdatedAt,
    mutationId: "first-edit",
    profile,
    scope: "basic",
  });

  assert.deepEqual(basic, {
    bio: "New intro",
    displayName: "New owner",
    expectedUpdatedAt: "2026-09-17T00:00:00.000Z",
    handles: {
      email: "owner@example.invalid",
      linkedinUrl: "https://linkedin.example/owner",
      lineId: "owner-line",
      phone: "+1 555 0100",
    },
    mutationId: "first-edit",
  });
  assert.equal("headline" in basic, false);
  assert.equal("relationshipGoal" in basic, false);
  assert.equal("homeMarket" in basic, false);
  assert.equal("offering" in basic, false);

  const matching = profileEditorUpdateInput({
    dirtyFields: new Set(["offering"]),
    expectedUpdatedAt: profile.expectedUpdatedAt,
    mutationId: "matching-edit",
    profile,
    scope: "matching",
  });
  assert.deepEqual(matching, {
    expectedUpdatedAt: "2026-09-17T00:00:00.000Z",
    mutationId: "matching-edit",
    offering: ["Product strategy"],
  });
});

test("readback compares submitted fields, detects retained cleared handles, and ignores GET receipts", () => {
  const expected = {
    bio: "New intro",
    expectedUpdatedAt: "2026-09-17T00:00:00.000Z",
    handles: {
      email: "owner@example.invalid",
      linkedinUrl: "https://linkedin.example/owner",
      phone: "+1 555 0100",
    },
    mutationId: "same-edit",
  };
  const payload = profilePayload({
    bio: "New intro",
    handles: expected.handles,
  });

  assert.equal(profileEditorReadbackMatches(expected, payload), true);
  assert.equal(
    profileEditorReadbackMatches(expected, profilePayload({
      bio: "New intro",
      handles: { ...expected.handles, wechatId: "retained-old-value" },
    })),
    false,
  );
  assert.equal(
    profileEditorReadbackMatches(
      { expectedUpdatedAt: null, mutationId: "matching", offering: ["New offer"] },
      profilePayload({ offering: ["New offer"] }),
    ),
    true,
  );
});

test("optional suggestion failure leaves the manual profile route usable", async (t) => {
  const signalResolution = profileSignalReviewQueueServiceFactory.create("mock");
  assert.equal(signalResolution.success, true);
  if (!signalResolution.success) return;

  t.mock.method(profileSignalReviewQueueServiceFactory, "create", () => ({
    ...signalResolution,
    service: {
      ...signalResolution.service,
      listUpdateSuggestions() {
        throw new Error("optional suggestions unavailable");
      },
    },
  }));

  const route = await loadAppProfileRouteViewModel({
    displayName: "Manual owner",
    id: "account:manual-owner",
  });
  assert.equal(route.state, "success");
  if (route.state !== "success") return;
  assert.equal(route.profile.suggestionCount, 0);
  assert.match(route.profile.reviewSummary, /manual profile editing can continue/);
  assert.equal(route.profile.onboarding.policyVersion, 1);
});

test("profile editor disables edits while the authoritative GET and PUT are pending", async (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  const previousFetch = globalThis.fetch;
  const initialPayload = profilePayload();
  let releaseInitialGet!: (response: Response) => void;
  let releasePut!: (response: Response) => void;
  let initialGetPending = true;
  let putPending = false;
  let latestPayload = initialPayload;
  let pendingMutationId = "";

  t.after(() => {
    act(() => root?.unmount());
    globalThis.fetch = previousFetch;
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === "PUT") {
      putPending = true;
      const body = JSON.parse(String(init.body)) as { mutationId: string; displayName: string };
      pendingMutationId = body.mutationId;
      latestPayload = profilePayload({ displayName: body.displayName });
      return new Promise<Response>((resolve) => {
        releasePut = (response) => resolve(response);
      });
    }
    if (initialGetPending) {
      return new Promise<Response>((resolve) => {
        releaseInitialGet = (response) => resolve(response);
      });
    }
    return Response.json({ success: true, data: latestPayload });
  }) as typeof fetch;

  const model = {
    industries: [],
    offeringTags: [],
    seekingTags: [],
    topics: [],
    profile: {
      bio: "",
      company: "",
      email: "owner@example.invalid",
      fullName: "Owner",
      headline: "",
      industry: "",
      intro: "",
      lineId: "",
      offering: [],
      seeking: [],
      title: "",
      topics: [],
      wechatName: "",
    },
  };
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<OrbitRealProfile viewModel={model} />);
  });
  assert.equal(root.root.findAllByType("input")[0].props.disabled, true);
  assert.equal(root.root.findAllByType("form")[0].props.onSubmit !== undefined, true);

  await act(async () => {
    initialGetPending = false;
    releaseInitialGet(Response.json({ success: true, data: initialPayload }));
    await Promise.resolve();
  });
  const nameInput = root.root.findAllByType("input")[0];
  assert.equal(nameInput.props.disabled, false);
  await act(async () => {
    nameInput.props.onChange({ target: { value: "Draft owner" } });
  });
  let savePromise!: Promise<void>;
  await act(async () => {
    savePromise = root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.equal(putPending, true);
  assert.equal(root.root.findAllByType("input")[0].props.disabled, true);

  await act(async () => {
    const receipt = profilePayload({ displayName: "Draft owner" });
    releasePut(Response.json({ success: true, data: { ...receipt, mutationId: pendingMutationId } }));
    await savePromise;
  });
});
