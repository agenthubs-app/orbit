import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { ManualProfile, ProfilePayload } from "../../features/profile/contract";
import { OrbitRealProfile } from "../../app/(app)/app/profile/orbit-real-profile";
import type {
  OrbitProfileEditorView,
  OrbitProfileEditorViewModel,
} from "../../app/(app)/app/profile/profile-editor-adapter";

const OLD_UPDATED_AT = "2026-09-17T00:00:00.000Z";
const NEW_UPDATED_AT = "2026-09-17T00:01:00.000Z";
const SAVED_UPDATED_AT = "2026-09-17T00:02:00.000Z";

const completeOnboarding = {
  policyVersion: 1 as const,
  status: "complete" as const,
  missingFields: [],
};

const incompleteOnboarding = {
  policyVersion: 1 as const,
  status: "incomplete" as const,
  missingFields: ["birthDate"] as const,
};

function baseProfile(overrides: Partial<ManualProfile> = {}): ManualProfile {
  return {
    birthDate: "1990-01-02",
    displayName: "Server owner",
    headline: "Existing headline",
    homeMarket: "Tokyo",
    id: "profile:owner",
    industry: "Existing industry",
    offering: ["Server offer"],
    organization: "Orbit",
    preferredFollowUpWindow: "48 hours",
    preferredIntroChannels: [],
    preferredLanguage: "en",
    relationshipGoal: "Existing relationship goal",
    role: "Founder",
    seeking: ["Server seeking"],
    targetRelationshipTypes: ["founders"],
    topics: ["Product"],
    updatedAt: OLD_UPDATED_AT,
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    handles: {
      email: "owner@example.invalid",
      lineId: "server-line",
      phone: "+1 555 0100",
      wechatId: "server-wechat",
      website: "https://old.example.invalid",
    },
    ...overrides,
  };
}

function profilePayload(
  overrides: {
    mutationId?: string;
    onboarding?: ProfilePayload["onboarding"];
    profile?: ManualProfile | null;
  } = {},
): ProfilePayload {
  const profile = overrides.profile === undefined ? baseProfile() : overrides.profile;
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
      lastSavedAt: profile?.updatedAt ?? null,
      validationMessages: [],
    },
    mutationId: overrides.mutationId,
    nextAction: "",
    onboarding: overrides.onboarding ?? completeOnboarding,
    profile,
    provenance: {
      collectedAt: profile?.updatedAt ?? OLD_UPDATED_AT,
      evidenceIds: ["evidence:profile:owner"],
      privacy: "actor-scoped-profile",
      source: "test",
      sourceLabel: "Test profile",
    },
    state: profile ? "success" : "empty",
  };
}

function editorModel(
  overrides: Partial<OrbitProfileEditorView> = {},
): OrbitProfileEditorViewModel {
  return {
    industries: [],
    offeringTags: ["Server offer", "Matching draft"],
    seekingTags: ["Server seeking", "Seeking draft"],
    topics: ["Product", "Topic draft"],
    profile: {
      bio: "Existing intro",
      birthDate: "1990-01-02",
      company: "Orbit",
      email: "owner@example.invalid",
      expectedUpdatedAt: OLD_UPDATED_AT,
      fullName: "Server owner",
      handles: baseProfile().handles,
      headline: "Existing headline",
      hasPersistedProfile: true,
      industry: "Existing industry",
      intro: "Existing relationship goal",
      lineId: "server-line",
      offering: ["Server offer"],
      primaryIndustryId: "technology_internet",
      secondaryIndustryId: "technology_internet.enterprise_software",
      seeking: ["Server seeking"],
      title: "Founder",
      topics: ["Product"],
      wechatName: "server-wechat",
      onboarding: completeOnboarding,
      ...overrides,
    },
  };
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installBrowserGlobals(options: { location?: { assign(path: string): void } } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      location: options.location ?? { assign() {} },
      removeEventListener() {},
    },
  });
  return () => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  };
}

function installFetch(
  t: { after(callback: () => void): void },
  implementation: typeof fetch,
) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
}

async function renderEditor(
  t: { after(callback: () => void): void },
  viewModel: OrbitProfileEditorViewModel = editorModel(),
  browserOptions: { location?: { assign(path: string): void } } = {},
  onboardingNext?: string,
): Promise<ReactTestRenderer> {
  const restoreWindow = installBrowserGlobals(browserOptions);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<OrbitRealProfile onboardingNext={onboardingNext} viewModel={viewModel} />);
    await settle();
  });
  t.after(() => {
    act(() => root.unmount());
    restoreWindow();
  });
  return root;
}

function inputWithValue(root: ReactTestRenderer, value: string) {
  const input = root.root.findAllByType("input").find((candidate) => candidate.props.value === value);
  assert.ok(input, `expected an input with value ${value}`);
  return input;
}

function buttonWithText(root: ReactTestRenderer, ...texts: string[]) {
  const button = root.root.findAllByType("button").find((candidate) => texts.some((text) => candidate.children.includes(text)));
  assert.ok(button, `expected a button with text ${texts.join(" or ")}`);
  return button;
}

function mutationIdFrom(body: Record<string, unknown>): string {
  if (typeof body.mutationId !== "string") throw new Error("profile PUT body is missing mutationId");
  return body.mutationId;
}

async function submit(root: ReactTestRenderer) {
  await act(async () => {
    await root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
  });
}

test("a 409 keeps the draft; reload merges latest hidden handles before explicit retry", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  const latestHandles = {
    email: "owner@example.invalid",
    lineId: "latest-server-line",
    phone: "+1 555 0199",
    website: "https://latest.example.invalid",
    wechatId: "latest-server-wechat",
  };
  const latestProfile = baseProfile({
    displayName: "Concurrent owner",
    handles: latestHandles,
    updatedAt: NEW_UPDATED_AT,
  });
  const savedProfile = baseProfile({
    displayName: "Concurrent owner",
    handles: {
      ...latestHandles,
      wechatId: "local-wechat",
    },
    updatedAt: SAVED_UPDATED_AT,
  });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      if (puts.length === 1) {
        return Response.json(
          { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "Conflict" } },
          { status: 409 },
        );
      }
      return Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(body), profile: savedProfile }) });
    }
    gets += 1;
    if (gets === 1) return Response.json({ success: true, data: profilePayload() });
    if (gets === 2) return Response.json({ success: true, data: profilePayload({ profile: latestProfile }) });
    return Response.json({ success: true, data: profilePayload({ profile: savedProfile }) });
  }) as typeof fetch);

  const root = await renderEditor(t);
  const wechat = inputWithValue(root, "server-wechat");
  await act(async () => {
    wechat.props.onChange({ target: { value: "local-wechat" } });
  });

  await submit(root);
  assert.equal(puts.length, 1);
  assert.equal(inputWithValue(root, "local-wechat").props.value, "local-wechat");
  assert.equal(inputWithValue(root, "server-line").props.value, "server-line");
  assert.ok(root.root.findAllByProps({ role: "alert" }).length);

  const reload = buttonWithText(root, "Reload latest", "刷新最新资料");
  await act(async () => {
    reload.props.onClick();
    await settle();
  });
  assert.equal(inputWithValue(root, "local-wechat").props.value, "local-wechat");
  assert.equal(inputWithValue(root, "latest-server-line").props.value, "latest-server-line");

  await submit(root);
  assert.equal(puts.length, 2);
  assert.equal(puts[1].expectedUpdatedAt, NEW_UPDATED_AT);
  assert.deepEqual(puts[1].handles, {
    email: "owner@example.invalid",
    lineId: "latest-server-line",
    phone: "+1 555 0199",
    website: "https://latest.example.invalid",
    wechatId: "local-wechat",
  });
  assert.ok(root.root.findAllByProps({ role: "status" }).length >= 1);
});

test("same-tick reload clicks share one GET", async (t) => {
  let profileGets = 0;
  const reloadResponses: Array<(response: Response) => void> = [];

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") {
      return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    }
    if (init?.method === "PUT") {
      return Response.json(
        { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "Conflict" } },
        { status: 409 },
      );
    }
    profileGets += 1;
    if (profileGets === 1) return Response.json({ success: true, data: profilePayload() });
    return new Promise<Response>((resolve) => reloadResponses.push(resolve));
  }) as typeof fetch);

  const root = await renderEditor(t);
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Conflict owner" } });
  });
  await submit(root);

  const reload = buttonWithText(root, "Reload latest", "刷新最新资料");
  await act(async () => {
    reload.props.onClick();
    reload.props.onClick();
    await settle();
  });
  const busyReload = buttonWithText(root, "Reloading latest…", "正在刷新最新资料…");
  assert.equal(busyReload.props.disabled, true);
  assert.equal(busyReload.props["aria-busy"], true);
  const basicSaveWhileReloading = buttonWithText(root, "Save basic profile", "保存基础资料");
  assert.equal(basicSaveWhileReloading.props.disabled, true);
  const observedGets = profileGets;
  for (const resolve of reloadResponses) {
    resolve(Response.json({ success: true, data: profilePayload() }));
  }
  await act(async () => {
    await settle();
  });

  assert.equal(observedGets, 2, "initial GET plus one single-flight reload GET");
  const basicSaveAfterReload = buttonWithText(root, "Save basic profile", "保存基础资料");
  assert.equal(basicSaveAfterReload.props.disabled, false);
});

test("a reload pending rejects a stale pre-conflict save callback", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let profileGets = 0;
  const reloadResponses: Array<(response: Response) => void> = [];

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") {
      return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    }
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json(
        { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "Conflict" } },
        { status: 409 },
      );
    }
    profileGets += 1;
    if (profileGets === 1) return Response.json({ success: true, data: profilePayload() });
    return new Promise<Response>((resolve) => reloadResponses.push(resolve));
  }) as typeof fetch);

  const root = await renderEditor(t);
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Conflict owner" } });
  });
  const staleSubmit = root.root.findAllByType("form")[0].props.onSubmit as (event: { preventDefault(): void }) => Promise<void>;
  await act(async () => {
    await staleSubmit({ preventDefault() {} });
  });

  const reload = buttonWithText(root, "Reload latest", "刷新最新资料");
  await act(async () => {
    reload.props.onClick();
    await staleSubmit({ preventDefault() {} });
    await settle();
  });
  for (const resolve of reloadResponses) {
    resolve(Response.json({ success: true, data: profilePayload() }));
  }
  await act(async () => {
    await settle();
  });

  assert.equal(puts.length, 1, "the conflict PUT is the only PUT while reload is pending");
});

test("a failed reload preserves the draft until an explicit retry succeeds", async (t) => {
  let releaseBody!: (value: unknown) => void;
  const bodyGate = new Promise<unknown>((resolve) => { releaseBody = resolve; });
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  const latestProfile = baseProfile({ displayName: "Concurrent owner", updatedAt: NEW_UPDATED_AT });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") {
      return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    }
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json(
        { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "Conflict" } },
        { status: 409 },
      );
    }
    gets += 1;
    if (gets === 1) return Response.json({ success: true, data: profilePayload() });
    if (gets === 2) {
      const response = Response.json({});
      response.json = () => bodyGate;
      return response;
    }
    if (gets === 3) return Response.json({ success: true, data: profilePayload({ profile: latestProfile }) });
    throw new Error(`Unexpected profile GET ${gets}`);
  }) as typeof fetch);

  const root = await renderEditor(t);
  await act(async () => {
    inputWithValue(root, "server-wechat").props.onChange({ target: { value: "local-wechat" } });
  });
  const staleSubmit = root.root.findAllByType("form")[0].props.onSubmit as (event: { preventDefault(): void }) => Promise<void>;
  await submit(root);

  const firstReload = buttonWithText(root, "Reload latest", "刷新最新资料").props.onClick as () => void;
  await act(async () => {
    firstReload();
    await settle();
  });
  await act(async () => {
    firstReload();
    await staleSubmit({ preventDefault() {} });
    await settle();
  });
  assert.equal(gets, 2, "a response waiting for JSON still owns the reload lock");
  assert.equal(puts.length, 1, "a stale submit cannot start while reload JSON is pending");

  await act(async () => {
    releaseBody({ success: false, error: { message: "Read failed" } });
    await settle();
  });
  assert.equal(inputWithValue(root, "local-wechat").props.value, "local-wechat");
  assert.equal(buttonWithText(root, "Save basic profile", "保存基础资料").props.disabled, true);

  const retry = buttonWithText(root, "Reload latest", "刷新最新资料");
  assert.equal(retry.props.disabled, false, "failed reload releases its lock for explicit retry");
  await act(async () => {
    retry.props.onClick();
    await settle();
  });
  assert.equal(gets, 3);
  assert.equal(inputWithValue(root, "Concurrent owner").props.value, "Concurrent owner");
  assert.equal(inputWithValue(root, "local-wechat").props.value, "local-wechat");
  assert.equal(buttonWithText(root, "Save basic profile", "保存基础资料").props.disabled, false);
});

test("a pending save rejects a stale reload callback", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let profileGets = 0;
  let releaseRetry!: (response: Response) => void;
  const savedProfile = baseProfile({ displayName: "Conflict owner", updatedAt: SAVED_UPDATED_AT });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") {
      return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    }
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      if (puts.length === 1) {
        return Response.json(
          { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "Conflict" } },
          { status: 409 },
        );
      }
      return new Promise<Response>((resolve) => {
        releaseRetry = (response) => resolve(response);
      });
    }
    profileGets += 1;
    if (profileGets === 1) return Response.json({ success: true, data: profilePayload() });
    return Response.json({ success: true, data: profilePayload({ profile: savedProfile }) });
  }) as typeof fetch);

  const root = await renderEditor(t);
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Conflict owner" } });
  });
  const staleSubmit = root.root.findAllByType("form")[0].props.onSubmit as (event: { preventDefault(): void }) => Promise<void>;
  await act(async () => {
    await staleSubmit({ preventDefault() {} });
  });
  const reload = buttonWithText(root, "Reload latest", "刷新最新资料");
  const staleReload = reload.props.onClick as () => void;

  let retryPromise!: Promise<void>;
  await act(async () => {
    retryPromise = staleSubmit({ preventDefault() {} });
    staleReload();
    await settle();
  });
  assert.equal(profileGets, 1, "a pending save blocks an old reload callback");

  releaseRetry(Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(puts[1]), profile: savedProfile }) }));
  await act(async () => {
    await retryPromise;
  });
  assert.equal(puts.length, 2);
});

test("a late save response after unmount does not read back or navigate", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let profileGets = 0;
  let releasePut!: (response: Response) => void;
  const assigned: string[] = [];

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") {
      return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    }
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Promise<Response>((resolve) => {
        releasePut = (response) => resolve(response);
      });
    }
    profileGets += 1;
    return Response.json({ success: true, data: profilePayload() });
  }) as typeof fetch);

  const root = await renderEditor(t, editorModel(), {
    location: { assign: (path: string) => assigned.push(path) },
  }, "/app/contacts?from=w1");
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Saved owner" } });
  });
  const savePromise = root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} }) as Promise<void>;
  await act(async () => {
    await settle();
  });
  assert.equal(puts.length, 1);
  assert.equal(profileGets, 1);

  await act(async () => {
    root.unmount();
  });
  releasePut(Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(puts[0]) }) }));
  await act(async () => {
    await savePromise;
    await settle();
  });

  assert.deepEqual(assigned, []);
  assert.equal(profileGets, 1);
  assert.equal(root.toJSON(), null);
});

test("a successful PUT followed by a failed readback retries with the exact same mutation and body", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  const savedProfile = baseProfile({ displayName: "Draft owner", updatedAt: SAVED_UPDATED_AT });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      return Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(body), profile: savedProfile }) });
    }
    gets += 1;
    if (gets === 1) return Response.json({ success: true, data: profilePayload() });
    if (gets === 2) return Response.json({ success: false, error: { message: "Readback unavailable" } }, { status: 503 });
    return Response.json({ success: true, data: profilePayload({ profile: savedProfile }) });
  }) as typeof fetch);

  const root = await renderEditor(t);
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Draft owner" } });
  });

  await submit(root);
  assert.equal(puts.length, 1);
  assert.equal(inputWithValue(root, "Draft owner").props.value, "Draft owner");
  assert.ok(root.root.findAllByProps({ role: "alert" }).length);

  await submit(root);
  assert.equal(puts.length, 2);
  assert.deepEqual(puts[1], puts[0]);
  assert.ok(root.root.findAllByProps({ role: "status" }).length >= 1);
});

for (const [label, data] of [
  ["missing onboarding", (() => {
    const { onboarding: _onboarding, ...withoutOnboarding } = profilePayload();
    return withoutOnboarding;
  })()],
  ["unknown onboarding", {
    ...profilePayload(),
    onboarding: {
      policyVersion: 2,
      status: "complete",
      missingFields: [],
    },
  }],
] as const) {
  test(`${label} GET prevents saving`, async (t) => {
    let putCount = 0;
    installFetch(t, (async (_input, init) => {
      if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
      if (init?.method === "PUT") putCount += 1;
      return Response.json({ success: true, data });
    }) as typeof fetch);

    const root = await renderEditor(t);
    const name = root.root.findAllByType("input").find((candidate) => candidate.props.value === "Server owner");
    assert.ok(name);
    assert.equal(name.props.disabled, true);
    await submit(root);
    assert.equal(putCount, 0);
    assert.ok(root.root.findAllByProps({ role: "alert" }).length);
  });
}

test("saving basic keeps a matching draft, and saving matching keeps a basic draft", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      if (puts.length === 1) {
        return Response.json({
          success: true,
          data: profilePayload({
            mutationId: mutationIdFrom(body),
            profile: baseProfile({ displayName: "Basic draft", updatedAt: SAVED_UPDATED_AT }),
          }),
        });
      }
      return Response.json({
        success: true,
        data: profilePayload({
          mutationId: mutationIdFrom(body),
          profile: baseProfile({ displayName: "Server owner", offering: ["Server offer", "Matching draft"], updatedAt: SAVED_UPDATED_AT }),
        }),
      });
    }
    gets += 1;
    if (gets === 1) return Response.json({ success: true, data: profilePayload() });
    if (gets === 2) return Response.json({ success: true, data: profilePayload({ profile: baseProfile({ displayName: "Basic draft", updatedAt: SAVED_UPDATED_AT }) }) });
    return Response.json({ success: true, data: profilePayload({ profile: baseProfile({ displayName: "Server owner", offering: ["Server offer", "Matching draft"], updatedAt: SAVED_UPDATED_AT }) }) });
  }) as typeof fetch);

  const root = await renderEditor(t);
  const name = inputWithValue(root, "Server owner");
  const offerGroup = root.root.findAllByProps({ role: "group", "aria-label": "我能提供" })[0];
  assert.ok(offerGroup);
  const matchingDraftButton = offerGroup.findAllByType("button").find((button) => button.children.includes("Matching draft"));
  assert.ok(matchingDraftButton);

  await act(async () => {
    name.props.onChange({ target: { value: "Basic draft" } });
    matchingDraftButton.props.onClick();
  });
  await submit(root);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].displayName, "Basic draft");
  assert.equal("offering" in puts[0], false);
  assert.equal(offerGroup.findAllByType("button").find((button) => button.children.includes("Matching draft"))?.props["aria-pressed"], true);

  const basicAfterMatchingEdit = inputWithValue(root, "Basic draft");
  await act(async () => {
    basicAfterMatchingEdit.props.onChange({ target: { value: "Basic draft kept" } });
  });
  const matchingSave = buttonWithText(root, "Save matching preferences", "保存匹配偏好");
  await act(async () => {
    matchingSave.props.onClick();
    await settle();
  });
  assert.equal(puts.length, 2);
  assert.deepEqual(puts[1].offering, ["Server offer", "Matching draft"]);
  assert.equal("displayName" in puts[1], false);
  assert.equal(inputWithValue(root, "Basic draft kept").props.value, "Basic draft kept");
});

test("first create sends the prefilled unchanged name with a null version", async (t) => {
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  const createdProfile = baseProfile({
    birthDate: null,
    displayName: "Prefilled owner",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    updatedAt: SAVED_UPDATED_AT,
  });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      return Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(body), profile: createdProfile }) });
    }
    gets += 1;
    if (gets === 1) {
      return Response.json({
        success: true,
        data: profilePayload({
          onboarding: {
            policyVersion: 1,
            status: "incomplete",
            missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
          },
          profile: null,
        }),
      });
    }
    return Response.json({ success: true, data: profilePayload({ profile: createdProfile }) });
  }) as typeof fetch);

  const root = await renderEditor(t, editorModel({
    fullName: "Prefilled owner",
    hasPersistedProfile: false,
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
  }));
  const primary = root.root.findAllByProps({ "aria-label": "一级行业" })[0];
  const secondary = root.root.findAllByProps({ "aria-label": "二级行业" })[0];
  assert.ok(primary);
  assert.ok(secondary);
  await act(async () => {
    primary.props.onChange({ target: { value: "technology_internet" } });
  });
  await act(async () => {
    root.root.findAllByProps({ "aria-label": "二级行业" })[0].props.onChange({ target: { value: "technology_internet.ai_data" } });
  });

  await submit(root);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].displayName, "Prefilled owner");
  assert.equal(puts[0].expectedUpdatedAt, null);
  assert.equal(puts[0].primaryIndustryId, "technology_internet");
  assert.equal(puts[0].secondaryIndustryId, "technology_internet.ai_data");
});

test("basic completion navigates through profile continue only after a complete readback", async (t) => {
  const next = "/app/contacts/new?eventId=event_123&source=onboarding";
  const assigned: string[] = [];
  let profileGets = 0;
  let readbackStarted = false;
  let releaseReadback!: (response: Response) => void;
  const updatedProfile = baseProfile({ displayName: "Ready owner", updatedAt: SAVED_UPDATED_AT });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        data: profilePayload({
          mutationId: mutationIdFrom(body),
          onboarding: incompleteOnboarding,
          profile: updatedProfile,
        }),
      });
    }
    profileGets += 1;
    if (profileGets === 1) return Response.json({ success: true, data: profilePayload({ onboarding: incompleteOnboarding }) });
    readbackStarted = true;
    return new Promise<Response>((resolve) => {
      releaseReadback = resolve;
    });
  }) as typeof fetch);

  const root = await renderEditor(
    t,
    editorModel({ onboarding: incompleteOnboarding }),
    { location: { assign: (path) => assigned.push(path) } },
    next,
  );
  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Ready owner" } });
  });

  let savePromise!: Promise<void>;
  await act(async () => {
    savePromise = root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
    await settle();
  });
  assert.equal(readbackStarted, true);
  assert.deepEqual(assigned, []);

  releaseReadback(Response.json({ success: true, data: profilePayload({ profile: updatedProfile }) }));
  await act(async () => {
    await savePromise;
  });
  assert.deepEqual(assigned, [`/app/profile/continue?next=${encodeURIComponent(next)}`]);
});

for (const readbackKind of ["failure", "incomplete"] as const) {
  test(`basic save does not navigate when readback is ${readbackKind}`, async (t) => {
    const assigned: string[] = [];
    let profileGets = 0;
    const updatedProfile = baseProfile({ displayName: "Ready owner", updatedAt: SAVED_UPDATED_AT });

    installFetch(t, (async (_input, init) => {
      if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(body), profile: updatedProfile }) });
      }
      profileGets += 1;
      if (profileGets === 1) return Response.json({ success: true, data: profilePayload({ onboarding: incompleteOnboarding }) });
      if (readbackKind === "failure") return Response.json({ success: false, error: { message: "Readback unavailable" } }, { status: 503 });
      return Response.json({ success: true, data: profilePayload({ onboarding: incompleteOnboarding, profile: updatedProfile }) });
    }) as typeof fetch);

    const root = await renderEditor(
      t,
      editorModel({ onboarding: incompleteOnboarding }),
      { location: { assign: (path) => assigned.push(path) } },
      "/app/contacts/new?eventId=event_failure",
    );
    const name = inputWithValue(root, "Server owner");
    await act(async () => {
      name.props.onChange({ target: { value: "Ready owner" } });
    });
    await submit(root);

    assert.deepEqual(assigned, []);
    assert.equal(inputWithValue(root, "Ready owner").props.value, "Ready owner");
    if (readbackKind === "failure") assert.ok(root.root.findAllByProps({ role: "alert" }).length >= 1);
  });
}

test("a pending matching draft prevents automatic navigation after basic completion", async (t) => {
  const next = "/app/contacts/new?eventId=event_456";
  const assigned: string[] = [];
  let profileGets = 0;
  const updatedProfile = baseProfile({ displayName: "Ready owner", updatedAt: SAVED_UPDATED_AT });

  installFetch(t, (async (_input, init) => {
    if (String(_input) !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      assert.equal("offering" in body, false);
      return Response.json({ success: true, data: profilePayload({ mutationId: mutationIdFrom(body), profile: updatedProfile }) });
    }
    profileGets += 1;
    if (profileGets === 1) return Response.json({ success: true, data: profilePayload({ onboarding: incompleteOnboarding }) });
    return Response.json({ success: true, data: profilePayload({ profile: updatedProfile }) });
  }) as typeof fetch);

  const root = await renderEditor(
    t,
    editorModel({ onboarding: incompleteOnboarding }),
    { location: { assign: (path) => assigned.push(path) } },
    next,
  );
  const offerGroup = root.root.findAllByProps({ role: "group", "aria-label": "我能提供" })[0];
  assert.ok(offerGroup);
  const matchingDraftButton = offerGroup.findAllByType("button").find((button) => button.children.includes("Matching draft"));
  assert.ok(matchingDraftButton);
  await act(async () => {
    matchingDraftButton.props.onClick();
  });

  const name = inputWithValue(root, "Server owner");
  await act(async () => {
    name.props.onChange({ target: { value: "Ready owner" } });
  });
  await submit(root);

  assert.deepEqual(assigned, []);
  assert.equal(inputWithValue(root, "Ready owner").props.value, "Ready owner");
  const retainedMatchingDraft = offerGroup.findAllByType("button").find((button) => button.children.includes("Matching draft"));
  assert.equal(retainedMatchingDraft?.props["aria-pressed"], true);
});
