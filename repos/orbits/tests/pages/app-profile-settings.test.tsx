import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { ManualProfile, ProfilePayload } from "../../features/profile/contract";
import type { OrbitProfileEditorView, OrbitProfileEditorViewModel } from "../../app/(app)/app/profile/profile-editor-adapter";
import { ProfileScreens } from "../../app/(app)/app/profile/profile-0918/profile-screens";
import { ProfileSettings } from "../../app/(app)/app/profile/profile-0918/profile-settings";
import { PROFILE_STYLES } from "../../app/(app)/app/profile/profile-0918/profile-shell";
import type { ProfileEditorSession } from "../../app/(app)/app/profile/profile-0918/use-profile-editor-session";

function profile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return {
    bio: "",
    birthDate: null,
    company: "",
    email: "",
    expectedUpdatedAt: null,
    fullName: "",
    handles: undefined,
    hasPersistedProfile: false,
    headline: "",
    industry: "",
    intro: "",
    lineId: "",
    offering: [],
    onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
    primaryIndustryId: undefined,
    secondaryIndustryId: undefined,
    seeking: [],
    title: "",
    topics: [],
    wechatName: "",
    ...overrides,
  };
}

function session(overrides: Partial<OrbitProfileEditorView> = {}, spies: Partial<ProfileEditorSession> = {}): ProfileEditorSession {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  return {
    profile: profile(overrides),
    dirtyFields: new Set(),
    matchingDirty: false,
    editorDisabled: false,
    industryReady: true,
    setIndustryReady: noop,
    saving: false,
    matchingSaving: false,
    reloading: false,
    requiresReconcile: false,
    extracting: false,
    message: "",
    messageKind: "info",
    notify: noop,
    method: "manual",
    setMethod: noop,
    extractText: "",
    setExtractText: noop,
    update: noop,
    updateBirthDate: noop,
    updateIndustry: noop,
    toggleTag: noop,
    saveProfile: asyncNoop,
    reloadLatestProfile: asyncNoop,
    onTextExtract: asyncNoop,
    ...spies,
  };
}

const LONG_BIO = "我是一名关注跨境合作与企业服务的产品负责人，十年 B2B 经验，长期关注生成式 AI 在金融与保险行业的落地，希望结识更多志同道合的伙伴并探索合作机会。";
const MOCK_STRINGS = [
  "Qiongyu Li",
  "我是一名关注 AI 与全球化的工程师",
  "我希望在未来一年内深入了解 AI 应用落地",
  "学习 AI 应用",
  "拓展行业人脉",
  "寻找合作机会",
  "参加优质活动",
  "中文（简体）",
  "专业、友好、直接",
  "工作日晚上或周末（东京时间）",
];

test("settings renders 关于我 textarea bound to bio, 当前目标 paragraph, and the right-hand summary card with aboutShort + intro", () => {
  const html = renderToStaticMarkup(<ProfileSettings session={session({ bio: LONG_BIO, intro: "拓展日本市场" })} />);
  // 左列 212–215：关于我 textarea ← bio
  assert.match(html, /<strong class="pc-h2-lg">关于我<\/strong>/);
  assert.match(html, /<textarea [^>]*class="pc-about"[^>]*rows="4"[^>]*>/);
  assert.match(html, new RegExp(`<textarea [^>]*>${LONG_BIO}</textarea>`));
  // 216–220：当前目标 = intro 段落，chips 省略
  assert.match(html, /<strong class="pc-h2-lg">当前目标<\/strong>/);
  assert.match(html, /<span class="pc-goal-text">拓展日本市场<\/span>/);
  assert.doesNotMatch(html, /pc-goal-chips/);
  // 221–228 沟通偏好 整卡省略（右卡子块也省略）
  assert.doesNotMatch(html, /沟通偏好/);
  assert.doesNotMatch(html, /首选语言/);
  // 右卡 231–239：aboutShort = 62 字 + …；当前目标 = intro；240 行说明句原样
  assert.match(html, /当前 iOrbit 使用的信息/);
  assert.match(html, /基于你填写的内容，这是 iOrbit 对你的理解。/);
  assert.match(html, new RegExp(`<span class="pc-info-text">${LONG_BIO.slice(0, 62)}…</span>`));
  assert.match(html, /<span class="pc-info-text">拓展日本市场<\/span>/);
  assert.match(html, /ⓘ 你可以随时编辑这些信息，帮助 iOrbit 更好地理解你。/);
  for (const mock of MOCK_STRINGS) {
    assert.doesNotMatch(html, new RegExp(mock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock string leaked: ${mock}`);
  }
});

test("settings without intro / bio shows 未设置 and never fakes content", () => {
  const html = renderToStaticMarkup(<ProfileSettings session={session()} />);
  assert.match(html, /<span class="pc-goal-text pc-goal-empty">未设置<\/span>/);
  assert.match(html, /<textarea [^>]*class="pc-about"[^>]*><\/textarea>/);
  assert.equal((html.match(/pc-info-text pc-info-empty">未设置<\/span>/g) ?? []).length, 2, "summary card: about + goal both 未设置");
});

test("settings textarea calls session.update(\"bio\") and is disabled while the editor is disabled", async (t) => {
  installDocument(t);
  const calls: [string, unknown][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileSettings session={session({}, { update: (field, value) => { calls.push([field, value]); } })} />);
  });
  const textarea = root.root.findAllByType("textarea")[0];
  assert.ok(textarea);
  await act(async () => { textarea.props.onChange({ target: { value: "新的关于我" } }); });
  assert.deepEqual(calls, [["bio", "新的关于我"]]);
  act(() => root.unmount());

  const disabled = renderToStaticMarkup(<ProfileSettings session={session({}, { editorDisabled: true })} />);
  assert.match(disabled, /<textarea [^>]*disabled=""/);
});

test("settings mounts the five legacy modules inside .pc-legacy-settings after the design cards, each framed by a pc-card", () => {
  const html = renderToStaticMarkup(<ProfileSettings session={session()} />);
  const legacyAt = html.indexOf('class="pc-legacy-settings"');
  assert.ok(legacyAt > 0, "legacy wrapper present");
  assert.ok(legacyAt > html.indexOf("当前 iOrbit 使用的信息"), "legacy modules come after the design cards");
  const legacy = html.slice(legacyAt);
  for (const marker of [
    'aria-labelledby="orbit-appearance-title"',
    "data-orbit-agent-memory-settings",
    "data-orbit-agent-feedback-settings",
    "data-orbit-agent-automation-settings",
    "data-orbit-agent-execution-settings",
  ]) {
    assert.match(legacy, new RegExp(marker), marker);
  }
  assert.equal((legacy.match(/class="pc-card pc-legacy-card"/g) ?? []).length, 5);
});

test("PROFILE_STYLES carry the settings rules scoped to the page", () => {
  for (const cls of [".pc-settings", ".pc-settings-card", ".pc-settings-head", ".pc-settings-title", ".pc-settings-icon", ".pc-about", ".pc-goal-text", ".pc-info-card", ".pc-info-head", ".pc-info-icon", ".pc-info-copy", ".pc-info-block", ".pc-info-block-next", ".pc-info-label", ".pc-info-label-icon", ".pc-info-label-text", ".pc-info-text", ".pc-info-note"]) {
    assert.match(PROFILE_STYLES, new RegExp(`\\[data-orbit-real-page="profile-0918"\\] ${cls.replace(/\./g, "\\.")} \\{`), cls);
  }
});

/* ── ProfileScreens 接线：settings 保存栏 → saveProfile("basic")，结果由壳通知条呈现；取消 → reload + 回 profile ── */

function payload(overrides: Partial<ProfilePayload> = {}, manual: Partial<ManualProfile> = {}): ProfilePayload {
  const profileRecord: ManualProfile = {
    displayName: "张三",
    headline: "",
    id: "profile:zhang",
    industry: "",
    offering: [],
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    birthDate: "1990-01-01",
    seeking: [],
    topics: [],
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...manual,
  } as ManualProfile;
  return {
    completeness: { completedFields: [], missingFields: [], nextBestField: null, score: 100, status: "ready" },
    editor: { canSave: true, dirtyFields: [], lastSavedAt: profileRecord.updatedAt, validationMessages: [] },
    nextAction: "",
    onboarding: { missingFields: [], policyVersion: 1, status: "complete" },
    profile: profileRecord,
    provenance: { collectedAt: profileRecord.updatedAt, evidenceIds: [], privacy: "actor-scoped-profile", source: "test", sourceLabel: "Test" },
    state: "success",
    ...overrides,
  };
}

function viewModel(): OrbitProfileEditorViewModel {
  return {
    industries: [],
    offeringTags: [],
    seekingTags: [],
    topics: [],
    profile: profile({
      fullName: "张三",
      hasPersistedProfile: true,
      expectedUpdatedAt: "2026-09-17T00:00:00.000Z",
      primaryIndustryId: "technology_internet",
      secondaryIndustryId: "technology_internet.ai_data",
      birthDate: "1990-01-01",
    }),
  } as unknown as OrbitProfileEditorViewModel;
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// 既有设置模块在 effect 里读 document（visibilitychange 监听、documentElement[data-theme]）；node 下补最小 document。
function installDocument(t: { after(cb: () => void): void }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const attrs = new Map<string, string>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      visibilityState: "visible",
      documentElement: {
        getAttribute: (name: string) => attrs.get(name) ?? null,
        setAttribute: (name: string, value: string) => { attrs.set(name, value); },
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
  });
}

function isProfileApi(input: unknown): boolean {
  return String(input).includes("/api/profile");
}

function installWindow(t: { after(cb: () => void): void }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const replaced: string[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
      location: { assign() {} },
      scrollTo() {},
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  });
  return replaced;
}

test("ProfileScreens settings: save bar saves the basic scope with the edited bio and shows the green notice on the settings view", async (t) => {
  const replaced = installWindow(t);
  installDocument(t);
  const puts: Record<string, unknown>[] = [];
  let latest = payload();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    if (!isProfileApi(input)) return new Response("not found", { status: 404 });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      latest = payload({}, { bio: body.bio as string });
      return Response.json({ success: true, data: { ...latest, mutationId: body.mutationId } });
    }
    return Response.json({ success: true, data: latest });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens view="settings" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  assert.equal(root.root.findAllByProps({ "data-profile-view": "settings" }).length >= 1, true);
  const save = root.root.findAllByType("button").find((b) => b.children.includes("保存修改"));
  assert.ok(save, "save bar present on settings");
  const about = root.root.findAllByType("textarea").find((n) => n.props.className === "pc-about")!;
  await act(async () => { about.props.onChange({ target: { value: "新的关于我" } }); });
  await act(async () => {
    save.props.onClick();
    await settle();
  });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].bio, "新的关于我");
  assert.equal(root.root.findAllByProps({ "data-profile-view": "settings" }).length >= 1, true, "stays on settings");
  const success = root.root.findAllByProps({ role: "status" }).find((n) => n.props.className === "pc-notice pc-notice-success");
  assert.ok(success, "green success notice");
  assert.match(textOf(success), /基础资料已保存并完成复读核验。/);
  assert.deepEqual(replaced, []);
});

test("ProfileScreens settings: cancel is disabled while saving; cancel reloads the latest profile and returns to the profile view", async (t) => {
  const replaced = installWindow(t);
  installDocument(t);
  let gets = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    if (!isProfileApi(input)) return new Response("not found", { status: 404 });
    gets += 1;
    return Response.json({ success: true, data: payload() });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens view="settings" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  const cancel = root.root.findAllByType("button").find((b) => b.children.includes("取消"));
  assert.ok(cancel);
  assert.equal(cancel.props.disabled, false);
  await act(async () => {
    cancel.props.onClick();
    await settle();
  });
  assert.equal(gets, 2, "initial GET + reload GET");
  assert.equal(root.root.findAllByProps({ "data-profile-view": "profile" }).length >= 1, true);
  assert.deepEqual(replaced, ["/app/profile"]);
});
