import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { ManualProfile, ProfilePayload } from "../../features/profile/contract";
import type { OrbitProfileEditorView, OrbitProfileEditorViewModel } from "../../app/(app)/app/profile/profile-editor-adapter";
import { ProfileBasic } from "../../app/(app)/app/profile/profile-0918/profile-basic";
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
    onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"] },
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
  headline: "把 AI 落到业务里",
  bio: "十年 B2B 产品经验。",
  birthDate: "1990-01-01",
  primaryIndustryId: "technology_internet",
  secondaryIndustryId: "technology_internet.ai_data",
  email: "zhangsan@example.com",
  wechatName: "zs_wechat",
  lineId: "zs_line",
  handles: { email: "zhangsan@example.com", linkedinUrl: "linkedin.com/in/zs", phone: "+81 90 0000 0000", wechatId: "zs_wechat", lineId: "zs_line" },
  onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
};

test("basic screen wraps everything in a form, marks core fields plus WeChat/LINE choice, and puts 姓名 first", () => {
  const html = renderToStaticMarkup(<ProfileBasic session={session(FULL)} onSubmit={async () => undefined} />);
  assert.match(html, /^<form /);
  assert.equal((html.match(/<span class="pc-required">必填<\/span>/g) ?? []).length, 6);
  for (const label of ["姓名", "一级行业", "二级行业", "生日"]) {
    assert.match(html, new RegExp(`${label}<span class="pc-required">必填</span>`), `${label} required`);
  }
  assert.doesNotMatch(html, /职位<span class="pc-required"/);
  // 首个 <input> 是姓名
  const firstInput = html.slice(html.indexOf("<input "), html.indexOf(">", html.indexOf("<input ")) + 1);
  assert.match(firstInput, /value="张三"/);
  // 行业 select 保留 aria-label
  assert.match(html, /<select [^>]*aria-label="一级行业"/);
  assert.match(html, /<select [^>]*aria-label="二级行业"/);
  assert.match(html, /<option value="technology_internet\.ai_data" selected=""/);
  // 生日 type=date
  assert.match(html, /<input [^>]*type="date"[^>]*value="1990-01-01"/);
  // 关于我 textarea + 80 可见字符提示；一句话介绍只读
  assert.match(html, /关于我（最多 80 个可见字符）/);
  assert.match(html, /<textarea [^>]*class="pc-input pc-textarea"[^>]*>十年 B2B 产品经验。<\/textarea>/);
  assert.match(html, /一句话介绍/);
  assert.match(html, /<span class="pc-readonly">把 AI 落到业务里<\/span>/);
  // 联系方式：WeChat / LINE 可编辑，Email 只读，其余 handle 只读行
  assert.match(html, /<input [^>]*aria-label="WeChat"[^>]*value="zs_wechat"/);
  assert.match(html, /<input [^>]*aria-label="LINE"[^>]*value="zs_line"/);
  assert.match(html, /WeChat（与 LINE 二选一必填）<span class="pc-required">必填<\/span>/);
  assert.match(html, /LINE（与 WeChat 二选一必填）<span class="pc-required">必填<\/span>/);
  assert.match(html, /WeChat 或 LINE 任选一项必填/);
  assert.doesNotMatch(html, /<input [^>]*value="zhangsan@example.com"/);
  assert.match(html, /Email<\/span><span class="pc-readonly">zhangsan@example.com<\/span>/);
  assert.match(html, /LinkedIn<\/span><span class="pc-readonly">linkedin\.com\/in\/zs<\/span>/);
  assert.match(html, /Phone<\/span><span class="pc-readonly">\+81 90 0000 0000<\/span>/);
  assert.match(html, /仅自己可见/);
  // 快速填充：两种方式
  assert.match(html, /role="group" aria-label="填写方式"/);
  assert.match(html, /aria-pressed="true"[^>]*>手动填写</);
  assert.match(html, /aria-pressed="false"[^>]*>结构化文本提取</);
});

test("form submit calls onSubmit; inputs are disabled while the editor is disabled; industry selects follow industryReady", async () => {
  let submits = 0;
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileBasic session={session(FULL, { editorDisabled: true, industryReady: false })} onSubmit={async () => { submits += 1; }} />);
  });
  const form = root.root.findAllByType("form")[0];
  assert.ok(form.props.onSubmit);
  let prevented = 0;
  await act(async () => { await form.props.onSubmit({ preventDefault() { prevented += 1; } }); });
  assert.equal(prevented, 1);
  assert.equal(submits, 1);
  assert.equal(root.root.findAllByType("input")[0].props.disabled, true);
  assert.equal(root.root.findAllByType("input")[0].props.value, "张三");
  assert.equal(root.root.findAllByProps({ "aria-label": "一级行业" })[0].props.disabled, true);
  assert.equal(root.root.findAllByProps({ "aria-label": "二级行业" })[0].props.disabled, true);
  act(() => root.unmount());
});

test("field handlers route to the hook: update / updateBirthDate / updateIndustry / method / extract", async () => {
  const updates: [string, unknown][] = [];
  const industries: unknown[] = [];
  const births: string[] = [];
  const methods: string[] = [];
  const texts: string[] = [];
  let extracts = 0;
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <ProfileBasic
        onSubmit={async () => undefined}
        session={session(FULL, {
          method: "text",
          update: (field, value) => { updates.push([field, value]); },
          updateBirthDate: (v) => { births.push(v); },
          updateIndustry: (sel) => { industries.push(sel); },
          setMethod: (m) => { methods.push(m); },
          setExtractText: (v) => { texts.push(v); },
          onTextExtract: async () => { extracts += 1; },
        })}
      />,
    );
  });
  const inputs = root.root.findAllByType("input");
  await act(async () => {
    inputs[0].props.onChange({ target: { value: "李四" } });
    root.root.findAllByProps({ "aria-label": "一级行业" })[0].props.onChange({ target: { value: "finance_investment" } });
    root.root.findAllByProps({ "aria-label": "二级行业" })[0].props.onChange({ target: { value: "" } });
    root.root.findAllByType("input").find((i) => i.props.type === "date")!.props.onChange({ target: { value: "1991-02-03" } });
    root.root.findAllByProps({ "aria-label": "WeChat" })[0].props.onChange({ target: { value: "wx" } });
    root.root.findAllByProps({ "aria-label": "LINE" })[0].props.onChange({ target: { value: "ln" } });
    root.root.findAllByType("textarea").find((n) => n.props.value === "十年 B2B 产品经验。")!.props.onChange({ target: { value: "新简介" } });
  });
  assert.deepEqual(updates, [["fullName", "李四"], ["wechatName", "wx"], ["lineId", "ln"], ["bio", "新简介"]]);
  assert.deepEqual(industries, [
    { primaryIndustryId: "finance_investment", secondaryIndustryId: null },
    { primaryIndustryId: "technology_internet", secondaryIndustryId: null },
  ]);
  assert.deepEqual(births, ["1991-02-03"]);
  // 快速填充：方式切换 + 文本提取
  const manual = root.root.findAllByType("button").find((b) => b.children.includes("手动填写"));
  assert.ok(manual);
  await act(async () => { manual.props.onClick(); });
  assert.deepEqual(methods, ["manual"]);
  const extractArea = root.root.findAllByType("textarea").find((n) => n.props.value === "");
  assert.ok(extractArea, "text mode shows the paste textarea");
  await act(async () => { extractArea.props.onChange({ target: { value: "姓名：李四" } }); });
  assert.deepEqual(texts, ["姓名：李四"]);
  const extract = root.root.findAllByType("button").find((b) => b.children.includes("提取到表单"));
  assert.ok(extract);
  await act(async () => { extract.props.onClick(); });
  assert.equal(extracts, 1);
  act(() => root.unmount());
});

test("secondary select is disabled without a primary industry and lists only the chosen primary's children", () => {
  const none = renderToStaticMarkup(<ProfileBasic session={session({ primaryIndustryId: undefined })} onSubmit={async () => undefined} />);
  assert.match(none, /<select [^>]*aria-label="二级行业"[^>]*disabled=""/);
  const tech = renderToStaticMarkup(<ProfileBasic session={session({ primaryIndustryId: "technology_internet" })} onSubmit={async () => undefined} />);
  assert.match(tech, /<option value="technology_internet\.ai_data"/);
  assert.doesNotMatch(tech, /<option value="finance_investment\.banking"/);
});

test("PROFILE_STYLES carry the basic-screen rules scoped to the page", () => {
  for (const cls of [".pc-fields", ".pc-field", ".pc-field-label", ".pc-required", ".pc-select", ".pc-textarea", ".pc-readonly", ".btn.pc-method", ".btn.pc-method.pc-method-on"]) {
    assert.match(PROFILE_STYLES, new RegExp(`\\[data-orbit-real-page="profile-0918"\\] ${cls.replace(/\./g, "\\.")} \\{`), cls);
  }
  assert.match(PROFILE_STYLES, /\.btn\.pc-method:active \{ transform: none; \}/);
});

/* ── ProfileScreens 接线：门禁横幅 + 保存后仍不完整 → 琥珀色 warning、不跳转、留在 basic ── */

function payload(overrides: Partial<ProfilePayload> = {}, manual: Partial<ManualProfile> = {}): ProfilePayload {
  const profileRecord: ManualProfile = {
    displayName: "张三",
    handles: { wechatId: "wx-zhang" },
    headline: "",
    id: "profile:zhang",
    industry: "",
    offering: [],
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    seeking: [],
    topics: [],
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...manual,
  } as ManualProfile;
  return {
    completeness: { completedFields: [], missingFields: [], nextBestField: null, score: 100, status: "ready" },
    editor: { canSave: true, dirtyFields: [], lastSavedAt: profileRecord.updatedAt, validationMessages: [] },
    nextAction: "",
    onboarding: { missingFields: ["birthDate"], policyVersion: 1, status: "incomplete" },
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
      handles: { wechatId: "wx-zhang" },
      wechatName: "wx-zhang",
      onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] },
    }),
  } as unknown as OrbitProfileEditorViewModel;
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installWindow(t: { after(cb: () => void): void }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const assigned: string[] = [];
  const replaced: string[] = [];
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

test("ProfileScreens basic (onboarding=1): banner shows, saving without a birthday renders the amber warning and stays on basic", async (t) => {
  const { assigned, replaced } = installWindow(t);
  const puts: Record<string, unknown>[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      return Response.json({ success: true, data: { ...payload({}, { displayName: body.displayName as string }), mutationId: body.mutationId } });
    }
    return Response.json({ success: true, data: payload({}, puts.length ? { displayName: puts[0].displayName as string } : {}) });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens onboarding onboardingNext="/app/agent" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  assert.equal(root.root.findAllByProps({ "data-profile-view": "basic" }).length >= 1, true);
  const banner = root.root.findAllByProps({ role: "status" }).find((n) => n.props.className?.includes("pc-notice-warning"));
  assert.ok(banner, "gate banner");
  assert.match(textOf(banner), /第一步：编辑个人资料/);

  const name = root.root.findAllByType("input")[0];
  assert.equal(name.props.value, "张三");
  await act(async () => { name.props.onChange({ target: { value: "张三丰" } }); });
  const save = root.root.findAllByType("button").find((b) => b.children.includes("保存修改"));
  assert.ok(save, "save bar present on basic");
  await act(async () => {
    await root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
    await settle();
  });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].displayName, "张三丰");
  const warning = root.root.findAllByProps({ role: "status" }).find((n) => n.props.className === "pc-notice pc-notice-warning" && textOf(n).includes("基础资料已保存"));
  assert.ok(warning, "amber warning notice");
  assert.match(textOf(warning), /基础资料已保存，但还需填写：生日。填完后才能进入其他页面。/);
  assert.doesNotMatch(textOf(warning), /已保存并完成复读核验/);
  assert.equal(root.root.findAllByProps({ "data-profile-view": "basic" }).length >= 1, true, "stays on basic");
  assert.deepEqual(assigned, []);
  assert.deepEqual(replaced, []);
});

test("ProfileScreens basic: a complete save with onboardingNext continues via the hook; without next it shows the green notice and stays on basic", async (t) => {
  const { assigned, replaced } = installWindow(t);
  const complete = { missingFields: [], policyVersion: 1 as const, status: "complete" as const };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ success: true, data: { ...payload({ onboarding: complete }, { birthDate: "1990-01-01" }), mutationId: body.mutationId } });
    }
    return Response.json({ success: true, data: payload({ onboarding: complete }, { birthDate: "1990-01-01" }) });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<ProfileScreens onboarding onboardingNext="/app/agent" view="basic" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  const birthday = root.root.findAllByType("input").find((i) => i.props.type === "date")!;
  await act(async () => { birthday.props.onChange({ target: { value: "1990-01-01" } }); });
  await act(async () => {
    await root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
    await settle();
  });
  assert.deepEqual(assigned, ["/app/profile/continue?next=%2Fapp%2Fagent"]);

  // 无 next：成功 → 绿色通知条，留在基础资料屏（不 toast、不切视图）
  let second!: ReactTestRenderer;
  await act(async () => {
    second = create(<ProfileScreens view="basic" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => second.unmount()));
  const bd = second.root.findAllByType("input").find((i) => i.props.type === "date")!;
  await act(async () => { bd.props.onChange({ target: { value: "1990-01-01" } }); });
  await act(async () => {
    await second.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} });
    await settle();
  });
  assert.equal(second.root.findAllByProps({ "data-profile-view": "basic" }).length >= 1, true);
  const success = second.root.findAllByProps({ role: "status" }).find((n) => n.props.className === "pc-notice pc-notice-success");
  assert.ok(success, "green success notice");
  assert.match(textOf(success), /基础资料已保存并完成复读核验。/);
  assert.equal(second.root.findAllByProps({ className: "pc-toast" }).length, 0);
  assert.deepEqual(replaced, []);
});

// 终审 I1：取消不再 reload + 就地切视图（reload 保留脏字段会把未保存值带到概览），改为整页跳转 /app/profile。
test("ProfileScreens basic: cancel discards the draft by navigating to /app/profile without reloading", async (t) => {
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
    root = create(<ProfileScreens view="basic" viewModel={viewModel()} />);
    await settle();
  });
  t.after(() => act(() => root.unmount()));
  const name = root.root.findAllByType("input")[0];
  await act(async () => { name.props.onChange({ target: { value: "未保存的名字" } }); });
  assert.equal(root.root.findAllByType("input")[0].props.value, "未保存的名字");
  const cancel = root.root.findAllByType("button").find((b) => b.children.includes("取消"));
  assert.ok(cancel);
  assert.equal(cancel.props.disabled, false);
  await act(async () => {
    cancel.props.onClick();
    await settle();
  });
  assert.deepEqual(assigned, ["/app/profile"], "full navigation discards the draft");
  assert.equal(gets, 1, "initial GET only — cancel issues no reload GET");
  assert.deepEqual(replaced, [], "no in-place view flip");
  assert.equal(root.root.findAllByProps({ "data-profile-view": "profile" }).length, 0, "overview is never rendered from the dirty session");
  assert.equal(root.root.findAll((n) => typeof n.props.children === "string" && n.props.children.includes("最新资料已加载")).length, 0, "no reload notice");
});
