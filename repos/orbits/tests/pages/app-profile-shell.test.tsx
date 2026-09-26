import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitProfileEditorView, OrbitProfileEditorViewModel } from "../../app/(app)/app/profile/profile-editor-adapter";
import { ProfileScreens } from "../../app/(app)/app/profile/profile-0918/profile-screens";
import { PROFILE_STYLES, ProfileShell, ProfileToast } from "../../app/(app)/app/profile/profile-0918/profile-shell";
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

function session(overrides: Partial<ProfileEditorSession> = {}): ProfileEditorSession {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  return {
    profile: profile(),
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
    ...overrides,
  };
}

function viewModel(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorViewModel {
  return { profile: profile(overrides) } as unknown as OrbitProfileEditorViewModel;
}

test("shell renders breadcrumb, title and the three design tabs as route links", () => {
  const html = renderToStaticMarkup(
    <ProfileShell view="persona" session={session()}>
      <div className="pc-card">body</div>
    </ProfileShell>,
  );
  assert.match(html, /个人中心/);
  assert.match(html, /个人资料 \/ 编辑商务画像/);
  assert.match(html, /<h1[^>]*>编辑商务画像<\/h1>/);
  // 三页签：个人资料（profile/persona/basic 高亮）/ iOrbit 设置 / 连接，都是链接
  assert.match(html, /href="\/app\/profile"[^>]*aria-current="page"[^>]*>个人资料</);
  assert.match(html, /href="\/app\/settings"[^>]*>iOrbit 设置</);
  assert.match(html, /href="\/app\/profile\?view=connect"[^>]*>连接</);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /class="pc-tab pc-tab-on"/);
  assert.equal((html.match(/class="pc-tab pc-tab-off"/g) ?? []).length, 2);
  assert.match(html, /data-profile-view="persona"/);
  // 没有保存栏时不渲染 取消 / 保存修改
  assert.doesNotMatch(html, /保存修改/);
});

test("gated shell keeps onboarding/next on the 个人资料 and 连接 tabs and crumb, settings tab unchanged", () => {
  const html = renderToStaticMarkup(
    <ProfileShell
      view="basic"
      session={session()}
      onboardingBanner={{ missing: ["生日"], go: "/app/profile?view=basic&onboarding=1&next=%2Fapp%2Fhome" }}
      onboardingQuery={{ onboarding: true, onboardingNext: "/app/home" }}
    >x</ProfileShell>,
  );
  assert.match(html, /<a class="pc-tab pc-tab-on" href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome" aria-current="page">个人资料</);
  assert.match(html, /<a class="pc-crumb-link" href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome">个人中心</);
  assert.match(html, /href="\/app\/settings"[^>]*>iOrbit 设置</);
  assert.match(html, /href="\/app\/profile\?view=connect&amp;onboarding=1&amp;next=%2Fapp%2Fhome"[^>]*>连接</);
  // ProfileScreens 从页面 props 接线
  const screens = renderToStaticMarkup(
    <ProfileScreens viewModel={viewModel({ onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } })} onboarding onboardingNext="/app/home" />,
  );
  assert.match(screens, /<a class="pc-tab pc-tab-on" href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome"/);
  // 不在门禁流程：链接不带 query
  const plain = renderToStaticMarkup(<ProfileShell view="profile" session={session()}>x</ProfileShell>);
  assert.match(plain, /<a class="pc-crumb-link" href="\/app\/profile">/);
});

test("settings view highlights the iOrbit 设置 tab", () => {
  const html = renderToStaticMarkup(<ProfileShell view="settings" session={session()}>x</ProfileShell>);
  assert.match(html, /href="\/app\/settings"[^>]*aria-current="page"[^>]*>iOrbit 设置</);
  assert.match(html, /<h1[^>]*>iOrbit 设置<\/h1>/);
  assert.match(html, /决定 iOrbit 如何理解你/);
});

test("save bar renders 取消 / 保存修改 as .btn buttons", () => {
  const html = renderToStaticMarkup(
    <ProfileShell view="persona" session={session()} showSaveBar onSave={() => undefined} onCancel={() => undefined}>x</ProfileShell>,
  );
  assert.match(html, /<button[^>]*class="btn pc-btn-cancel"[^>]*>取消<\/button>/);
  assert.match(html, /<button[^>]*class="btn pc-btn-primary"[^>]*>保存修改<\/button>/);
  assert.doesNotMatch(html, /class="btn pc-btn-cancel" disabled=""/);
});

test("save bar disables 取消 while a basic or matching save is in flight", () => {
  for (const spies of [{ saving: true }, { matchingSaving: true }]) {
    const html = renderToStaticMarkup(
      <ProfileShell view="persona" session={session(spies)} showSaveBar onSave={() => undefined} onCancel={() => undefined}>x</ProfileShell>,
    );
    assert.match(html, /<button[^>]*class="btn pc-btn-cancel" disabled=""[^>]*>取消<\/button>/, JSON.stringify(spies));
    assert.match(html, /<button[^>]*class="btn pc-btn-primary" disabled=""[^>]*>保存中…<\/button>/);
  }
});

test("onboarding banner lists the missing fields and links to the basic editor", () => {
  const html = renderToStaticMarkup(
    <ProfileShell view="basic" session={session()} onboardingBanner={{ missing: ["生日", "二级行业"], go: "/app/profile?view=basic&onboarding=1&next=%2Fapp%2Fhome" }}>x</ProfileShell>,
  );
  assert.match(html, /第一步：编辑个人资料。完成必填的基础资料后，才能进入 iOrbit、活动和人脉。/);
  assert.match(html, /还需填写：生日、二级行业/);
  assert.match(html, /class="pc-notice pc-notice-warning"/);
  assert.match(html, /<a[^>]*class="btn pc-btn-primary"[^>]*href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome"[^>]*>去填写<\/a>/);
});

test("session message renders as alert for errors and status otherwise, warning in amber", () => {
  const error = renderToStaticMarkup(<ProfileShell view="profile" session={session({ message: "坏了", messageKind: "error" })}>x</ProfileShell>);
  assert.match(error, /<div[^>]*role="alert"[^>]*class="pc-notice pc-notice-error"[^>]*><span class="pc-notice-text">坏了/);

  const info = renderToStaticMarkup(<ProfileShell view="profile" session={session({ message: "提示", messageKind: "info" })}>x</ProfileShell>);
  assert.match(info, /<div[^>]*role="status"[^>]*class="pc-notice pc-notice-info"[^>]*><span class="pc-notice-text">提示/);

  const warning = renderToStaticMarkup(<ProfileShell view="profile" session={session({ message: "还差生日", messageKind: "warning" })}>x</ProfileShell>);
  assert.match(warning, /<div[^>]*role="status"[^>]*class="pc-notice pc-notice-warning"[^>]*><span class="pc-notice-text">还差生日/);

  const success = renderToStaticMarkup(<ProfileShell view="profile" session={session({ message: "已保存", messageKind: "success" })}>x</ProfileShell>);
  assert.match(success, /<div[^>]*role="status"[^>]*class="pc-notice pc-notice-success"[^>]*><span class="pc-notice-text">已保存/);

  const none = renderToStaticMarkup(<ProfileShell view="profile" session={session()}>x</ProfileShell>);
  assert.doesNotMatch(none, /class="pc-notice /);
});

test("reconcile state keeps the 刷新最新资料 button", () => {
  const html = renderToStaticMarkup(
    <ProfileShell view="profile" session={session({ message: "资料已被更新", messageKind: "error", requiresReconcile: true })}>x</ProfileShell>,
  );
  assert.match(html, /<button[^>]*class="btn pc-btn-reload"[^>]*>刷新最新资料<\/button>/);
});

test("PROFILE_STYLES scope every rule to the profile-0918 page and neutralise .btn", () => {
  const rules = PROFILE_STYLES.split("\n").filter((line) => line.trim().startsWith("["));
  assert.ok(rules.length > 10);
  for (const rule of rules) assert.match(rule, /^\[data-orbit-real-page="profile-0918"\]/);
  assert.match(PROFILE_STYLES, /\.pc-main \{ max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px; display: flex; flex-direction: column; gap: 22px; \}/);
  assert.match(PROFILE_STYLES, /\.btn\.pc-btn-primary:active \{ transform: none; \}/);
  assert.match(PROFILE_STYLES, /\.btn\.pc-btn-cancel:active \{ transform: none; \}/);
  assert.match(PROFILE_STYLES, /\.pc-notice-warning \{ background: #FBF1DC; color: #8A6420; \}/);
});

test("toast renders the design toast pill", () => {
  const html = renderToStaticMarkup(<ProfileToast text="修改已保存" />);
  assert.match(html, /class="pc-toast"[^>]*>修改已保存</);
});

test("ProfileScreens defaults to the basic view and shows the gate banner when onboarding is incomplete", () => {
  const html = renderToStaticMarkup(
    <ProfileScreens
      viewModel={viewModel({ fullName: "李四", onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } })}
      onboarding
      onboardingNext="/app/home"
    />,
  );
  assert.match(html, /data-orbit-route="app-profile-screens"/);
  assert.match(html, /data-profile-view="basic"/);
  assert.match(html, /还需填写：生日/);
  assert.match(html, /href="\/app\/profile\?view=basic&amp;onboarding=1&amp;next=%2Fapp%2Fhome"/);
});

test("ProfileScreens respects the requested view and hides the banner when complete", () => {
  const html = renderToStaticMarkup(
    <ProfileScreens
      view="connect"
      viewModel={viewModel({ fullName: "李四", onboarding: { policyVersion: 1, status: "complete", missingFields: [] } })}
      onboarding
    />,
  );
  assert.match(html, /data-profile-view="connect"/);
  assert.doesNotMatch(html, /还需填写/);
  // 任务 5：connect 视图挂真实连接屏（四张集成卡）
  assert.match(html, /class="pc-connect"/);
  assert.match(html, /class="pc-card pc-int-card"/);
});

test("ProfileScreens without onboarding flag never shows the banner and defaults to profile", () => {
  const html = renderToStaticMarkup(<ProfileScreens viewModel={viewModel()} />);
  assert.match(html, /data-profile-view="profile"/);
  assert.doesNotMatch(html, /完成基础资料后才能进入/);
});
