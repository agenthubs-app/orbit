"use client";

/**
 * UR-P 编辑资料（2026-11-27 定稿）：电脑右侧抽屉（✕ 在右上，底部 キャンセル + 保存），手机全屏（52 高顶栏 ✕ + 居中标题，保存固定在底部）。
 * 会社 / 役職分栏；提供 / 求めていること是标签输入（每项一枚、最多 5 项带计数）；自己紹介带字数（中日文 80 / 其他 200）；
 * 公開する項目用开关（与名片卡同一份 publicFields，只在这里改）；連絡先固定「人脈と主催者のみ」，生日不列。
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../../../../shared/api-schema/profile-bio";
import type { ProfilePublicFieldsContract } from "../../../../../shared/contract/profile";
import { ConfirmDialog, Icon, Toggle } from "../ui";
import p from "./ProfileEditPanel.module.css";

export type ProfileEditDraft = { organization: string; role: string; offering: string[]; seeking: string[]; bio: string; publicFields: ProfilePublicFieldsContract };
type Lang = "ja" | "zh" | "en";
type Text = Record<Lang, string>;
const TAG_LIMIT = 5;
const C = {
  title: { ja: "プロフィールを編集", zh: "编辑资料", en: "Edit profile" },
  companyRole: { ja: "会社・役職", zh: "公司和职位", en: "Company and role" },
  company: { ja: "会社", zh: "公司", en: "Company" },
  role: { ja: "役職", zh: "职位", en: "Role" },
  companyPh: { ja: "例）株式会社ミナトリンク", zh: "例如：港联科技", en: "e.g. Minatolink Inc." },
  rolePh: { ja: "例）代表取締役", zh: "例如：总经理", en: "e.g. CEO" },
  offer: { ja: "提供できること", zh: "能提供的帮助", en: "What I can offer" },
  seek: { ja: "求めていること", zh: "希望认识的人", en: "Who I want to meet" },
  add: { ja: "追加", zh: "添加", en: "Add" },
  remove: { ja: "削除", zh: "删除", en: "Remove" },
  intro: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  visibility: { ja: "公開する項目", zh: "公开的内容", en: "Visible details" },
  visCompany: { ja: "会社・役職", zh: "公司和职位", en: "Company and role" },
  visTags: { ja: "提供・求めていること", zh: "能提供的 · 希望认识的", en: "Offer and seek" },
  visIntro: { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  contact: { ja: "連絡先", zh: "联系方式", en: "Contact details" },
  contactWho: { ja: "人脈にいない人には表示されません", zh: "不在人脉里的人看不到", en: "Hidden from people outside your network" },
  contactFixed: { ja: "人脈と主催者のみ", zh: "仅人脉和主办方", en: "Network and hosts only" },
  cancel: { ja: "キャンセル", zh: "取消", en: "Cancel" },
  save: { ja: "保存", zh: "保存", en: "Save" },
  saving: { ja: "保存しています…", zh: "正在保存…", en: "Saving…" },
  close: { ja: "閉じる", zh: "关闭", en: "Close" },
  saveError: { ja: "保存できませんでした。通信を確認して、もう一度お試しください。", zh: "保存失败。请检查网络后再试一次。", en: "Couldn't save. Check your connection and try again." },
  discardTitle: { ja: "変更を破棄しますか？", zh: "要放弃修改吗？", en: "Discard your changes?" },
  discard: { ja: "破棄する", zh: "放弃", en: "Discard" },
  keep: { ja: "編集を続ける", zh: "继续编辑", en: "Keep editing" },
} satisfies Record<string, Text>;

function TagInput({ field, values, tone, label, disabled, t, onChange, onTyping }: { field: "offering" | "seeking"; values: string[]; tone: "lav" | "pink"; label: string; disabled: boolean; t: (x: Text) => string; onChange: (next: string[]) => void; onTyping: (text: string | null) => void }) {
  const [typing, setTypingState] = useState<string | null>(null);
  const setTyping = (next: string | null) => { setTypingState(next); onTyping(next); };
  const commit = () => {
    const value = (typing ?? "").trim();
    if (value && !values.includes(value) && values.length < TAG_LIMIT) onChange([...values, value]);
    setTyping(null);
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); }
    if (event.key === "Escape") { event.preventDefault(); setTyping(null); }
  };
  return (
    <div className={p.tagin} data-profile-tags={field}>
      {values.map(value => (
        <span key={value} className={`${p.tagx} ${tone === "lav" ? p.lav : p.pink}`}>{value}
          <button type="button" className={`btn ${p.tagX}`} aria-label={`${t(C.remove)}: ${value}`} disabled={disabled} onClick={() => onChange(values.filter(item => item !== value))}><Icon name="x" size={16} /></button>
        </span>
      ))}
      {values.length < TAG_LIMIT ? (typing !== null
        ? <input className={p.tagInput} autoFocus aria-label={label} value={typing} maxLength={40} disabled={disabled} onChange={event => setTyping(event.target.value)} onKeyDown={key} onBlur={commit} data-profile-tag-input={field} />
        : <button type="button" className={`btn ${p.tagadd}`} disabled={disabled} onClick={() => setTyping("")} data-profile-tag-add={field}><Icon name="plus" size={16} />{t(C.add)}</button>) : null}
    </div>
  );
}

export function ProfileEditPanel({ draft, initial, language, saving, saveError, onChange, onCancel, onSave }: {
  draft: ProfileEditDraft; initial: ProfileEditDraft; language: Lang; saving: boolean; saveError: boolean;
  onChange: (next: ProfileEditDraft) => void; onCancel: () => void; onSave: () => void;
}) {
  const t = (x: Text) => x[language] ?? x.ja;
  const [confirm, setConfirm] = useState(false);
  // 自己紹介随内容变高（画板 .fld .ta height auto），不出现框内滚动。
  const bioRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = bioRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [draft.bio]);
  // 输入中的那一项也算进计数（画板 UR-P2 / P6：「3 / 5」）。
  const [typingIn, setTypingIn] = useState<{ field: "offering" | "seeking"; text: string } | null>(null);
  const count = (field: "offering" | "seeking", values: string[]) => values.length + (typingIn?.field === field && typingIn.text.trim() ? 1 : 0);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const close = () => { if (changed && !saving) setConfirm(true); else onCancel(); };
  const bioLength = profileVisibleLength(draft.bio);
  const bioLimit = profileBioLimit(draft.bio);
  const bioOver = !profileBioWithinLimit(draft.bio);
  const dim = saving ? p.dim : "";
  const vis = draft.publicFields;
  return (
    <div className={p.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className={p.panel} role="dialog" aria-modal="true" aria-label={t(C.title)} data-profile-editor="">
        <header className={p.head}>
          <button type="button" className={`btn ${p.rbtn}`} aria-label={t(C.close)} onClick={close} data-profile-close=""><Icon name="x" size={20} /></button>
          <b>{t(C.title)}</b>
          <span className={p.headEnd} aria-hidden />
        </header>
        <div className={p.body}>
          <div className={p.card}>
            <div className={p.gh}>{t(C.companyRole)}</div>
            <div className={`${p.grid2} ${dim}`}>
              <label className={p.fld}><span>{t(C.company)}</span><input className={p.in} value={draft.organization} maxLength={80} disabled={saving} placeholder={t(C.companyPh)} onChange={event => onChange({ ...draft, organization: event.target.value })} /></label>
              <label className={p.fld}><span>{t(C.role)}</span><input className={p.in} value={draft.role} maxLength={80} disabled={saving} placeholder={t(C.rolePh)} onChange={event => onChange({ ...draft, role: event.target.value })} /></label>
            </div>
          </div>
          <div className={`${p.card} ${saving ? p.fade : ""}`} data-profile-card="tags">
            <div className={p.gh}>{t(C.offer)}<small>{count("offering", draft.offering)} / {TAG_LIMIT}</small></div>
            <TagInput field="offering" values={draft.offering} tone="lav" label={t(C.offer)} disabled={saving} t={t} onChange={offering => onChange({ ...draft, offering })} onTyping={text => setTypingIn(text === null ? null : { field: "offering", text })} />
            <div className={`${p.gh} ${p.gh2}`}>{t(C.seek)}<small>{count("seeking", draft.seeking)} / {TAG_LIMIT}</small></div>
            <TagInput field="seeking" values={draft.seeking} tone="pink" label={t(C.seek)} disabled={saving} t={t} onChange={seeking => onChange({ ...draft, seeking })} onTyping={text => setTypingIn(text === null ? null : { field: "seeking", text })} />
          </div>
          <div className={p.card} data-profile-card="bio">
            <label className={`${p.fld} ${bioOver ? p.err : ""} ${dim}`}>
              <span>{t(C.intro)}<em className={p.count}>{bioLength} / {bioLimit}</em></span>
              <textarea ref={bioRef} className={p.ta} value={draft.bio} disabled={saving} onChange={event => onChange({ ...draft, bio: event.target.value })} aria-invalid={bioOver || undefined} data-profile-bio="" />
              {bioOver ? <span className={p.msg} role="alert">{t({ ja: `あと ${bioLength - bioLimit} 文字減らしてください`, zh: `还需删掉 ${bioLength - bioLimit} 个字`, en: `Remove ${bioLength - bioLimit} more characters` })}</span> : null}
            </label>
          </div>
          <div className={`${p.card} ${p.visCard}`} data-profile-card="visibility">
            <div className={p.gh}>{t(C.visibility)}</div>
            {([["companyRole", C.visCompany], ["offeringSeeking", C.visTags], ["intro", C.visIntro]] as const).map(([key, label]) => (
              <div key={key} className={p.vrow} data-public-field={key}>
                <div className={p.grow}><b>{t(label)}</b></div>
                <Toggle checked={vis[key]} label={t(label)} onChange={next => onChange({ ...draft, publicFields: { ...vis, [key]: next } })} />
              </div>
            ))}
            <div className={p.vrow}>
              <div className={p.grow}><b>{t(C.contact)}</b><span>{t(C.contactWho)}</span></div>
              <span className={p.fix}><Icon name="users" size={16} />{t(C.contactFixed)}</span>
            </div>
          </div>
          {saveError ? <div className={p.ngCard} role="alert"><span className={p.ngMark}><Icon name="alert" size={16} /></span><span>{t(C.saveError)}</span></div> : null}
        </div>
        <footer className={p.foot}>
          <span className={p.spacer} />
          <button type="button" className={`btn ${p.btn} ${p.cancel}`} disabled={saving} onClick={onCancel}>{t(C.cancel)}</button>
          <button type="button" className={`btn ${p.btn} ${p.primary} ${saving ? p.saving : ""}`} disabled={saving || bioOver} onClick={onSave} data-profile-save>{saving ? t(C.saving) : t(C.save)}</button>
        </footer>
      </section>
      <ConfirmDialog open={confirm} title={t(C.discardTitle)} confirmLabel={t(C.discard)} cancelLabel={t(C.keep)} destructive onConfirm={() => { setConfirm(false); onCancel(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}
