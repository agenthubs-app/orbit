/**
 * 个人中心（Orbit_0918）容器：持有 useProfileEditorSession，按 view 切换子屏，算 onboarding 门禁横幅。
 * 任务 2 先渲染占位 pc-card；任务 3–5 用 profile-overview / persona / basic / settings / connect 填充。
 */
"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitProfileEditorViewModel } from "../profile-editor-adapter";
import { ProfileLegacySettings } from "./profile-legacy-settings";
import { missingFieldLabels } from "./profile-model";
import { ProfileShell, type ProfileView } from "./profile-shell";
import { useProfileEditorSession } from "./use-profile-editor-session";

export type { ProfileView } from "./profile-shell";

export function profileBasicEditorPath(input: { onboarding?: boolean; onboardingNext?: string }): string {
  const params = new URLSearchParams({ view: "basic" });
  if (input.onboarding) params.set("onboarding", "1");
  if (input.onboardingNext) params.set("next", input.onboardingNext);
  return `/app/profile?${params.toString()}`;
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
  const incomplete = session.profile.onboarding.status !== "complete";
  const gated = Boolean(onboarding) && incomplete;
  const activeView: ProfileView = view ?? (gated ? "basic" : "profile");
  const onboardingBanner = gated
    ? {
        missing: missingFieldLabels(session.profile.onboarding, language === "en" ? "en" : "zh"),
        go: profileBasicEditorPath({ onboarding: true, onboardingNext }),
      }
    : undefined;

  return (
    <ProfileShell view={activeView} session={session} onboardingBanner={onboardingBanner}>
      {activeView === "settings" ? (
        <section className="pc-card">
          <ProfileLegacySettings />
        </section>
      ) : (
        <section className="pc-card">
          <p className="pc-empty">{t({ en: "This screen is being rebuilt.", zh: "此屏正在重建中。" })}</p>
        </section>
      )}
    </ProfileShell>
  );
}
