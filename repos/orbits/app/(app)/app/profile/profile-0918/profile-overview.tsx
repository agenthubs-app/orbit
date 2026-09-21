/**
 * 个人资料屏（Orbit_0918 个人中心 设计稿 67–152 行）。
 * 数据全部来自 ProfileEditorSession.profile：没有数据源的元素（76/144 行地点、mock 数字/文案）不做假。
 *   - 资料完整度 = completeness().score（10 项已填比例，口径见 profile-model.ts）
 *   - 我的目标 = intro 单 chip 只读；空画像组显示一枚「未填写」chip
 *   - 联系信息可见范围一律「仅自己可见」（handles 不进公开资料）
 *   - 资料建议 = suggestions(profile, 0)（连接数今天恒为 0）
 *   - 公开预览卡（140–148 行）= 既有 BusinessCardPreview 真实预览；「预览公开资料」「查看完整预览」滚动到它
 *   - 按钮映射：84 行「编辑资料」→ persona；91/122/135 行 flashEdit → 基础资料编辑屏 basic
 */
"use client";

import { industryLabel, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import { useOrbitLanguage } from "../../orbit-language-context";
import { BusinessCardPreview, profileInitial } from "./business-card-preview";
import { completeness, contactRows, personaGroups, suggestions, type SuggestionKey } from "./profile-model";
import { profileRoutePath, type ProfileOnboardingQuery } from "./profile-shell";
import type { ProfileEditorSession } from "./use-profile-editor-session";

type Copy = { zh: string; en: string };

export const PREVIEW_CARD_ID = "pc-preview";

// 设计 132–136 行三条建议的图标/文案位；行文案按真实条件改写（mock 文案不得出现）。
const SUGGESTION_COPY: Record<SuggestionKey, { icon: string; view: "basic" | "persona" | "connect"; title: Copy; desc: Copy }> = {
  basic: {
    icon: "◎",
    view: "basic",
    title: { zh: "完善基础资料", en: "Complete your basic profile" },
    desc: { zh: "姓名、行业与生日填完后才能进入 iOrbit、活动与人脉。", en: "Name, industry and birth date unlock iOrbit, Events and Network." },
  },
  persona: {
    icon: "✦",
    view: "persona",
    title: { zh: "完善商务画像", en: "Complete your business persona" },
    desc: { zh: "补全目标、能提供、在寻找与话题，让匹配更准确。", en: "Fill in goals, offers, asks and topics for better matches." },
  },
  connect: {
    icon: "⇄",
    view: "connect",
    title: { zh: "连接工具", en: "Connect your tools" },
    desc: { zh: "连接常用工具后，iOrbit 能更好地理解你的工作安排。", en: "Connected tools help iOrbit understand your schedule." },
  },
};

function scrollToPreview() {
  document.getElementById(PREVIEW_CARD_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ProfileOverview({ session, onboardingQuery }: { session: ProfileEditorSession; onboardingQuery?: ProfileOnboardingQuery }) {
  const { language, t } = useOrbitLanguage();
  const profile = session.profile;
  const score = completeness(profile).score;
  const roleLine = [profile.title.trim(), profile.company.trim()].filter(Boolean).join(" · ");
  const headline = profile.headline.trim();
  const groups = personaGroups(profile);
  const contacts = contactRows(profile);
  const tips = suggestions(profile, 0);
  const empty = t({ en: "Not filled in", zh: "未填写" });
  const text = (value: string) => value.trim() || empty;
  const primary = profile.primaryIndustryId ? industryLabel(profile.primaryIndustryId, language) : "";
  const secondary = profile.secondaryIndustryId ? secondaryIndustryLabel(profile.secondaryIndustryId, language) : "";
  const personaHref = profileRoutePath("persona", onboardingQuery);
  const basicHref = profileRoutePath("basic", onboardingQuery);

  return (
    <div className="pc-overview">
      <div className="pc-col">
        <section className="pc-card pc-hero">
          <span className="pc-avatar">{profileInitial(profile)}</span>
          <span className="pc-hero-copy">
            <strong className="pc-name">{profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}</strong>
            {roleLine ? <span className="pc-role">{roleLine}</span> : null}
            {headline ? <span className="pc-role">{headline}</span> : null}
          </span>
          <span className="pc-hero-side">
            <span className="pc-progress">
              <span className="pc-progress-label">{t({ en: "Profile completeness", zh: "资料完整度" })} <strong className="pc-score">{score}%</strong></span>
              <span className="pc-bar"><span className="pc-bar-fill" style={{ width: `${score}%` }} /></span>
            </span>
            <span className="pc-hero-actions">
              <a className="btn pc-btn-primary" href={personaHref}>{t({ en: "Edit profile", zh: "编辑资料" })}</a>
              <button className="btn pc-btn-cancel" onClick={scrollToPreview} type="button">{t({ en: "Preview public profile", zh: "预览公开资料" })}</button>
            </span>
          </span>
        </section>

        <section className="pc-card pc-stack">
          <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Basic profile", zh: "基础资料" })}</strong><a className="btn pc-btn-small" href={basicHref}>{t({ en: "Edit basic profile", zh: "编辑基础资料" })}</a></span>
          <div className="pc-grid">
            <span className="pc-grid-k">{t({ en: "Name", zh: "姓名" })}</span><span className="pc-grid-v">{text(profile.fullName)}</span>
            <span className="pc-grid-k">Headline</span><span className="pc-grid-v">{text(profile.headline)}</span>
            <span className="pc-grid-k">{t({ en: "Company", zh: "公司" })}</span><span className="pc-grid-v">{text(profile.company)}</span>
            <span className="pc-grid-k">{t({ en: "Title", zh: "职位" })}</span><span className="pc-grid-v">{text(profile.title)}</span>
            <span className="pc-grid-k">{t({ en: "Primary industry", zh: "主行业" })}</span><span className="pc-grid-v">{text(primary)}</span>
            <span className="pc-grid-k">{t({ en: "Secondary industry", zh: "次行业" })}</span><span className="pc-grid-v">{text(secondary)}</span>
            <span className="pc-grid-k">{t({ en: "About", zh: "简介" })}</span><span className="pc-grid-v pc-grid-bio">{text(profile.bio)}</span>
          </div>
        </section>

        <section className="pc-card pc-stack">
          <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Business persona", zh: "商务画像" })}</strong><a className="btn pc-btn-small" href={personaHref}>{t({ en: "Edit business persona", zh: "编辑商务画像" })}</a></span>
          <div className="pc-persona-grid">
            {groups.map((group) => (
              <span key={group.key} className="pc-persona-card">
                <span className="pc-persona-head"><span className="pc-persona-icon">{group.icon}</span><strong className="pc-persona-title">{t(group.title)}</strong></span>
                <span className="pc-chips">
                  {group.values.length
                    ? group.values.map((value) => <span key={value} className="pc-chip">{value}</span>)
                    : <span className="pc-chip-empty">{empty}</span>}
                </span>
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="pc-col">
        <section className="pc-card pc-side-card pc-stack">
          <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Contact details", zh: "联系信息" })}</strong><a className="btn pc-btn-small" href={basicHref}>{t({ en: "Edit", zh: "编辑" })}</a></span>
          {contacts.length ? contacts.map((row) => (
            <span key={row.label} className="pc-contact">
              <span className="pc-contact-icon">{row.icon}</span>
              <span className="pc-contact-copy"><span className="pc-contact-label">{row.label}</span><span className="pc-contact-value">{row.value}</span></span>
              <span></span>
              <span className="pc-contact-scope">{t({ en: "Only visible to you", zh: "仅自己可见" })}</span>
            </span>
          )) : <span className="pc-empty-line">{t({ en: "No contact details yet.", zh: "还没有填写联系方式。" })}</span>}
        </section>

        <section className="pc-card pc-side-card pc-suggest-card">
          <strong className="pc-h2">{t({ en: "Suggestions", zh: "资料建议" })}</strong>
          {tips.length ? tips.map((key) => {
            const tip = SUGGESTION_COPY[key];
            return (
              <a key={key} className="btn pc-suggest" href={profileRoutePath(tip.view, onboardingQuery)}>
                <span className="pc-suggest-icon">{tip.icon}</span>
                <span className="pc-suggest-copy"><strong className="pc-suggest-title">{t(tip.title)}</strong><span className="pc-suggest-desc">{t(tip.desc)}</span></span>
                <span className="pc-suggest-caret">›</span>
              </a>
            );
          }) : <p className="pc-empty">{t({ en: "Your profile is complete — no suggestions right now.", zh: "资料很完整，暂无建议" })}</p>}
        </section>

        <section className="pc-card pc-side-card pc-preview-card" id={PREVIEW_CARD_ID}>
          <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Public preview", zh: "公开预览" })}</strong><button className="btn pc-btn-small" onClick={scrollToPreview} type="button">{t({ en: "View full preview", zh: "查看完整预览" })}</button></span>
          <BusinessCardPreview profile={profile} t={t} />
        </section>
      </div>
    </div>
  );
}
