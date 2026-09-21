import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitProfileEditorView, OrbitProfileEditorViewModel } from "../../app/(app)/app/profile/profile-editor-adapter";
import { ProfileOverview } from "../../app/(app)/app/profile/profile-0918/profile-overview";
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
    onboarding: {
      policyVersion: 1,
      status: "incomplete",
      missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
    },
    primaryIndustryId: undefined,
    secondaryIndustryId: undefined,
    seeking: [],
    title: "",
    topics: [],
    wechatName: "",
    ...overrides,
  };
}

function session(overrides: Partial<OrbitProfileEditorView> = {}): ProfileEditorSession {
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
  };
}

const FULL: Partial<OrbitProfileEditorView> = {
  fullName: "张三",
  title: "产品负责人",
  company: "星轨科技",
  headline: "把 AI 落到业务里",
  bio: "十年 B2B 产品经验，关注 AI 与跨境合作。",
  birthDate: "1990-01-01",
  primaryIndustryId: "technology_internet",
  secondaryIndustryId: "food_hospitality.restaurants",
  intro: "拓展日本市场",
  offering: ["产品咨询", "日本市场资源"],
  seeking: ["投资人"],
  topics: ["生成式 AI"],
  email: "zhangsan@example.com",
  wechatName: "zs_wechat",
  lineId: "zs_line",
  handles: { linkedinUrl: "linkedin.com/in/zs", phone: "+81 90 0000 0000" },
  onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
};

const MOCK_STRINGS = ["Qiongyu Li", "82%", "Zurich Insurance Japan", "东京", "Production AI", "qiongyu.li@example.com", "linkedin.com/in/qiongyuli", "金融 / 保险", "人工智能 / 企业软件", "生成式 AI 应用于金融保险"];

test("overview renders real profile fields, initial avatar and derived completeness", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.match(html, /class="pc-avatar"[^>]*>张<\/span>/);
  assert.match(html, /<strong class="pc-name">张三<\/strong>/);
  assert.match(html, /产品负责人 · 星轨科技/);
  // 10/10 已填 → 100%
  assert.match(html, /资料完整度 <strong class="pc-score">100%<\/strong>/);
  assert.match(html, /class="pc-bar-fill" style="width:100%"/);
  for (const mock of MOCK_STRINGS) assert.doesNotMatch(html, new RegExp(mock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock string leaked: ${mock}`);
});

test("overview role line omits empty parts and completeness is derived (2/10 → 20%, empty → 0%)", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session({ fullName: "李四", company: "星轨科技" })} />);
  assert.match(html, /<span class="pc-role">星轨科技<\/span>/);
  assert.doesNotMatch(html, /· 星轨科技/);
  assert.match(html, /资料完整度 <strong class="pc-score">20%<\/strong>/);
  assert.match(html, /class="pc-bar-fill" style="width:20%"/);
  const blank = renderToStaticMarkup(<ProfileOverview session={session()} />);
  assert.match(blank, /资料完整度 <strong class="pc-score">0%<\/strong>/);
  assert.match(blank, /class="pc-bar-fill" style="width:0%"/);
  // 没有地点数据源：不渲染 ◎ 城市
  assert.doesNotMatch(html, /◎ /);
});

test("基础资料 grid shows every field with industry labels and 未填写 for blanks", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.match(html, /基础资料/);
  assert.match(html, /<span class="pc-grid-k">姓名<\/span><span class="pc-grid-v">张三<\/span>/);
  assert.match(html, /<span class="pc-grid-k">Headline<\/span><span class="pc-grid-v">把 AI 落到业务里<\/span>/);
  assert.match(html, /<span class="pc-grid-k">公司<\/span><span class="pc-grid-v">星轨科技<\/span>/);
  assert.match(html, /<span class="pc-grid-k">职位<\/span><span class="pc-grid-v">产品负责人<\/span>/);
  assert.match(html, /<span class="pc-grid-k">主行业<\/span><span class="pc-grid-v">科技与互联网<\/span>/);
  assert.match(html, /<span class="pc-grid-k">次行业<\/span><span class="pc-grid-v">餐饮经营<\/span>/);
  assert.match(html, /<span class="pc-grid-k">简介<\/span><span class="pc-grid-v pc-grid-bio">十年 B2B 产品经验/);

  const empty = renderToStaticMarkup(<ProfileOverview session={session()} />);
  assert.equal((empty.match(/<span class="pc-grid-v(?: pc-grid-bio)?">未填写<\/span>/g) ?? []).length, 7);
});

test("persona cards come from personaGroups; empty groups show a 未填写 chip, goal is a single read-only chip", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.match(html, /商务画像/);
  assert.match(html, /我的目标/);
  assert.match(html, /<span class="pc-chip">拓展日本市场<\/span>/);
  assert.match(html, /<span class="pc-chip">产品咨询<\/span>/);
  assert.match(html, /<span class="pc-chip">投资人<\/span>/);
  assert.match(html, /<span class="pc-chip">生成式 AI<\/span>/);
  assert.doesNotMatch(html, /pc-chip-empty/);

  const empty = renderToStaticMarkup(<ProfileOverview session={session()} />);
  assert.equal((empty.match(/<span class="pc-chip-empty">未填写<\/span>/g) ?? []).length, 4);
  assert.doesNotMatch(empty, /<span class="pc-chip">/);
});

test("contact rows render non-empty handles with 仅自己可见 scope, none → empty copy", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.match(html, /联系信息/);
  assert.match(html, /<span class="pc-contact-label">Email<\/span><span class="pc-contact-value">zhangsan@example.com<\/span>/);
  assert.match(html, /<span class="pc-contact-label">LinkedIn<\/span><span class="pc-contact-value">linkedin.com\/in\/zs<\/span>/);
  assert.match(html, /<span class="pc-contact-label">LINE<\/span><span class="pc-contact-value">zs_line<\/span>/);
  assert.match(html, /<span class="pc-contact-label">WeChat<\/span><span class="pc-contact-value">zs_wechat<\/span>/);
  assert.match(html, /<span class="pc-contact-label">Phone<\/span><span class="pc-contact-value">\+81 90 0000 0000<\/span>/);
  assert.equal((html.match(/<span class="pc-contact-scope">仅自己可见<\/span>/g) ?? []).length, 5);
  assert.doesNotMatch(html, /活动授权后可交换/);

  const empty = renderToStaticMarkup(<ProfileOverview session={session()} />);
  assert.doesNotMatch(empty, /pc-contact-scope/);
  assert.match(empty, /还没有填写联系方式/);
});

test("suggestions follow real conditions: basic incomplete / empty persona group / no connections", () => {
  // 全空：三条都出现
  const empty = renderToStaticMarkup(<ProfileOverview session={session()} />);
  assert.match(empty, /资料建议/);
  assert.match(empty, /完善基础资料/);
  assert.match(empty, /完善商务画像/);
  assert.match(empty, /连接工具/);
  assert.doesNotMatch(empty, /资料很完整，暂无建议/);
  // 基础资料条目 → basic；画像条目 → persona；连接条目 → connect
  assert.match(empty, /<a class="btn pc-suggest" href="\/app\/profile\?view=basic">/);
  assert.match(empty, /<a class="btn pc-suggest" href="\/app\/profile\?view=persona">/);
  assert.match(empty, /<a class="btn pc-suggest" href="\/app\/profile\?view=connect">/);

  // 基础完成 + 画像齐全，连接数今天恒为 0 → 只剩连接一条
  const full = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.doesNotMatch(full, /完善基础资料/);
  assert.doesNotMatch(full, /完善商务画像/);
  assert.match(full, /连接工具/);
  assert.doesNotMatch(full, /资料很完整，暂无建议/);

  // 设计 mock 行文案不得出现
  assert.doesNotMatch(empty, /完成联系信息授权/);
  assert.doesNotMatch(empty, /添加更多兴趣话题/);
  assert.doesNotMatch(empty, /完善个人简介/);
});

test("buttons: 编辑资料/编辑商务画像 → persona, 编辑基础资料/联系信息 编辑 → basic, previews scroll to #pc-preview", () => {
  const html = renderToStaticMarkup(<ProfileOverview session={session(FULL)} />);
  assert.match(html, /<a class="btn pc-btn-primary" href="\/app\/profile\?view=persona">编辑资料<\/a>/);
  assert.match(html, /<a class="btn pc-btn-small" href="\/app\/profile\?view=persona">编辑商务画像<\/a>/);
  assert.match(html, /<a class="btn pc-btn-small" href="\/app\/profile\?view=basic">编辑基础资料<\/a>/);
  assert.match(html, /<a class="btn pc-btn-small" href="\/app\/profile\?view=basic">编辑<\/a>/);
  assert.match(html, /<button class="btn pc-btn-cancel" type="button">预览公开资料<\/button>/);
  assert.match(html, /<button class="btn pc-btn-small" type="button">查看完整预览<\/button>/);
  assert.match(html, /id="pc-preview"/);
  assert.match(html, /公开预览/);
  // 星空名片预览渲染真实名字
  assert.match(html, /张三/);

  // 门禁 query 时内部链接保留 onboarding/next
  const gated = renderToStaticMarkup(<ProfileOverview session={session(FULL)} onboardingQuery={{ onboarding: true, onboardingNext: "/app/home" }} />);
  assert.match(gated, /href="\/app\/profile\?view=persona&amp;onboarding=1&amp;next=%2Fapp%2Fhome">编辑资料</);
  assert.match(gated, /href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome">编辑基础资料</);
});

test("ProfileScreens renders the overview for the profile view", () => {
  const html = renderToStaticMarkup(<ProfileScreens viewModel={{ profile: profile(FULL) } as unknown as OrbitProfileEditorViewModel} />);
  assert.match(html, /data-profile-view="profile"/);
  assert.match(html, /class="pc-overview"/);
  assert.match(html, /<strong class="pc-name">张三<\/strong>/);
  assert.doesNotMatch(html, /此屏正在重建中/);
});

test("PROFILE_STYLES carry the overview pc-* rules with neutralised buttons", () => {
  assert.match(PROFILE_STYLES, /\.pc-overview \{ display: grid; grid-template-columns: minmax\(0, 1\.6fr\) minmax\(300px, 1fr\); gap: 20px; align-items: start; animation: orbit-fade \.3s ease; \}/);
  assert.match(PROFILE_STYLES, /\.pc-avatar \{ width: 92px; height: 92px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270;/);
  assert.match(PROFILE_STYLES, /\.pc-grid \{ display: grid; grid-template-columns: 110px minmax\(0, 1fr\); gap: 16px 20px; align-items: start; font-size: 14px; \}/);
  assert.match(PROFILE_STYLES, /\.btn\.pc-btn-small:active \{ transform: none; \}/);
  assert.match(PROFILE_STYLES, /\.btn\.pc-suggest:active \{ transform: none; \}/);
  assert.match(PROFILE_STYLES, /\.pc-chip-empty \{/);
});
