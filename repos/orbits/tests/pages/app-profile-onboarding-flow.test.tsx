import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { OnboardingFlow } from "../../app/(app)/app/orbit-2026/onboarding/onboarding-flow";
import {
  ONBOARDING_STEPS,
  SEEK_OPTIONS,
  addCustomValue,
  composeRelationshipGoal,
  parseRelationshipGoal,
  readOnboardingDraft,
  seekOptionsFromLabels,
  toggleValue,
} from "../../app/(app)/app/orbit-2026/onboarding/onboarding-model";
import { profileOnboardingFlowPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

test("onboarding has five steps with the AI introduction between persona and import", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["profile", "goals", "persona", "intro", "import"]);
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

test("b1 A3: the first screen is the basics form under the five-step header — no welcome page, no app nav", () => {
  const html = renderToStaticMarkup(<OnboardingFlow actorKey="u1" cardScanAvailable next="/app/home" todayIso="2026-09-26" />);
  assert.match(html, /先从你开始/);
  for (const label of ["基本信息", "目标", "优势与需求", "自我介绍", "导入名片"]) assert.ok(html.includes(label), label);
  assert.match(html, /稍后设置/);
  assert.match(html, /对方看到的你/);
  assert.doesNotMatch(html, /欢迎来到 Orbit|开始设置|>iOrbit<|>活动<|>人脉</);
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
  let progressReads = 0;
  let profile: Record<string, unknown> = { displayName: "张三", relationshipGoal, offering: [], seeking: [], topics: [], bio: "", headline: "", updatedAt: "2026-09-28T00:00:00.000Z", ...extra };
  let mutationId: string | undefined;
  let revision = 0;
  let flow: Record<string, unknown> | null = initialConfirmed ? { version: 1, lastConfirmedScreen: initialConfirmed, currentScreen: initialConfirmed + 1, deferred: false, finishedAt: null, revision: "flow:1" } : null;
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/profile/onboarding-progress" && !init?.method) { progressReads += 1; return Response.json({ success: true, data: flow }); }
    if (url === "/api/profile/onboarding-progress" && init?.method === "POST") {
      const command = JSON.parse(String(init.body)) as { action: string; screen?: number };
      commands.push(command);
      if (command.action === "defer" && deferFailures-- > 0) return Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }, { status: 503 });
      if (command.action === "initialize") flow ??= { version: 1, lastConfirmedScreen: 0, currentScreen: 1, deferred: false, finishedAt: null, revision: "flow:1" };
      if (command.action === "confirm" && flow) flow = { ...flow, lastConfirmedScreen: command.screen, currentScreen: (command.screen ?? 0) + 1, revision: `flow:${++revision + 1}` };
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
      return Response.json({ success: true, data: { profile, mutationId, onboarding: { status: "complete", missingFields: [], policyVersion: 1 } } });
    }
    if (url === "/api/profile/seek-suggestions") return Response.json({ success: true, data: { suggestions: [] } });
    if (url === "/api/profile/intro-draft" && introFailureMessage) return Response.json({ success: false, error: { code: introFailureCode, message: introFailureMessage } }, { status: 503 });
    return Response.json({ success: false }, { status: 404 });
  });
  return { puts, commands, progressReads: () => progressReads, progress: () => flow, saved: () => String(profile.relationshipGoal) };
}

async function mountFlow(actorKey: string) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<OnboardingFlow actorKey={actorKey} cardScanAvailable next="/app/home" todayIso="2026-09-28" />, {
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

  assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "03 目标").length, 1);
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

test("fifth-screen scan and CSV import carry the exact return to unfinished onboarding", async (t) => {
  stubWindow(t, new Map());
  stubProfileApi(t, "資金調達", {}, 4);
  const root = await mountFlow("u-import-return");
  const hrefs = root.root.findAll(node => node.type === "a").map(node => node.props.href);
  assert.ok(hrefs.includes("/app/contacts/new/scan?returnTo=%2Fapp%2Fprofile%2Fonboarding%3Fscreen%3D5"));
  assert.ok(hrefs.includes("/app/contacts/new/import?method=csv&returnTo=%2Fapp%2Fprofile%2Fonboarding%3Fscreen%3D5"));
  act(() => root.unmount());
});

test("Set up later defers with CAS and readback; failure keeps the step for retry", async (t) => {
  const assignments = stubWindow(t, new Map());
  const api = stubProfileApi(t, "", {}, 1, undefined, "MODEL_REQUEST_FAILED", 1);
  const root = await mountFlow("u-defer-retry");
  const later = () => root.root.findAll(node => node.type === "button" && textOf(node) === "稍后设置")[0]!;
  assert.equal(root.root.findAll(node => node.props["data-onboarding-view"] === "goals").length, 1);
  await act(async () => { await later().props.onClick(); });
  assert.equal(root.root.findAll(node => node.props["data-onboarding-view"] === "goals").length, 1);
  assert.deepEqual(assignments, [], "failed defer does not navigate");
  assert.equal(api.progress()?.deferred, false);
  const readsBeforeRetry = api.progressReads();
  await act(async () => { await later().props.onClick(); });
  assert.deepEqual(assignments, ["/app/home"]);
  assert.equal(api.progress()?.deferred, true);
  assert.ok(api.progressReads() > readsBeforeRetry, "successful write is read back");
  const defers = api.commands.filter(command => command.action === "defer");
  assert.equal(defers.length, 2);
  assert.deepEqual(defers[0], defers[1], "retry reuses the CAS mutation");
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
    const button = root.root.findAll(node => node.type === "button" && textOf(node) === text)[0];
    assert.ok(button, text);
    await act(async () => { await button.props.onClick(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  // 无草稿 → 基本信息（资料已齐）下一步 → 目标步
  const enterGoals = async (root: ReactTestRenderer) => {
    await clickText(root, "下一步");
    assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "03 目标").length, 1);
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
  assert.equal(second.root.findAll(node => node.props["data-screen-label"] === "04 商务画像").length, 1);
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
