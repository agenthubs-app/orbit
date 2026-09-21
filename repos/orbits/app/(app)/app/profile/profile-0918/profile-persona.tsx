/**
 * 编辑商务画像屏（Orbit_0918 个人中心 设计稿 154–207 行）。
 *   - 左列「商务画像内容」：personaGroups 四张组卡（设计 158–174 行）。offer / seek / topic 可编辑：
 *     chip ✕ → toggleTag 移除；输入 + Enter → 先 `values.includes(tag)` 守卫再 toggleTag 添加
 *     （toggleTag 对已存在标签是移除）；offer / seek 各最多 5 项，超出 notify("error", 旧 ChipGroup 文案) 且不添加。
 *   - 「我的目标」= intro 单文本，hook 无保存通道 → 同卡结构但只读 chip（无值「未设置」）、无输入框（偏差记台账）。
 *   - 右列「预览效果」（177–196 行）= 真实姓名 / title · company / bio + 四组真实值（空组一枚「未填写」）；
 *     设计 184 行地点无数据源省略；「填写建议」三条（198–205 行）原样。
 *   - 保存栏在壳里（ProfileScreens 传 showSaveBar / onSave / onCancel）。
 */
"use client";

import { useState, type KeyboardEvent } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { profileInitial } from "./business-card-preview";
import { personaGroups, type PersonaGroup } from "./profile-model";
import type { ProfileEditorSession } from "./use-profile-editor-session";

type TagField = "offering" | "seeking" | "topics";

// 旧 EditSections：offer / seek 各 maxSelected 5，topic 无上限。
const GROUP_FIELD: Record<PersonaGroup["key"], { field: TagField; max?: number } | null> = {
  goal: null,
  offer: { field: "offering", max: 5 },
  seek: { field: "seeking", max: 5 },
  topic: { field: "topics" },
};

// 设计 198–205 行三条建议（文案原样）。
const TIPS: readonly { title: { zh: string; en: string }; desc: { zh: string; en: string } }[] = [
  { title: { zh: "突出你的核心价值", en: "Lead with your core value" }, desc: { zh: "使用具体、清晰的关键词，让他人快速了解你。", en: "Use specific, clear keywords so people understand you at a glance." } },
  { title: { zh: "结合你的真实意图", en: "Match your real intent" }, desc: { zh: "基于你当前的阶段和兴趣，选择最相关的内容。", en: "Pick what is most relevant to your current stage and interests." } },
  { title: { zh: "保持简洁与专业", en: "Keep it concise and professional" }, desc: { zh: "建议每个部分选择 3–5 个关键词，便于他人快速理解。", en: "Three to five keywords per section work best." } },
];

function PersonaGroupCard({ group, session }: { group: PersonaGroup; session: ProfileEditorSession }) {
  const { t } = useOrbitLanguage();
  const [draft, setDraft] = useState("");
  const binding = GROUP_FIELD[group.key];
  const disabled = session.editorDisabled;

  // 旧 ChipGroup.addDraft 行为：空/重复不加；到上限 → onLimitReached（notify）；否则 toggleTag 并清空草稿。
  function addDraft() {
    if (!binding || disabled) return;
    const tag = draft.trim();
    if (!tag || group.values.includes(tag)) return;
    if (binding.max !== undefined && group.values.length >= binding.max) {
      session.notify("error", t({ en: "You can select up to five offerings or five things you are seeking.", zh: "能提供和想寻求各最多选择 5 项。" }));
      return;
    }
    session.toggleTag(binding.field, tag);
    setDraft("");
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addDraft();
  }

  const label = t(group.title);
  return (
    <div className="pc-group" role="group" aria-label={label}>
      <span className="pc-group-head">
        <span className="pc-group-icon">{group.icon}</span>
        <span className="pc-group-copy"><strong className="pc-group-title">{label}</strong><span className="pc-group-hint">{t(group.hint)}</span></span>
      </span>
      <span className="pc-tags">
        {binding
          ? group.values.map((value) => (
              <span key={value} className="pc-tag">{value} <button aria-label={t({ en: `Remove ${value}`, zh: `移除 ${value}` })} className="btn pc-tag-remove" disabled={disabled} onClick={() => session.toggleTag(binding.field, value)} type="button">✕</button></span>
            ))
          : group.values.length
            ? group.values.map((value) => <span key={value} className="pc-tag pc-tag-readonly">{value}</span>)
            : <span className="pc-tag pc-tag-readonly pc-tag-empty">{t({ en: "Not set", zh: "未设置" })}</span>}
      </span>
      {binding ? (
        <span className="pc-input-wrap">
          <span className="pc-input-plus">＋</span>
          <input
            aria-label={t({ en: `Add ${label} item`, zh: `添加${label}项目` })}
            className="pc-input"
            disabled={disabled}
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onDraftKeyDown}
            placeholder={t(group.placeholder)}
            value={draft}
          />
        </span>
      ) : null}
    </div>
  );
}

export function ProfilePersona({ session }: { session: ProfileEditorSession }) {
  const { t } = useOrbitLanguage();
  const profile = session.profile;
  const groups = personaGroups(profile);
  const roleLine = [profile.title.trim(), profile.company.trim()].filter(Boolean).join(" · ");
  const bio = profile.bio.trim();
  const empty = t({ en: "Not filled in", zh: "未填写" });

  return (
    <div className="pc-editor">
      <section className="pc-card pc-stack">
        <strong className="pc-h2-lg">{t({ en: "Business persona", zh: "商务画像内容" })}</strong>
        {groups.map((group) => <PersonaGroupCard key={group.key} group={group} session={session} />)}
      </section>

      <div className="pc-col">
        <section className="pc-card pc-side-section">
          <span className="pc-side-head">
            <span className="pc-side-title-row"><span className="pc-side-title-icon">◉</span><strong className="pc-h2">{t({ en: "Preview", zh: "预览效果" })}</strong></span>
            <span className="pc-side-desc">{t({ en: "This is your public business persona preview; other members will see this.", zh: "这是你的公开商务画像预览，其他用户将看到这些内容。" })}</span>
          </span>
          <div className="pc-preview-box">
            <span className="pc-preview-head">
              <span className="pc-preview-avatar">{profileInitial(profile)}</span>
              <span className="pc-preview-copy">
                <strong className="pc-preview-name">{profile.fullName.trim() || t({ en: "Your name", zh: "你的名字" })}</strong>
                {roleLine ? <span className="pc-preview-role">{roleLine}</span> : null}
              </span>
            </span>
            {bio ? <span className="pc-preview-bio">{bio}</span> : null}
            {groups.map((group) => (
              <span key={group.key} className="pc-preview-row">
                <span className="pc-preview-label"><span className="pc-preview-label-icon">{group.icon}</span>{t(group.title)}</span>
                <span className="pc-preview-tags">
                  {group.values.length
                    ? group.values.map((value) => <span key={value} className="pc-preview-tag">{value}</span>)
                    : <span className="pc-preview-tag pc-preview-tag-empty">{empty}</span>}
                </span>
              </span>
            ))}
          </div>
        </section>

        <section className="pc-card pc-side-section">
          <span className="pc-side-title-row"><span className="pc-side-title-icon">✦</span><strong className="pc-h2">{t({ en: "Writing tips", zh: "填写建议" })}</strong></span>
          {TIPS.map((tip, index) => (
            <span key={tip.title.zh} className="pc-tip">
              <span className="pc-tip-n">{index + 1}</span>
              <span className="pc-tip-copy"><strong className="pc-tip-title">{t(tip.title)}</strong><span className="pc-tip-desc">{t(tip.desc)}</span></span>
            </span>
          ))}
        </section>
      </div>
    </div>
  );
}
