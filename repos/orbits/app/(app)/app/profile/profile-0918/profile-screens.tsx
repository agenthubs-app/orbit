/**
 * 个人中心（Orbit_0918）容器：持有 useProfileEditorSession，按 view 切换子屏，算 onboarding 门禁横幅。
 * 任务 3 接入 profile-overview；任务 4 接入 persona / basic：
 *   - persona：保存栏 → saveProfile("matching")；成功 → toast「修改已保存」+ 就地回 profile 视图（设计 save()）。
 *   - basic：保存栏 → 提交 <form>（saveProfile("basic")）；结果由壳内通知条呈现（绿色成功 / 琥珀色仍不完整 / 错误），
 *     留在本屏；完整且带 onboardingNext 时由 hook 自动跳转 next。
 *   - 两屏取消 → reloadLatestProfile() 后回 profile 视图。connect 仍为占位 pc-card（任务 5 填充）。
 *
 * 视图切换：初始视图来自 URL（page.tsx 传 view），「回 profile」为组件内状态切换 + history.replaceState
 * （不整页跳转，才能沿用设计的 toast 并保留 hook 状态）；页签与卡片按钮仍是路由链接。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitProfileEditorViewModel } from "../profile-editor-adapter";
import { ProfileBasic } from "./profile-basic";
import { ProfileLegacySettings } from "./profile-legacy-settings";
import { missingFieldLabels } from "./profile-model";
import { ProfileOverview } from "./profile-overview";
import { ProfilePersona } from "./profile-persona";
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
    goProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingMatching, matchingSaving, messageKind]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function cancelEdit() {
    await session.reloadLatestProfile();
    goProfile();
  }

  const editing = activeView === "persona" || activeView === "basic";
  const onSave = activeView === "persona"
    ? saveMatching
    : activeView === "basic"
      ? () => { basicFormRef.current?.requestSubmit?.(); }
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
          <ProfileBasic formRef={basicFormRef} onSubmit={() => session.saveProfile("basic")} session={session} />
        ) : activeView === "settings" ? (
          <section className="pc-card">
            <ProfileLegacySettings />
          </section>
        ) : (
          <section className="pc-card">
            <p className="pc-empty">{t({ en: "This screen is being rebuilt.", zh: "此屏正在重建中。" })}</p>
          </section>
        )}
      </ProfileShell>
      <ProfileToast text={toast} />
    </>
  );
}
