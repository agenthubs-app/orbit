"use client";

// R11a 連絡先を編集（Web 抽屉; b5 #45）。✕ · 連絡先を編集 · キャンセル / 保存。氏名・会社・役職・メール・電話 → PATCH …/fields
// （旧值进「以前の値」）；業界 / 役職層 / 段階（知り合い・関係構築，代定 12）/ 地域 → PATCH /api/contacts/:id。
// 出会った場所 只显示（编辑留给加人线）。「最終更新」+ 削除（确认后软删）。
import { useMemo, useState, type ReactNode } from "react";

import { SENIORITY_LEVELS } from "../../../../../shared/compute/seniority-group";
import { meetingNoteValue } from "../../../../../shared/compute/contact-source-chip";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../../../../shared/domain/industries";
import type { IndustryIdCode } from "../../../../../shared/contract/industries";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Icon, useToast } from "../ui";
import { ContactAvatar, useNetworkT, type DrawerContact } from "./ContactDrawer";
import { networkApi } from "./network-api";
import { NETWORK_CITY_KEYS, tokyoMonthDay, type NetworkCityKey } from "./network-model";
import e from "./ContactEditDrawer.module.css";

const GROUPS = [["decision", "c_level", "editSeniorityDecision"], ["manager", "manager", "editSeniorityManager"], ["staff", "individual_contributor", "editSeniorityStaff"]] as const;

export function ContactEditDrawer({ contact, onClose, onSaved, onDelete }: { contact: DrawerContact; onClose: () => void; onSaved: () => void; onDelete: () => void }) {
  const t = useNetworkT();
  const { language } = useOrbitLanguage();
  const toast = useToast();
  const initial = useMemo(() => ({
    displayName: contact.displayName, organization: contact.organization, role: contact.role, email: contact.primaryEmail, phone: contact.primaryPhone,
    primaryIndustryId: contact.primaryIndustryId ?? "", secondaryIndustryId: contact.secondaryIndustryId ?? "", seniorityLevel: contact.seniorityLevel ?? "",
    status: contact.status === "nurture" ? "nurture" : "active", city: contact.region?.city ?? "",
  }), [contact]);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  const subs = draft.primaryIndustryId ? listSecondaryIndustries(draft.primaryIndustryId as IndustryIdCode) : [];
  const met = meetingNoteValue(contact.cardNotes ?? null);

  const save = async () => {
    setBusy(true);
    const values: Record<string, string | null> = {};
    for (const key of ["displayName", "organization", "role", "email", "phone"] as const) {
      if (draft[key].trim() !== initial[key].trim()) values[key] = draft[key].trim() || (key === "displayName" ? draft[key] : null);
    }
    const patch: Record<string, unknown> = {};
    if (draft.primaryIndustryId !== initial.primaryIndustryId || draft.secondaryIndustryId !== initial.secondaryIndustryId) {
      patch.primaryIndustryId = draft.primaryIndustryId || null; patch.secondaryIndustryId = draft.secondaryIndustryId || null;
    }
    if (draft.seniorityLevel !== initial.seniorityLevel) patch.seniorityLevel = draft.seniorityLevel || null;
    if (draft.status !== initial.status) patch.status = draft.status;
    if (draft.city !== initial.city) patch.region = draft.city ? { countryCode: contact.region?.countryCode ?? "JP", city: draft.city } : null;
    const results = await Promise.all([
      Object.keys(values).length ? networkApi.updateFields(contact.id, values) : Promise.resolve({ ok: true as const }),
      Object.keys(patch).length ? networkApi.updateDetail(contact.id, patch) : Promise.resolve({ ok: true as const }),
    ]);
    setBusy(false);
    if (results.every((result) => result.ok)) { toast.success(t("editSaved")); onSaved(); } else toast.error(t("editSaveFailed"));
  };


  const input = (label: string, key: "displayName" | "organization" | "role" | "email" | "phone", type = "text") => (
    <label className={e.fld}><span>{label}</span><input className={e.in} type={type} value={draft[key]} disabled={busy} onChange={(event) => set({ [key]: event.target.value })} aria-label={label} /></label>
  );
  const select = (label: string, value: string, onChange: (value: string) => void, options: ReactNode) => (
    <label className={e.fld}><span>{label}</span><span className={e.selWrap}><select className={e.in} value={value} disabled={busy} aria-label={label} onChange={(event) => onChange(event.target.value)}>{options}</select><Icon name="down" size={16} /></span></label>
  );
  const unset = <option value="">{t("editIndustryUnset")}</option>;

  // UR-E（2026-11-27）：电脑照 b5 E2 抽屉（✕ · 標題 · キャンセル · 保存 一行）；手机 52 高顶栏（✕ + 居中标题，随内容滚走），保存在底部；
  // 三组卡（基本情報 / 分類 / 連絡先），手机单列；出会った場所写成一行文字；删除整行在最下面，点了先确认（确认框盖在这个面板上）。
  return (
    <div className={e.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={e.panel} role="dialog" aria-modal="true" aria-label={t("editTitleWeb")} data-network-edit="">
        <header className={e.head}>
          <button type="button" className={`btn ${e.rbtn}`} onClick={onClose} aria-label={t("drawerClose")}><Icon name="x" size={20} /></button>
          <b>{t("editTitleWeb")}</b>
          <button type="button" className={`btn ${e.btn} ${e.cancel}`} onClick={onClose} disabled={busy}>{t("editCancel")}</button>
          <button type="button" className={`btn ${e.btn} ${e.primary} ${e.headSave}`} onClick={() => void save()} disabled={busy} data-network-edit-save="">{busy ? t("editSaving") : t("editSave")}</button>
          <span className={e.headEnd} aria-hidden />
        </header>
        <div className={e.body}>
          <div className={e.who}><ContactAvatar name={draft.displayName || contact.displayName} large />{contact.updatedAt ? <span className={e.lbl}>{t("editUpdated", { date: tokyoMonthDay(contact.updatedAt) })}</span> : null}</div>
          <div className={`${e.card} ${busy ? e.dim : ""}`} data-network-edit-group="basic">
            <div className={e.gh}>{t("editGroupBasic")}</div>
            {input(t("editName"), "displayName")}
            <div className={e.grid2}>{input(t("editCompany"), "organization")}{input(t("editRole"), "role")}</div>
          </div>
          <div className={`${e.card} ${busy ? e.dim : ""}`} data-network-edit-group="class">
            <div className={e.gh}>{t("editGroupClass")}</div>
            <div className={e.grid2}>
              {select(t("editIndustry"), draft.secondaryIndustryId || draft.primaryIndustryId, (value) => {
                const parent = value.includes(".") ? value.split(".")[0]! : value;
                set({ primaryIndustryId: parent, secondaryIndustryId: value.includes(".") ? value : "" });
              }, <>{unset}
                {INDUSTRY_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.labels[language]}</option>)}
                {subs.map((item) => <option key={item.id} value={item.id}>{`${INDUSTRY_CATALOG.find((parent) => parent.id === draft.primaryIndustryId)?.labels[language] ?? ""} › ${item.labels[language]}`}</option>)}</>)}
              {select(t("editSeniority"), draft.seniorityLevel, (value) => set({ seniorityLevel: value }), <>{unset}
                {GROUPS.map(([key, level, copy]) => <option key={key} value={level}>{t(copy)}</option>)}
                {draft.seniorityLevel && !GROUPS.some(([, level]) => level === draft.seniorityLevel) && (SENIORITY_LEVELS as readonly string[]).includes(draft.seniorityLevel) ? <option value={draft.seniorityLevel}>{draft.seniorityLevel}</option> : null}</>)}
            </div>
            <div className={e.fld}>
              <span>{t("editStage")}</span>
              <div className={e.seg} role="tablist" aria-label={t("editStage")}>
                {(["active", "nurture"] as const).map((key) => (
                  <button key={key} type="button" role="tab" aria-selected={draft.status === key} className={`btn ${e.segBtn} ${draft.status === key ? e.segOn : ""}`} disabled={busy} onClick={() => set({ status: key })}>{t(key === "active" ? "stageActive" : "stageNurture")}</button>
                ))}
              </div>
            </div>
          </div>
          <div className={`${e.card} ${busy ? e.dim : ""}`} data-network-edit-group="contact">
            <div className={e.gh}>{t("editGroupContact")}</div>
            <div className={e.grid2}>{input(t("editEmail"), "email", "email")}{input(t("editPhone"), "phone", "tel")}</div>
            {select(t("editRegion"), draft.city, (value) => set({ city: value }), <>{unset}
              {NETWORK_CITY_KEYS.map((city) => <option key={city} value={city}>{t(`city${city}` as `city${NetworkCityKey}`)}</option>)}
              {draft.city && !(NETWORK_CITY_KEYS as readonly string[]).includes(draft.city) ? <option value={draft.city}>{draft.city}</option> : null}</>)}
            <div className={e.met}><Icon name="pin" size={16} />{t("editMetLine", { place: met ?? t("editMetUnknown") })}</div>
          </div>
          <button type="button" className={`btn ${e.del}`} onClick={onDelete} disabled={busy} data-network-edit-delete=""><Icon name="x" size={16} />{t("editDelete")}</button>
        </div>
        <footer className={e.foot}>
          <button type="button" className={`btn ${e.btn} ${e.primary}`} onClick={() => void save()} disabled={busy}>{busy ? t("editSaving") : t("editSave")}</button>
        </footer>
      </section>
    </div>
  );
}
