/**
 * 个人中心（Orbit_0918）容器：持有 useProfileEditorSession，按 view 切换子屏，算 onboarding 门禁横幅。
 * 任务 3 接入 profile-overview；任务 4 接入 persona / basic：
 *   - persona：保存栏 → saveProfile("matching")；成功 → toast「修改已保存」+ 就地回 profile 视图（设计 save()）。
 *   - basic：保存栏 → 提交 <form>（saveProfile("basic")）；结果由壳内通知条呈现（绿色成功 / 琥珀色仍不完整 / 错误），
 *     留在本屏；完整且带 onboardingNext 时由 hook 自动跳转 next。
 *   - settings（任务 5）：保存栏 → saveProfile("basic")（关于我 = bio）；结果由壳内通知条呈现，留在本屏。
 *   - persona / basic 取消 → 整页跳转 /app/profile 丢弃草稿（不调 reloadLatestProfile：它按设计保留脏字段，
 *     就地切回 profile 会把未保存的值和「最新资料已加载…」提示带到概览——合并前终审 I1 修正）；
 *     settings 取消 → reloadLatestProfile() 后整页跳转 /app/profile（settings 屏挂在 /app/settings 路由、
 *     顶栏 active="settings"，就地切换会让顶栏高亮停在「设置」——任务 6 复审修正）。connect（任务 5）无保存栏。
 *
 * 视图切换：初始视图来自 URL（page.tsx 传 view），「回 profile」为组件内状态切换 + history.replaceState
 * （不整页跳转，才能沿用设计的 toast 并保留 hook 状态）；页签与卡片按钮仍是路由链接。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitProfileEditorViewModel } from "../profile-editor-adapter";
import { ProfileBasic } from "./profile-basic";
import { ProfileConnect } from "./profile-connect";
import { missingFieldLabels } from "./profile-model";
import { ProfileOverview } from "./profile-overview";
import { ProfilePersona } from "./profile-persona";
import { ProfileSettings } from "./profile-settings";
import { ProfileShell, ProfileToast, profileRoutePath, type ProfileView } from "./profile-shell";
import { useProfileEditorSession } from "./use-profile-editor-session";

export type { ProfileView } from "./profile-shell";

const TOAST_MS = 2000; // 设计稿 flash()：2s

export function profileBasicEditorPath(input: { onboarding?: boolean; onboardingNext?: string }): string {
  return profileRoutePath("basic", input);
}

export function ProfileScreens({
  view,
  viewModel,
  onboardingNext,
  onboarding,
}: {
  /** 未指定 → profile；`?onboarding=1` 且资料未完成 → basic。 */
  view?: ProfileView;
  viewModel: OrbitProfileEditorViewModel;
  onboardingNext?: string;
  onboarding?: boolean;
}) {
  const { language, t } = useOrbitLanguage();
  const session = useProfileEditorSession({ onboardingNext, t, viewModel });
  const [localView, setLocalView] = useState<ProfileView | undefined>(view);
  const [toast, setToast] = useState("");
  const [awaitingMatching, setAwaitingMatching] = useState(false);
  const basicFormRef = useRef<HTMLFormElement | null>(null);
  const incomplete = session.profile.onboarding.status !== "complete";
  const gated = Boolean(onboarding) && incomplete;
  const activeView: ProfileView = localView ?? (gated ? "basic" : "profile");
  const onboardingBanner = gated
    ? {
        missing: missingFieldLabels(session.profile.onboarding, language === "en" ? "en" : "zh"),
        go: profileBasicEditorPath({ onboarding: true, onboardingNext }),
      }
    : undefined;
  const onboardingQuery = { onboarding, onboardingNext };

  function goProfile() {
    setLocalView("profile");
    if (typeof window !== "undefined") {
      window.history?.replaceState?.(null, "", profileRoutePath(undefined, onboardingQuery));
      window.scrollTo?.(0, 0);
    }
  }

  function saveMatching() {
    setAwaitingMatching(true);
    void session.saveProfile("matching");
  }

  // 画像保存结束后（matchingSaving 落回 false）看 hook 的结果：success → toast + 回 profile；
  // error / info（无改动）→ 留在画像屏，由壳内通知条呈现。
  const { matchingSaving, messageKind } = session;
  useEffect(() => {
    if (!awaitingMatching || matchingSaving) return;
    setAwaitingMatching(false);
    if (messageKind !== "success") return;
    setToast(t({ en: "Changes saved", zh: "修改已保存" }));
    // 概览只显示设计的 toast；清掉 hook 的绿色复读通知，避免双重提示（终审 M4）。
    session.notify("info", "");
    goProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingMatching, matchingSaving, messageKind]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function cancelEdit() {
    if (activeView === "settings") {
      // /app/settings 路由：reload 后整页跳转让共享顶栏切回「我的」。
      await session.reloadLatestProfile();
      window.location.assign(profileRoutePath("profile", onboardingQuery));
      return;
    }
    // persona / basic：整页跳转丢弃草稿。不调 reloadLatestProfile（它保留脏字段），也不就地切视图。
    window.location.assign(profileRoutePath("profile", onboardingQuery));
  }

  const editing = activeView === "persona" || activeView === "basic" || activeView === "settings";
  const onSave = activeView === "persona"
    ? saveMatching
    : activeView === "basic"
      ? () => { basicFormRef.current?.requestSubmit?.(); }
      : activeView === "settings"
        ? () => { void session.saveProfile("basic"); }
        : undefined;

  return (
    <>
      <ProfileShell
        view={activeView}
        session={session}
        onboardingBanner={onboardingBanner}
        onboardingQuery={onboardingQuery}
        showSaveBar={editing}
        onSave={onSave}
        onCancel={editing ? () => { void cancelEdit(); } : undefined}
      >
        {activeView === "profile" ? (
          <ProfileOverview session={session} onboardingQuery={onboardingQuery} />
        ) : activeView === "persona" ? (
          <ProfilePersona session={session} />
        ) : activeView === "basic" ? (
          <ProfileBasic aria-label={t({ en: "Edit basic profile", zh: "编辑基础资料" })} formRef={basicFormRef} onSubmit={() => session.saveProfile("basic")} session={session} />
        ) : activeView === "settings" ? (
          <ProfileSettings session={session} onboardingQuery={onboardingQuery} />
        ) : (
          <ProfileConnect />
        )}
      </ProfileShell>
      <ProfileToast text={toast} />
    </>
  );
}
