"use client";

/* 从 orbit-real-profile.tsx 原样搬出的星空名片预览（个人中心 任务 2）。
   BusinessCardPreview / PreviewTagRow / CARD_BG / CARD_GLOW 逐行不变。 */

import { industryLabel, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import type { OrbitProfileEditorView } from "../profile-editor-adapter";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitProfileView } from "../../orbit-profile-route-view-model";
import { Avatar, gradientFromString, Logo } from "../../orbit-reference-primitives";
import { ORBIT_0918_FONTS } from "../../orbit-0918-tokens";

type Translate = (copy: { en: string; zh: string }) => string;
type EditableProfile = OrbitProfileEditorView;


/* 名片预览是深色的实体名片隐喻,明暗两套主题下都保持同一张卡,
   所以这里用固定色而不是主题 token。 */
export const CARD_BG = "linear-gradient(158deg, #22312d 0%, #17211f 52%, #131b19 100%)";
export const CARD_GLOW = "radial-gradient(420px 260px at 88% -10%, rgba(94, 234, 212, 0.16), transparent 68%)";

export function profileInitial(profile: OrbitProfileView) {
  return (profile.fullName.trim()[0] || "O").toUpperCase();
}

export function PreviewTagRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;

  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.46)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 7 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {values.slice(0, 3).map((value) => (
          <span key={value} style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: "var(--r-pill)", color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: "24px", padding: "0 10px", whiteSpace: "nowrap" }}>
            {value}
          </span>
        ))}
        {values.length > 3 ? (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: "26px" }}>+{values.length - 3}</span>
        ) : null}
      </div>
    </div>
  );
}

export function BusinessCardPreview({
  profile,
  t,
}: {
  profile: EditableProfile;
  t: Translate;
}) {
  const { language } = useOrbitLanguage();
  const selectedIndustry = profile.secondaryIndustryId
    ? secondaryIndustryLabel(profile.secondaryIndustryId, language)
    : profile.primaryIndustryId
      ? `${industryLabel(profile.primaryIndustryId, language)} · ${t({ en: "Secondary industry not set", zh: "二级未填写" })}`
      : profile.industry;
  const meta = [profile.company, profile.title, selectedIndustry]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" · ");
  const contacts = [
    profile.wechatName.trim() && { label: t({ en: "WeChat", zh: "微信" }), value: profile.wechatName.trim() },
    profile.lineId.trim() && { label: "LINE", value: profile.lineId.trim() },
    profile.email.trim() && { label: "Email", value: profile.email.trim() },
  ].filter(Boolean) as { label: string; value: string }[];
  const divider = <div aria-hidden style={{ background: "rgba(255,255,255,0.10)", height: 1 }} />;

  return (
    <div style={{ background: CARD_BG, borderRadius: 16, boxShadow: "0 18px 44px rgba(14,18,37,0.18)", overflow: "hidden", position: "relative" }}>
      <div aria-hidden style={{ background: CARD_GLOW, inset: 0, pointerEvents: "none", position: "absolute" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "24px 24px 22px", position: "relative" }}>
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between" }}>
          <Avatar g={gradientFromString(profile.fullName.trim() || "Orbit")} letter={profileInitial(profile)} ring="rgba(255,255,255,0.22)" size={56} />
          <Logo color="rgba(255,255,255,0.55)" size={20} withText={false} />
        </div>
        <div>
          <div style={{ color: "#fff", fontFamily: ORBIT_0918_FONTS.serif, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}
          </div>
          {(profile.bio.trim() || profile.headline.trim()) ? (
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.55, marginTop: 7 }}>{profile.bio.trim() || profile.headline}</div>
          ) : null}
          {meta ? (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, letterSpacing: "0.01em", marginTop: 9 }}>{meta}</div>
          ) : null}
        </div>
        {profile.offering.length || profile.seeking.length ? (
          <>
            {divider}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <PreviewTagRow label={t({ en: "OFFERING", zh: "能提供" })} values={profile.offering} />
              <PreviewTagRow label={t({ en: "SEEKING", zh: "想认识" })} values={profile.seeking} />
            </div>
          </>
        ) : null}
        {contacts.length ? (
          <>
            {divider}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {contacts.map((contact) => (
                <div key={contact.label} style={{ display: "flex", fontSize: 12, gap: 10 }}>
                  <span style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0, width: 44 }}>{contact.label}</span>
                  <span style={{ color: "rgba(255,255,255,0.8)", minWidth: 0, overflowWrap: "anywhere" }}>{contact.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
