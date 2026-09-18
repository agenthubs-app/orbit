"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

import type { ProfileDocumentExtractionPayload } from "../../../../features/profile/extraction-contract";
import type { IndustrySelectionContract, IndustryIdCode, SecondaryIndustryIdCode } from "../../../../shared/contract/industries";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../../../shared/domain/industries";
import type {
  ManualProfileUpdateInput,
  ProfilePayload,
} from "../../../../features/profile/contract";
import {
  profileEditorReadbackMatches,
  profileEditorUpdateInput,
  profileEditorViewFromPayload,
  type OrbitProfileEditorView,
  type OrbitProfileEditorViewModel,
  type ProfileEditorField,
  type ProfileEditorSaveScope,
  type ProfileEditorVisibleHandleKey,
} from "./profile-editor-adapter";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitProfileView, OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { Avatar, gradientFromString, Icon, Logo } from "../orbit-reference-primitives";
import { PublicTopNav } from "../orbit-public-shell";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../orbit-0918-tokens";
import { profileContinuationPath } from "./profile-onboarding-navigation";
import {
  emptyProfileAfterReload,
  mergeProfilePreservingDraft,
  profileSaveFailureKind,
  profileSaveScopeFields,
  validateProfileSaveDraft,
} from "./profile-save-model";

type Translate = (copy: { en: string; zh: string }) => string;

type TagField = "offering" | "seeking" | "topics";
type Method = "text" | "manual";
type NoticeKind = "error" | "info" | "success";
type EditableProfile = OrbitProfileEditorView;
type ProfileTab = "edit" | "overview";

interface ApiEnvelope<TData> {
  success?: boolean;
  data?: TData;
  error?: {
    code?: string;
    message?: string;
  };
}

/* 名片预览是深色的实体名片隐喻,明暗两套主题下都保持同一张卡,
   所以这里用固定色而不是主题 token。 */
const CARD_BG = "linear-gradient(158deg, #22312d 0%, #17211f 52%, #131b19 100%)";
const CARD_GLOW = "radial-gradient(420px 260px at 88% -10%, rgba(94, 234, 212, 0.16), transparent 68%)";

export const profileReadbackMatches = profileEditorReadbackMatches;

function applyExtractionDraft(
  profile: EditableProfile,
  payload: ProfileDocumentExtractionPayload,
): EditableProfile {
  const draft = payload.draft;
  if (!draft) return profile;

  return {
    ...profile,
    company: draft.organization || profile.company,
    fullName: draft.displayName || profile.fullName,
    title: draft.role || profile.title,
  };
}

function profileInitial(profile: OrbitProfileView) {
  return (profile.fullName.trim()[0] || "O").toUpperCase();
}

function PreviewTagRow({ label, values }: { label: string; values: string[] }) {
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

function BusinessCardPreview({
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
          <div style={{ color: "#fff", fontFamily: ORBIT_0918_FONTS.serif, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}
          </div>
          {(profile.bio.trim() || profile.headline.trim()) ? (
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13.5, lineHeight: 1.55, marginTop: 7 }}>{profile.bio.trim() || profile.headline}</div>
          ) : null}
          {meta ? (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12.5, letterSpacing: "0.01em", marginTop: 9 }}>{meta}</div>
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
                <div key={contact.label} style={{ display: "flex", fontSize: 12.5, gap: 10 }}>
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

function OnboardingStatus({
  continueHref,
  onboarding,
  t,
}: {
  continueHref?: string;
  onboarding: OrbitProfileEditorView["onboarding"];
  t: Translate;
}) {
  const labels: Record<string, string> = {
    birthDate: t({ en: "Birthday", zh: "生日" }),
    displayName: t({ en: "Name", zh: "姓名" }),
    primaryIndustryId: t({ en: "Primary industry", zh: "一级行业" }),
    secondaryIndustryId: t({ en: "Secondary industry", zh: "二级行业" }),
  };
  const missing = onboarding.missingFields.map((field) => labels[field] ?? field);
  const complete = onboarding.status === "complete";

  return (
    <div
      aria-label={t({ en: "Private onboarding status", zh: "仅本人可见的引导状态" })}
      className="pf-onboarding"
    >
      <strong style={{ color: complete ? "#2F6B4F" : C.ink }}>
        {complete
          ? t({ en: "Basic profile complete", zh: "基础资料已完成" })
          : t({ en: "Still needed", zh: "还需填写" })}
      </strong>
      {!complete ? `: ${missing.join(t({ en: ", ", zh: "、" }))}` : null}
      <div style={{ color: C.text3, marginTop: 4 }}>
        {t({ en: "Only you can see this status. Birthday is private.", zh: "此状态仅本人可见，生日属于私密资料。" })}
      </div>
      {complete && continueHref ? (
        <a
          className="btn btn-ghost btn-sm"
          href={continueHref}
          style={{ marginTop: 8, textDecoration: "none" }}
        >
          {t({ en: "Continue", zh: "继续" })}
        </a>
      ) : null}
    </div>
  );
}

function Section({
  children,
  desc,
  title,
}: {
  children: ReactNode;
  desc?: string;
  title: string;
}) {
  return (
    <section className="pf-section">
      <header className="pf-section-head">
        <h2 className="pf-section-title">{title}</h2>
        {desc ? <p className="pf-section-desc">{desc}</p> : null}
      </header>
      {children}
    </section>
  );
}

function ProfileMethods({
  disabled,
  extractText,
  extracting,
  method,
  onTextExtract,
  setExtractText,
  setMethod,
  t,
}: {
  disabled: boolean;
  extractText: string;
  extracting: boolean;
  method: Method;
  onTextExtract: () => void;
  setExtractText: (value: string) => void;
  setMethod: (value: Method) => void;
  t: Translate;
}) {
  const methods = [
    ["manual", "user", t({ en: "Manual entry", zh: "手动填写" })],
    ["text", "sparkle", t({ en: "Structured text extract", zh: "结构化文本提取" })],
  ] as const;
  const helper = {
    text: t({ en: "Paste text with explicit labels such as Name, Company, Title, Market, and Goal. Only stated fields are extracted; review before saving.", zh: "粘贴带有“姓名、公司、职位、市场、关系目标”等明确标签的文本。只提取原文明确写出的字段，保存前请复核。" }),
    manual: t({ en: "Fill in the sections below field by field.", zh: "直接在下方各区块逐项填写。" }),
  }[method];

  return (
    <div>
      <div role="group" aria-label={t({ en: "Fill method", zh: "填写方式" })} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {methods.map(([key, icon, label]) => {
          const on = method === key;

          return (
            <button
              aria-pressed={on}
              className={`pf-method${on ? " is-active" : ""}`}
              disabled={disabled}
              key={key}
              onClick={() => setMethod(key)}
              type="button"
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          );
        })}
        <a
          className="btn btn-ghost btn-sm"
          href="/app/contacts/new"
          style={{ textDecoration: "none" }}
        >
          <Icon name="download" size={15} />
          {t({ en: "Scan/import in Import hub", zh: "到导入中心扫描/导入" })}
        </a>
      </div>
      <p style={{ color: C.text3, fontSize: 13, lineHeight: 1.5, margin: "10px 0 0" }}>{helper}</p>
      {method === "text" ? (
        <div style={{ marginTop: 12 }}>
          <textarea className="field" disabled={disabled} onChange={(event) => setExtractText(event.target.value)} placeholder={t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" })} style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} value={extractText} />
          <button className="btn btn-dark btn-sm" disabled={disabled || extracting} onClick={onTextExtract} style={{ marginTop: 10 }} type="button">
            <Icon name="sparkle" size={15} />
            {extracting ? t({ en: "Extracting…", zh: "提取中…" }) : t({ en: "Extract to form", zh: "提取到表单" })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FieldInput({
  disabled,
  label,
  onValue,
  readOnly,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onValue?: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label style={{ minWidth: 0 }}>
      <span className="field-label">{label}</span>
      <input
        className="field"
        disabled={disabled}
        onChange={onValue ? (event) => onValue(event.target.value) : undefined}
        readOnly={readOnly}
        style={readOnly ? { background: "#F7F7FD", color: C.text2 } : undefined}
        type={type}
        value={value}
      />
    </label>
  );
}

function FieldTextarea({
  disabled,
  label,
  onValue,
  rows,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValue: (value: string) => void;
  rows: number;
  value: string;
}) {
  // field-sizing 让 textarea 随内容撑高(Chrome);不支持的浏览器退回 rows 行高,
  // 内部滚动,不会拦腰截断文字。
  const style = {
    fieldSizing: "content",
    fontFamily: "var(--ff)",
    height: "auto",
    lineHeight: 1.55,
    minHeight: rows * 23 + 24,
    padding: "11px 14px",
    resize: "none",
  } as React.CSSProperties;

  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className="field-label">{label}</span>
      <textarea className="field" disabled={disabled} onChange={(event) => onValue(event.target.value)} rows={rows} style={style} value={value} />
    </label>
  );
}

function ChipGroup({
  disabled,
  label,
  maxSelected,
  onToggle,
  onLimitReached,
  options,
  section,
  t,
  values,
}: {
  disabled?: boolean;
  label: string;
  maxSelected?: number;
  onToggle: (section: TagField, option: string) => void;
  onLimitReached?: () => void;
  options: string[];
  section: TagField;
  t: Translate;
  values: string[];
}) {
  const [draft, setDraft] = useState("");
  const allOptions = Array.from(new Set([...values, ...options]));

  function addDraft() {
    const tag = draft.trim();
    if (!tag || values.includes(tag)) return;
    if (maxSelected !== undefined && values.length >= maxSelected) {
      onLimitReached?.();
      return;
    }

    onToggle(section, tag);
    setDraft("");
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    addDraft();
  }

  return (
    <div role="group" aria-label={label}>
      <div style={{ alignItems: "baseline", display: "flex", gap: 8, marginBottom: 8 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
        <span style={{ color: C.text4, fontSize: 12 }}>{t({ en: `${values.length} selected`, zh: `已选 ${values.length}` })}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allOptions.map((option) => {
          const active = values.includes(option);

          return (
            <button aria-pressed={active} className={`chip${active ? " chip-accent" : ""}`} disabled={disabled} key={option} onClick={() => {
              if (!active && maxSelected !== undefined && values.length >= maxSelected) {
                onLimitReached?.();
                return;
              }
              onToggle(section, option);
            }} type="button">
              {active ? <Icon name="check" size={13} /> : null}
              {option}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          aria-label={t({
            en: `Add ${label.toLowerCase()} item`,
            zh: `添加${label}项目`,
          })}
          className="field"
          maxLength={80}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder={t({
            en: "Enter a specific item",
            zh: "输入具体内容",
          })}
          style={{ flex: "1 1 220px", minWidth: 0 }}
          value={draft}
        />
        <button
          className="btn btn-ghost btn-sm"
          disabled={disabled || !draft.trim() || values.includes(draft.trim()) || (maxSelected !== undefined && values.length >= maxSelected)}
          onClick={addDraft}
          type="button"
        >
          {t({ en: "Add", zh: "添加" })}
        </button>
      </div>
    </div>
  );
}

function EditSections({
  editorDisabled,
  extractProps,
  industryDisabled,
  matchingDirty,
  matchingSaving,
  onLimitReached,
  onSaveMatching,
  onBirthDateChange,
  profile,
  t,
  toggleTag,
  update,
  updateIndustry,
  viewModel,
}: {
  editorDisabled: boolean;
  extractProps: {
    extractText: string;
    extracting: boolean;
    method: Method;
    onTextExtract: () => void;
    setExtractText: (value: string) => void;
    setMethod: (value: Method) => void;
    t: Translate;
  };
  industryDisabled: boolean;
  matchingDirty: boolean;
  matchingSaving: boolean;
  onLimitReached: () => void;
  onSaveMatching: () => void;
  onBirthDateChange: (value: string) => void;
  profile: EditableProfile;
  t: Translate;
  toggleTag: (field: TagField, tag: string) => void;
  update: <K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) => void;
  updateIndustry: (selection: IndustrySelectionContract) => void;
  viewModel: OrbitProfileViewModel;
}) {
  const { language } = useOrbitLanguage();
  const grid: React.CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" };

  return (
    <div className="pf-card pf-edit-card">
      <Section desc={t({ en: "Auto-fill the form from a pasted bio or a business card photo.", zh: "粘贴简介或拍张名片，几秒填好档案。" })} title={t({ en: "Quick fill", zh: "快速填充" })}>
        <ProfileMethods disabled={editorDisabled} {...extractProps} />
      </Section>
      <Section title={t({ en: "Basics", zh: "基本信息" })}>
        <div style={grid}>
          <FieldInput disabled={editorDisabled} label={t({ en: "Name", zh: "姓名" })} onValue={(value) => update("fullName", value)} value={profile.fullName} />
          <label>{t({ en: "Primary industry", zh: "一级行业" })}
            <select className="field" aria-label={t({ en: "Primary industry", zh: "一级行业" })} disabled={industryDisabled} value={profile.primaryIndustryId ?? ""} onChange={event => updateIndustry({ primaryIndustryId: (event.target.value || null) as IndustryIdCode | null, secondaryIndustryId: null })}>
              <option value="">{t({ en: "Not selected", zh: "未选择" })}</option>
              {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
            </select>
          </label>
          <label>{t({ en: "Secondary industry", zh: "二级行业" })}
            <select className="field" aria-label={t({ en: "Secondary industry", zh: "二级行业" })} disabled={industryDisabled || !profile.primaryIndustryId} value={profile.secondaryIndustryId ?? ""} onChange={event => updateIndustry({ primaryIndustryId: profile.primaryIndustryId, secondaryIndustryId: (event.target.value || null) as SecondaryIndustryIdCode | null })}>
              <option value="">{t({ en: "Not selected", zh: "未选择" })}</option>
              {(profile.primaryIndustryId ? listSecondaryIndustries(profile.primaryIndustryId) : []).map(item => <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>)}
            </select>
          </label>
          <FieldInput disabled={editorDisabled} label={t({ en: "Title", zh: "职位" })} onValue={(value) => update("title", value)} value={profile.title} />
          <FieldInput disabled={editorDisabled} label={t({ en: "Company", zh: "公司" })} onValue={(value) => update("company", value)} value={profile.company} />
          <FieldInput disabled={editorDisabled} label={t({ en: "Birthday (private)", zh: "生日（仅本人可见）" })} onValue={onBirthDateChange} type="date" value={profile.birthDate ?? ""} />
        </div>
        {profile.industry.trim() ? (
          <p style={{ color: C.text3, fontSize: 12.5, lineHeight: 1.5, margin: "12px 0 0" }}>
            {t({ en: "Existing industry text is preserved; choose the structured categories above for new edits:", zh: "已有行业文字会保留；新的修改请使用上面的结构化分类：" })} {profile.industry}
          </p>
        ) : null}
      </Section>
      <Section desc={t({ en: "Contact details are optional and are saved independently from matching preferences.", zh: "联系方式可选，与匹配偏好分开保存。" })} title={t({ en: "Contact", zh: "联系方式" })}>
        <div style={grid}>
          <FieldInput disabled={editorDisabled} label={t({ en: "WeChat ID", zh: "微信号" })} onValue={(value) => update("wechatName", value)} value={profile.wechatName} />
          <FieldInput disabled={editorDisabled} label={t({ en: "LINE ID", zh: "LINE ID" })} onValue={(value) => update("lineId", value)} value={profile.lineId} />
          <FieldInput disabled={editorDisabled} label={t({ en: "Email", zh: "邮箱" })} readOnly type="email" value={profile.email} />
        </div>
      </Section>
      <Section desc={t({ en: "Use one short introduction. Existing headline and relationship goal are preserved.", zh: "只填写一句简短介绍，已有标题和关系目标会保留。" })} title={t({ en: "About you", zh: "自我介绍" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FieldTextarea disabled={editorDisabled} label={t({ en: "One-line intro (up to 80 visible characters)", zh: "一句话介绍（最多 80 个可见字符）" })} onValue={(value) => update("bio", value)} rows={3} value={profile.bio} />
          {profile.headline.trim() || profile.intro.trim() ? (
            <p style={{ color: C.text3, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
              {t({ en: "Existing values are preserved:", zh: "已有内容会保留：" })} {profile.headline.trim() ? `${t({ en: "headline", zh: "标题" })}: ${profile.headline}` : null}{profile.headline.trim() && profile.intro.trim() ? " · " : null}{profile.intro.trim() ? `${t({ en: "relationship goal", zh: "关系目标" })}: ${profile.intro}` : null}
            </p>
          ) : null}
        </div>
      </Section>
      <Section desc={t({ en: "Optional preferences are saved separately from basic profile fields.", zh: "可选偏好与基础资料分开保存。" })} title={t({ en: "Matching preferences", zh: "匹配偏好" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ChipGroup disabled={editorDisabled} label={t({ en: "I can offer", zh: "我能提供" })} maxSelected={5} onLimitReached={onLimitReached} onToggle={toggleTag} options={viewModel.offeringTags} section="offering" t={t} values={profile.offering} />
          <ChipGroup disabled={editorDisabled} label={t({ en: "I'm seeking", zh: "我想寻求" })} maxSelected={5} onLimitReached={onLimitReached} onToggle={toggleTag} options={viewModel.seekingTags} section="seeking" t={t} values={profile.seeking} />
          <ChipGroup disabled={editorDisabled} label={t({ en: "Topics to chat about", zh: "想聊的话题" })} onToggle={toggleTag} options={viewModel.topics} section="topics" t={t} values={profile.topics} />
          <button className="btn btn-ghost btn-sm" disabled={editorDisabled || !matchingDirty || matchingSaving} onClick={onSaveMatching} type="button">
            {matchingSaving ? t({ en: "Saving preferences…", zh: "保存偏好中…" }) : t({ en: "Save matching preferences", zh: "保存匹配偏好" })}
          </button>
        </div>
      </Section>
    </div>
  );
}

/* ===================== 总览（个人资料 tab） ===================== */

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="pf-ov-label">{label}</span>
      <span className={value ? "pf-ov-value" : "pf-ov-value is-empty"}>{value || "—"}</span>
    </>
  );
}

function PersonaGroupCard({ icon, title, values, emptyText }: { icon: string; title: string; values: string[]; emptyText: string }) {
  return (
    <span className="pf-persona-card">
      <span className="pf-persona-head">
        <span className="pf-icon-box"><Icon name={icon} size={14} /></span>
        <strong>{title}</strong>
      </span>
      {values.length ? (
        <span className="pf-pill-row">
          {values.map((value) => <span className="pf-pill" key={value}>{value}</span>)}
        </span>
      ) : (
        <span className="pf-persona-empty">{emptyText}</span>
      )}
    </span>
  );
}

function OverviewPanel({
  completeness,
  onEdit,
  profile,
  t,
}: {
  completeness: number;
  onEdit: () => void;
  profile: EditableProfile;
  t: Translate;
}) {
  const { language } = useOrbitLanguage();
  const primaryLabel = profile.primaryIndustryId ? industryLabel(profile.primaryIndustryId, language) : "";
  const secondaryLabel = profile.secondaryIndustryId ? secondaryIndustryLabel(profile.secondaryIndustryId, language) : "";
  const headline = profile.headline.trim();
  const notSet = t({ en: "Not set", zh: "未填写" });
  const previewTags = [...profile.offering, ...profile.seeking].slice(0, 4);
  const previewMeta = [profile.title.trim() || headline, profile.company.trim(), secondaryLabel || primaryLabel].filter(Boolean).join(" · ");
  const suggestions = [
    !profile.bio.trim() ? { icon: "edit", title: t({ en: "Complete your bio", zh: "完善个人简介" }), desc: t({ en: "A clear one-line intro helps people understand you quickly.", zh: "一段清晰的简介能帮助他人更好地了解你。" }) } : null,
    profile.topics.length === 0 ? { icon: "sparkle", title: t({ en: "Add topics you care about", zh: "添加更多兴趣话题" }), desc: t({ en: "Topics let like-minded people find you more easily.", zh: "选择你关注的话题，让志同道合的人更容易找到你。" }) } : null,
    !profile.wechatName.trim() && !profile.lineId.trim() ? { icon: "handshake", title: t({ en: "Add exchange contact details", zh: "完善名片交换联系方式" }), desc: t({ en: "After a card exchange at an event, people can reach you here.", zh: "在活动中交换名片后，他人可通过这里的信息联系你。" }) } : null,
  ].filter(Boolean) as { icon: string; title: string; desc: string }[];

  return (
    <div className="pf-overview-grid">
      <div className="pf-col">
        <section className="pf-card pf-id-card">
          <span className="pf-id-avatar">{profileInitial(profile)}</span>
          <span className="pf-id-copy">
            <strong className="pf-id-name">{profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}</strong>
            {headline || profile.title.trim() ? <span className="pf-id-line">{[profile.title.trim(), headline].filter(Boolean).join(" · ")}</span> : null}
            {profile.company.trim() ? <span className="pf-id-line">{profile.company}</span> : null}
          </span>
          <span className="pf-id-side">
            <span className="pf-complete">
              <span className="pf-complete-label">{t({ en: "Profile completeness", zh: "资料完整度" })} <strong>{completeness}%</strong></span>
              <span className="pf-complete-track"><span className="pf-complete-bar" style={{ width: `${completeness}%` }} /></span>
            </span>
            <span className="pf-id-actions">
              <button className="pf-btn-dark" onClick={onEdit} type="button">{t({ en: "Edit profile", zh: "编辑资料" })}</button>
              <a className="pf-btn-ghost" href="#pf-preview">{t({ en: "Preview public profile", zh: "预览公开资料" })}</a>
            </span>
          </span>
        </section>

        <section className="pf-card">
          <span className="pf-card-head">
            <strong className="pf-card-title">{t({ en: "Basic information", zh: "基础资料" })}</strong>
            <button className="pf-btn-ghost pf-btn-sm" onClick={onEdit} type="button">{t({ en: "Edit basics", zh: "编辑基础资料" })}</button>
          </span>
          <div className="pf-ov-grid">
            <OverviewRow label={t({ en: "Name", zh: "姓名" })} value={profile.fullName.trim()} />
            <OverviewRow label="Headline" value={headline} />
            <OverviewRow label={t({ en: "Company", zh: "公司" })} value={profile.company.trim()} />
            <OverviewRow label={t({ en: "Title", zh: "职位" })} value={profile.title.trim()} />
            <OverviewRow label={t({ en: "Primary industry", zh: "主行业" })} value={primaryLabel || profile.industry.trim()} />
            <OverviewRow label={t({ en: "Secondary industry", zh: "次行业" })} value={secondaryLabel} />
            <OverviewRow label={t({ en: "Bio", zh: "简介" })} value={profile.bio.trim()} />
          </div>
        </section>

        <section className="pf-card">
          <span className="pf-card-head">
            <strong className="pf-card-title">{t({ en: "Business persona", zh: "商务画像" })}</strong>
            <button className="pf-btn-ghost pf-btn-sm" onClick={onEdit} type="button">{t({ en: "Edit persona", zh: "编辑商务画像" })}</button>
          </span>
          <div className="pf-persona-grid">
            <PersonaGroupCard icon="handshake" title={t({ en: "I can offer", zh: "我能提供" })} values={profile.offering} emptyText={notSet} />
            <PersonaGroupCard icon="target" title={t({ en: "I'm seeking", zh: "我想寻求" })} values={profile.seeking} emptyText={notSet} />
            <PersonaGroupCard icon="message" title={t({ en: "Topics to chat about", zh: "想聊的话题" })} values={profile.topics} emptyText={notSet} />
          </div>
        </section>
      </div>

      <div className="pf-col">
        <section className="pf-card">
          <span className="pf-card-head">
            <strong className="pf-card-title">{t({ en: "Contact info", zh: "联系信息" })}</strong>
            <button className="pf-btn-ghost pf-btn-sm" onClick={onEdit} type="button">{t({ en: "Edit", zh: "编辑" })}</button>
          </span>
          <div className="pf-contact-list">
            <span className="pf-contact-row">
              <span className="pf-icon-box"><Icon name="message" size={12} /></span>
              <span className="pf-contact-copy"><span className="pf-contact-label">{t({ en: "WeChat", zh: "微信" })}</span><span className="pf-contact-value">{profile.wechatName.trim() || notSet}</span></span>
              <span className="pf-scope">{t({ en: "Shared after card exchange", zh: "交换名片后可见" })}</span>
            </span>
            <span className="pf-contact-row">
              <span className="pf-icon-box"><Icon name="phone" size={12} /></span>
              <span className="pf-contact-copy"><span className="pf-contact-label">LINE</span><span className="pf-contact-value">{profile.lineId.trim() || notSet}</span></span>
              <span className="pf-scope">{t({ en: "Shared after card exchange", zh: "交换名片后可见" })}</span>
            </span>
            <span className="pf-contact-row">
              <span className="pf-icon-box"><Icon name="mail" size={12} /></span>
              <span className="pf-contact-copy"><span className="pf-contact-label">Email</span><span className="pf-contact-value">{profile.email.trim() || notSet}</span></span>
              <span className="pf-scope">{t({ en: "Sign-in email · only you", zh: "登录邮箱 · 仅本人" })}</span>
            </span>
          </div>
        </section>

        <section className="pf-card">
          <strong className="pf-card-title">{t({ en: "Profile suggestions", zh: "资料建议" })}</strong>
          {suggestions.length ? suggestions.map((item) => (
            <button className="pf-suggestion" key={item.title} onClick={onEdit} type="button">
              <span className="pf-icon-box pf-suggestion-icon"><Icon name={item.icon} size={15} /></span>
              <span className="pf-suggestion-copy"><strong>{item.title}</strong><span>{item.desc}</span></span>
              <span className="pf-suggestion-chev"><Icon name="chevR" size={15} /></span>
            </button>
          )) : (
            <p className="pf-persona-empty" style={{ margin: 0 }}>{t({ en: "Your profile looks complete. Nice work.", zh: "资料已完善，保持更新即可。" })}</p>
          )}
        </section>

        <section className="pf-card" id="pf-preview">
          <span className="pf-card-head">
            <strong className="pf-card-title">{t({ en: "Public preview", zh: "公开预览" })}</strong>
          </span>
          <span className="pf-preview-head">
            <span className="pf-preview-avatar">{profileInitial(profile)}</span>
            <span className="pf-preview-copy">
              <strong>{profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}</strong>
              {previewMeta ? <span>{previewMeta}</span> : null}
            </span>
          </span>
          {profile.bio.trim() ? <span className="pf-preview-bio">{profile.bio.trim()}</span> : null}
          {previewTags.length ? (
            <span className="pf-pill-row">
              {previewTags.map((value) => <span className="pf-pill" key={value}>{value}</span>)}
            </span>
          ) : null}
          {!profile.bio.trim() && !previewTags.length && !previewMeta ? (
            <span className="pf-persona-empty">{t({ en: "Public preview fills in as you complete your profile.", zh: "完善资料后，这里会展示你的公开形象。" })}</span>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/* ===================== 作用域样式 =====================
   React 静态渲染会把 <style> 内容里的双引号转义成 &quot;，
   因此属性选择器一律不加引号。 */
const PROFILE_0918_CSS = `
[data-orbit-real-page=profile] { background: #FBFBFE; min-height: 100dvh; }
[data-orbit-real-page=profile] .pf-main { max-width: 1120px; margin: 0 auto; padding: 14px 24px 96px; display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page=profile] .pf-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=profile] .pf-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 20px; }
[data-orbit-real-page=profile] .pf-title { margin: 0; color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: clamp(30px, 3.6vw, 40px); letter-spacing: -0.03em; }
[data-orbit-real-page=profile] .pf-sub { margin: 8px 0 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-head-actions { display: flex; gap: 12px; }
[data-orbit-real-page=profile] .pf-tabs { display: flex; gap: 32px; flex-wrap: wrap; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page=profile] .pf-tab { padding: 0 0 14px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; color: #6B6F99; font-size: 15px; cursor: pointer; }
[data-orbit-real-page=profile] .pf-tab[data-active=true] { border-bottom-color: #4B4FC7; color: #0E1225; font-weight: 600; }
[data-orbit-real-page=profile] .pf-panel[hidden] { display: none; }
[data-orbit-real-page=profile] .pf-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
[data-orbit-real-page=profile] .pf-overview-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page=profile] .pf-edit-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
[data-orbit-real-page=profile] .pf-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page=profile] .pf-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=profile] .pf-card-title { color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page=profile] .pf-btn-dark { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 22px; border: 0; border-radius: 10px; background: #0E1225; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
[data-orbit-real-page=profile] .pf-btn-dark:hover { background: #2E3270; }
[data-orbit-real-page=profile] .pf-btn-dark:disabled { background: #ECEEFB; color: #9FA3C4; cursor: not-allowed; }
[data-orbit-real-page=profile] .pf-btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 22px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer; text-decoration: none; }
[data-orbit-real-page=profile] .pf-btn-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page=profile] .pf-btn-ghost.pf-btn-sm { padding: 9px 16px; border-radius: 9px; font-size: 13px; }
[data-orbit-real-page=profile] .pf-icon-box { width: 28px; height: 28px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
[data-orbit-real-page=profile] .pf-id-card { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 24px; }
[data-orbit-real-page=profile] .pf-id-avatar { width: 92px; height: 92px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: inline-flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: 34px; }
[data-orbit-real-page=profile] .pf-id-copy { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page=profile] .pf-id-name { color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; }
[data-orbit-real-page=profile] .pf-id-line { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-id-side { display: flex; flex-direction: column; gap: 14px; min-width: 240px; }
[data-orbit-real-page=profile] .pf-complete { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page=profile] .pf-complete-label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-complete-label strong { font-weight: 700; color: #0E1225; }
[data-orbit-real-page=profile] .pf-complete-track { display: block; height: 7px; border-radius: 999px; background: #ECEEFB; overflow: hidden; }
[data-orbit-real-page=profile] .pf-complete-bar { display: block; height: 7px; border-radius: 999px; background: #4B4FC7; }
[data-orbit-real-page=profile] .pf-id-actions { display: flex; gap: 12px; flex-wrap: wrap; }
[data-orbit-real-page=profile] .pf-ov-grid { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px 20px; align-items: start; font-size: 14px; }
[data-orbit-real-page=profile] .pf-ov-label { color: #6B6F99; }
[data-orbit-real-page=profile] .pf-ov-value { color: #0E1225; line-height: 1.7; overflow-wrap: anywhere; }
[data-orbit-real-page=profile] .pf-ov-value.is-empty { color: #9FA3C4; }
[data-orbit-real-page=profile] .pf-persona-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 14px; }
[data-orbit-real-page=profile] .pf-persona-card { padding: 18px; border-radius: 14px; background: #F7F7FD; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page=profile] .pf-persona-head { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page=profile] .pf-persona-empty { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=profile] .pf-pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page=profile] .pf-pill { padding: 6px 12px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; }
[data-orbit-real-page=profile] .pf-contact-list { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page=profile] .pf-contact-row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 4px 10px; align-items: center; }
[data-orbit-real-page=profile] .pf-contact-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
[data-orbit-real-page=profile] .pf-contact-label { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-contact-value { font-size: 13px; color: #4B4FC7; word-break: break-all; }
[data-orbit-real-page=profile] .pf-scope { grid-column: 2; justify-self: start; padding: 5px 10px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 11px; }
[data-orbit-real-page=profile] .pf-suggestion { display: flex; align-items: center; gap: 12px; padding: 14px 4px; border: 0; border-top: 1px solid #F1F1FA; background: transparent; text-align: left; cursor: pointer; }
[data-orbit-real-page=profile] .pf-suggestion-icon { width: 32px; height: 32px; border-radius: 10px; }
[data-orbit-real-page=profile] .pf-suggestion-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page=profile] .pf-suggestion-copy strong { font-size: 14px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page=profile] .pf-suggestion-copy span { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=profile] .pf-suggestion-chev { color: #9FA3C4; }
[data-orbit-real-page=profile] .pf-preview-head { display: flex; gap: 16px; align-items: center; }
[data-orbit-real-page=profile] .pf-preview-avatar { width: 66px; height: 66px; flex: none; border-radius: 50%; background: #ECEEFB; color: #2E3270; display: inline-flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: 24px; }
[data-orbit-real-page=profile] .pf-preview-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
[data-orbit-real-page=profile] .pf-preview-copy strong { font-size: 17px; color: #0E1225; }
[data-orbit-real-page=profile] .pf-preview-copy span { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=profile] .pf-preview-bio { font-size: 13px; line-height: 1.8; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-edit-card { padding: 0; overflow: hidden; gap: 0; }
[data-orbit-real-page=profile] .pf-section { padding: 24px 26px 26px; }
[data-orbit-real-page=profile] .pf-section + .pf-section { border-top: 1px solid #E8E9F6; }
[data-orbit-real-page=profile] .pf-section-head { margin-bottom: 18px; }
[data-orbit-real-page=profile] .pf-section-title { margin: 0; color: #0E1225; font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-size: 18px; font-weight: 900; letter-spacing: -0.01em; }
[data-orbit-real-page=profile] .pf-section-desc { color: #6B6F99; font-size: 13px; line-height: 1.5; margin: 5px 0 0; }
[data-orbit-real-page=profile] .pf-method { align-items: center; background: #FFFFFF; border: 1px solid #DDDEFA; border-radius: 999px; color: #3B3F7A; cursor: pointer; display: inline-flex; font-size: 13.5px; font-weight: 600; gap: 7px; height: 36px; padding: 0 14px; }
[data-orbit-real-page=profile] .pf-method.is-active { background: #ECEEFB; border-color: #4B4FC7; color: #4B4FC7; }
[data-orbit-real-page=profile] .pf-method:disabled { opacity: 0.55; cursor: not-allowed; }
[data-orbit-real-page=profile] .pf-onboarding { background: #F7F7FD; border: 1px solid #E8E9F6; border-radius: 12px; color: #3B3F7A; font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
[data-orbit-real-page=profile] .pf-side-note { color: #6B6F99; font-size: 12.5px; line-height: 1.5; margin: 0; text-align: center; }
[data-orbit-real-page=profile] .pf-tips { display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page=profile] .pf-tip { display: flex; gap: 14px; align-items: flex-start; }
[data-orbit-real-page=profile] .pf-tip-n { width: 28px; height: 28px; flex: none; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page=profile] .pf-tip-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page=profile] .pf-tip-copy strong { font-size: 14px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page=profile] .pf-tip-copy span { font-size: 12px; color: #6B6F99; line-height: 1.6; }
[data-orbit-real-page=profile] .chip { border-radius: 999px; }
[data-orbit-real-page=profile] .chip.chip-accent { background: #ECEEFB; border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page=profile] .btn.btn-primary { background: #0E1225; border-color: #0E1225; }
[data-orbit-real-page=profile] .btn.btn-primary:hover { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page=profile] .field:focus { border-color: #4B4FC7; }
[data-orbit-real-page=profile] .pf-tab:focus-visible, [data-orbit-real-page=profile] .pf-btn-dark:focus-visible, [data-orbit-real-page=profile] .pf-btn-ghost:focus-visible, [data-orbit-real-page=profile] .pf-suggestion:focus-visible { outline: 2px solid #4B4FC7; outline-offset: 2px; }
@media (max-width: 960px) {
  [data-orbit-real-page=profile] .pf-overview-grid, [data-orbit-real-page=profile] .pf-edit-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  [data-orbit-real-page=profile] .pf-main { padding: 12px 16px 88px; }
  [data-orbit-real-page=profile] .pf-card { padding: 20px; }
  [data-orbit-real-page=profile] .pf-id-side { min-width: 0; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page=profile] .pf-card { transition: none; }
}
`;

export function OrbitRealProfile({
  onboardingNext,
  viewModel,
}: {
  onboardingNext?: string;
  viewModel: OrbitProfileViewModel | OrbitProfileEditorViewModel;
}) {
  const { t } = useOrbitLanguage();
  const initialView = viewModel as OrbitProfileEditorViewModel;
  const initialProfile: EditableProfile = {
    ...initialView.profile,
    birthDate: initialView.profile.birthDate ?? null,
    expectedUpdatedAt: initialView.profile.expectedUpdatedAt ?? null,
    handles: initialView.profile.handles ? { ...initialView.profile.handles } : undefined,
    hasPersistedProfile: initialView.profile.hasPersistedProfile ?? false,
    onboarding: initialView.profile.onboarding ?? {
      policyVersion: 1,
      status: "incomplete",
      missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
    },
    offering: [...initialView.profile.offering],
    seeking: [...initialView.profile.seeking],
    topics: [...initialView.profile.topics],
  };
  const [profile, setProfile] = useState<EditableProfile>(initialProfile);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [dirtyFields, setDirtyFields] = useState<Set<ProfileEditorField>>(() =>
    initialProfile.hasPersistedProfile
      ? new Set<ProfileEditorField>()
      : new Set<ProfileEditorField>(["displayName"]),
  );
  const [dirtyHandleFields, setDirtyHandleFields] = useState<Set<ProfileEditorVisibleHandleKey>>(new Set());
  const [industryReady, setIndustryReady] = useState(false);
  const [method, setMethod] = useState<Method>("manual");
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchingSaving, setMatchingSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [requiresReconcile, setRequiresReconcile] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<NoticeKind>("info");
  const mountedRef = useRef(true);
  const operationEpoch = useRef(0);
  const reloadInFlight = useRef<number | null>(null);
  const saveInFlight = useRef<number | null>(null);
  const pendingSave = useRef<{
    fingerprint: string;
    input: ManualProfileUpdateInput;
    scope: ProfileEditorSaveScope;
  } | null>(null);
  const editorDisabled = !industryReady || extracting || saving || matchingSaving || reloading || requiresReconcile;

  function knownOnboarding(value: ProfilePayload["onboarding"]): value is NonNullable<ProfilePayload["onboarding"]> {
    return Boolean(
      value &&
        value.policyVersion === 1 &&
        (value.status === "complete" || value.status === "incomplete") &&
        Array.isArray(value.missingFields),
    );
  }

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    const loadEpoch = ++operationEpoch.current;
    // Re-read the actor-scoped profile so the editor starts from the real
    // revision, private birthday, and complete hidden handle object.
    void (async () => {
      try {
        const response = await fetch("/api/profile", { cache: "no-store", headers: { accept: "application/json" } });
        const envelope = await response.json() as ApiEnvelope<ProfilePayload>;
        if (!response.ok || envelope.success !== true || !envelope.data || !knownOnboarding(envelope.data.onboarding)) {
          throw new Error("Profile read failed");
        }
        if (!active || !mountedRef.current || operationEpoch.current !== loadEpoch) return;
        if (envelope.data.profile) {
          setProfile(current => profileEditorViewFromPayload(current, envelope.data!));
          setDirtyFields(new Set());
          setDirtyHandleFields(new Set());
        } else {
          setProfile(current => ({
            ...current,
            birthDate: null,
            expectedUpdatedAt: null,
            hasPersistedProfile: false,
            onboarding: envelope.data!.onboarding!,
            primaryIndustryId: undefined,
            secondaryIndustryId: undefined,
          }));
          setDirtyFields(current => new Set(current).add("displayName"));
          setDirtyHandleFields(new Set());
        }
        setIndustryReady(true);
      } catch {
        if (!active || !mountedRef.current || operationEpoch.current !== loadEpoch) return;
        setMessageKind("error");
        setMessage(t({ en: "Could not load your profile policy. Reload before saving.", zh: "资料政策读取失败，请刷新后再保存。" }));
      }
    })();
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, []);
  const subText = t({ en: "Fill it once, auto-reused when registering for every event.", zh: "填一次，报名各场活动自动复用。" });

  function markDirty(field: ProfileEditorField) {
    setDirtyFields(current => new Set(current).add(field));
  }

  function update<K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) {
    if (editorDisabled) return;
    const editorField: Partial<Record<keyof OrbitProfileView, ProfileEditorField>> = {
      bio: "bio",
      company: "organization",
      fullName: "displayName",
      title: "role",
      wechatName: "handles",
      lineId: "handles",
    };
    const dirty = editorField[field];
    setProfile((current) => ({ ...current, [field]: value }));
    if (dirty) markDirty(dirty);
    if (field === "lineId" || field === "wechatName") {
      setDirtyHandleFields(current => new Set(current).add(field === "lineId" ? "lineId" : "wechatId"));
    }
  }

  function updateBirthDate(value: string) {
    if (editorDisabled) return;
    setProfile(current => ({ ...current, birthDate: value || null }));
    markDirty("birthDate");
  }

  function updateIndustry(selection: IndustrySelectionContract) {
    if (editorDisabled) return;
    setProfile(current => ({ ...current, ...selection }));
    if (selection.primaryIndustryId !== undefined) markDirty("primaryIndustryId");
    if (selection.secondaryIndustryId !== undefined) markDirty("secondaryIndustryId");
  }

  function toggleTag(field: TagField, tag: string) {
    if (editorDisabled) return;
    setProfile((current) => {
      const values = current[field];
      return { ...current, [field]: values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag] };
    });
    markDirty(field);
  }

  async function extractProfile(
    input: { fileName: string; mimeType: string; text?: string },
  ) {
    if (editorDisabled || extracting) return;
    setExtracting(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile/extractions/resume", {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const envelope =
        (await response.json()) as ApiEnvelope<ProfileDocumentExtractionPayload>;

      if (!response.ok || envelope.success !== true || !envelope.data) {
        throw new Error(
          envelope.error?.message ||
            t({ en: "Profile extraction failed.", zh: "档案提取失败。" }),
        );
      }

      if (envelope.data.state !== "success" || !envelope.data.draft) {
        setMessageKind("info");
        setMessage(
          t({
            en: "No profile fields were extracted. Your profile was not changed.",
            zh: "未提取到档案字段，你的档案没有发生变化。",
          }),
        );
        return;
      }

      const draft = envelope.data.draft;
      setProfile((current) => applyExtractionDraft(current, envelope.data!));
      if (draft?.displayName) markDirty("displayName");
      if (draft?.organization) markDirty("organization");
      if (draft?.role) markDirty("role");
      setMessageKind("info");
      setMessage(
        t({
          en: "Extracted draft fields were filled into the form. Review them before saving.",
          zh: "提取出的草稿字段已填入表单，请复核后再保存。",
        }),
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : t({ en: "Profile extraction failed.", zh: "档案提取失败。" }),
      );
    } finally {
      setExtracting(false);
    }
  }

  async function onTextExtract() {
    if (editorDisabled) return;
    const text = extractText.trim();
    if (!text) {
      setMessageKind("error");
      setMessage(
        t({
          en: "Paste profile text before extracting.",
          zh: "请先粘贴档案文本再提取。",
        }),
      );
      return;
    }

    await extractProfile({
      fileName: "pasted-profile.txt",
      mimeType: "text/plain",
      text,
    });
  }

  async function saveProfile(scope: ProfileEditorSaveScope) {
    if (editorDisabled || reloadInFlight.current !== null || saveInFlight.current !== null) return;
    const scopeFields = profileSaveScopeFields(scope);
    const scopeDirty = new Set([...dirtyFields].filter(field => scopeFields.has(field)));
    if (scopeDirty.size === 0) {
      setMessageKind("info");
      setMessage(t({ en: "There are no changes in this section.", zh: "此区块没有待保存的修改。" }));
      return;
    }
    const dirtyHandleFieldsAtSave = new Set(dirtyHandleFields);
    const validation = validateProfileSaveDraft({ profile, scope, scopeDirty });
    if (validation.ok === false) {
      setMessageKind("error");
      setMessage(t(validation.message));
      return;
    }

    const newInput = profileEditorUpdateInput({
      dirtyFields: scopeDirty,
      expectedUpdatedAt: profile.expectedUpdatedAt,
      mutationId: globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}`,
      profile,
      scope,
    });
    const inputFingerprint = JSON.stringify({ ...newInput, mutationId: undefined });
    const pending = pendingSave.current;
    const updateInput = pending?.scope === scope && pending.fingerprint === inputFingerprint
      ? pending.input
      : newInput;
    const saveEpoch = ++operationEpoch.current;
    saveInFlight.current = saveEpoch;
    pendingSave.current = { fingerprint: inputFingerprint, input: updateInput, scope };
    if (scope === "basic") setSaving(true); else setMatchingSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        body: JSON.stringify(updateInput),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const envelope = (await response.json()) as ApiEnvelope<ProfilePayload>;
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;

      if (!response.ok || envelope.success !== true || !envelope.data) {
        if (profileSaveFailureKind(response.status, envelope.error?.code) === "conflict") {
          setRequiresReconcile(true);
          throw new Error(t({ en: "This profile changed elsewhere. Reload the latest profile before saving this draft.", zh: "资料已在其他位置发生变化，请先刷新最新资料，再处理当前草稿。" }));
        }
        throw new Error(envelope.error?.message || t({ en: "Profile save failed.", zh: "档案保存失败。" }));
      }
      if (envelope.data.mutationId !== updateInput.mutationId) {
        throw new Error(t({ en: "The save receipt could not be verified. Retry the same draft.", zh: "保存回执无法核验，请使用相同草稿重试。" }));
      }

      const readbackResponse = await fetch("/api/profile", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const readback = (await readbackResponse.json()) as ApiEnvelope<ProfilePayload>;
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;
      if (!readbackResponse.ok || readback.success !== true || !readback.data || !knownOnboarding(readback.data.onboarding) || !profileEditorReadbackMatches(updateInput, readback.data)) {
        throw new Error(t({ en: "The save could not be verified by reading the profile back.", zh: "保存结果无法通过重新读取资料完成核验。" }));
      }
      const matchingDraftAtSave = [...dirtyFields].some((field) =>
        field === "offering" || field === "seeking" || field === "topics",
      );
      const shouldContinue =
        scope === "basic" &&
        Boolean(onboardingNext) &&
        readback.data.onboarding.status === "complete" &&
        !matchingDraftAtSave;

      setProfile(current => mergeProfilePreservingDraft({
        current,
        dirtyHandleFields: dirtyHandleFieldsAtSave,
        latest: profileEditorViewFromPayload(current, readback.data!),
        preserve: new Set([...dirtyFields].filter(field => !scopeFields.has(field))),
      }));
      setDirtyFields(current => {
        const next = new Set(current);
        for (const field of scopeFields) next.delete(field);
        return next;
      });
      if (scope === "basic") setDirtyHandleFields(new Set());
      pendingSave.current = null;
      setRequiresReconcile(false);
      setMessageKind("success");
      setMessage(
        t(
          onboardingNext &&
            scope === "basic" &&
            readback.data.onboarding.status === "complete" &&
            matchingDraftAtSave
            ? {
                en: "Basic profile saved and verified. Matching preferences still have unsaved changes.",
                zh: "基础资料已保存并完成复读核验；匹配偏好还有未保存的修改。",
              }
            : {
                en: scope === "basic"
                  ? "Basic profile saved and verified."
                  : "Matching preferences saved and verified.",
                zh: scope === "basic"
                  ? "基础资料已保存并完成复读核验。"
                  : "匹配偏好已保存并完成复读核验。",
              },
        ),
      );
      if (shouldContinue) {
        window.location.assign(profileContinuationPath(onboardingNext!));
      }
    } catch (error) {
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : t({ en: "Profile save failed.", zh: "档案保存失败。" }));
    } finally {
      if (saveInFlight.current === saveEpoch) {
        saveInFlight.current = null;
        if (mountedRef.current && operationEpoch.current === saveEpoch) {
          if (scope === "basic") setSaving(false); else setMatchingSaving(false);
        }
      }
    }
  }

  async function reloadLatestProfile() {
    if (
      saving ||
      matchingSaving ||
      extracting ||
      reloadInFlight.current !== null ||
      saveInFlight.current !== null
    ) return;
    const reloadEpoch = ++operationEpoch.current;
    reloadInFlight.current = reloadEpoch;
    const dirtyAtReload = new Set(dirtyFields);
    const dirtyHandleFieldsAtReload = new Set(dirtyHandleFields);
    setReloading(true);
    setRequiresReconcile(true);
    try {
      const response = await fetch("/api/profile", { cache: "no-store", headers: { accept: "application/json" } });
      const envelope = await response.json() as ApiEnvelope<ProfilePayload>;
      if (!response.ok || envelope.success !== true || !envelope.data || !knownOnboarding(envelope.data.onboarding)) throw new Error("Profile reload failed");
      if (!mountedRef.current || operationEpoch.current !== reloadEpoch) return;
      setProfile(current => mergeProfilePreservingDraft({
        current,
        dirtyHandleFields: dirtyHandleFieldsAtReload,
        latest: envelope.data!.profile
          ? profileEditorViewFromPayload(current, envelope.data!)
          : emptyProfileAfterReload(current, envelope.data!.onboarding!),
        preserve: dirtyAtReload,
      }));
      setDirtyFields(dirtyAtReload);
      setDirtyHandleFields(dirtyHandleFieldsAtReload);
      pendingSave.current = null;
      setRequiresReconcile(false);
      setMessageKind("info");
      setMessage(t({ en: "Latest profile loaded. Your unsaved fields remain in the draft; save again to reconcile them.", zh: "最新资料已加载，未保存字段仍保留在草稿中；请再次保存以完成合并。" }));
    } catch (error) {
      if (!mountedRef.current || operationEpoch.current !== reloadEpoch) return;
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : t({ en: "Profile reload failed.", zh: "资料刷新失败。" }));
    } finally {
      if (reloadInFlight.current === reloadEpoch) {
        reloadInFlight.current = null;
        if (mountedRef.current && operationEpoch.current === reloadEpoch) {
          setReloading(false);
        }
      }
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveProfile("basic");
  }

  const extractProps = { extractText, extracting, method, onTextExtract, setExtractText, setMethod, t };
  const matchingDirty = ["offering", "seeking", "topics"].some(field => dirtyFields.has(field as ProfileEditorField));
  const onLimitReached = () => {
    setMessageKind("error");
    setMessage(t({ en: "You can select up to five offerings or five things you are seeking.", zh: "能提供和想寻求各最多选择 5 项。" }));
  };
  const editProps = {
    editorDisabled,
    extractProps,
    industryDisabled: saving || matchingSaving || !industryReady || requiresReconcile,
    matchingDirty,
    matchingSaving,
    onBirthDateChange: updateBirthDate,
    onLimitReached,
    onSaveMatching: () => void saveProfile("matching"),
    profile,
    t,
    toggleTag,
    update,
    updateIndustry,
    viewModel: initialView,
  };
  const alert = message ? (
    <div role={messageKind === "error" ? "alert" : "status"} style={{ background: messageKind === "error" ? "#FBEAEA" : messageKind === "success" ? "#E6F1EC" : "#F7F7FD", borderRadius: 12, color: messageKind === "error" ? "#B5473A" : messageKind === "success" ? "#2F6B4F" : C.text2, fontSize: 13, padding: "10px 14px" }}>
      {message}
      {requiresReconcile ? <button aria-busy={reloading} className="btn btn-ghost btn-sm" disabled={reloading} onClick={() => void reloadLatestProfile()} style={{ marginLeft: 10 }} type="button">{reloading ? t({ en: "Reloading latest…", zh: "正在刷新最新资料…" }) : t({ en: "Reload latest", zh: "刷新最新资料" })}</button> : null}
    </div>
  ) : null;
  const ONBOARDING_FIELD_TOTAL = 4;
  const completeness = profile.onboarding.status === "complete"
    ? 100
    : Math.max(0, Math.min(100, Math.round(((ONBOARDING_FIELD_TOTAL - profile.onboarding.missingFields.length) / ONBOARDING_FIELD_TOTAL) * 100)));
  const tabMeta: Record<ProfileTab, { crumb: string; title: string }> = {
    overview: { crumb: t({ en: "Profile", zh: "个人资料" }), title: t({ en: "Profile", zh: "个人资料" }) },
    edit: { crumb: t({ en: "Edit profile", zh: "编辑资料" }), title: t({ en: "Edit profile", zh: "编辑资料" }) },
  };

  return (
    <main data-orbit-real-page="profile">
      <style>{PROFILE_0918_CSS}</style>
      <PublicTopNav active="me" />
      <form onSubmit={onSubmit}>
        <div className="pf-main">
          <span className="pf-crumb">{t({ en: "Account", zh: "个人中心" })} / {tabMeta[tab].crumb}</span>
          <div className="pf-head">
            <div>
              <h1 className="pf-title">{tabMeta[tab].title}</h1>
              <p className="pf-sub">{subText}</p>
            </div>
            <span className="pf-head-actions">
              {tab === "edit" ? (
                <button className="pf-btn-ghost" onClick={() => setTab("overview")} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
              ) : null}
              <button className="pf-btn-dark" disabled={editorDisabled} type="submit">
                <Icon color="var(--on-dark)" name="check" size={16} />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save basic profile", zh: "保存基础资料" })}
              </button>
            </span>
          </div>
          {alert}
          <nav aria-label={t({ en: "Profile sections", zh: "个人中心栏目" })} className="pf-tabs">
            <button className="pf-tab" data-active={tab === "overview" ? "true" : undefined} onClick={() => setTab("overview")} type="button">{t({ en: "Profile", zh: "个人资料" })}</button>
            <button className="pf-tab" data-active={tab === "edit" ? "true" : undefined} onClick={() => setTab("edit")} type="button">{t({ en: "Edit profile", zh: "编辑资料" })}</button>
          </nav>

          <div className="pf-panel" hidden={tab !== "overview"}>
            <OverviewPanel completeness={completeness} onEdit={() => setTab("edit")} profile={profile} t={t} />
          </div>
          <div className="pf-panel" hidden={tab !== "edit"}>
            <div className="pf-edit-grid">
              <EditSections {...editProps} />
              <div className="pf-col">
                <section className="pf-card">
                  <span className="pf-card-head">
                    <strong className="pf-card-title">{t({ en: "Live preview", zh: "预览效果" })}</strong>
                  </span>
                  <BusinessCardPreview profile={profile} t={t} />
                  <p className="pf-side-note">
                    {t({ en: "This is how you appear to matches — updates as you type.", zh: "这是别人看到的你，边填边更新。" })}
                  </p>
                </section>
                <section className="pf-card">
                  <strong className="pf-card-title">{t({ en: "Writing tips", zh: "填写建议" })}</strong>
                  <div className="pf-tips">
                    <span className="pf-tip"><span className="pf-tip-n">1</span><span className="pf-tip-copy"><strong>{t({ en: "Lead with your core value", zh: "突出你的核心价值" })}</strong><span>{t({ en: "Use specific, clear keywords so people understand you at a glance.", zh: "使用具体、清晰的关键词，让他人快速了解你。" })}</span></span></span>
                    <span className="pf-tip"><span className="pf-tip-n">2</span><span className="pf-tip-copy"><strong>{t({ en: "Match your real intent", zh: "结合你的真实意图" })}</strong><span>{t({ en: "Pick what is most relevant to your current stage and interests.", zh: "基于你当前的阶段和兴趣，选择最相关的内容。" })}</span></span></span>
                    <span className="pf-tip"><span className="pf-tip-n">3</span><span className="pf-tip-copy"><strong>{t({ en: "Keep it concise and professional", zh: "保持简洁与专业" })}</strong><span>{t({ en: "Three to five keywords per section work best.", zh: "建议每个部分选择 3–5 个关键词，便于他人快速理解。" })}</span></span></span>
                  </div>
                </section>
                <OnboardingStatus continueHref={onboardingNext ? profileContinuationPath(onboardingNext) : undefined} onboarding={profile.onboarding} t={t} />
              </div>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
