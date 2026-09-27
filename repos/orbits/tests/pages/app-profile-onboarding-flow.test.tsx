import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OnboardingFlow } from "../../app/(app)/app/profile/onboarding-0918/onboarding-flow";
import {
  ONBOARDING_STEPS,
  SEEK_OPTIONS,
  addCustomValue,
  composeRelationshipGoal,
  parseRelationshipGoal,
  readOnboardingDraft,
  seekOptionsFromLabels,
  toggleValue,
} from "../../app/(app)/app/profile/onboarding-0918/onboarding-model";
import { firstIncompleteStep } from "../../app/(app)/app/profile/onboarding-0918/onboarding-previews";
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

test("preview clicks fall through to the first unfinished step", () => {
  const done = { profileDone: true, goalsDone: true, personaDone: true, introDone: true };
  assert.equal(firstIncompleteStep({ ...done, profileDone: false }), "profile");
  assert.equal(firstIncompleteStep({ ...done, personaDone: false }), "persona");
  assert.equal(firstIncompleteStep(done), "import");
});

test("gate target is the onboarding route and keeps a safe next", () => {
  assert.equal(profileOnboardingFlowPath("/app/contacts?from=x"), "/app/profile/onboarding?next=%2Fapp%2Fcontacts%3Ffrom%3Dx");
  assert.equal(profileOnboardingFlowPath("/app/profile/onboarding"), "/app/profile/onboarding?next=%2Fapp%2Fhome");
});

test("welcome screen renders the five steps and the real nav (no calendar, no LinkedIn)", () => {
  const html = renderToStaticMarkup(<OnboardingFlow actorKey="u1" cardScanAvailable next="/app/home" todayIso="2026-09-26" />);
  assert.match(html, /欢迎来到 Orbit。/);
  for (const label of ["告诉我们你是谁", "你最近想推进什么", "你能提供什么、在找什么", "iOrbit 帮你写好自我介绍", "带入已有人脉"]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, />iOrbit</);
  assert.match(html, />活动</);
  assert.match(html, />人脉</);
  assert.doesNotMatch(html, /日历|领英|LinkedIn/);
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
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      location: { assign() {} },
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
}

function stubProfileApi(t: { mock: { method: (target: object, name: string, impl: (...args: never[]) => unknown) => unknown } }, relationshipGoal: string, extra: Record<string, unknown> = {}) {
  const puts: Record<string, unknown>[] = [];
  let profile: Record<string, unknown> = { displayName: "张三", relationshipGoal, offering: [], seeking: [], topics: [], bio: "", headline: "", updatedAt: "2026-09-28T00:00:00.000Z", ...extra };
  let mutationId: string | undefined;
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
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
    return Response.json({ success: false }, { status: 404 });
  });
  return { puts, saved: () => String(profile.relationshipGoal) };
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

const goalInput = (root: ReactTestRenderer) => root.root.findByProps({ "aria-label": "你的目标", className: "ge-input" });
const pressed = (root: ReactTestRenderer, className: string) => root.root
  .findAll(node => node.type === "button" && node.props.className === className && node.props["aria-pressed"] === true)
  .map(node => node.props["aria-label"] ?? node.children.join(""));
const DRAFT_KEY = (actor: string) => `orbit.onboarding.v1:${actor}`;

test("goals step uses the shared editor with the reminder and no direction chips; an old local draft folds its chips into the text", async (t) => {
  const store = new Map([[DRAFT_KEY("u-old"), JSON.stringify({ view: "goals", goals: ["寻找合作伙伴", "开拓新市场"], focus: "先找 5 家试用企业", horizon: "本季度", introRegenerations: 0, cardBatchId: null })]]);
  stubWindow(t, store);
  const api = stubProfileApi(t, "");
  const root = await mountFlow("u-old");

  assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "03 目标").length, 1);
  assert.equal(root.root.findAll(node => typeof node.props.className === "string" && /\bob-chip\b/.test(node.props.className)).length, 0, "no direction chips");
  assert.ok(root.root.findAll(node => node.props.className === "ge-reminder").length === 1, "reminder above the editor");
  assert.equal(goalInput(root).props.value, "寻找合作伙伴、开拓新市场：先找 5 家试用企业");
  assert.deepEqual(pressed(root, "btn ge-horizon"), ["3 个月内"]);
  assert.deepEqual(readOnboardingDraft("u-old"), { view: "goals", goalText: "寻找合作伙伴、开拓新市场：先找 5 家试用企业", horizon: "quarter", introRegenerations: 0, cardBatchId: null });

  // 点示例 → 整句替换 + 自动选期限 → 继续 → 保存「正文（期限）」
  const example = root.root.findAll(node => node.type === "button" && node.props.className === "btn ge-example" && node.children.join("") === "＋ 一个月内见 10 位关注我们赛道的投资人")[0];
  assert.ok(example);
  await act(async () => { example.props.onClick(); });
  assert.equal(goalInput(root).props.value, "一个月内见 10 位关注我们赛道的投资人");
  assert.deepEqual(pressed(root, "btn ge-horizon"), ["一个月内"]);
  const next = root.root.findAll(node => node.type === "button" && node.children.join("") === "继续")[0];
  assert.ok(next);
  await act(async () => { await next.props.onClick(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.deepEqual(api.puts.map(body => body.relationshipGoal), ["一个月内见 10 位关注我们赛道的投资人（一个月内）"]);
  assert.equal(api.saved(), "一个月内见 10 位关注我们赛道的投资人（一个月内）");
  act(() => root.unmount());
});

test("without a local goal draft the goals step reads the saved text back, including old chip-prefixed goals", async (t) => {
  stubWindow(t, new Map([[DRAFT_KEY("u-saved"), JSON.stringify({ view: "goals" })]]));
  stubProfileApi(t, "寻找合作伙伴、开拓新市场：把产品推到日本市场（本季度）");
  const root = await mountFlow("u-saved");
  assert.equal(goalInput(root).props.value, "寻找合作伙伴、开拓新市场：把产品推到日本市场");
  assert.deepEqual(pressed(root, "btn ge-horizon"), ["3 个月内"]);
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

test("SC-W0002-04 onboarding: the goal saved on the goals step reads back into the editor after a reload with no local draft", async (t) => {
  const store = new Map<string, string>();
  stubWindow(t, store);
  const api = stubProfileApi(t, "", {
    birthDate: "1990-01-02",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
  });
  const clickText = async (root: ReactTestRenderer, text: string) => {
    const button = root.root.findAll(node => node.type === "button" && node.children.join("") === text)[0];
    assert.ok(button, text);
    await act(async () => { await button.props.onClick(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  // 无草稿 → 欢迎页 → 开始设置 → 关于你（资料已齐）继续 → 目标步
  const enterGoals = async (root: ReactTestRenderer) => {
    await clickText(root, "开始设置");
    await clickText(root, "继续");
    assert.equal(root.root.findAll(node => node.props["data-screen-label"] === "03 目标").length, 1);
  };

  const first = await mountFlow("u-reload");
  await enterGoals(first);
  await act(async () => { goalInput(first).props.onChange({ target: { value: "年内找到 2 家稳定的日本供应商，先谈大阪" } }); });
  const yearCard = first.root.findAll(node => node.type === "button" && node.props["aria-label"] === "一年内")[0];
  await act(async () => { yearCard.props.onClick(); });
  await clickText(first, "继续");
  assert.equal(api.puts.at(-1)?.relationshipGoal, "年内找到 2 家稳定的日本供应商，先谈大阪（一年内）");
  assert.equal(api.saved(), "年内找到 2 家稳定的日本供应商，先谈大阪（一年内）");
  act(() => first.unmount());

  // 刷新：本地草稿清空，接口返回刚保存的值
  store.clear();
  const second = await mountFlow("u-reload");
  await enterGoals(second);
  assert.equal(goalInput(second).props.value, "年内找到 2 家稳定的日本供应商，先谈大阪");
  assert.deepEqual(pressed(second, "btn ge-horizon"), ["一年内"]);
  act(() => second.unmount());
});
