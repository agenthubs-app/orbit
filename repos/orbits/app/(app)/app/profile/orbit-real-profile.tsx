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
import { AccountTopNav, MobileBar, orbitNavigate, StatusBar } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitProfileView, OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { Avatar, gradientFromString, Icon, Logo } from "../orbit-reference-primitives";
import { ORBIT_Z } from "../orbit-z";
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
    <div style={{ background: CARD_BG, borderRadius: "var(--r-lg)", boxShadow: "var(--sh-lg)", overflow: "hidden", position: "relative" }}>
      <div aria-hidden style={{ background: CARD_GLOW, inset: 0, pointerEvents: "none", position: "absolute" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "24px 24px 22px", position: "relative" }}>
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between" }}>
          <Avatar g={gradientFromString(profile.fullName.trim() || "Orbit")} letter={profileInitial(profile)} ring="rgba(255,255,255,0.22)" size={56} />
          <Logo color="rgba(255,255,255,0.55)" size={20} withText={false} />
        </div>
        <div>
          <div style={{ color: "#fff", fontFamily: "var(--ff-display)", fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
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
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        color: "var(--text-2)",
        fontSize: 12.5,
        lineHeight: 1.5,
        marginTop: 12,
        padding: "10px 12px",
      }}
    >
      <strong style={{ color: complete ? "var(--live-text)" : "var(--ink)" }}>
        {complete
          ? t({ en: "Basic profile complete", zh: "基础资料已完成" })
          : t({ en: "Still needed", zh: "还需填写" })}
      </strong>
      {!complete ? `: ${missing.join(t({ en: ", ", zh: "、" }))}` : null}
      <div style={{ color: "var(--text-3)", marginTop: 4 }}>
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
    <section style={{ padding: "24px 26px 26px" }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ alignItems: "center", color: "var(--ink)", display: "flex", fontFamily: "var(--ff-display)", fontSize: 16, fontWeight: 650, gap: 9, letterSpacing: "-0.01em", margin: 0 }}>
          <span aria-hidden style={{ background: "var(--accent)", borderRadius: 2, flexShrink: 0, height: 14, width: 3 }} />
          {title}
        </h2>
        {desc ? <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5, margin: "5px 0 0", paddingLeft: 12 }}>{desc}</p> : null}
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
              disabled={disabled}
              key={key}
              onClick={() => setMethod(key)}
              style={{
                alignItems: "center",
                background: on ? "var(--accent-soft)" : "var(--surface)",
                border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                borderRadius: "var(--r-pill)",
                color: on ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer",
                display: "inline-flex",
                fontFamily: "var(--ff)",
                fontSize: 13.5,
                fontWeight: 600,
                gap: 7,
                height: 36,
                padding: "0 14px",
                transition: "background .14s, color .14s, border-color .14s",
              }}
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
      <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5, margin: "10px 0 0" }}>{helper}</p>
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
        style={readOnly ? { background: "var(--surface-2)", color: "var(--text-2)" } : undefined}
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
        <span style={{ color: "var(--text-4)", fontSize: 12 }}>{t({ en: `${values.length} selected`, zh: `已选 ${values.length}` })}</span>
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
    <div className="card orbit-profile-edit" style={{ overflow: "hidden" }}>
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
          <p style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, margin: "12px 0 0" }}>
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
            <p style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
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

const PROFILE_LAYOUT_CSS = `
[data-orbit-real-page="profile"] .orbit-profile-layout {
  align-items: start;
  display: grid;
  gap: 22px;
  grid-template-columns: 330px minmax(0, 1fr);
}
[data-orbit-real-page="profile"] .orbit-profile-preview {
  position: sticky;
  top: 20px;
}
@media (max-width: 1080px) {
  [data-orbit-real-page="profile"] .orbit-profile-layout {
    grid-template-columns: 1fr;
  }
  [data-orbit-real-page="profile"] .orbit-profile-preview {
    position: static;
  }
}
[data-orbit-real-page="profile"] .orbit-profile-edit > section + section {
  border-top: 1px solid var(--border);
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
  const letter = profileInitial(profile);
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
    <div role={messageKind === "error" ? "alert" : "status"} style={{ background: messageKind === "error" ? "var(--danger-soft, #fff1f2)" : messageKind === "success" ? "var(--live-soft)" : "var(--surface-2)", borderRadius: "var(--r-sm)", color: messageKind === "error" ? "var(--danger, #C2410C)" : messageKind === "success" ? "var(--live-text)" : "var(--text-2)", fontSize: 13, marginBottom: 14, padding: "10px 14px" }}>
      {message}
      {requiresReconcile ? <button aria-busy={reloading} className="btn btn-ghost btn-sm" disabled={reloading} onClick={() => void reloadLatestProfile()} style={{ marginLeft: 10 }} type="button">{reloading ? t({ en: "Reloading latest…", zh: "正在刷新最新资料…" }) : t({ en: "Reload latest", zh: "刷新最新资料" })}</button> : null}
    </div>
  ) : null;

  return (
    <main data-orbit-real-page="profile">
      <style dangerouslySetInnerHTML={{ __html: PROFILE_LAYOUT_CSS }} />
      <div className="orbit-desktop-only scroll" data-appscroll style={{ background: "var(--bg)", minHeight: "100dvh", overflowY: "auto", position: "relative" }}>
        <AccountTopNav accountInitial={letter} active="me" />
        <form onSubmit={onSubmit}>
          <div style={{ margin: "0 auto", maxWidth: 1024, padding: "24px 40px 36px" }}>
            <div style={{ alignItems: "center", display: "flex", gap: 10, marginBottom: 16 }}>
              <button aria-label={t({ en: "Back", zh: "返回" })} className="btn btn-quiet btn-sm hit-44" onClick={() => orbitNavigate("/home")} style={{ paddingLeft: 8 }} type="button"><Icon name="chevL" size={16} />{t({ en: "Back", zh: "返回" })}</button>
              <span aria-hidden style={{ background: "var(--border-2)", height: 16, width: 1 }} />
              <h1 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 16, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>{t({ en: "Universal profile", zh: "通用档案" })}</h1>
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>{subText}</span>
            </div>
            {alert}
            <div className="orbit-profile-layout">
              <aside className="orbit-profile-preview">
                <BusinessCardPreview profile={profile} t={t} />
                <OnboardingStatus continueHref={onboardingNext ? profileContinuationPath(onboardingNext) : undefined} onboarding={profile.onboarding} t={t} />
                <p style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, margin: "12px 4px 0", textAlign: "center" }}>
                  {t({ en: "This is how you appear to matches — updates as you type.", zh: "这是别人看到的你，边填边更新。" })}
                </p>
              </aside>
              <EditSections {...editProps} />
            </div>
          </div>
          <div style={{ backdropFilter: "blur(14px)", background: "var(--glass-bar)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", gap: 12, justifyContent: "flex-end", padding: "14px 40px", position: "sticky", zIndex: ORBIT_Z.sticky }}>
            <button className="btn btn-ghost" onClick={() => orbitNavigate("/home")} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
            <button className="btn btn-primary" disabled={editorDisabled} type="submit"><Icon color="var(--on-dark)" name="check" size={16} />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save basic profile", zh: "保存基础资料" })}</button>
          </div>
        </form>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh", position: "relative" }}>
        <StatusBar />
        <form onSubmit={onSubmit} style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          <MobileBar onBack={() => orbitNavigate("/home")} right={<button className="btn btn-primary btn-sm" disabled={editorDisabled} type="submit">{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save basic", zh: "保存基础资料" })}</button>} title={t({ en: "Universal profile", zh: "通用档案" })} />
          <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "14px 16px 100px" }}>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 12px" }}>{subText}</p>
            {alert}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <BusinessCardPreview profile={profile} t={t} />
              <OnboardingStatus continueHref={onboardingNext ? profileContinuationPath(onboardingNext) : undefined} onboarding={profile.onboarding} t={t} />
              <EditSections {...editProps} />
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
