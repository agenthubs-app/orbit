/**
 * iOrbit 设置屏（Orbit_0918 个人中心 设计稿 209–242 行）+ 既有设置面板。
 *   - 左列 212–215「关于我」textarea ← `bio`（`session.update("bio", …)`，basic scope；保存栏在壳里 → saveProfile("basic")，
 *     `BIO_VISIBLE_LIMIT` 80 可见字符校验沿用 `validateProfileSaveDraft`）。卡头「编辑」→ 基础资料编辑屏（bio 也在那里）。
 *   - 216–220「当前目标」= `intro`(=relationshipGoal) 段落，无值「未设置」；设计的 4 个目标 chip 无数据源 → 省略；
 *     卡头「编辑」→ 画像编辑屏（目标只读展示处；hook 无 intro 保存通道）。
 *   - 221–228「沟通偏好」（首选语言 / 沟通风格 / 会议时间偏好）`OrbitProfileView` 无字段 → 整卡省略。
 *   - 右卡 231–239「当前 iOrbit 使用的信息」= 关于我 `aboutShort(bio)`（62 字 + …）+ 当前目标 `intro`；沟通偏好子块与目标 chip 省略；
 *     240 行说明句原样。
 *   - 之后 `.pc-legacy-settings`（ProfileLegacySettings）逐个以 pc-card 外框挂载 外观 / 记忆 / 反馈 / 自动化 / 执行 五个既有模块。
 * 设计 mock 文案（about 段落、目标 chip、沟通偏好值）一律不出现。
 */
"use client";

import { useOrbitLanguage } from "../../orbit-language-context";
import { ProfileLegacySettings } from "./profile-legacy-settings";
import { aboutShort } from "./profile-model";
import { profileRoutePath, type ProfileOnboardingQuery } from "./profile-shell";
import type { ProfileEditorSession } from "./use-profile-editor-session";

export function ProfileSettings({ session, onboardingQuery }: { session: ProfileEditorSession; onboardingQuery?: ProfileOnboardingQuery }) {
  const { t } = useOrbitLanguage();
  const profile = session.profile;
  const intro = profile.intro.trim();
  const short = aboutShort(profile.bio);
  const unset = t({ en: "Not set", zh: "未设置" });
  const aboutLabel = t({ en: "About me", zh: "关于我" });
  const goalLabel = t({ en: "Current goal", zh: "当前目标" });
  const edit = t({ en: "Edit", zh: "编辑" });

  return (
    <>
      <div className="pc-settings">
        <div className="pc-col">
          <section className="pc-card pc-settings-card">
            <span className="pc-settings-head">
              <span className="pc-settings-title"><span className="pc-settings-icon">⚇</span><strong className="pc-h2-lg">{aboutLabel}</strong></span>
              <a className="btn pc-btn-small" href={profileRoutePath("basic", onboardingQuery)}>{edit}</a>
            </span>
            <textarea
              aria-label={aboutLabel}
              className="pc-about"
              disabled={session.editorDisabled}
              onChange={(event) => session.update("bio", event.target.value)}
              rows={4}
              value={profile.bio}
            />
          </section>

          <section className="pc-card pc-settings-card">
            <span className="pc-settings-head">
              <span className="pc-settings-title"><span className="pc-settings-icon">⚑</span><strong className="pc-h2-lg">{goalLabel}</strong></span>
              <a className="btn pc-btn-small" href={profileRoutePath("persona", onboardingQuery)}>{edit}</a>
            </span>
            {intro ? <span className="pc-goal-text">{intro}</span> : <span className="pc-goal-text pc-goal-empty">{unset}</span>}
          </section>
        </div>

        <section className="pc-card pc-info-card">
          <span className="pc-info-head">
            <span className="pc-info-icon">✦</span>
            <span className="pc-info-copy">
              <strong className="pc-h2">{t({ en: "What iOrbit currently uses", zh: "当前 iOrbit 使用的信息" })}</strong>
              <span className="pc-side-desc">{t({ en: "Based on what you filled in, this is how iOrbit understands you.", zh: "基于你填写的内容，这是 iOrbit 对你的理解。" })}</span>
            </span>
          </span>
          <div className="pc-preview-box">
            <span className="pc-info-block">
              <span className="pc-info-label"><span className="pc-info-label-icon">⚇</span><strong className="pc-info-label-text">{aboutLabel}</strong></span>
              {short ? <span className="pc-info-text">{short}</span> : <span className="pc-info-text pc-info-empty">{unset}</span>}
            </span>
            <span className="pc-info-block pc-info-block-next">
              <span className="pc-info-label"><span className="pc-info-label-icon">⚑</span><strong className="pc-info-label-text">{goalLabel}</strong></span>
              {intro ? <span className="pc-info-text">{intro}</span> : <span className="pc-info-text pc-info-empty">{unset}</span>}
            </span>
          </div>
          <span className="pc-info-note">{t({ en: "ⓘ You can edit this information at any time to help iOrbit understand you better.", zh: "ⓘ 你可以随时编辑这些信息，帮助 iOrbit 更好地理解你。" })}</span>
        </section>
      </div>

      <ProfileLegacySettings />
    </>
  );
}
