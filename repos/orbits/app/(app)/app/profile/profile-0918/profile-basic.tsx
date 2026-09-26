/**
 * 编辑基础资料屏（设计稿没有；用画像编辑屏的表单语言：pc-card / pc-group-title 字号的标签 / 设计 169–171 行的输入框声明）。
 * 承载 onboarding 必填字段与已批准的门禁提示：
 *   - 整屏 `<form onSubmit>` → saveProfile("basic")（既有测试用 findAllByType("form")[0].props.onSubmit 触发）。
 *   - 「快速填充」= 旧 ProfileMethods（手动填写 / 结构化文本提取 ← hook 的 method / extractText / onTextExtract / extracting）。
 *   - 「基础信息」字段顺序：姓名*（表单首个 <input>，editorDisabled 时 disabled）/ 一级行业* / 二级行业*（两个 <select> 从旧
 *     EditSections 原样搬，保留 aria-label）/ 职位 / 公司 / 生日*（type=date）/ 关于我（bio，80 可见字符校验由
 *     validateProfileSaveDraft 提供）/ 一句话介绍（headline 只读，hook 无保存通道）。
 *   - 「联系方式」：WeChat 与 LINE 可编辑且二选一必填（hook update 只把这两个标记为脏）；Email 只读；其余 handle 只读行；一律「仅自己可见」。
 *   - 必填标记 <span class="pc-required">必填</span>；壳里的保存栏通过 formRef.requestSubmit() 提交本表单。
 */
"use client";

import type { FormEvent, ReactNode, RefObject } from "react";

import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../../../shared/contract/industries";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { ProfileEditorSession } from "./use-profile-editor-session";

type Copy = { zh: string; en: string };

function Required() {
  const { t } = useOrbitLanguage();
  return <span className="pc-required">{t({ en: "Required", zh: "必填" })}</span>;
}

function Field({ label, required, children }: { label: Copy; required?: boolean; children: ReactNode }) {
  const { t } = useOrbitLanguage();
  return (
    <label className="pc-field">
      <span className="pc-field-label">{t(label)}{required ? <Required /> : null}</span>
      {children}
    </label>
  );
}

function ReadonlyRow({ label, value, scope }: { label: string; value: string; scope: string }) {
  return (
    <span className="pc-field">
      <span className="pc-field-label">{label}</span><span className="pc-readonly">{value}</span>
      <span className="pc-readonly-scope">{scope}</span>
    </span>
  );
}

// 旧 ProfileMethods：手动填写 / 结构化文本提取（导入中心链接保留）。
function QuickFill({ session }: { session: ProfileEditorSession }) {
  const { t } = useOrbitLanguage();
  const disabled = session.editorDisabled;
  const methods = [
    ["manual", t({ en: "Manual entry", zh: "手动填写" })],
    ["text", t({ en: "Structured text extract", zh: "结构化文本提取" })],
  ] as const;
  const helper = {
    text: t({ en: "Paste text with explicit labels such as Name, Company, Title, Market, and Goal. Only stated fields are extracted; review before saving.", zh: "粘贴带有“姓名、公司、职位、市场、关系目标”等明确标签的文本。只提取原文明确写出的字段，保存前请复核。" }),
    manual: t({ en: "Fill in the sections below field by field.", zh: "直接在下方各区块逐项填写。" }),
  }[session.method];

  return (
    <section className="pc-card pc-stack">
      <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Quick fill", zh: "快速填充" })}</strong></span>
      <div className="pc-methods" role="group" aria-label={t({ en: "Fill method", zh: "填写方式" })}>
        {methods.map(([key, label]) => {
          const on = session.method === key;
          return (
            <button aria-pressed={on} className={`btn pc-method${on ? " pc-method-on" : ""}`} disabled={disabled} key={key} onClick={() => session.setMethod(key)} type="button">{label}</button>
          );
        })}
        <a className="btn pc-method" href="/app/contacts/new">{t({ en: "Scan/import in Import hub", zh: "到导入中心扫描/导入" })}</a>
      </div>
      <span className="pc-group-hint">{helper}</span>
      {session.method === "text" ? (
        <div className="pc-stack">
          <span className="pc-input-wrap pc-input-wrap-area">
            <textarea className="pc-input pc-textarea" disabled={disabled} onChange={(event) => session.setExtractText(event.target.value)} placeholder={t({ en: "Paste your business, experience, focus areas, or who you want to meet", zh: "粘贴业务、经历、关注方向或希望认识的人" })} rows={4} value={session.extractText} />
          </span>
          <span className="pc-hero-actions">
            <button className="btn pc-btn-primary" disabled={disabled || session.extracting} onClick={() => void session.onTextExtract()} type="button">
              {session.extracting ? t({ en: "Extracting…", zh: "提取中…" }) : t({ en: "Extract to form", zh: "提取到表单" })}
            </button>
          </span>
        </div>
      ) : null}
    </section>
  );
}

export function ProfileBasic({
  "aria-label": ariaLabel,
  session,
  onSubmit,
  formRef,
}: {
  /** 表单地标的可及名（审计 P1 `accessible-name-unresolved`）：`<form>` 拿到名字
      才会被辅助技术当成一个具名区域；视觉输出不变。 */
  "aria-label"?: string;
  session: ProfileEditorSession;
  /** 表单提交 → ProfileScreens 里的 saveProfile("basic")（返回保存 promise）。 */
  onSubmit: () => Promise<void>;
  formRef?: RefObject<HTMLFormElement | null>;
}) {
  const { language, t } = useOrbitLanguage();
  const profile = session.profile;
  const editorDisabled = session.editorDisabled;
  // 旧 OrbitRealProfile.editProps.industryDisabled 原样。
  const industryDisabled = session.saving || session.matchingSaving || !session.industryReady || session.requiresReconcile;
  const scope = t({ en: "Only visible to you", zh: "仅自己可见" });
  const handles = profile.handles ?? {};
  const otherHandles: [string, string | undefined][] = [
    ["LinkedIn", handles.linkedinUrl],
    ["Phone", handles.phone],
    ["Website", handles.website],
    ["X", handles.xHandle],
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return onSubmit();
  }

  return (
    <form aria-label={ariaLabel} className="pc-editor" onSubmit={submit} ref={formRef}>
      <div className="pc-col">
        <QuickFill session={session} />

        <section className="pc-card pc-stack">
          <span className="pc-card-head"><strong className="pc-h2">{t({ en: "Basic information", zh: "基础信息" })}</strong></span>
          <div className="pc-fields">
            <Field label={{ en: "Name", zh: "姓名" }} required>
              <span className="pc-input-wrap"><input className="pc-input" disabled={editorDisabled} onChange={(event) => session.update("fullName", event.target.value)} value={profile.fullName} /></span>
            </Field>
            <Field label={{ en: "Primary industry", zh: "一级行业" }} required>
              <span className="pc-input-wrap">
                <select className="pc-input pc-select" aria-label={t({ en: "Primary industry", zh: "一级行业" })} disabled={industryDisabled} value={profile.primaryIndustryId ?? ""} onChange={event => session.updateIndustry({ primaryIndustryId: (event.target.value || null) as IndustryIdCode | null, secondaryIndustryId: null })}>
                  <option value="">{t({ en: "Not selected", zh: "未选择" })}</option>
                  {INDUSTRY_CATALOG.map(item => <option key={item.id} value={item.id}>{industryLabel(item.id, language)}</option>)}
                </select>
              </span>
            </Field>
            <Field label={{ en: "Secondary industry", zh: "二级行业" }} required>
              <span className="pc-input-wrap">
                <select className="pc-input pc-select" aria-label={t({ en: "Secondary industry", zh: "二级行业" })} disabled={industryDisabled || !profile.primaryIndustryId} value={profile.secondaryIndustryId ?? ""} onChange={event => session.updateIndustry({ primaryIndustryId: profile.primaryIndustryId, secondaryIndustryId: (event.target.value || null) as SecondaryIndustryIdCode | null })}>
                  <option value="">{t({ en: "Not selected", zh: "未选择" })}</option>
                  {(profile.primaryIndustryId ? listSecondaryIndustries(profile.primaryIndustryId) : []).map(item => <option key={item.id} value={item.id}>{secondaryIndustryLabel(item.id, language)}</option>)}
                </select>
              </span>
            </Field>
            <Field label={{ en: "Title", zh: "职位" }}>
              <span className="pc-input-wrap"><input className="pc-input" disabled={editorDisabled} onChange={(event) => session.update("title", event.target.value)} value={profile.title} /></span>
            </Field>
            <Field label={{ en: "Company", zh: "公司" }}>
              <span className="pc-input-wrap"><input className="pc-input" disabled={editorDisabled} onChange={(event) => session.update("company", event.target.value)} value={profile.company} /></span>
            </Field>
            <Field label={{ en: "Birthday (private)", zh: "生日" }} required>
              <span className="pc-input-wrap"><input className="pc-input" disabled={editorDisabled} onChange={(event) => session.updateBirthDate(event.target.value)} type="date" value={profile.birthDate ?? ""} /></span>
            </Field>
          </div>
          {profile.industry.trim() ? (
            <span className="pc-group-hint">{t({ en: "Existing industry text is preserved; choose the structured categories above for new edits:", zh: "已有行业文字会保留；新的修改请使用上面的结构化分类：" })} {profile.industry}</span>
          ) : null}
          <Field label={{ en: "About me (up to 80 visible characters)", zh: "关于我（最多 80 个可见字符）" }}>
            <span className="pc-input-wrap pc-input-wrap-area"><textarea className="pc-input pc-textarea" disabled={editorDisabled} onChange={(event) => session.update("bio", event.target.value)} rows={3} value={profile.bio} /></span>
          </Field>
          <span className="pc-field">
            <span className="pc-field-label">{t({ en: "One-line intro", zh: "一句话介绍" })}</span>
            <span className="pc-readonly">{profile.headline.trim() || t({ en: "Not filled in", zh: "未填写" })}</span>
            <span className="pc-readonly-scope">{t({ en: "Read-only here", zh: "此处只读" })}</span>
          </span>
        </section>
      </div>

      <div className="pc-col">
        <section className="pc-card pc-side-section">
          <span className="pc-side-head">
            <span className="pc-side-title-row"><span className="pc-side-title-icon">✉</span><strong className="pc-h2">{t({ en: "Contact details", zh: "联系方式" })}</strong></span>
            <span className="pc-side-desc">{t({ en: "Add either WeChat or LINE. Contact details are only visible to you and saved with the basic profile.", zh: "WeChat 或 LINE 任选一项必填；联系方式仅自己可见，随基础资料一起保存。" })}</span>
          </span>
          <Field label={{ en: "WeChat (either this or LINE)", zh: "WeChat（与 LINE 二选一必填）" }} required>
            <span className="pc-input-wrap"><input aria-label="WeChat" className="pc-input" disabled={editorDisabled} onChange={(event) => session.update("wechatName", event.target.value)} value={profile.wechatName} /></span>
          </Field>
          <Field label={{ en: "LINE (either this or WeChat)", zh: "LINE（与 WeChat 二选一必填）" }} required>
            <span className="pc-input-wrap"><input aria-label="LINE" className="pc-input" disabled={editorDisabled} onChange={(event) => session.update("lineId", event.target.value)} value={profile.lineId} /></span>
          </Field>
          {profile.email.trim() ? <ReadonlyRow label="Email" scope={scope} value={profile.email} /> : null}
          {otherHandles.map(([label, raw]) => raw?.trim() ? <ReadonlyRow key={label} label={label} scope={scope} value={raw.trim()} /> : null)}
        </section>
      </div>
    </form>
  );
}
