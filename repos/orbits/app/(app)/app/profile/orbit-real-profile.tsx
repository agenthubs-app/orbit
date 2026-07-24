"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import { AccountTopNav, MobileBar, orbitNavigate, StatusBar } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitProfileView, OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { Avatar, gradientFromString, Icon, Logo } from "../orbit-reference-primitives";

type Translate = (copy: { en: string; zh: string }) => string;

type TagField = "offering" | "seeking" | "topics";
type Method = "ai" | "scan" | "manual";

const PROFILE_FIELD_TOTAL = 10;

/* 名片预览是深色的实体名片隐喻,明暗两套主题下都保持同一张卡,
   所以这里用固定色而不是主题 token。 */
const CARD_BG = "linear-gradient(158deg, #22312d 0%, #17211f 52%, #131b19 100%)";
const CARD_GLOW = "radial-gradient(420px 260px at 88% -10%, rgba(94, 234, 212, 0.16), transparent 68%)";

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
  missing,
  missingSeparator,
  profile,
  t,
}: {
  missing: string[];
  missingSeparator: string;
  profile: OrbitProfileView;
  t: Translate;
}) {
  const done = PROFILE_FIELD_TOTAL - missing.length;
  const pct = Math.round((done / PROFILE_FIELD_TOTAL) * 100);
  const complete = missing.length === 0;
  const meta = [profile.company, profile.title, profile.industry]
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
          <div style={{ color: "#fff", fontFamily: "var(--ff-tight)", fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}
          </div>
          {profile.headline.trim() ? (
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13.5, lineHeight: 1.55, marginTop: 7 }}>{profile.headline}</div>
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
        {divider}
        <div>
          <div style={{ alignItems: "baseline", display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, fontWeight: 600 }}>
              {t({ en: "Completeness", zh: "档案完成度" })} {pct}%
            </span>
            <span style={{ color: complete ? "#7ee2c9" : "#f4c67f", fontSize: 12.5, textAlign: "right" }}>
              {complete ? t({ en: "Ready to be matched", zh: "可被匹配 ✓" }) : `${t({ en: "Missing: ", zh: "还差：" })}${missing.join(missingSeparator)}`}
            </span>
          </div>
          <div aria-hidden style={{ background: "rgba(255,255,255,0.14)", borderRadius: "var(--r-pill)", height: 4, overflow: "hidden" }}>
            <div style={{ background: complete ? "#4ade80" : "#5eead4", borderRadius: "var(--r-pill)", height: "100%", transition: "width .3s ease", width: `${pct}%` }} />
          </div>
        </div>
      </div>
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
        <h2 style={{ alignItems: "center", color: "var(--ink)", display: "flex", fontFamily: "var(--ff-tight)", fontSize: 16, fontWeight: 650, gap: 9, letterSpacing: "-0.01em", margin: 0 }}>
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
  extractText,
  extracting,
  method,
  onFilePick,
  onTextExtract,
  setExtractText,
  setMethod,
  t,
}: {
  extractText: string;
  extracting: boolean;
  method: Method;
  onFilePick: () => void;
  onTextExtract: () => void;
  setExtractText: (value: string) => void;
  setMethod: (value: Method) => void;
  t: Translate;
}) {
  const methods = [
    ["manual", "user", t({ en: "Manual entry", zh: "手动填写" })],
    ["ai", "sparkle", t({ en: "AI text extract", zh: "AI 文本提取" })],
    ["scan", "search", t({ en: "Card scan", zh: "名片扫描" })],
  ] as const;
  const helper = {
    ai: t({ en: "Paste a bio below; extraction uses the company and title already filled in. Results only fill the form — save after confirming.", zh: "在下方粘贴简介，会结合已填写的公司和职位提取。结果只填入表单，确认后再保存。" }),
    manual: t({ en: "Fill in the sections below field by field.", zh: "直接在下方各区块逐项填写。" }),
    scan: t({ en: "Upload a business card or resume photo; results only fill the form — save after confirming.", zh: "上传名片或简历照片自动识别。结果只填入表单，确认后再保存。" }),
  }[method];

  return (
    <div>
      <div role="group" aria-label={t({ en: "Fill method", zh: "填写方式" })} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {methods.map(([key, icon, label]) => {
          const on = method === key;

          return (
            <button
              aria-pressed={on}
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
      </div>
      <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5, margin: "10px 0 0" }}>{helper}</p>
      {method === "ai" ? (
        <div style={{ marginTop: 12 }}>
          <textarea className="field" onChange={(event) => setExtractText(event.target.value)} placeholder={t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" })} style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} value={extractText} />
          <button className="btn btn-dark btn-sm" disabled={extracting} onClick={onTextExtract} style={{ marginTop: 10 }} type="button">
            <Icon name="sparkle" size={15} />
            {extracting ? t({ en: "Extracting…", zh: "提取中…" }) : t({ en: "Extract to form", zh: "提取到表单" })}
          </button>
        </div>
      ) : null}
      {method === "scan" ? (
        <button disabled={extracting} onClick={onFilePick} style={{ alignItems: "center", background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: "var(--r-md)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 12, marginTop: 12, padding: "14px 16px", textAlign: "left", width: "100%" }} type="button">
          <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: "var(--r-pill)", color: "var(--accent)", display: "flex", flexShrink: 0, height: 38, justifyContent: "center", width: 38 }}>
            <Icon name="search" size={18} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ color: "var(--ink)", display: "block", fontSize: 14, fontWeight: 600 }}>
              {extracting ? t({ en: "Extracting…", zh: "正在提取…" }) : t({ en: "Tap to upload a business card or resume", zh: "点击上传名片或简历" })}
            </span>
            <span style={{ color: "var(--text-3)", display: "block", fontSize: 12.5, marginTop: 2 }}>{t({ en: "JPG / PNG / PDF", zh: "支持 JPG / PNG / PDF" })}</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

function FieldInput({
  label,
  onValue,
  readOnly,
  type = "text",
  value,
}: {
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
  label,
  onValue,
  rows,
  value,
}: {
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
      <textarea className="field" onChange={(event) => onValue(event.target.value)} rows={rows} style={style} value={value} />
    </label>
  );
}

function ChipGroup({
  label,
  onToggle,
  options,
  section,
  t,
  values,
}: {
  label: string;
  onToggle: (section: TagField, option: string) => void;
  options: string[];
  section: TagField;
  t: Translate;
  values: string[];
}) {
  return (
    <div role="group" aria-label={label}>
      <div style={{ alignItems: "baseline", display: "flex", gap: 8, marginBottom: 8 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
        <span style={{ color: "var(--text-4)", fontSize: 12 }}>{t({ en: `${values.length} selected`, zh: `已选 ${values.length}` })}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const active = values.includes(option);

          return (
            <button aria-pressed={active} className={`chip${active ? " chip-accent" : ""}`} key={option} onClick={() => onToggle(section, option)} type="button">
              {active ? <Icon name="check" size={13} /> : null}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditSections({
  extractProps,
  profile,
  selectRenderKey,
  t,
  toggleTag,
  update,
  viewModel,
}: {
  extractProps: {
    extractText: string;
    extracting: boolean;
    method: Method;
    onFilePick: () => void;
    onTextExtract: () => void;
    setExtractText: (value: string) => void;
    setMethod: (value: Method) => void;
    t: Translate;
  };
  profile: OrbitProfileView;
  selectRenderKey: number;
  t: Translate;
  toggleTag: (field: TagField, tag: string) => void;
  update: <K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) => void;
  viewModel: OrbitProfileViewModel;
}) {
  const grid: React.CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" };

  return (
    <div className="card orbit-profile-edit" style={{ overflow: "hidden" }}>
      <Section desc={t({ en: "Auto-fill the form from a pasted bio or a business card photo.", zh: "粘贴简介或拍张名片，几秒填好档案。" })} title={t({ en: "Quick fill", zh: "快速填充" })}>
        <ProfileMethods {...extractProps} />
      </Section>
      <Section title={t({ en: "Basics", zh: "基本信息" })}>
        <div style={grid}>
          <FieldInput label={t({ en: "Name", zh: "姓名" })} onValue={(value) => update("fullName", value)} value={profile.fullName} />
          <FieldInput label={t({ en: "Company", zh: "公司" })} onValue={(value) => update("company", value)} value={profile.company} />
          <FieldInput label={t({ en: "Title", zh: "职位" })} onValue={(value) => update("title", value)} value={profile.title} />
          <label style={{ minWidth: 0 }}>
            <span className="field-label">{t({ en: "Industry", zh: "行业" })}</span>
            <select key={selectRenderKey} className="field" onChange={(event) => update("industry", event.target.value)} value={profile.industry}>
              <option value="">{t({ en: "Please select", zh: "请选择" })}</option>
              {viewModel.industries.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </Section>
      <Section desc={t({ en: "Fill in WeChat or LINE (at least one) so matches can reach you.", zh: "微信或 LINE 至少填一个，匹配后对方才能联系到你。" })} title={t({ en: "Contact", zh: "联系方式" })}>
        <div style={grid}>
          <FieldInput label={t({ en: "WeChat ID", zh: "微信号" })} onValue={(value) => update("wechatName", value)} value={profile.wechatName} />
          <FieldInput label={t({ en: "LINE ID", zh: "LINE ID" })} onValue={(value) => update("lineId", value)} value={profile.lineId} />
          <FieldInput label={t({ en: "Email", zh: "邮箱" })} readOnly type="email" value={profile.email} />
        </div>
      </Section>
      <Section desc={t({ en: "Shown to people you match with.", zh: "这些内容会展示给和你匹配到的人。" })} title={t({ en: "About you", zh: "自我介绍" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FieldInput label={t({ en: "One-line intro", zh: "一句话介绍" })} onValue={(value) => update("headline", value)} value={profile.headline} />
          <FieldTextarea label={t({ en: "Bio", zh: "简介" })} onValue={(value) => update("bio", value)} rows={4} value={profile.bio} />
          <FieldTextarea label={t({ en: "Opener", zh: "开场白" })} onValue={(value) => update("intro", value)} rows={3} value={profile.intro} />
        </div>
      </Section>
      <Section desc={t({ en: "Tags drive who we match you with — pick what fits.", zh: "标签决定我们帮你匹配谁，选贴合的就好。" })} title={t({ en: "Matching preferences", zh: "匹配偏好" })}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ChipGroup label={t({ en: "I can offer", zh: "我能提供" })} onToggle={toggleTag} options={viewModel.offeringTags} section="offering" t={t} values={profile.offering} />
          <ChipGroup label={t({ en: "I'm seeking", zh: "我想寻求" })} onToggle={toggleTag} options={viewModel.seekingTags} section="seeking" t={t} values={profile.seeking} />
          <ChipGroup label={t({ en: "Topics to chat about", zh: "想聊的话题" })} onToggle={toggleTag} options={viewModel.topics} section="topics" t={t} values={profile.topics} />
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

export function OrbitRealProfile({ viewModel }: { viewModel: OrbitProfileViewModel }) {
  const { t } = useOrbitLanguage();
  const [profile, setProfile] = useState<OrbitProfileView>(() => ({ ...viewModel.profile, offering: [...viewModel.profile.offering], seeking: [...viewModel.profile.seeking], topics: [...viewModel.profile.topics] }));
  const [method, setMethod] = useState<Method>("manual");
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectRenderKey, setSelectRenderKey] = useState(0);
  const letter = profileInitial(profile);
  const subText = t({ en: "Fill it once, auto-reused when registering for every event.", zh: "填一次，报名各场活动自动复用。" });

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    const remountSelect = () => {
      if (!window.matchMedia("(min-width: 761px)").matches) return;
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) setSelectRenderKey(1);
      });
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(remountSelect, remountSelect);
    } else {
      remountSelect();
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const missing = useMemo(() => {
    const fields: string[] = [];

    if (!profile.fullName.trim()) fields.push(t({ en: "Name", zh: "姓名" }));
    if (!profile.wechatName.trim() && !profile.lineId.trim()) fields.push(t({ en: "WeChat or LINE", zh: "微信或 LINE" }));
    if (!profile.company.trim()) fields.push(t({ en: "Company", zh: "公司" }));
    if (!profile.title.trim()) fields.push(t({ en: "Title", zh: "职位" }));
    if (!profile.industry.trim()) fields.push(t({ en: "Industry", zh: "行业" }));
    if (!profile.bio.trim()) fields.push(t({ en: "Bio", zh: "简介" }));
    if (!profile.intro.trim()) fields.push(t({ en: "Opener", zh: "开场白" }));
    if (!profile.offering.length) fields.push(t({ en: "Offering", zh: "能提供" }));
    if (!profile.seeking.length) fields.push(t({ en: "Seeking", zh: "想寻求" }));
    if (!profile.topics.length) fields.push(t({ en: "Topics", zh: "话题" }));

    return fields;
  }, [profile, t]);
  const missingSeparator = t({ en: ", ", zh: "、" });

  function update<K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function toggleTag(field: TagField, tag: string) {
    setProfile((current) => {
      const values = current[field];
      return { ...current, [field]: values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag] };
    });
  }

  function fakeExtract() {
    setExtracting(true);
    window.setTimeout(() => {
      setExtracting(false);
      setMessage(t({ en: "Extracted results filled into the form, please confirm and save the profile.", zh: "提取结果已填入表单，请确认后保存档案。" }));
    }, 700);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    window.setTimeout(() => {
      setSaving(false);
      setMessage(t({ en: "Saved.", zh: "已保存。" }));
    }, 500);
  }

  const extractProps = { extractText, extracting, method, onFilePick: fakeExtract, onTextExtract: fakeExtract, setExtractText, setMethod, t };
  const editProps = { extractProps, profile, selectRenderKey, t, toggleTag, update, viewModel };
  const alert = message ? (
    <div role="alert" style={{ background: "var(--live-soft)", borderRadius: "var(--r-sm)", color: "var(--live)", fontSize: 13, marginBottom: 14, padding: "10px 14px" }}>{message}</div>
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
              <h1 style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 16, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>{t({ en: "Universal profile", zh: "通用档案" })}</h1>
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>{subText}</span>
            </div>
            {alert}
            <div className="orbit-profile-layout">
              <aside className="orbit-profile-preview">
                <BusinessCardPreview missing={missing} missingSeparator={missingSeparator} profile={profile} t={t} />
                <p style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, margin: "12px 4px 0", textAlign: "center" }}>
                  {t({ en: "This is how you appear to matches — updates as you type.", zh: "这是别人看到的你，边填边更新。" })}
                </p>
              </aside>
              <EditSections {...editProps} />
            </div>
          </div>
          <div style={{ backdropFilter: "blur(14px)", background: "var(--glass-bar)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", gap: 12, justifyContent: "flex-end", padding: "14px 40px", position: "sticky", zIndex: 5 }}>
            <button className="btn btn-ghost" onClick={() => orbitNavigate("/home")} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
            <button className="btn btn-primary" disabled={saving} type="submit"><Icon color="var(--on-dark)" name="check" size={16} />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save profile", zh: "保存档案" })}</button>
          </div>
        </form>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh", position: "relative" }}>
        <StatusBar />
        <form onSubmit={onSubmit} style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          <MobileBar onBack={() => orbitNavigate("/home")} right={<button className="btn btn-primary btn-sm" disabled={saving} type="submit">{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save", zh: "保存" })}</button>} title={t({ en: "Universal profile", zh: "通用档案" })} />
          <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "14px 16px 100px" }}>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 12px" }}>{subText}</p>
            {alert}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <BusinessCardPreview missing={missing} missingSeparator={missingSeparator} profile={profile} t={t} />
              <EditSections {...editProps} />
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
