"use client";

// R11a 連絡先を編集（Web 抽屉; b5 #45）。✕ · 連絡先を編集 · キャンセル / 保存。氏名・会社・役職・メール・電話 → PATCH …/fields
// （旧值进「以前の値」）；業界 / 役職層 / 段階（知り合い・関係構築，代定 12）/ 地域 → PATCH /api/contacts/:id。
// 出会った場所 只显示（编辑留给加人线）。「最終更新」+ 削除（确认后软删）。
import { useMemo, useState } from "react";

import { SENIORITY_LEVELS } from "../../../../../shared/compute/seniority-group";
import { meetingNoteValue } from "../../../../../shared/compute/contact-source-chip";
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../../../../shared/domain/industries";
import type { IndustryIdCode } from "../../../../../shared/contract/industries";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Drawer, Icon, useToast } from "../ui";
import { ContactAvatar, useNetworkT, type DrawerContact } from "./ContactDrawer";
import { networkApi } from "./network-api";
import { NETWORK_CITY_KEYS, tokyoMonthDay, type NetworkCityKey } from "./network-model";
import styles from "./network.module.css";

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

  const field = (label: string, key: "displayName" | "organization" | "role" | "email" | "phone", type = "text") => (
    <label className={styles.fld}><span className={styles.lbl}>{label}</span><span className={styles.input}><input type={type} value={draft[key]} onChange={(event) => set({ [key]: event.target.value })} aria-label={label} /></span></label>
  );

  return (
    <Drawer open onClose={onClose} title={t("editTitleWeb")} size="lg" fullOnPhone bare>
      <div className={styles.drawer} data-network-edit="">
        <div className={styles.drawerTop}>
          <button type="button" className={`btn ${styles.rbtn}`} onClick={onClose} aria-label={t("drawerClose")}><Icon name="x" size={20} /></button>
          <b>{t("editTitleWeb")}</b>
          <div className={styles.row}>
            <button type="button" className={`btn ${styles.btn}`} onClick={onClose}>{t("editCancel")}</button>
            <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={() => void save()} disabled={busy}>{t("editSave")}</button>
          </div>
        </div>
        <div className={styles.row}><ContactAvatar name={draft.displayName || contact.displayName} large /></div>
        <div className={styles.card}>
          <div className={styles.grid2}>{field(t("editName"), "displayName")}{field(t("editCompany"), "organization")}{field(t("editRole"), "role")}</div>
          <div className={styles.grid2} style={{ marginTop: 12 }}>
            <label className={styles.fld}><span className={styles.lbl}>{t("editIndustry")}</span><span className={styles.input}>
              <select aria-label={t("editIndustry")} value={draft.secondaryIndustryId || draft.primaryIndustryId} onChange={(event) => {
                const value = event.target.value;
                const parent = value.includes(".") ? value.split(".")[0]! : value;
                set({ primaryIndustryId: parent, secondaryIndustryId: value.includes(".") ? value : "" });
              }}>
                <option value="">{t("editIndustryUnset")}</option>
                {INDUSTRY_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.labels[language]}</option>)}
                {subs.map((item) => <option key={item.id} value={item.id}>{`${INDUSTRY_CATALOG.find((parent) => parent.id === draft.primaryIndustryId)?.labels[language] ?? ""} › ${item.labels[language]}`}</option>)}
              </select></span></label>
            <label className={styles.fld}><span className={styles.lbl}>{t("editSeniority")}</span><span className={styles.input}>
              <select aria-label={t("editSeniority")} value={draft.seniorityLevel} onChange={(event) => set({ seniorityLevel: event.target.value })}>
                <option value="">{t("editIndustryUnset")}</option>
                {GROUPS.map(([key, level, copy]) => <option key={key} value={level}>{t(copy)}</option>)}
                {draft.seniorityLevel && !GROUPS.some(([, level]) => level === draft.seniorityLevel) && (SENIORITY_LEVELS as readonly string[]).includes(draft.seniorityLevel) ? <option value={draft.seniorityLevel}>{draft.seniorityLevel}</option> : null}
              </select></span></label>
          </div>
          <div className={styles.fld} style={{ marginTop: 12 }}>
            <span className={styles.lbl}>{t("editStage")}</span>
            <div className={styles.seg} role="tablist" aria-label={t("editStage")}>
              {(["active", "nurture"] as const).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={draft.status === key} className={`btn ${styles.segBtn} ${draft.status === key ? styles.segOn : ""}`} onClick={() => set({ status: key })}>{t(key === "active" ? "stageActive" : "stageNurture")}</button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.grid2}>
            {field(t("editEmail"), "email", "email")}{field(t("editPhone"), "phone", "tel")}
            <label className={styles.fld}><span className={styles.lbl}>{t("editMet")}</span><span className={styles.input}><input value={met ?? t("editMetUnknown")} readOnly aria-label={t("editMet")} /></span></label>
            <label className={styles.fld}><span className={styles.lbl}>{t("editRegion")}</span><span className={styles.input}>
              <select aria-label={t("editRegion")} value={draft.city} onChange={(event) => set({ city: event.target.value })}>
                <option value="">{t("editIndustryUnset")}</option>
                {NETWORK_CITY_KEYS.map((city) => <option key={city} value={city}>{t(`city${city}` as `city${NetworkCityKey}`)}</option>)}
                {draft.city && !(NETWORK_CITY_KEYS as readonly string[]).includes(draft.city) ? <option value={draft.city}>{draft.city}</option> : null}
              </select></span></label>
          </div>
        </div>
        <div className={`${styles.row} ${styles.between}`}>
          <span className={styles.lbl}>{contact.updatedAt ? t("editUpdated", { date: tokyoMonthDay(contact.updatedAt) }) : null}</span>
          <button type="button" className={`btn ${styles.btn} ${styles.dangerGhost}`} onClick={onDelete}>{t("editDeleteShort")}</button>
        </div>
      </div>
    </Drawer>
  );
}
