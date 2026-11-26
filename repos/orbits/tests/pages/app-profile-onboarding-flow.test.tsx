import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { OnboardingFlow } from "../../app/(app)/app/orbit-2026/onboarding/onboarding-flow";
import {
  ONBOARDING_STEPS,
  migrateOnboardingView,
  missingBasics,
  missingIntro,
  onboardingStepForProgress,
  onboardingStepsDone,
  SEEK_OPTIONS,
  addCustomValue,
  composeRelationshipGoal,
  parseRelationshipGoal,
  readOnboardingDraft,
  seekOptionsFromLabels,
  toggleValue,
} from "../../app/(app)/app/orbit-2026/onboarding/onboarding-model";
import { profileOnboardingFlowPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

test("three steps over the server's five screens: ① = 1, ② = 2 + 3, ③ = 4 + 5", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["basics", "goals", "intro"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(onboardingStepForProgress), ["basics", "goals", "goals", "intro", "intro", "intro"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(onboardingStepsDone), [0, 1, 1, 2, 2, 3]);
  assert.deepEqual(["profile", "goals", "persona", "intro", "import", "welcome", "home"].map(migrateOnboardingView), ["basics", "goals", "goals", "intro", "intro", "basics", "basics"]);
});

test("missing items: the industry detail only counts once an industry is chosen; intro reasons are exclusive", () => {
  assert.deepEqual(missingBasics({ birthValid: true, industryValid: false, name: " ", primaryIndustryId: "", contacts: {} }), ["name", "industry", "contact"]);
  assert.deepEqual(missingBasics({ birthValid: false, industryValid: false, name: "a", primaryIndustryId: "other", contacts: { lineId: "a-line" } }), ["birthDate", "industryDetail"]);
  const basic = { birthValid: true, industryValid: true, name: "a", primaryIndustryId: "other" };
  for (const contacts of [{ lineId: "a-line" }, { wechatId: "a-wechat" }, { email: "a@example.com" }, { phone: "+81 90 1234 5678" }]) {
    assert.deepEqual(missingBasics({ ...basic, contacts }), []);
  }
  assert.deepEqual(missingBasics({ ...basic, contacts: { email: "bad", phone: "bad" } }), ["contact"]);
  assert.deepEqual(missingBasics({ birthValid: true, contacts: {}, industryValid: false, legacyRepair: true, name: "a", primaryIndustryId: "" }), ["industry", "industryDetail"], "the repair page lists both industry items");
  assert.deepEqual(missingIntro({ bio: "", bioOver: false, generating: true, headlineOver: false }), ["introGenerating"]);
  assert.deepEqual(missingIntro({ bio: " ", bioOver: false, generating: false, headlineOver: false }), ["introEmpty"]);
  assert.deepEqual(missingIntro({ bio: "x", bioOver: true, generating: false, headlineOver: false }), ["introOver"]);
  assert.deepEqual(missingIntro({ bio: "x", bioOver: false, generating: false, headlineOver: false }), []);
});

test("AI seek labels map back to seek options in either language", () => {
  assert.ok(SEEK_OPTIONS.length >= 20);
  const mapped = seekOptionsFromLabels(["Investors", "渠道合作伙伴", "不存在的标签", "投资人"]);
  assert.deepEqual(mapped.map(option => option.zh), ["投资人", "渠道合作伙伴"]);
});

test("relationship goal text is 正文（期限） only — no direction-chip prefix", () => {
  assert.equal(composeRelationshipGoal({ text: " 找到 5 家试用企业 ", horizon: "quarter" }, "zh"), "找到 5 家试用企业（3 个月内）");
  assert.equal(composeRelationshipGoal({ text: "Raise funding", horizon: "year" }, "en"), "Raise funding (Within 1 year)");
  assert.equal(composeRelationshipGoal({ text: "", horizon: "month" }, "zh"), "");
});

test("tag helpers respect limits and de-duplicate custom tags", () => {
  assert.deepEqual(toggleValue(["a", "b"], "c", 2), ["a", "b"]);
  assert.deepEqual(toggleValue(["a", "b"], "a", 2), ["b"]);
  assert.deepEqual(addCustomValue(["AI Agent"], "  ai   agent "), ["AI Agent"]);
  assert.deepEqual(addCustomValue([], "  会议 纪要 "), ["会议 纪要"]);
  assert.deepEqual(addCustomValue(["x"], "y", 1), ["x"]);
});

test("gate target is the onboarding route and keeps a safe next", () => {
  assert.equal(profileOnboardingFlowPath("/app/contacts?from=x"), "/app/profile/onboarding?next=%2Fapp%2Fcontacts%3Ffrom%3Dx");
  assert.equal(profileOnboardingFlowPath("/app/profile/onboarding"), "/app/profile/onboarding?next=%2Fapp%2Fhome");
});

test("before the first read comes back no step is drawn — only the page's skeleton, with log out", () => {
  const html = renderToStaticMarkup(<OnboardingFlow actorKey="u1" cardScanAvailable next="/app/home" todayIso="2026-09-26" />);
  assert.match(html, /data-onboarding-loading/);
  assert.match(html, /退出登录/);
  assert.doesNotMatch(html, /先从你开始|onb-name|data-onboarding-view|名片与基本信息|只填一次|data-onboarding-next/);
});

test("a reopened page lands straight on the step the server knows, without drawing step 1 first", async (t) => {
  stubWindow(t, new Map());
  stubProfileApi(t, "寻找投资", { secondaryIndustryId: "other.other" }, 1);
  const drawn: string[] = [];
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<OnboardingFlow actorKey="u-reopen" cardScanAvailable next="/app/home" todayIso="2026-09-28" />); drawn.push(JSON.stringify(root.toJSON() ?? "")); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  drawn.push(JSON.stringify(root.toJSON()));
  assert.ok(drawn.every(output => !output.includes("onb-name")), "step 1 never appears");
  assert.equal(root.root.findAll(node => node.props["data-onboarding-view"] === "goals").length, 1);
  act(() => root.unmount());
});

test("a failed first read says so instead of showing an empty form", async (t) => {
  stubWindow(t, new Map());
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: false }, { status: 503 }));
  const root = await mountFlow("u-read-fail");
  assert.equal(root.root.findAll(node => typeof node.type === "string" && node.props.role === "alert").length, 1);
  assert.equal(root.root.findAll(node => node.props.id === "onb-name").length, 0);
  act(() => root.unmount());
});

test("the first screen: card scan first, the once-only notice, log out instead of 稍后设置, no skip and no app nav", async (t) => {
  stubWindow(t, new Map());
  stubProfileApi(t, "", { assumeComplete: false, displayName: "" });
  const textIn = (root: ReactTestRenderer) => root.root.findAll(node => typeof node.type === "string").flatMap(node => node.children.filter((child): child is string => typeof child === "string")).join("|");
  const root = await mountFlow("u-first");
  const html = textIn(root);
  for (const label of ["名片与基本信息", "目标与强项", "自我介绍", "约 1 分钟", "退出登录", "把名片图片拖到这里", "用手机拍（二维码）", "先从你开始", "只填一次，之后参加的每场活动都会用它", "扫一下自己的名片，大部分内容会自动填好。"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /稍后设置|跳过|导入名片/);
  act(() => root.unmount());
});

test("saved goal text round-trips into the editor; old chip-prefixed text keeps every word", () => {
  const draft = { text: "把产品推到日本：先找 5 家试用", horizon: "quarter" as const };
  assert.deepEqual(parseRelationshipGoal(composeRelationshipGoal(draft, "zh")), draft);
  const en = { text: "Close a seed round", horizon: "year" as const };
  assert.deepEqual(parseRelationshipGoal(composeRelationshipGoal(en, "en")), en);
  // W0002 前引导写出的「方向、方向：正文（本季度）」：前缀并入正文，期限映射到 3 个月内
  assert.deepEqual(parseRelationshipGoal("寻找合作伙伴、开拓新市场：把产品推到日本（本季度）"), { text: "寻找合作伙伴、开拓新市场：把产品推到日本", horizon: "quarter" });
  // 个人中心手写的目标（无期限）：整段保留
  assert.deepEqual(parseRelationshipGoal("三个月内认识 3 位日本渠道伙伴"), { text: "三个月内认识 3 位日本渠道伙伴", horizon: "" });
});

// ── 设目标步接线（D7）：同一个编辑器、没有方向 chip、保存写「正文（期限）」 ──

function stubWindow(t: { after: (fn: () => void) => void }, store: Map<string, string>) {
  const assignments: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      location: { assign(href: string) { assignments.push(href); } },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => { store.delete(key); },
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
      removeEventListener() {},
      scrollTo() {},
      scrollY: 0,
      clearTimeout,
      setTimeout,
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete (globalThis as { window?: unknown }).window;
  });
  return assignments;
}

function stubProfileApi(t: { mock: { method: (target: object, name: string, impl: (...args: never[]) => unknown) => unknown } }, relationshipGoal: string, extra: Record<string, unknown> = {}, initialConfirmed = 0, introFailureMessage?: string, introFailureCode = "MODEL_REQUEST_FAILED", deferFailures = 0) {
  const puts: Record<string, unknown>[] = [];
  const commands: Record<string, unknown>[] = [];
  const inferences: Record<string, unknown>[] = [];
  const seeks: Record<string, unknown>[] = [];
  let progressReads = 0;
  let profile: Record<string, unknown> = { displayName: "张三", handles: { wechatId: "zhang" }, relationshipGoal, offering: [], seeking: [], topics: [], bio: "", headline: "", updatedAt: "2026-09-28T00:00:00.000Z", ...extra };
  let mutationId: string | undefined;
  let revision = 0;
  let flow: Record<string, unknown> | null = initialConfirmed ? { version: 1, lastConfirmedScreen: initialConfirmed, currentScreen: initialConfirmed + 1, deferred: false, finishedAt: extra.finishedAt ?? null, revision: "flow:1" } : null;
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/profile/onboarding-progress?view=setup" && !init?.method) {
      progressReads += 1;
      return Response.json({ success: true, data: { progress: flow, legacyRepair: extra.legacyRepair === true } });
    }
    if (url === "/api/profile/onboarding-progress" && !init?.method) { progressReads += 1; return Response.json({ success: true, data: flow }); }
    if (url === "/api/profile/onboarding-progress" && init?.method === "POST") {
      const command = JSON.parse(String(init.body)) as { action: string; screen?: number };
      commands.push(command);
      if (command.action === "defer" && deferFailures-- > 0) return Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }, { status: 503 });
      if (command.action === "initialize") flow ??= { version: 1, lastConfirmedScreen: 0, currentScreen: 1, deferred: false, finishedAt: null, revision: "flow:1" };
      if (command.action === "confirm" && flow) flow = { ...flow, lastConfirmedScreen: command.screen, currentScreen: (command.screen ?? 0) + 1, revision: `flow:${++revision + 1}` };
      if (command.action === "finish_repair") {
        flow = { version: 1, lastConfirmedScreen: 5, currentScreen: null, finishedAt: "2026-09-28T00:00:02.000Z", deferred: false, revision: `flow:${++revision + 1}` };
      }
      if (command.action === "finish" && flow) flow = { ...flow, finishedAt: "2026-09-28T00:00:02.000Z", deferred: false, revision: `flow:${++revision + 1}` };
      if (command.action === "defer" && flow) flow = { ...flow, deferred: true, revision: `flow:${++revision + 1}` };
      return Response.json({ success: true, data: flow });
    }
    if (url === "/api/profile" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      const { expectedUpdatedAt: _expected, mutationId: id, ...fields } = body;
      profile = { ...profile, ...fields, updatedAt: "2026-09-28T00:00:01.000Z" };
      mutationId = String(id);
      return Response.json({ success: true, data: { profile, mutationId, onboarding: { status: "complete", missingFields: [], policyVersion: 1 } } });
    }
    if (url === "/api/profile") {
      return Response.json({ success: true, data: { profile, mutationId, onboarding: { status: profile.secondaryIndustryId || extra.assumeComplete !== false ? "complete" : "incomplete", missingFields: [], policyVersion: 2 } } });
    }
    if (url === "/api/profile/seek-suggestions") { seeks.push(JSON.parse(String(init?.body))); return Response.json({ success: true, data: { suggestions: ["投资人"] } }); }
    if (url === "/api/profile/autofill-inference") { inferences.push(JSON.parse(String(init?.body))); return extra.inference ? Response.json({ success: true, data: extra.inference }) : Response.json({ success: false }, { status: 500 }); }
    if (url === "/api/contact-drafts/business-card/scan") return extra.card ? Response.json({ success: true, data: extra.card }) : Response.json({ success: false, error: { code: "X", message: "server words" } }, { status: 503 });
    if (url === "/api/profile/intro-draft" && !introFailureMessage) return Response.json({ success: true, data: { bio: "写好的介绍。", headline: "一句话" } });
    if (url === "/api/profile/intro-draft" && introFailureMessage) return Response.json({ success: false, error: { code: introFailureCode, message: introFailureMessage } }, { status: 503 });
    return Response.json({ success: false }, { status: 404 });
  });
  return { puts, commands, inferences, seeks, progressReads: () => progressReads, progress: () => flow, saved: () => String(profile.relationshipGoal) };
}

async function mountFlow(actorKey: string, next = "/app/home") {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<OnboardingFlow actorKey={actorKey} cardScanAvailable next={next} todayIso="2026-09-28" />, {
      createNodeMock: () => ({ focus() {}, setSelectionRange() {}, value: "" }),
    });
  });
  // 等 fetchProfile 与草稿恢复落地
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return root;
}

const goalInput = (root: ReactTestRenderer) => root.root.find(node => node.type === "input" && node.props["data-goal-line"] !== undefined);
// Visible text of a host node (icons and tiles are elements, so only string children count).
const textOf = (node: { children: ReadonlyArray<unknown> }): string => node.children.map(child => typeof child === "string" ? child : child && typeof child === "object" && "children" in child ? textOf(child as { children: ReadonlyArray<unknown> }) : "").join("");
const DRAFT_KEY = (actor: string) => `orbit.onboarding.v1:${actor}`;

test("goals step preserves an old local draft and presents six choices with no default deadline", async (t) => {
  const store = new Map([[DRAFT_KEY("u-old"), JSON.stringify({ view: "goals", goals: ["寻找合作伙伴", "开拓新市场"], focus: "先找 5 家试用企业", horizon: "本季度", introRegenerations: 0, cardBatchId: null })]]);
  stubWindow(t, store);
  stubProfileApi(t, "", {}, 1);
  const root = await mountFlow("u-old");

  assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "02 目标与强项").length, 1);
  assert.equal(root.root.findAll(node => node.type === "button" && node.props["data-goal"] !== undefined).length, 6);
  assert.equal(goalInput(root).props.value, "寻找合作伙伴、开拓新市场：先找 5 家试用企业");
  assert.match(JSON.stringify(readOnboardingDraft("u-old")), /寻找合作伙伴、开拓新市场：先找 5 家试用企业/);
  act(() => root.unmount());
});

test("without a local goal draft the goals step reads the saved text back, including old chip-prefixed goals", async (t) => {
  stubWindow(t, new Map([[DRAFT_KEY("u-saved"), JSON.stringify({ view: "goals" })]]));
  stubProfileApi(t, "寻找合作伙伴、开拓新市场：把产品推到日本市场（本季度）", {}, 1);
  const root = await mountFlow("u-saved");
  assert.equal(goalInput(root).props.value, "寻找合作伙伴、开拓新市场：把产品推到日本市场（本季度）");
  act(() => root.unmount());
});

test("a max-length legacy draft (3 × 24-char chips + 80-char focus + 本季度) migrates without truncation", (t) => {
  const chips = ["甲".repeat(24), "乙".repeat(24), "丙".repeat(24)];
  const focus = "丁".repeat(80);
  stubWindow(t, new Map([[DRAFT_KEY("u-long"), JSON.stringify({ view: "goals", goals: chips, focus, horizon: "本季度" })]]));
  const draft = readOnboardingDraft("u-long");
  const expected = `${chips.join("、")}：${focus}`;
  assert.equal(Array.from(expected).length, 155);
  assert.equal(draft?.goalText, expected);
  assert.equal(draft?.horizon, "quarter");
  // 同一段旧文字作为已保存目标读回也不截断
  assert.deepEqual(parseRelationshipGoal(`${expected}（本季度）`), { text: expected, horizon: "quarter" });
});

test("onboarding goal choices and sentence read back after reload without a local draft", async (t) => {
  const store = new Map<string, string>();
  stubWindow(t, store);
  const api = stubProfileApi(t, "", {
    birthDate: "1990-01-02",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
  });
  const clickText = async (root: ReactTestRenderer, text: string) => {
    const button = root.root.findAll(node => node.type === "button" && (text === "下一步" ? node.props["data-onboarding-next"] === "" : textOf(node) === text))[0];
    assert.ok(button, text);
    await act(async () => { await button.props.onClick(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  // 无草稿 → 基本信息（资料已齐）下一步 → 目标步
  const enterGoals = async (root: ReactTestRenderer) => {
    await clickText(root, "下一步");
    assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "02 目标与强项").length, 1);
  };

  const first = await mountFlow("u-reload");
  await enterGoals(first);
  const choice = first.root.findAll(node => node.type === "button" && node.props["data-goal"] === "partners")[0];
  assert.ok(choice);
  await act(async () => { choice.props.onClick(); });
  await act(async () => { goalInput(first).props.onChange({ target: { value: "先谈大阪的两家供应商" } }); });
  await clickText(first, "下一步");
  assert.equal(api.puts.at(-1)?.relationshipGoal, "寻找合作伙伴：先谈大阪的两家供应商");
  assert.equal(api.saved(), "寻找合作伙伴：先谈大阪的两家供应商");
  act(() => first.unmount());

  // 刷新：本地草稿清空，接口返回刚保存的值
  store.clear();
  const second = await mountFlow("u-reload");
  assert.equal(second.root.findAll(node => node.props["data-screen-label"] === "03 自我介绍").length, 1, "② confirms screens 2 and 3");
  await clickText(second, "返回");
  assert.equal(goalInput(second).props.value, "先谈大阪的两家供应商");
  assert.equal(second.root.findAll(node => node.type === "button" && node.props["aria-pressed"] === true && node.props["data-goal"] === "partners").length, 1);
  act(() => second.unmount());
});

test("intro counter follows the shared bio rule: 200 for non-CJK text, 80 once CJK appears (0127)", async () => {
  const { bioCounter } = await import("../../app/(app)/app/orbit-2026/onboarding/onboarding-model");
  assert.deepEqual(bioCounter(""), { count: 0, limit: 200, over: false });
  assert.deepEqual(bioCounter(`  ${"a".repeat(180)}  `), { count: 180, limit: 200, over: false });
  assert.deepEqual(bioCounter("a".repeat(201)), { count: 201, limit: 200, over: true });
  assert.deepEqual(bioCounter("界".repeat(81)), { count: 81, limit: 80, over: true });
  assert.deepEqual(bioCounter(`${"a".repeat(90)}界`), { count: 91, limit: 80, over: true });
});

test("intro failure offers a manual draft without exposing provider configuration", async (t) => {
  stubWindow(t, new Map([[DRAFT_KEY("u-intro-error"), JSON.stringify({ view: "intro" })]]));
  stubProfileApi(t, "Find partners", {}, 3, "No model provider API key is configured. Set GEMINI_API_KEY.");
  const root = await mountFlow("u-intro-error");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const output = JSON.stringify(root.toJSON());
  assert.match(output, /可以点「重试」再生成一次，或直接在下面写几句/);
  assert.doesNotMatch(output, /GEMINI_API_KEY|No model provider API key/);
  act(() => root.unmount());
});

test("intro quota exhaustion offers manual writing without another retry", async (t) => {
  stubWindow(t, new Map([[DRAFT_KEY("u-intro-limit"), JSON.stringify({ view: "intro" })]]));
  stubProfileApi(t, "Find partners", {}, 3, "Quota error from server", "INTRO_LIMIT_REACHED");
  const root = await mountFlow("u-intro-limit");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const output = JSON.stringify(root.toJSON());
  assert.match(output, /介绍草稿的 3 次生成额度已用完/);
  assert.doesNotMatch(output, /Quota error from server/);
  assert.equal(root.root.findAll(node => node.type === "button" && textOf(node) === "重试").length, 0);
  act(() => root.unmount());
});

const settleFlow = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
const nextButton = (root: ReactTestRenderer) => root.root.find(node => node.type === "button" && node.props["data-onboarding-next"] === "");
const button = (root: ReactTestRenderer, text: string) => root.root.findAll(node => node.type === "button" && textOf(node) === text)[0]!;
const click = async (root: ReactTestRenderer, target: ReactTestInstance) => { await act(async () => { await target.props.onClick(); }); await settleFlow(); };
const alerts = (root: ReactTestRenderer) => root.root.findAll(node => typeof node.type === "string" && node.props.role === "alert").map(node => textOf(node).trim());
const field = (root: ReactTestRenderer, id: string) => root.root.findAll(node => typeof node.type === "string" && node.props.id === id)[0];
const output = (root: ReactTestRenderer) => JSON.stringify(root.toJSON());
test("a migrated account completes just its missing basics and goes back to the event", async (t) => {
  const assignments = stubWindow(t, new Map());
  for (const [name, value] of Object.entries({
    document: { activeElement: null, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const api = stubProfileApi(t, "已有目标", {
    legacyRepair: true, assumeComplete: false, displayName: "", primaryIndustryId: "technology_internet",
    bio: "已有简介", organization: "已有公司", handles: { email: "legacy@example.test", wechatId: "existing" },
  }, 3);
  const target = "/app/events/event-a?from=mine";
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<OnboardingFlow actorKey="u-legacy-repair" cardScanAvailable next={target} todayIso="2026-09-28" />);
  });
  await settleFlow();
  // UR-R：与引导 ① 同一版式；顶部一句来由；行业平铺成单选块，选后平铺细分（手机是底部面板）。
  assert.match(output(root), /确认资料/);
  assert.match(output(root), /已沿用你之前活动报名的资料。/);
  assert.match(textOf(nextButton(root)), /保存并继续/);
  assert.equal(field(root, "onb-industry")?.props.role, "radiogroup");
  assert.equal(button(root, "科技与互联网")!.props["aria-checked"], true);
  assert.equal(field(root, "onb-email"), undefined);
  assert.equal(field(root, "onb-company"), undefined);
  assert.doesNotMatch(output(root), /目标与强项|扫码|把名片图片拖到这里/);
  await act(async () => { field(root, "onb-name")!.props.onChange({ target: { value: "林晓" } }); });
  await click(root, button(root, "人工智能与数据")!);
  assert.equal(button(root, "人工智能与数据")!.props["aria-checked"], true);
  await click(root, button(root, "科技与互联网")!);
  assert.equal(button(root, "人工智能与数据")!.props["aria-checked"], true, "picking the same industry keeps the detail");
  assert.match(output(root), /科技与互联网 › 人工智能与数据/, "the preview shows the industry and its detail");
  await click(root, nextButton(root));
  const writes = api.puts.map(({ expectedUpdatedAt, mutationId, ...fields }) => fields);
  assert.deepEqual(writes, [{ displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }]);
  assert.deepEqual(api.commands.map(command => [command.action, command.expectedRevision]), [["finish_repair", "flow:1"]]);
  assert.deepEqual(api.inferences, []);
  assert.deepEqual(assignments, [target]);
  act(() => root.unmount());
});

const CARD = {
  draft: { displayName: "佐藤 健一", email: "sato@minatolink.example", organization: "株式会社ミナトリンク", phone: "03-5555-0142", role: "代表取締役 CEO" },
  ocr: { structuredExtraction: { primaryIndustryId: "technology_internet", regionCity: "Tokyo", regionCountryCode: "JP", secondaryIndustryId: "technology_internet.enterprise_software", seniorityLevel: "c_level" } },
};
const INFERENCE = { offering: ["资本政策的经验", "起业支援"], primaryIndustryId: null, secondaryIndustryId: null, seniorityLevel: "c_level", status: "ready", topics: ["SaaS 与企业服务"] };
const BLANK = { assumeComplete: false, displayName: "", handles: { wechatId: "keep-me" } };
async function scanCard(root: ReactTestRenderer) {
  const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0]!;
  await act(async () => { input.props.onChange({ target: { files: [new File(["x"], "card.png", { type: "image/png" })], value: "" } }); });
  await settleFlow();
}

test("次へ is never disabled: missing items are named, marked for screen readers, and clear once filled", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", BLANK);
  const root = await mountFlow("u-missing");
  assert.ok(!nextButton(root).props.disabled);
  await click(root, nextButton(root));
  assert.deepEqual(alerts(root), ["还差 2 项：姓名、行业"]);
  assert.equal(field(root, "onb-name")!.props["aria-invalid"], true);
  assert.equal(field(root, "onb-name")!.props["aria-describedby"], "onb-name-msg");
  assert.equal(textOf(field(root, "onb-name-msg")!), "请填写姓名");
  assert.equal(field(root, "onb-industry")!.props["aria-invalid"], true);
  assert.equal(api.puts.length, 0, "nothing is saved while something is missing");
  await act(async () => { field(root, "onb-name")!.props.onChange({ target: { value: "张三" } }); });
  assert.deepEqual(alerts(root), ["还差 1 项：行业"]);
  await act(async () => { field(root, "onb-industry")!.props.onChange({ target: { value: "technology_internet" } }); });
  assert.deepEqual(alerts(root), ["还差 1 项：细分行业"]);
  await act(async () => { field(root, "onb-industry-detail")!.props.onChange({ target: { value: "technology_internet.ai_data" } }); });
  assert.deepEqual(alerts(root), []);
  act(() => root.unmount());
});

test("a completed basic profile still needs one contact method before continuing", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { displayName: "张三", primaryIndustryId: "other", secondaryIndustryId: "other.other", handles: {} });
  const root = await mountFlow("u-contact");
  await click(root, nextButton(root));
  assert.equal(api.puts.length, 0);
  // UR-C：一种都没填 → 组下「填写其中一种即可」；LINE、WeChat 直接给出，邮箱电话收在「＋」里（点开后才有栏位）。
  assert.ok(alerts(root).some(alert => alert.includes("填写其中一种即可")));
  assert.ok(["onb-lineId", "onb-wechatId"].every(id => field(root, id)));
  assert.ok(["onb-email", "onb-phone"].every(id => !field(root, id)));
  await act(async () => { field(root, "onb-lineId")!.props.onChange({ target: { value: "line-handle" } }); });
  await click(root, nextButton(root));
  assert.deepEqual(api.puts[0]?.handles, { lineId: "line-handle" });
  act(() => root.unmount());
});

test("contact: an email in the wrong format marks only that field and says so; the group opens by itself when email or phone has a value", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { displayName: "张三", primaryIndustryId: "other", secondaryIndustryId: "other.other", handles: { email: "zhang@example" } });
  const root = await mountFlow("u-contact-format");
  assert.ok(field(root, "onb-email"), "a stored email opens the email / phone pair");
  await click(root, nextButton(root));
  assert.equal(api.puts.length, 0);
  assert.equal(field(root, "onb-email")!.props["aria-invalid"], true);
  assert.notEqual(field(root, "onb-lineId")!.props["aria-invalid"], true, "LINE is not marked when the problem is the email format");
  assert.ok(alerts(root).some(alert => alert.includes("邮箱格式")));
  act(() => root.unmount());
});

test("scan: printed items are 来自名片, the industry is AI 推断, a user edit drops the mark, and handles merge instead of replacing", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { ...BLANK, card: CARD, inference: INFERENCE });
  const root = await mountFlow("u-scan");
  await scanCard(root);
  assert.equal(field(root, "onb-name")!.props.value, "佐藤 健一");
  assert.equal(field(root, "onb-email")!.props.value, "sato@minatolink.example");
  assert.match(output(root), /名片读到 6 项，AI 推断 3 项/);
  const count = (text: string) => root.root.findAll(node => typeof node.type === "string" && node.children.length === 1 && node.children[0] === text).length;
  assert.equal(count("来自名片"), 6);
  assert.equal(count("AI 推断"), 3);
  assert.deepEqual([field(root, "onb-seniority")!.props.value, field(root, "onb-place")!.props.value], ["c_level", "日本 · 东京"]);
  await act(async () => { field(root, "onb-company")!.props.onChange({ target: { value: "ミナトリンク" } }); });
  assert.equal(count("来自名片"), 5);
  await act(async () => { field(root, "onb-seniority")!.props.onChange({ target: { value: "founder" } }); });
  assert.equal(count("AI 推断"), 2, "changing the level drops its mark");
  assert.deepEqual(api.inferences[0], { displayName: "佐藤 健一", language: "zh", organization: "株式会社ミナトリンク", primaryIndustryId: "technology_internet", role: "代表取締役 CEO", secondaryIndustryId: "technology_internet.enterprise_software" });
  assert.equal(api.puts.length, 0, "a scan only fills the form");
  await click(root, nextButton(root));
  const saved = api.puts[0]!;
  assert.deepEqual(saved.handles, { email: "sato@minatolink.example", phone: "03-5555-0142", wechatId: "keep-me" });
  assert.equal(saved.seniorityLevel, "founder");
  assert.match(String(saved.homeMarket), /东京/);
  assert.equal(saved.secondaryIndustryId, "technology_internet.enterprise_software");
  assert.deepEqual(api.commands.map(command => [command.action, command.screen, command.contactMethodsConfirmed]), [["initialize", undefined, undefined], ["confirm", 1, true]]);
  // ② carries the AI's picks, marked until the person changes that group.
  assert.equal(root.root.findAll(node => node.props["data-onboarding-view"] === "goals").length, 1);
  assert.match(output(root), /资本政策的经验/);
  assert.ok(count("AI 推断") >= 2);
  await click(root, button(root, "资本政策的经验"));
  await click(root, button(root, "起业支援"));
  assert.doesNotMatch(output(root), /资本政策的经验/);
  act(() => root.unmount());
});

test("level and place are optional: empty ones never block 下一步 and are saved as cleared", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { ...BLANK, displayName: "张三", homeMarket: "大阪", primaryIndustryId: "other", secondaryIndustryId: "other.other", seniorityLevel: "manager" });
  const root = await mountFlow("u-optional");
  assert.deepEqual([field(root, "onb-seniority")!.props.value, field(root, "onb-place")!.props.value], ["manager", "大阪"]);
  await act(async () => { field(root, "onb-seniority")!.props.onChange({ target: { value: "" } }); });
  await act(async () => { field(root, "onb-place")!.props.onChange({ target: { value: " " } }); });
  await click(root, nextButton(root));
  assert.deepEqual(alerts(root), []);
  assert.deepEqual([api.puts[0]!.seniorityLevel, api.puts[0]!.homeMarket], [null, ""]);
  act(() => root.unmount());
});

test("scan failure keeps the form usable and never shows the server's words", async (t) => {
  stubWindow(t, new Map());
  stubProfileApi(t, "", BLANK);
  const root = await mountFlow("u-scan-fail");
  await scanCard(root);
  assert.match(alerts(root)[0]!, /名片没有识别出来/);
  assert.doesNotMatch(output(root), /server words/);
  assert.ok(!field(root, "onb-name")!.props.disabled);
  act(() => root.unmount());
});

test("without a scan the company is asked about once on 下一步, and the industry the person picked stays", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { ...BLANK, displayName: "张三", inference: { ...INFERENCE, primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.banking" }, organization: "港联", primaryIndustryId: "other", secondaryIndustryId: "other.other" });
  const root = await mountFlow("u-late");
  await click(root, nextButton(root));
  assert.equal(api.puts[0]!.secondaryIndustryId, "other.other");
  assert.equal(api.inferences.length, 1, "without a scan the company is enough to ask once");
  act(() => root.unmount());
});

test("② goals: no goal is named at the group; choosing one clears it, asks once for seek ideas, and those join only on click", async (t) => {
  stubWindow(t, new Map());
  const api = stubProfileApi(t, "", { secondaryIndustryId: "other.other" }, 1);
  const root = await mountFlow("u-goals");
  await click(root, nextButton(root));
  assert.deepEqual(alerts(root), ["还差 1 项：目标"]);
  assert.match(output(root), /请至少选 1 个目标/);
  const goal = (id: string) => root.root.findAll(node => node.type === "button" && node.props["data-goal"] === id)[0]!;
  await click(root, goal("funding"));
  assert.deepEqual(alerts(root), []);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 800)); });
  assert.equal(api.seeks.length, 1);
  assert.equal(api.seeks[0]!.goal, "寻找投资");
  const candidate = root.root.findAll(node => node.type === "button" && node.props["data-ai-candidate"] === "")[0]!;
  assert.equal(textOf(candidate), "投资人");
  await click(root, candidate);
  await click(root, nextButton(root));
  assert.deepEqual(api.puts.at(-1)!.seeking, ["投资人"]);
  assert.equal(api.puts.at(-1)!.relationshipGoal, "寻找投资");
  assert.deepEqual(api.commands.filter(command => command.action === "confirm").map(command => command.screen), [2, 3]);
  act(() => root.unmount());
});

test("③ intro: empty and over-long introductions say why; 就用这份开始 confirms 4 and 5, finishes and goes to next", async (t) => {
  const assignments = stubWindow(t, new Map());
  const api = stubProfileApi(t, "寻找投资", { bio: "介".repeat(81), headline: "一句话", secondaryIndustryId: "other.other" }, 3);
  const root = await mountFlow("u-intro", "/app/events/ev-1/register");
  await click(root, nextButton(root));
  assert.deepEqual(alerts(root), ["自我介绍超过字数上限"]);
  await click(root, button(root, "直接编辑"));
  await act(async () => { field(root, "onb-intro")!.props.onChange({ target: { value: "" } }); });
  assert.deepEqual(alerts(root), ["还差 1 项：自我介绍"]);
  await act(async () => { field(root, "onb-intro")!.props.onChange({ target: { value: "做企业软件。" } }); });
  assert.deepEqual(alerts(root), []);
  await click(root, nextButton(root));
  assert.deepEqual(api.commands.map(command => command.screen ?? command.action), [4, 5, "finish"]);
  assert.deepEqual(assignments, ["/app/events/ev-1/register"]);
  act(() => root.unmount());
});

test("a finished flow whose required fields went missing stays on step 1 and leaves after saving them", async (t) => {
  const assignments = stubWindow(t, new Map());
  const api = stubProfileApi(t, "寻找投资", { assumeComplete: false, finishedAt: "2026-09-01T00:00:00.000Z", secondaryIndustryId: "" }, 5);
  const root = await mountFlow("u-finished");
  assert.equal(root.root.findAll(node => node.props["data-onboarding-view"] === "basics").length, 1);
  assert.deepEqual(assignments, []);
  await act(async () => { field(root, "onb-industry")!.props.onChange({ target: { value: "other" } }); });
  await act(async () => { field(root, "onb-industry-detail")!.props.onChange({ target: { value: "other.other" } }); });
  await click(root, nextButton(root));
  assert.equal(api.puts.length, 1);
  assert.deepEqual(assignments, ["/app/home"]);
  act(() => root.unmount());
});

test("log out stores this step's input on the server first, without moving the progress", async (t) => {
  stubWindow(t, new Map());
  // next-auth's signOut opens a BroadcastChannel, which would keep the test process alive.
  const channel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: class { addEventListener() {} close() {} postMessage() {} removeEventListener() {} } });
  t.after(() => { if (channel) Object.defineProperty(globalThis, "BroadcastChannel", channel); });
  const api = stubProfileApi(t, "", BLANK);
  const root = await mountFlow("u-logout");
  await act(async () => { field(root, "onb-name")!.props.onChange({ target: { value: "张三" } }); });
  await act(async () => { field(root, "onb-company")!.props.onChange({ target: { value: "港联" } }); });
  await act(async () => { await root.root.findAll(node => node.type === "button" && node.props["data-onboarding-logout"] === "")[0]!.props.onClick(); await new Promise(resolve => setTimeout(resolve, 5)); });
  assert.deepEqual([api.puts[0]?.displayName, api.puts[0]?.organization, "primaryIndustryId" in (api.puts[0] ?? {})], ["张三", "港联", false]);
  assert.equal(api.commands.length, 0);
  act(() => root.unmount());
});

test("an old five-step draft moves over without losing what was typed; 已自动保存 only after something was saved", async (t) => {
  const saved = (root: ReactTestRenderer) => output(root).includes("已自动保存");
  const store = new Map([[DRAFT_KEY("u-old5"), JSON.stringify({ view: "profile", goalText: "找投资", fields: { basic: { birthDate: "", company: "港联", name: "张三", primaryIndustryId: "", secondaryIndustryId: "", title: "总经理" }, offer: ["客户引荐"], seek: [], topics: [], bio: "草稿介绍" } })]]);
  stubWindow(t, store);
  stubProfileApi(t, "", BLANK);
  const root = await mountFlow("u-old5");
  assert.equal(field(root, "onb-company")!.props.value, "港联");
  assert.equal(saved(root), true);
  const migrated = readOnboardingDraft("u-old5")!;
  assert.equal(migrated.view, "basics");
  assert.deepEqual([migrated.goalText, migrated.fields?.offer, migrated.fields?.bio, migrated.fields?.basic?.email], ["找投资", ["客户引荐"], "草稿介绍", ""]);
  act(() => root.unmount());

  stubWindow(t, new Map());
  const fresh = await mountFlow("u-fresh");
  assert.equal(saved(fresh), false);
  await act(async () => { field(fresh, "onb-company")!.props.onChange({ target: { value: "港联" } }); });
  assert.equal(saved(fresh), true);
  act(() => fresh.unmount());

  stubWindow(t, new Map());
  Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: () => null, removeItem() {}, setItem() { throw new Error("blocked"); } } });
  const blocked = await mountFlow("u-blocked");
  await act(async () => { field(blocked, "onb-company")!.props.onChange({ target: { value: "港联" } }); });
  assert.equal(saved(blocked), false, "storage refused the draft");
  act(() => blocked.unmount());
});
