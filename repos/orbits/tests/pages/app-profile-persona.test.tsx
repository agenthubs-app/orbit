import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { ManualProfile, ProfilePayload } from "../../features/profile/contract";
import type { OrbitProfileEditorView, OrbitProfileEditorViewModel } from "../../app/(app)/app/profile/profile-editor-adapter";
import { ProfilePersona } from "../../app/(app)/app/profile/profile-0918/profile-persona";
import { ProfileScreens } from "../../app/(app)/app/profile/profile-0918/profile-screens";
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

const FULL: Partial<OrbitProfileEditorView> = {
  fullName: "张三",
  title: "产品负责人",
  company: "星轨科技",
  bio: "十年 B2B 产品经验，关注 AI 与跨境合作。",
  intro: "拓展日本市场",
  offering: ["产品咨询", "日本市场资源"],
  seeking: ["投资人"],
  topics: ["生成式 AI"],
};

// 设计 mock 数据（placeholder 里的「例如：…」是设计 UI 文案，不算 mock 数据）
const MOCK_STRINGS = ["Qiongyu Li", "AI Engineer", "Tokyo, Japan", "致力于用生成式 AI 连接金融与保险行业", "进入欧美市场"];

function group(root: ReactTestRenderer, label: string) {
  const found = root.root.findAllByProps({ role: "group", "aria-label": label })[0];
  assert.ok(found, `expected group ${label}`);
  return found;
}

async function typeAndEnter(root: ReactTestRenderer, label: string, value: string) {
  const input = group(root, label).findAllByType("input")[0];
  assert.ok(input, `expected an input in ${label}`);
  await act(async () => {
    input.props.onChange({ target: { value } });
  });
  let prevented = false;
  await act(async () => {
    group(root, label).findAllByType("input")[0].props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  });
  return prevented;
}

test("persona renders the three multi-select groups with badges above the add box, plus a manual goal input", () => {
  const html = renderToStaticMarkup(<ProfilePersona session={session(FULL)} />);
  for (const label of ["我能提供", "我在寻找", "想聊的话题"]) {
    assert.match(html, new RegExp(`role="group" aria-label="${label}"`), `group ${label}`);
  }
  assert.match(html, /<span class="pc-tag">产品咨询 <button[^>]*class="btn pc-tag-remove"[^>]*>✕<\/button><\/span>/);
  assert.match(html, /<span class="pc-tag">投资人 <button/);
  assert.match(html, /<span class="pc-tag">生成式 AI <button/);
  // badge 在添加框上方
  const offerCard = html.slice(html.indexOf('aria-label="我能提供"'), html.indexOf('aria-label="我在寻找"'));
  assert.ok(offerCard.indexOf("pc-tag-remove") < offerCard.indexOf("pc-input-wrap"), "badges render above the add box");
  // 我的目标：手动输入框承载 intro，无 chip、无移除按钮
  const goalCard = html.slice(html.indexOf("我的目标"), html.indexOf('aria-label="我能提供"'));
  assert.match(goalCard, /<input aria-label="我的目标"[^>]*value="拓展日本市场"/);
  assert.match(goalCard, /placeholder="写下你的目标，或点击下方示例快速填入"/);
  // 输入框下方三枚示例 badge
  assert.ok(goalCard.indexOf("pc-input-wrap") < goalCard.indexOf("pc-options"), "goal examples render below the input");
  for (const example of ["三个月内认识 3 位日本市场的渠道伙伴", "年内在东京开出第一家线下门店", "从 0 到 1 打造自有品牌"]) {
    assert.match(goalCard, new RegExp(`class="btn pc-option"[^>]*>＋ ${example}</button>`), example);
  }
  assert.doesNotMatch(goalCard, /pc-tag/);
  // 目标 + 三组添加框
  assert.equal((html.match(/<input /g) ?? []).length, 4);
  // 设计 groupMeta 的 hint / placeholder
  assert.match(html, /你可以为他人提供什么帮助或资源？（可选择多个）/);
  assert.match(html, /placeholder="添加我能提供的内容，例如：投资机会"/);
  for (const mock of MOCK_STRINGS) {
    assert.doesNotMatch(html, new RegExp(mock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock string leaked: ${mock}`);
  }
});

test("preset options sit below the add box and hide once selected (in either language)", () => {
  const html = renderToStaticMarkup(<ProfilePersona session={session({ seeking: ["Investors"], topics: ["生成式 AI"] })} />);
  const seekCard = html.slice(html.indexOf('aria-label="我在寻找"'), html.indexOf('aria-label="想聊的话题"'));
  assert.ok(seekCard.indexOf("pc-input-wrap") < seekCard.indexOf("pc-options"), "options render below the add box");
  assert.match(seekCard, /class="btn pc-option"[^>]*>＋ 联合创始人<\/button>/);
  assert.doesNotMatch(seekCard, />＋ 投资人</, "option selected in English is hidden");
  const topicCard = html.slice(html.indexOf('aria-label="想聊的话题"'), html.indexOf("预览效果"));
  assert.doesNotMatch(topicCard, />＋ 生成式 AI</);
  assert.match(topicCard, />＋ 日本市场</);
});

test("empty goal shows an empty input and empty groups show no badges", () => {
  const html = renderToStaticMarkup(<ProfilePersona session={session()} />);
  assert.match(html, /<input aria-label="我的目标"[^>]*value=""/);
  assert.doesNotMatch(html, /pc-tag-remove/);
  assert.doesNotMatch(html, /class="pc-tags"/);
});

test("typing a goal calls update(\"intro\")", async () => {
  const calls: [string, unknown][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfilePersona session={session(FULL, { update: ((field: string, value: unknown) => { calls.push([field, value]); }) as ProfileEditorSession["update"] })} />);
  });
  const input = group(root, "我的目标").findAllByType("input")[0];
  assert.equal(input.props.maxLength, 100);
  await act(async () => { input.props.onChange({ target: { value: "认识出海渠道伙伴" } }); });
  assert.deepEqual(calls, [["intro", "认识出海渠道伙伴"]]);
  act(() => root.unmount());
});

test("clicking a goal example fills the goal input via update(\"intro\") and marks it pressed", async () => {
  const calls: [string, unknown][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfilePersona session={session({ intro: "年内在东京开出第一家线下门店" }, { update: ((field: string, value: unknown) => { calls.push([field, value]); }) as ProfileEditorSession["update"] })} />);
  });
  const examples = group(root, "我的目标示例").findAllByType("button");
  assert.equal(examples.length, 3);
  assert.deepEqual(examples.map((b) => b.props["aria-pressed"]), [false, true, false]);
  await act(async () => { examples[2].props.onClick(); });
  assert.deepEqual(calls, [["intro", "从 0 到 1 打造自有品牌"]]);
  act(() => root.unmount());
});

test("clicking a preset option adds it via toggleTag and respects the 5-item limit", async () => {
  const calls: [string, string][] = [];
  const notices: [string, string][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ProfilePersona
        session={session({ offering: ["a", "b", "c", "d", "e"] }, {
          toggleTag: (field, tag) => { calls.push([field, tag]); },
          notify: (kind, text) => { notices.push([kind, text]); },
        })}
      />,
    );
  });
  const option = (label: string, text: string) => {
    const found = group(root, label).findAllByType("button").find((b) => b.props.className === "btn pc-option" && b.children.includes(text));
    assert.ok(found, `option ${text} in ${label}`);
    return found;
  };
  await act(async () => { option("我在寻找", "投资人").props.onClick(); });
  await act(async () => { option("想聊的话题", "金融科技").props.onClick(); });
  await act(async () => { option("我能提供", "市场渠道").props.onClick(); });
  assert.deepEqual(calls, [["seeking", "投资人"], ["topics", "金融科技"]]);
  assert.deepEqual(notices, [["error", "能提供和想寻求各最多选择 5 项。"]]);
  act(() => root.unmount());
});

test("chip ✕ calls toggleTag with the group field and label", async () => {
  const calls: [string, string][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfilePersona session={session(FULL, { toggleTag: (field, tag) => { calls.push([field, tag]); } })} />);
  });
  const remove = group(root, "我在寻找").findAllByType("button").find((b) => b.children.includes("✕"));
  assert.ok(remove);
  await act(async () => { remove.props.onClick(); });
  assert.deepEqual(calls, [["seeking", "投资人"]]);
  act(() => root.unmount());
});

test("Enter adds a new tag via toggleTag, clears the draft, and skips tags already present", async () => {
  const calls: [string, string][] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfilePersona session={session(FULL, { toggleTag: (field, tag) => { calls.push([field, tag]); } })} />);
  });
  const prevented = await typeAndEnter(root, "想聊的话题", "  跨境电商 ");
  assert.equal(prevented, true);
  assert.deepEqual(calls, [["topics", "跨境电商"]]);
  assert.equal(group(root, "想聊的话题").findAllByType("input")[0].props.value, "");
  // 已存在 → 不调用 toggleTag（toggleTag 对已存在标签是移除）
  await typeAndEnter(root, "想聊的话题", "生成式 AI");
  assert.deepEqual(calls, [["topics", "跨境电商"]]);
  // 空白 → 不调用
  await typeAndEnter(root, "我能提供", "   ");
  assert.deepEqual(calls, [["topics", "跨境电商"]]);
  // 非 Enter 不拦截
  let prevent = 0;
  await act(async () => {
    group(root, "我能提供").findAllByType("input")[0].props.onKeyDown({ key: "a", preventDefault() { prevent += 1; } });
  });
  assert.equal(prevent, 0);
  act(() => root.unmount());
});

test("a sixth offer / seek tag triggers notify with the 5-item limit copy and is not added; topics have no limit", async () => {
  const calls: [string, string][] = [];
  const notices: [string, string][] = [];
  const five = ["a", "b", "c", "d", "e"];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ProfilePersona
        session={session({ offering: five, seeking: five, topics: five }, {
          toggleTag: (field, tag) => { calls.push([field, tag]); },
          notify: (kind, text) => { notices.push([kind, text]); },
        })}
      />,
    );
  });
  await typeAndEnter(root, "我能提供", "f");
  await typeAndEnter(root, "我在寻找", "f");
  assert.deepEqual(calls, []);
  assert.deepEqual(notices, [
    ["error", "能提供和想寻求各最多选择 5 项。"],
    ["error", "能提供和想寻求各最多选择 5 项。"],
  ]);
  await typeAndEnter(root, "想聊的话题", "f");
  assert.deepEqual(calls, [["topics", "f"]]);
  act(() => root.unmount());
});

test("preview card shows the real name, title · company, bio and the four groups with 未填写 for empty ones; tips are verbatim", () => {
  const html = renderToStaticMarkup(<ProfilePersona session={session({ ...FULL, seeking: [] })} />);
  assert.match(html, /class="pc-preview-avatar">张<\/span>/);
  assert.match(html, /<strong class="pc-preview-name">张三<\/strong>/);
  assert.match(html, /<span class="pc-preview-role">产品负责人 · 星轨科技<\/span>/);
  assert.match(html, /<span class="pc-preview-bio">十年 B2B 产品经验，关注 AI 与跨境合作。<\/span>/);
  assert.match(html, /<span class="pc-preview-tag">产品咨询<\/span>/);
  assert.match(html, /<span class="pc-preview-tag">拓展日本市场<\/span>/);
  assert.match(html, /<span class="pc-preview-tag pc-preview-tag-empty">未填写<\/span>/);
  assert.match(html, /预览效果/);
  assert.match(html, /这是你的公开商务画像预览，其他用户将看到这些内容。/);
  assert.match(html, /填写建议/);
  for (const [n, title, desc] of [
    ["1", "突出你的核心价值", "使用具体、清晰的关键词，让他人快速了解你。"],
    ["2", "结合你的真实意图", "基于你当前的阶段和兴趣，选择最相关的内容。"],
    ["3", "保持简洁与专业", "建议每个部分选择 3–5 个关键词，便于他人快速理解。"],
  ]) {
    assert.match(html, new RegExp(`<span class="pc-tip-n">${n}</span>`));
    assert.match(html, new RegExp(`<strong class="pc-tip-title">${title}</strong><span class="pc-tip-desc">${desc}</span>`));
  }
  // 无姓名 / 无职位公司 / 无简介 → 不做假
  const blank = renderToStaticMarkup(<ProfilePersona session={session()} />);
  assert.match(blank, /<strong class="pc-preview-name">你的名字<\/strong>/);
  assert.doesNotMatch(blank, /pc-preview-role/);
  assert.doesNotMatch(blank, /pc-preview-bio/);
});

test("persona inputs, options and remove buttons are disabled while the editor is disabled", () => {
  const html = renderToStaticMarkup(<ProfilePersona session={session(FULL, { editorDisabled: true })} />);
  assert.equal((html.match(/<input [^>]*disabled=""/g) ?? []).length, 4);
  assert.match(html, /class="btn pc-option" disabled=""/);
  assert.match(html, /class="btn pc-tag-remove" disabled=""/);
});

test("PROFILE_STYLES carry the persona rules scoped to the page", () => {
  for (const cls of [".pc-editor", ".pc-group", ".pc-group-icon", ".pc-tag", ".btn.pc-tag-remove", ".pc-input-wrap", ".pc-input", ".pc-options", ".btn.pc-option", ".pc-preview-box", ".pc-preview-row", ".pc-preview-tag", ".pc-tip", ".pc-tip-n"]) {
    assert.match(PROFILE_STYLES, new RegExp(`\\[data-orbit-real-page="profile-0918"\\] ${cls.replace(/\./g, "\\.")} \\{`), cls);
  }
  assert.match(PROFILE_STYLES, /\.btn\.pc-tag-remove:active \{ transform: none; \}/);
});

/* ── ProfileScreens 接线：保存栏 → saveProfile("matching") → toast + 回 profile；取消 → 整页跳转 /app/profile 丢弃草稿 ── */

function payload(overrides: Partial<ManualProfile> = {}): ProfilePayload {
  const manual: ManualProfile = {
    displayName: "张三",
    headline: "",
    id: "profile:zhang",
    industry: "",
    offering: ["产品咨询"],
    seeking: [],
    topics: [],
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  } as ManualProfile;
  return {
    completeness: { completedFields: [], missingFields: [], nextBestField: null, score: 100, status: "ready" },
    editor: { canSave: true, dirtyFields: [], lastSavedAt: manual.updatedAt, validationMessages: [] },
    nextAction: "",
    onboarding: { missingFields: [], policyVersion: 1, status: "complete" },
    profile: manual,
    provenance: { collectedAt: manual.updatedAt, evidenceIds: [], privacy: "actor-scoped-profile", source: "test", sourceLabel: "Test" },
    state: "success",
  };
}

function viewModel(): OrbitProfileEditorViewModel {
  return {
    industries: [],
    offeringTags: [],
    seekingTags: [],
    topics: [],
    profile: profile({ fullName: "张三", offering: ["产品咨询"], hasPersistedProfile: true, expectedUpdatedAt: "2026-09-17T00:00:00.000Z" }),
  } as unknown as OrbitProfileEditorViewModel;
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installWindow(t: { after(cb: () => void): void }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const replaced: string[] = [];
  const assigned: string[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } },
      location: { assign: (path: string) => { assigned.push(path); } },
      scrollTo() {},
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  });
  return { assigned, replaced };
}

test("ProfileScreens persona: save bar saves matching, then toasts 修改已保存 and returns to the profile view in place", async (t) => {
  const { replaced } = installWindow(t);
  const puts: Record<string, unknown>[] = [];
  let latest = payload();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      latest = payload({ offering: body.offering as string[] });
      return Response.json({ success: true, data: { ...latest, mutationId: body.mutationId } });
    }
    return Response.json({ success: true, data: latest });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens view="persona" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  assert.equal(root.root.findAllByProps({ "data-profile-view": "persona" }).length >= 1, true);
  const save = root.root.findAllByType("button").find((b) => b.children.includes("保存修改"));
  assert.ok(save, "save bar present on persona");
  await typeAndEnter(root, "我能提供", "日本市场资源");
  await act(async () => {
    save.props.onClick();
    await settle();
  });
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].offering, ["产品咨询", "日本市场资源"]);
  assert.equal(root.root.findAllByProps({ "data-profile-view": "profile" }).length >= 1, true);
  assert.ok(root.root.findAllByProps({ className: "pc-toast" }).find((n) => n.children.includes("修改已保存")));
  // 终审 M4：概览只保留设计 toast，hook 的绿色复读通知条已被清空，不出现双重提示。
  const notices = root.root.findAll((n) => n.type === "div" && n.props.role === "status" && String(n.props.className ?? "").includes("pc-notice"));
  assert.equal(notices.length, 0, "no pc-notice role=status on the overview after save");
  assert.equal(root.root.findAll((n) => typeof n.props.children === "string" && /复读核验|已保存并/.test(n.props.children)).length, 0);
  assert.deepEqual(replaced, ["/app/profile"]);
});

// 终审 I1：reloadLatestProfile 按设计保留脏字段，取消若就地切回 profile 会把未保存 chip 与
// 「最新资料已加载…」提示带到概览。改为整页跳转 /app/profile 丢弃草稿，不发 reload GET。
test("ProfileScreens persona: cancel discards the draft by navigating to /app/profile without reloading", async (t) => {
  const { assigned, replaced } = installWindow(t);
  let gets = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    gets += 1;
    return Response.json({ success: true, data: payload() });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens view="persona" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  await typeAndEnter(root, "我能提供", "未保存的资源");
  assert.ok(root.root.findAll((n) => n.props.children === "未保存的资源").length >= 1, "draft chip rendered before cancel");
  const cancel = root.root.findAllByType("button").find((b) => b.children.includes("取消"));
  assert.ok(cancel);
  assert.equal(cancel.props.disabled, false);
  const getsBeforeCancel = gets;
  await act(async () => {
    cancel.props.onClick();
    await settle();
  });
  assert.deepEqual(assigned, ["/app/profile"], "full navigation discards the draft");
  assert.equal(gets, getsBeforeCancel, "cancel issues no extra GET /api/profile");
  assert.deepEqual(replaced, [], "no in-place view flip");
  assert.equal(root.root.findAllByProps({ "data-profile-view": "profile" }).length, 0, "overview is never rendered from the dirty session");
  assert.equal(root.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes("最新资料已加载")).length, 0, "no reload notice");
});
