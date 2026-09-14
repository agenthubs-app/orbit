"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { INDUSTRY_CATALOG, isIndustryIdCode, listSecondaryIndustries, validateIndustrySelection } from "../../../../shared/domain/industries";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { ORBIT_Z } from "../orbit-z";

export function ContactIndustryEditor({ contactId, initialIndustryId, initialSecondaryIndustryId, language, onClose, onSaved }: {
  contactId: string;
  initialIndustryId?: string;
  initialSecondaryIndustryId?: string;
  language: "zh" | "en" | "ja";
  onClose: () => void;
  onSaved: (industryId: string | null, secondaryIndustryId: string | null) => void;
}) {
  const copy = {
    zh: { title: "主要行业", empty: "未分类", save: "保存行业", saving: "正在保存…", close: "关闭", saved: "行业已保存", error: "未能确认保存结果。你的选择已保留，请重试。" },
    en: { title: "Primary industry", empty: "Unclassified", save: "Save industry", saving: "Saving…", close: "Close", saved: "Industry saved", error: "Could not confirm the save. Your selection is still here; please retry." },
    ja: { title: "主な業種", empty: "未分類", save: "業種を保存", saving: "保存中…", close: "閉じる", saved: "業種を保存しました", error: "保存結果を確認できませんでした。選択内容は残っています。もう一度お試しください。" },
  }[language];
  const secondaryTitle = { zh: "二级行业", en: "Secondary industry", ja: "詳細業種" }[language];
  const secondaryEmpty = { zh: "二级未填写", en: "Secondary industry not set", ja: "詳細業種未入力" }[language];
  const [value, setValue] = useState(initialIndustryId ?? "");
  const [secondaryValue, setSecondaryValue] = useState(initialSecondaryIndustryId ?? "");
  const [savedValue, setSavedValue] = useState(initialIndustryId ?? "");
  const [savedSecondaryValue, setSavedSecondaryValue] = useState(initialSecondaryIndustryId ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const modalRef = useOrbitModalA11y(() => { if (!pending.current) onClose(); });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const unchanged = value === savedValue && secondaryValue === savedSecondaryValue;
  const selectionValid = validateIndustrySelection({ primaryIndustryId: value || null, secondaryIndustryId: secondaryValue || null }).valid
    && (!value || Boolean(secondaryValue));

  async function save() {
    if (pending.current || unchanged || !selectionValid) return;
    pending.current = true;
    setStatus("saving");
    const selected = value || null;
    const secondarySelected = secondaryValue || null;
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIndustryId: selected, secondaryIndustryId: secondarySelected }),
      });
      const result = z.object({ success: z.literal(true), data: z.object({ contact: z.object({
        id: z.literal(contactId), primaryIndustryId: z.string().nullish(), secondaryIndustryId: z.string().nullish(),
      }) }) }).parse(await response.json());
      if (!response.ok || (result.data.contact.primaryIndustryId ?? null) !== selected
        || (result.data.contact.secondaryIndustryId ?? null) !== secondarySelected) throw new Error("Unconfirmed industry");
      if (!mounted.current) return;
      setSavedValue(value);
      setSavedSecondaryValue(secondaryValue);
      setStatus("saved");
      onSaved(selected, secondarySelected);
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: ORBIT_Z.modal, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 18 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1} className="card" style={{ width: "100%", maxWidth: 420, padding: 22 }}>
        <h2 className="h-section" style={{ margin: "0 0 18px" }}>{copy.title}</h2>
        <select aria-label={copy.title} value={value} disabled={status === "saving"} onChange={(event) => { setValue(event.target.value); if (event.target.value !== value) setSecondaryValue(""); setStatus("idle"); }} style={{ width: "100%", minHeight: 44, padding: "8px 10px", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--r-md)" }}>
          <option value="">{copy.empty}</option>
          {initialIndustryId && !isIndustryIdCode(initialIndustryId) ? <option value={initialIndustryId} disabled>{copy.empty}</option> : null}
          {INDUSTRY_CATALOG.map((industry) => <option key={industry.id} value={industry.id}>{industry.labels[language]}</option>)}
        </select>
        <label style={{ display: "block", marginTop: 14 }}>
          <span>{secondaryTitle}</span>
          <select aria-label={secondaryTitle} value={secondaryValue} disabled={status === "saving" || !isIndustryIdCode(value)} onChange={event => { setSecondaryValue(event.target.value); setStatus("idle"); }} style={{ width: "100%", minHeight: 44, padding: "8px 10px", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--r-md)" }}>
            <option value="">{secondaryEmpty}</option>
            {isIndustryIdCode(value) ? listSecondaryIndustries(value).map(industry => <option key={industry.id} value={industry.id}>{industry.labels[language]}</option>) : null}
          </select>
        </label>
        {status === "error" ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{copy.error}</p> : null}
        {status === "saved" ? <p role="status">{copy.saved}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-quiet" disabled={status === "saving"} onClick={onClose}>{copy.close}</button>
          <button type="button" className="btn btn-primary" data-industry-save disabled={status === "saving" || unchanged || !selectionValid} onClick={save}>{status === "saving" ? copy.saving : copy.save}</button>
        </div>
      </div>
    </div>
  );
}
