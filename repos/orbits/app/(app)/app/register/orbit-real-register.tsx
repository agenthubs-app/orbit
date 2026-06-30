"use client";

import { ChangeEvent, CSSProperties, useState } from "react";
import {
  orbitRegisterEmptyProfile,
  type OrbitRegisterProfileForm,
  type OrbitRegisterViewModel,
} from "../orbit-register-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { Cover, gradientFromString, Icon } from "../orbit-reference-primitives";

type Translate = (copy: { en: string; zh: string }) => string;

type RegisterScreen = "select" | "ai" | "confirm" | "complete";
type RegisterFlowType = "manual" | "ai";
type RegisterContactMethod = "wechat" | "line";
type RegisterSourceMode = "card" | "resume" | "describe";

const regStyles: Record<string, CSSProperties> = {
  accent: { color: "var(--accent)" },
  back: { alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 999, color: "var(--ink)", cursor: "pointer", display: "flex", height: 38, justifyContent: "center", width: 38 },
  banner: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, padding: "12px 14px" },
  eyebrow: { color: "var(--accent)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
  heroTitle: { color: "var(--ink)", fontFamily: "var(--ff-tight)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.12, marginTop: 8 },
  methodGrid: { display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" },
  outer: { alignItems: "stretch", background: "var(--bg-sunken)", display: "flex", justifyContent: "center", minHeight: "100dvh", padding: 0 },
  primary: { background: "var(--accent)", border: "none", borderRadius: 14, color: "var(--on-dark)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 16, fontWeight: 650, height: 52, padding: "1px 6px", width: "100%" },
  screen: { display: "flex", flex: 1, flexDirection: "column", gap: 18, overflowY: "auto", padding: "10px 22px 30px" },
  secondary: { background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 14, color: "var(--text-2)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 14.5, fontWeight: 550, height: 48, marginTop: 10, width: "100%" },
  shell: { background: "var(--bg)", boxShadow: "0 0 0 1px var(--border)", display: "flex", flexDirection: "column", minHeight: "100dvh", position: "relative", width: "min(100%, 440px)" },
  stepText: { color: "var(--text-3)", fontFamily: "var(--ff-mono)", fontSize: 12 },
  topBar: { alignItems: "center", display: "flex", flexShrink: 0, height: 52, justifyContent: "space-between" },
};

function navigate(prototypeHref: string) {
  if (prototypeHref === "/") {
    window.location.href = "/app";
    return;
  }
  if (prototypeHref === "/party") {
    window.location.href = "/app/party";
    return;
  }
  window.location.href = `/app${prototypeHref}`;
}

function StepDots({ active }: { active: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            background: index === active ? "var(--accent)" : "var(--border-strong)",
            borderRadius: 999,
            height: 7,
            transition: "width .2s",
            width: index === active ? 20 : 7,
          }}
        />
      ))}
    </div>
  );
}

function RegTopBar({ active, onBack, step, t }: { active: number; onBack: () => void; step: string; t: Translate }) {
  return (
    <div style={regStyles.topBar}>
      <button aria-label={t({ en: "Back", zh: "返回" })} className="hit-44" onClick={onBack} style={regStyles.back} type="button">
        <Icon name="back" size={18} />
      </button>
      <StepDots active={active} />
      <div style={regStyles.stepText}>{step}</div>
    </div>
  );
}

function RegMethodCard({
  active,
  icon,
  onClick,
  subtitle,
  title,
}: {
  active: boolean;
  icon: string;
  onClick: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--accent-soft)" : "var(--surface)",
        border: `1.5px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
        borderRadius: 16,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--ff)",
        gap: 6,
        padding: 16,
        textAlign: "left",
      }}
      type="button"
    >
      <div style={{ alignItems: "center", background: active ? "var(--accent)" : "var(--surface-2)", borderRadius: 11, color: active ? "var(--on-dark)" : "var(--text-2)", display: "flex", height: 40, justifyContent: "center", width: 40 }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ color: active ? "var(--accent)" : "var(--ink)", fontSize: 15, fontWeight: 650, marginTop: 4 }}>{title}</div>
      <div style={{ color: "var(--text-3)", fontSize: 12 }}>{subtitle}</div>
    </button>
  );
}

function RegField({
  hint,
  icon,
  label,
  onChange,
  placeholder,
  required,
  type,
  value,
}: {
  hint?: string;
  icon?: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>
        {label}{required ? <span style={{ color: "var(--rose)", marginLeft: 3 }}>*</span> : null}
      </div>
      <div style={{ position: "relative" }}>
        {icon ? <span style={{ color: "var(--text-3)", left: 13, position: "absolute", top: 14 }}><Icon name={icon} size={17} /></span> : null}
        <input className="field" onChange={onChange} placeholder={placeholder} style={{ paddingLeft: icon ? 40 : 14 }} type={type || "text"} value={value} />
      </div>
      {hint ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>{hint}</div> : null}
    </label>
  );
}

function RegChips({
  onToggle,
  options,
  required,
  selected,
  t,
  title,
}: {
  onToggle: (tag: string) => void;
  options: string[];
  required?: boolean;
  selected: string[];
  t: Translate;
  title: string;
}) {
  return (
    <div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
        <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550 }}>
          {title}{required ? <span style={{ color: "var(--rose)", marginLeft: 3 }}>*</span> : null} <span style={{ color: "var(--text-4)", fontWeight: 400 }}>· {t({ en: "up to 5", zh: "最多5项" })}</span>
        </div>
        <span className="mono" style={{ color: "var(--accent)", fontSize: 12 }}>{selected.length}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {options.map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              className={`chip${on ? " chip-accent" : ""}`}
              key={tag}
              onClick={() => onToggle(tag)}
              style={{ background: on ? undefined : "var(--surface-2)" }}
              type="button"
            >
              {on ? "✓ " : ""}{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PassTicket({
  code,
  event,
  profile,
  t,
}: {
  code: string;
  event: OrbitRegisterViewModel["event"];
  profile: OrbitRegisterProfileForm;
  t: Translate;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--sh-md)", overflow: "hidden" }}>
      <Cover g={gradientFromString(event.code)} style={{ height: 92, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", inset: 0, justifyContent: "space-between", padding: 16, position: "absolute" }}>
          <div style={{ color: "var(--on-dark)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{event.name}</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{event.theme}</span>
          </div>
          <div style={{ color: "var(--on-dark)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 700 }}>{profile.name || t({ en: "Guest", zh: "访客" })}</div>
        </div>
      </Cover>
      <div style={{ alignItems: "center", display: "flex", gap: 14, padding: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "var(--text-3)", fontSize: 11, marginBottom: 4 }}>{t({ en: "Pass code", zh: "通行码" })}</div>
          <div className="mono" style={{ color: "var(--ink)", fontSize: 26, fontWeight: 700, letterSpacing: "0.1em" }}>{code}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>{profile.company} · {profile.title}</div>
        </div>
        <div style={{ alignItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--ink)", display: "flex", height: 72, justifyContent: "center", width: 72 }}>
          <Icon name="qr" size={48} />
        </div>
      </div>
    </div>
  );
}

function buildExtractedProfile(
  profilePreview: OrbitRegisterProfileForm,
): OrbitRegisterProfileForm {
  return {
    ...orbitRegisterEmptyProfile,
    ...profilePreview,
  };
}

export function OrbitRealRegister({ viewModel }: { viewModel: OrbitRegisterViewModel }) {
  const { t } = useOrbitLanguage();
  const [screen, setScreen] = useState<RegisterScreen>("select");
  const [flowType, setFlowType] = useState<RegisterFlowType>("manual");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<OrbitRegisterProfileForm>(orbitRegisterEmptyProfile);
  const [contactMethod, setContactMethod] = useState<RegisterContactMethod>("wechat");
  const [sourceMode, setSourceMode] = useState<RegisterSourceMode>("card");
  const [extracting, setExtracting] = useState(false);
  const [step, setStepN] = useState(-1);
  const code = `${(viewModel.event.code || "ORBT").slice(0, 4).toUpperCase()}-4821`;

  function upd(key: keyof OrbitRegisterProfileForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "topics" | "offering" | "seeking", tag: string) {
    setForm((current) => {
      const list = current[key] || [];
      if (list.includes(tag)) return { ...current, [key]: list.filter((item) => item !== tag) };
      if (list.length >= 5) return current;
      return { ...current, [key]: [...list, tag] };
    });
  }

  function startFlow(nextFlow: RegisterFlowType) {
    if (!email.trim()) return;
    setFlowType(nextFlow);
    setScreen(nextFlow === "manual" ? "confirm" : "ai");
  }

  function runExtract() {
    setExtracting(true);
    setStepN(0);
    [380, 840, 1340].forEach((delay, index) => window.setTimeout(() => setStepN(index + 1), delay));
    window.setTimeout(() => {
      setExtracting(false);
      setStepN(-1);
      setForm(buildExtractedProfile(viewModel.profilePreview));
      setScreen("confirm");
    }, 1800);
  }

  return (
    <main data-orbit-real-page="register" style={regStyles.outer}>
      <div style={regStyles.shell}>
        {screen === "select" ? (
          <div style={regStyles.screen}>
            <RegTopBar active={0} onBack={() => navigate("/")} step="1 / 3" t={t} />
            <div><div style={regStyles.eyebrow}>{t({ en: "You are", zh: "你是" })}</div><h1 className="h-display" style={regStyles.heroTitle}>{t({ en: "Let's get to know", zh: "先认识一下" })}<span style={regStyles.accent}> {t({ en: "you.", zh: "你。" })}</span></h1></div>
            <RegField icon="mail" label={t({ en: "Email", zh: "邮箱" })} onChange={(event) => setEmail(event.target.value)} placeholder={t({ en: "Enter your email address", zh: "输入邮箱地址" })} required type="email" value={email} />
            <div style={regStyles.banner}>{t({ en: "Leave your email first. Once you finish registering, your pass code and direct link will be sent here.", zh: "先留下邮箱。报名完成后，通行码和直达链接都会发到这里。" })}</div>
            <div style={regStyles.methodGrid}>
              <RegMethodCard active={flowType === "manual"} icon="edit" onClick={() => startFlow("manual")} subtitle={t({ en: "~2 min", zh: "~2 分钟" })} title={t({ en: "Fill it in myself", zh: "自己填" })} />
              <RegMethodCard active={flowType === "ai"} icon="sparkle" onClick={() => startFlow("ai")} subtitle={t({ en: "~30 sec", zh: "~30 秒" })} title={t({ en: "AI autofill", zh: "AI 填充" })} />
            </div>
            {!email.trim() ? <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>{t({ en: "Please enter your email address before choosing how to fill in your details.", zh: "请先填写邮箱地址，再选择填写方式。" })}</div> : null}
          </div>
        ) : null}

        {screen === "ai" ? (
          <div style={regStyles.screen}>
            <RegTopBar active={0} onBack={() => setScreen("select")} step="1 / 3" t={t} />
            <div><div style={regStyles.eyebrow}>{t({ en: "AI is loading", zh: "AI 正在装载" })}</div><h1 className="h-display" style={regStyles.heroTitle}>{t({ en: "2 minutes", zh: "2分钟" })}<br /><span style={regStyles.accent}>{t({ en: "and it's ready for you.", zh: "帮你自动准备好。" })}</span></h1></div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <RegMethodCard active={sourceMode === "card"} icon="scan" onClick={() => setSourceMode("card")} subtitle={t({ en: "Ready", zh: "已就位" })} title={t({ en: "Business card", zh: "名片" })} />
              <RegMethodCard active={sourceMode === "resume"} icon="doc" onClick={() => setSourceMode("resume")} subtitle={t({ en: "Optional", zh: "可选" })} title={t({ en: "Resume", zh: "简历" })} />
              <RegMethodCard active={sourceMode === "describe"} icon="edit" onClick={() => setSourceMode("describe")} subtitle={t({ en: "Optional", zh: "可选" })} title={t({ en: "Describe", zh: "描述" })} />
            </div>
            {sourceMode === "describe" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <RegField icon="wallet" label={t({ en: "Company", zh: "公司" })} onChange={(event) => upd("company", event.target.value)} placeholder={t({ en: "Enter your company name", zh: "输入公司名称" })} value={form.company} />
                <RegField icon="briefcase" label={t({ en: "Title", zh: "职位" })} onChange={(event) => upd("title", event.target.value)} placeholder={t({ en: "Enter your title", zh: "输入职位" })} value={form.title} />
                <label>
                  <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "Business and experience", zh: "业务与经历" })}</div>
                  <textarea className="field" placeholder={t({ en: "Describe what you do, what you're following lately, and who you'd like to meet.", zh: "写你做什么、最近在关注什么、希望认识什么人。" })} style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} />
                </label>
                <button disabled={extracting} onClick={runExtract} style={regStyles.primary} type="button">{extracting ? t({ en: "AI filling in...", zh: "AI 填充中..." }) : t({ en: "Go to confirm", zh: "去确认" })}</button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: 16, padding: 28, textAlign: "center" }}>
                  <div className="mono" style={{ color: "var(--accent)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em" }}>EXTRACTING...</div>
                  <div style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.5, marginTop: 10 }}>{t({ en: `Upload a ${sourceMode === "resume" ? "PDF resume" : "business card"}, and AI will pre-fill your name, company, title, industry and tags.`, zh: `上传一张${sourceMode === "resume" ? "PDF 简历" : "名片"}，AI 会把姓名、公司、职位、行业和标签先帮你填好。` })}</div>
                </div>
                <button disabled={extracting} onClick={runExtract} style={regStyles.primary} type="button">{extracting ? t({ en: "AI filling in...", zh: "AI 填充中..." }) : sourceMode === "resume" ? t({ en: "Upload resume", zh: "上传简历" }) : t({ en: "Upload business card", zh: "上传名片" })}</button>
              </div>
            )}
            <button onClick={() => { setFlowType("manual"); setScreen("confirm"); }} style={regStyles.secondary} type="button">{t({ en: "Skip AI and fill in manually", zh: "跳过 AI，直接填写" })}</button>
            <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
              {([
                { en: "Recognize text", zh: "识别文本" },
                { en: "Structure fields", zh: "结构化字段" },
                { en: "Extract industry tags", zh: "提炼行业标签" },
                { en: "Prepare confirmation screen", zh: "准备确认界面" },
              ] as const).map((labelCopy, index) => {
                const label = t(labelCopy);
                const done = step > index;
                const working = step === index;
                const note = ["0.3s", "0.5s", "...", ""][index];
                return (
                  <div key={label} style={{ alignItems: "center", display: "flex", gap: 12 }}>
                    <div style={{ alignItems: "center", background: done ? "var(--accent-soft)" : "transparent", border: `1.5px solid ${done || working ? "var(--accent)" : "var(--border-2)"}`, borderRadius: 999, color: "var(--accent)", display: "flex", height: 22, justifyContent: "center", width: 22 }}>
                      {done ? <Icon name="check" size={13} /> : null}
                    </div>
                    <div style={{ color: "var(--ink)", flex: 1, fontSize: 13.5 }}>{label}</div>
                    <div className="mono" style={{ color: "var(--text-4)", fontSize: 11.5 }}>{working ? "..." : note}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {screen === "confirm" ? (
          <div style={regStyles.screen}>
            <RegTopBar active={1} onBack={() => setScreen(flowType === "ai" ? "ai" : "select")} step="2 / 3" t={t} />
            <div><div style={regStyles.eyebrow}>{t({ en: "Confirm", zh: "确认" })} · {flowType === "ai" ? t({ en: "AI filled it in for you", zh: "AI 帮你填好了" }) : t({ en: "Fill in your details", zh: "填写资料" })}</div><h1 className="h-display" style={regStyles.heroTitle}>{t({ en: "Take a look,", zh: "看一眼，" })}<br /><span style={regStyles.accent}>{t({ en: "edit anything you like.", zh: "改哪里都行。" })}</span></h1></div>
            {flowType === "ai" ? <div style={{ ...regStyles.banner, background: "var(--accent-soft)", borderColor: "rgba(99,89,233,0.18)", color: "var(--accent)" }}>{t({ en: "AI has filled in the following fields from your business card. Please confirm before generating your pass code.", zh: "AI 已根据你的名片填好以下字段，请确认后生成通行码。" })}</div> : null}
            <div style={{ display: "grid", gap: 14 }}>
              <RegField icon="user" label={t({ en: "Name", zh: "姓名" })} onChange={(event) => upd("name", event.target.value)} placeholder={t({ en: "Enter your name", zh: "输入姓名" })} required value={form.name} />
              <div>
                <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "Contact", zh: "联系方式" })}<span style={{ color: "var(--rose)", marginLeft: 3 }}>*</span></div>
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, display: "inline-flex", marginBottom: 9, padding: 3 }}>
                  {([["wechat", { en: "WeChat", zh: "微信号" }], ["line", { en: "LINE ID", zh: "LINE 号" }]] as const).map(([key, labelCopy]) => (
                    <button
                      key={key}
                      onClick={() => setContactMethod(key)}
                      style={{ background: contactMethod === key ? "var(--ink)" : "none", border: "none", borderRadius: 8, color: contactMethod === key ? "var(--on-dark)" : "var(--text-2)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 550, padding: "6px 14px" }}
                      type="button"
                    >
                      {t(labelCopy)}
                    </button>
                  ))}
                </div>
                <input className="field" onChange={(event) => upd(contactMethod === "line" ? "lineId" : "wechatName", event.target.value)} placeholder={contactMethod === "line" ? t({ en: "Enter your LINE ID", zh: "输入 LINE 号" }) : t({ en: "Enter your WeChat ID", zh: "输入微信号" })} value={contactMethod === "line" ? form.lineId : form.wechatName} />
                <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>{t({ en: "Just fill in either your WeChat or LINE ID.", zh: "微信号和 LINE 号二选一填写即可。" })}</div>
              </div>
              <RegField icon="wallet" label={t({ en: "Company", zh: "公司" })} onChange={(event) => upd("company", event.target.value)} placeholder={t({ en: "Enter your company name", zh: "输入公司名称" })} required value={form.company} />
              <RegField icon="briefcase" label={t({ en: "Title", zh: "职位" })} onChange={(event) => upd("title", event.target.value)} placeholder={t({ en: "Enter your title", zh: "输入职位" })} required value={form.title} />
              <RegField icon="phone" label={t({ en: "Phone", zh: "电话" })} onChange={(event) => upd("phone", event.target.value)} placeholder={t({ en: "Enter your phone number", zh: "输入电话号码" })} value={form.phone} />
              <label>
                <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "Industry", zh: "行业" })}<span style={{ color: "var(--rose)", marginLeft: 3 }}>*</span></div>
                <select className="field" onChange={(event) => upd("industry", event.target.value)} value={form.industry}>
                  <option value="">{t({ en: "Please select", zh: "请选择" })}</option>
                  {viewModel.industryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "Seniority", zh: "职级" })}</div>
                <select className="field" onChange={(event) => upd("level", event.target.value)} value={form.level}>
                  <option value="">{t({ en: "Please select", zh: "请选择" })}</option>
                  {viewModel.levelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "Experience and background", zh: "经历与背景" })}</div>
                <textarea className="field" onChange={(event) => upd("bio", event.target.value)} placeholder={t({ en: "Add your background, business focus, or what you want to push forward lately.", zh: "补充你的背景、业务重点或最近想推进的方向。" })} style={{ fontFamily: "var(--ff)", height: 80, lineHeight: 1.5, padding: 12, resize: "none" }} value={form.bio} />
              </label>
              <RegChips onToggle={(tag) => toggle("topics", tag)} options={viewModel.topics} required selected={form.topics} t={t} title={t({ en: "Topics you're interested in", zh: "感兴趣的话题" })} />
              <RegChips onToggle={(tag) => toggle("offering", tag)} options={viewModel.offeringTags} required selected={form.offering} t={t} title={t({ en: "Resources you can offer", zh: "你能提供的资源" })} />
              <RegChips onToggle={(tag) => toggle("seeking", tag)} options={viewModel.seekingTags} required selected={form.seeking} t={t} title={t({ en: "Support you're looking for", zh: "你在寻找的支持" })} />
              <label>
                <div style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 550, marginBottom: 7 }}>{t({ en: "One-line summary", zh: "一句话总结" })}<span style={{ color: "var(--rose)", marginLeft: 3 }}>*</span></div>
                <textarea className="field" onChange={(event) => upd("intro", event.target.value)} placeholder={t({ en: "Briefly describe what you want to get and your goal today.", zh: "简单说说您今天想获得的资源和目的。" })} style={{ fontFamily: "var(--ff)", height: 64, lineHeight: 1.5, padding: 12, resize: "none" }} value={form.intro} />
              </label>
            </div>
            <button onClick={() => setScreen("complete")} style={regStyles.primary} type="button">{t({ en: "Generate pass code", zh: "生成通行码" })}</button>
          </div>
        ) : null}

        {screen === "complete" ? (
          <div style={regStyles.screen}>
            <div style={{ height: 8 }} />
            <div style={{ alignItems: "center", alignSelf: "flex-start", background: "var(--live-soft)", borderRadius: 999, color: "var(--live)", display: "inline-flex", fontSize: 13, fontWeight: 600, gap: 7, height: 30, padding: "0 12px" }}><Icon name="checkCircle" size={16} />{t({ en: "Registration complete", zh: "报名完成" })}</div>
            <div><h1 className="h-display" style={regStyles.heroTitle}>{t({ en: "Keep your", zh: "收好你的" })}<span style={regStyles.accent}> {t({ en: "pass code", zh: "通行码" })}</span></h1><div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>{t({ en: "Show this on the day of the event for faster check-in and sign-in later.", zh: "活动当天出示这张图，签到和之后登录都会更快。" })}</div></div>
            <PassTicket code={code} event={viewModel.event} profile={form.name ? form : { ...viewModel.profilePreview, ...form }} t={t} />
            <div style={{ ...regStyles.banner, background: "var(--accent-softer)" }}>
              <div style={{ color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}>{t({ en: "We recommend taking a screenshot of this pass code right now.", zh: "建议现在直接截图保存这张通行码。" })}</div>
              {t({ en: "Your pass code and direct link have been sent to your email.", zh: "已向你的邮箱发送通行码和直达链接。" })}
            </div>
            <button onClick={() => navigate("/party")} style={regStyles.primary} type="button"><Icon color="var(--on-dark)" name="arrowUR" size={17} style={{ marginRight: 6 }} />{t({ en: "Enter the event", zh: "进入活动" })}</button>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, textAlign: "center" }}>{t({ en: "If you can't find the screenshot later, that's okay — staff can verify you with your email or pass code.", zh: "如果一时找不到截图也没关系，工作人员可以用你的邮箱或通行码帮你核对。" })}</div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
