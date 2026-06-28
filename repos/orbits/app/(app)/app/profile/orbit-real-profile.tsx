"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AccountTopNav, MobileBar, orbitNavigate, StatusBar } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitProfileView, OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { Avatar, Icon } from "../orbit-reference-primitives";

type Translate = (copy: { en: string; zh: string }) => string;

function textFields(t: Translate) {
  return [
    { key: "fullName", label: t({ en: "Name", zh: "姓名" }), icon: "user" },
    { key: "headline", label: t({ en: "One-line intro", zh: "一句话介绍" }), icon: "sparkle" },
    { key: "company", label: t({ en: "Company", zh: "公司" }), icon: "wallet" },
    { key: "title", label: t({ en: "Title", zh: "职位" }), icon: "star" },
    { key: "wechatName", label: t({ en: "WeChat ID", zh: "微信号" }), icon: "mail" },
    { key: "lineId", label: t({ en: "LINE ID", zh: "LINE ID" }), icon: "mail" },
  ] as const;
}

type TagField = "offering" | "seeking" | "topics";
type Method = "ai" | "scan" | "manual";

function profileInitial(profile: OrbitProfileView) {
  return (profile.fullName.trim()[0] || "O").toUpperCase();
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
    ["ai", "sparkle", t({ en: "AI text extract", zh: "AI 文本提取" }), t({ en: "Paste a bio to auto-fill", zh: "粘贴简介自动填" })],
    ["scan", "search", t({ en: "Card scan", zh: "名片扫描" }), t({ en: "Snap a photo to recognize", zh: "拍一张自动识别" })],
    ["manual", "user", t({ en: "Manual entry", zh: "手动填写" }), t({ en: "Fill in field by field", zh: "一个个字段填" })],
  ] as const;

  return (
    <div>
      <div style={{ display: "flex", gap: 10 }}>
        {methods.map(([key, icon, label, desc]) => {
          const on = method === key;

          return (
            <div
              key={key}
              onClick={() => setMethod(key)}
              style={{ background: on ? "var(--accent-soft)" : "var(--surface)", border: `1.5px solid ${on ? "var(--accent)" : "var(--border-2)"}`, borderRadius: 14, cursor: "pointer", flex: 1, padding: 14 }}
            >
              <Icon color={on ? "var(--accent)" : "var(--text-2)"} name={icon} size={20} />
              <div style={{ color: on ? "var(--accent)" : "var(--ink)", fontSize: 14, fontWeight: 600, marginTop: 10 }}>{label}</div>
              <div style={{ color: on ? "var(--accent)" : "var(--text-3)", fontSize: 11.5, marginTop: 2, opacity: on ? 0.8 : 1 }}>{desc}</div>
            </div>
          );
        })}
      </div>
      {method === "ai" ? (
        <div style={{ marginTop: 14 }}>
          <textarea className="field" onChange={(event) => setExtractText(event.target.value)} placeholder={t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" })} style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} value={extractText} />
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 8 }}>{t({ en: "Extraction uses the company and title filled in below; results only fill the form, save after confirming.", zh: "会结合下方已填写的公司和职位提取，结果只填入表单，确认后再保存。" })}</div>
          <button className="btn btn-dark" disabled={extracting} onClick={onTextExtract} style={{ marginTop: 10 }} type="button"><Icon name="sparkle" size={16} />{extracting ? t({ en: "Extracting…", zh: "提取中…" }) : t({ en: "Extract to form", zh: "提取到表单" })}</button>
        </div>
      ) : null}
      {method === "scan" ? (
        <button disabled={extracting} onClick={onFilePick} style={{ background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: 14, cursor: "pointer", fontFamily: "var(--ff)", marginTop: 14, padding: 24, textAlign: "center", width: "100%" }} type="button">
          <div style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 999, color: "var(--accent)", display: "flex", height: 48, justifyContent: "center", margin: "0 auto 10px", width: 48 }}><Icon name="search" size={24} /></div>
          <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 550 }}>{extracting ? t({ en: "Extracting…", zh: "正在提取…" }) : t({ en: "Tap to upload a business card or resume", zh: "点击上传名片或简历" })}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 4 }}>{t({ en: "Supports JPG / PNG / PDF; results only fill the form, save after confirming.", zh: "支持 JPG / PNG / PDF，结果只填入表单，确认后再保存。" })}</div>
        </button>
      ) : null}
    </div>
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
    <div>
      <label className="field-label">{label}{t({ en: ` (${values.length})`, zh: `（${values.length}）` })}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {options.map((option) => {
          const active = values.includes(option);

          return (
            <button className={`chip${active ? " chip-accent" : ""}`} key={option} onClick={() => onToggle(section, option)} style={{ background: active ? undefined : "var(--surface-2)" }} type="button">
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileFields({
  profile,
  selectRenderKey,
  t,
  toggleTag,
  update,
  viewModel,
}: {
  profile: OrbitProfileView;
  selectRenderKey: number;
  t: Translate;
  toggleTag: (field: TagField, tag: string) => void;
  update: <K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) => void;
  viewModel: OrbitProfileViewModel;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 22 }}>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <label className="field-label">{t({ en: "Email", zh: "邮箱" })}</label>
          <div style={{ position: "relative" }}>
            <Icon color="var(--text-3)" name="mail" size={16} style={{ left: 13, position: "absolute", top: 16 }} />
            <input className="field" readOnly style={{ background: "var(--surface-2)", color: "var(--text-2)", paddingLeft: 40 }} type="email" value={profile.email} />
          </div>
        </div>
        {textFields(t).map(({ icon, key, label }) => (
          <div key={key}>
            <label className="field-label">{label}</label>
            <div style={{ position: "relative" }}>
              <Icon color="var(--text-3)" name={icon} size={16} style={{ left: 13, position: "absolute", top: 16 }} />
              <input className="field" onChange={(event) => update(key, event.target.value)} style={{ paddingLeft: 40 }} value={profile[key]} />
            </div>
          </div>
        ))}
        <div>
          <label className="field-label">{t({ en: "Industry", zh: "行业" })}</label>
          <div style={{ position: "relative" }}>
            <Icon color="var(--text-3)" name="list" size={16} style={{ left: 13, position: "absolute", top: 16 }} />
            <select key={selectRenderKey} className="field" onChange={(event) => update("industry", event.target.value)} style={{ paddingLeft: 40 }} value={profile.industry}>
              <option value="">{t({ en: "Please select", zh: "请选择" })}</option>
              {viewModel.industries.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div><label className="field-label">{t({ en: "One-line bio", zh: "一句话简介" })}</label><textarea className="field" onChange={(event) => update("bio", event.target.value)} style={{ fontFamily: "var(--ff)", height: 64, lineHeight: 1.5, padding: 12, resize: "none" }} value={profile.bio} /></div>
      <ChipGroup label={t({ en: "I can offer (offering)", zh: "我能提供 (offering)" })} onToggle={toggleTag} options={viewModel.offeringTags} section="offering" t={t} values={profile.offering} />
      <ChipGroup label={t({ en: "I'm seeking (seeking)", zh: "我想寻求 (seeking)" })} onToggle={toggleTag} options={viewModel.seekingTags} section="seeking" t={t} values={profile.seeking} />
      <ChipGroup label={t({ en: "Topics to chat about (topics)", zh: "想聊的话题 (topics)" })} onToggle={toggleTag} options={viewModel.topics} section="topics" t={t} values={profile.topics} />
      <div><label className="field-label">{t({ en: "Opener (intro)", zh: "开场白 (intro)" })}</label><textarea className="field" onChange={(event) => update("intro", event.target.value)} style={{ fontFamily: "var(--ff)", height: 56, lineHeight: 1.5, padding: 12, resize: "none" }} value={profile.intro} /></div>
    </div>
  );
}

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
  const alert = message ? (
    <div role="alert" style={{ background: "var(--live-soft)", borderRadius: 10, color: "var(--live)", fontSize: 13, padding: "10px 12px" }}>{message}</div>
  ) : missing.length ? (
    <div role="alert" style={{ background: "var(--amber-soft)", borderRadius: 10, color: "var(--amber)", fontSize: 13, padding: "10px 12px" }}>{t({ en: "Still missing: ", zh: "还差：" })}{missing.join(missingSeparator)}{t({ en: " (complete all to be matched)", zh: "（填全才能被匹配）" })}</div>
  ) : (
    <div role="alert" style={{ background: "var(--live-soft)", borderRadius: 10, color: "var(--live)", fontSize: 13, padding: "10px 12px" }}>{t({ en: "Profile complete, ready to be matched", zh: "档案完整，可被匹配" })}</div>
  );

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

  const methodsProps = { extractText, extracting, method, onFilePick: fakeExtract, onTextExtract: fakeExtract, setExtractText, setMethod, t };

  return (
    <main data-orbit-real-page="profile">
      <div className="orbit-desktop-only scroll" data-appscroll style={{ background: "var(--bg)", minHeight: "100dvh", overflowY: "auto", position: "relative" }}>
        <AccountTopNav accountInitial={letter} active="me" />
        <form onSubmit={onSubmit}>
          <div style={{ margin: "0 auto", maxWidth: 720, padding: "36px 40px 110px" }}>
            <button aria-label={t({ en: "Back", zh: "返回" })} className="btn btn-quiet btn-sm hit-44" onClick={() => orbitNavigate("/home")} style={{ marginBottom: 16, paddingLeft: 8 }} type="button"><Icon name="chevL" size={16} />{t({ en: "Back", zh: "返回" })}</button>
            <div style={{ alignItems: "center", display: "flex", gap: 16, marginBottom: 6 }}>
              <Avatar letter={letter} size={56} />
              <div style={{ minWidth: 0 }}><h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Universal profile", zh: "通用档案" })}</h1><div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 3 }}>{subText}</div></div>
            </div>
            <div style={{ marginTop: 24 }}><ProfileMethods {...methodsProps} /></div>
            <div style={{ background: "var(--border)", height: 1, margin: "24px 0 0" }} />
            <div style={{ marginTop: 22 }}>{alert}</div>
            <ProfileFields profile={profile} selectRenderKey={selectRenderKey} t={t} toggleTag={toggleTag} update={update} viewModel={viewModel} />
          </div>
          <div style={{ backdropFilter: "blur(14px)", background: "rgba(255,255,255,0.92)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", gap: 12, justifyContent: "flex-end", left: 0, padding: "14px 40px", position: "absolute", right: 0 }}>
            <button className="btn btn-ghost" onClick={() => orbitNavigate("/home")} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
            <button className="btn btn-primary" disabled={saving} type="submit"><Icon color="var(--on-dark)" name="check" size={16} />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save profile", zh: "保存档案" })}</button>
          </div>
        </form>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh", position: "relative" }}>
        <StatusBar />
        <form onSubmit={onSubmit} style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          <MobileBar onBack={() => orbitNavigate("/home")} right={<button className="btn btn-primary btn-sm" disabled={saving} type="submit">{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save", zh: "保存" })}</button>} title={t({ en: "Universal profile", zh: "通用档案" })} />
          <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "14px 18px 100px" }}>
            <p style={{ color: "var(--text-2)", fontSize: 13.5, margin: "0 0 16px" }}>{subText}</p>
            <ProfileMethods {...methodsProps} />
            <div style={{ background: "var(--border)", height: 1, margin: "20px 0 0" }} />
            <div style={{ marginTop: 20 }}>{alert}</div>
            <ProfileFields profile={profile} selectRenderKey={selectRenderKey} t={t} toggleTag={toggleTag} update={update} viewModel={viewModel} />
          </div>
        </form>
      </div>
    </main>
  );
}
