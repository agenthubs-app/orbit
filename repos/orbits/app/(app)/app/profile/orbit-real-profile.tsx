"use client";

import { FormEvent, KeyboardEvent, ReactNode, useState } from "react";

import type { IndustrySelectionContract, IndustryIdCode, SecondaryIndustryIdCode } from "../../../../shared/contract/industries";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../../../shared/domain/industries";
import {
  type OrbitProfileEditorView,
  type OrbitProfileEditorViewModel,
} from "./profile-editor-adapter";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitProfileView, OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { Icon } from "../orbit-reference-primitives";
import { PublicTopNav } from "../orbit-public-shell";
import { ORBIT_0918_COLORS as C } from "../orbit-0918-tokens";
import { profileContinuationPath } from "./profile-onboarding-navigation";
import { useProfileEditorSession } from "./profile-0918/use-profile-editor-session";
// 个人中心 任务 2：星空名片预览搬到 profile-0918/business-card-preview.tsx（任务 1 已把本文件列为修改例外）。
import { BusinessCardPreview, profileInitial } from "./profile-0918/business-card-preview";

type Translate = (copy: { en: string; zh: string }) => string;

type TagField = "offering" | "seeking" | "topics";
type Method = "text" | "manual";
type EditableProfile = OrbitProfileEditorView;
type ProfileTab = "connect" | "edit" | "overview";

export { profileReadbackMatches } from "./profile-0918/use-profile-editor-session";

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
          <p style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, margin: "12px 0 0" }}>
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
            <p style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, margin: 0 }}>
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
/* connect 连接占位（用户 2026-09-19 决定：先占位，全部「即将开放」禁用态） */
[data-orbit-real-page=profile] .pf-connect-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 20px; }
[data-orbit-real-page=profile] .pf-connect-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page=profile] .pf-connect-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=profile] .pf-connect-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; }
[data-orbit-real-page=profile] .pf-connect-chip { padding: 6px 14px; border-radius: 999px; background: #F1F1FA; color: #6B6F99; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page=profile] .pf-connect-name { font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; color: #0E1225; }
[data-orbit-real-page=profile] .pf-connect-desc { font-size: 13px; line-height: 1.8; color: #6B6F99; }
[data-orbit-real-page=profile] .pf-connect-scopes { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid #F1F1FA; }
[data-orbit-real-page=profile] .pf-connect-scope { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page=profile] .pf-connect-scope i { width: 20px; height: 20px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 11px; font-style: normal; }
[data-orbit-real-page=profile] .pf-connect-btn { padding: 14px; border-radius: 10px; background: #F1F1FA; border-color: #E8E9F6; color: #9FA3C4; font-size: 14px; font-weight: 500; justify-content: center; }
[data-orbit-real-page=profile] .pf-connect-note { font-size: 12px; line-height: 1.7; color: #9FA3C4; }
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

/* ===================== 连接（集成占位：即将开放） ===================== */
/* 用户 2026-09-19 决定：connect 连接屏先占位。真实 OAuth 集成尚未实现，
   四张卡片全部禁用态「即将开放」，不写假连接流程、不记任何连接状态。 */
const CONNECT_INTEGRATIONS: readonly {
  glyph: string;
  iconBg: string;
  iconColor: string;
  name: string;
  desc: { en: string; zh: string };
  scopes: readonly { en: string; zh: string }[];
}[] = [
  {
    glyph: "31", iconBg: "#ECEEFB", iconColor: "#2E3270", name: "Google Calendar",
    desc: { en: "Sync your schedule so iOrbit can plan time better for you.", zh: "同步你的日程安排，帮助 iOrbit 更好地为你规划时间。" },
    scopes: [
      { en: "Read calendar events", zh: "读取日程事件" },
      { en: "Create and manage events (after your authorization)", zh: "创建和管理日程（在你授权后）" },
    ],
  },
  {
    glyph: "M", iconBg: "#FBECEA", iconColor: "#B5473A", name: "Gmail",
    desc: { en: "Let iOrbit understand important emails and extract todos and meeting info.", zh: "让 iOrbit 帮你理解重要邮件，提取待办和会议信息。" },
    scopes: [
      { en: "Read important emails (after your authorization)", zh: "读取重要邮件（在你授权后）" },
      { en: "Recognize meeting invites and action items", zh: "识别会议邀请与待办事项" },
    ],
  },
  {
    glyph: "⚇", iconBg: "#ECEEFB", iconColor: "#4B4FC7", name: "Google Contacts",
    desc: { en: "Sync your contacts to manage relationships and meetings more easily.", zh: "同步你的联系人，帮助你更轻松地管理人脉与会议。" },
    scopes: [
      { en: "Read contact info", zh: "读取联系人信息" },
      { en: "Help identify meeting participants", zh: "帮助识别会议参与者" },
    ],
  },
  {
    glyph: "N", iconBg: "#F1F1FA", iconColor: "#0E1225", name: "Notion",
    desc: { en: "Connect your knowledge base so iOrbit understands your projects and work.", zh: "连接你的知识库，让 iOrbit 更好地理解你的项目与工作内容。" },
    scopes: [
      { en: "Read pages and databases (after your authorization)", zh: "读取页面与数据库（在你授权后）" },
      { en: "Help search and summarize related content", zh: "帮助检索与总结相关内容" },
    ],
  },
];

function ConnectPanel({ t }: { t: Translate }) {
  return (
    <div>
      <div className="pf-connect-grid">
        {CONNECT_INTEGRATIONS.map((integration) => (
          <section className="pf-connect-card" key={integration.name}>
            <span className="pf-connect-top">
              <span className="pf-connect-icon" style={{ background: integration.iconBg, color: integration.iconColor }}>{integration.glyph}</span>
              <span className="pf-connect-chip">{t({ en: "Coming soon", zh: "即将开放" })}</span>
            </span>
            <strong className="pf-connect-name">{integration.name}</strong>
            <span className="pf-connect-desc">{t(integration.desc)}</span>
            <span className="pf-connect-scopes">
              {integration.scopes.map((scope) => (
                <span className="pf-connect-scope" key={scope.zh}><i>✓</i>{t(scope)}</span>
              ))}
            </span>
            <span aria-disabled="true" className="btn pf-connect-btn" role="note">{t({ en: "Coming soon", zh: "即将开放" })}</span>
          </section>
        ))}
      </div>
      <p className="pf-connect-note" style={{ marginTop: 18 }}>
        {t({ en: "Integrations are not available yet. Nothing here connects to your accounts or reads any data.", zh: "集成功能尚未开放，此处不会连接你的账号，也不会读取任何数据。" })}
      </p>
    </div>
  );
}

export function OrbitRealProfile({
  onboardingNext,
  viewModel,
}: {
  onboardingNext?: string;
  viewModel: OrbitProfileViewModel | OrbitProfileEditorViewModel;
}) {
  const { t } = useOrbitLanguage();
  const initialView = viewModel as OrbitProfileEditorViewModel;
  const [tab, setTab] = useState<ProfileTab>("overview");
  const {
    dirtyFields,
    editorDisabled,
    extractText,
    extracting,
    industryReady,
    matchingDirty,
    matchingSaving,
    message,
    messageKind,
    method,
    notify,
    onTextExtract,
    profile,
    reloadLatestProfile,
    reloading,
    requiresReconcile,
    saveProfile,
    saving,
    setExtractText,
    setMethod,
    toggleTag,
    update,
    updateBirthDate,
    updateIndustry,
  } = useProfileEditorSession({ onboardingNext, t, viewModel: initialView });
  const subText = t({ en: "Fill it once, auto-reused when registering for every event.", zh: "填一次，报名各场活动自动复用。" });
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveProfile("basic");
  }

  const extractProps = { extractText, extracting, method, onTextExtract, setExtractText, setMethod, t };
  const onLimitReached = () => {
    notify("error", t({ en: "You can select up to five offerings or five things you are seeking.", zh: "能提供和想寻求各最多选择 5 项。" }));
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
    <div role={messageKind === "error" ? "alert" : "status"} style={{ background: messageKind === "error" ? "#FBEAEA" : messageKind === "success" ? "#E6F1EC" : messageKind === "warning" ? "#FBF1DC" : "#F7F7FD", borderRadius: 12, color: messageKind === "error" ? "#B5473A" : messageKind === "success" ? "#2F6B4F" : messageKind === "warning" ? "#8A6420" : C.text2, fontSize: 13, padding: "10px 14px" }}>
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
    connect: { crumb: t({ en: "Connections", zh: "连接" }), title: t({ en: "Connections", zh: "连接" }) },
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
              {tab !== "connect" ? (
                <button className="pf-btn-dark" disabled={editorDisabled} type="submit">
                  <Icon color="var(--on-dark)" name="check" size={16} />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save basic profile", zh: "保存基础资料" })}
                </button>
              ) : null}
            </span>
          </div>
          {alert}
          <nav aria-label={t({ en: "Profile sections", zh: "个人中心栏目" })} className="pf-tabs">
            <button className="pf-tab" data-active={tab === "overview" ? "true" : undefined} onClick={() => setTab("overview")} type="button">{t({ en: "Profile", zh: "个人资料" })}</button>
            <button className="pf-tab" data-active={tab === "edit" ? "true" : undefined} onClick={() => setTab("edit")} type="button">{t({ en: "Edit profile", zh: "编辑资料" })}</button>
            <button className="pf-tab" data-active={tab === "connect" ? "true" : undefined} onClick={() => setTab("connect")} type="button">{t({ en: "Connections", zh: "连接" })}</button>
          </nav>

          <div className="pf-panel" hidden={tab !== "overview"}>
            <OverviewPanel completeness={completeness} onEdit={() => setTab("edit")} profile={profile} t={t} />
          </div>
          <div className="pf-panel" hidden={tab !== "connect"}>
            <ConnectPanel t={t} />
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
