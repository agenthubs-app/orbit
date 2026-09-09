"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useOrbitLanguage } from "../../orbit-language-context";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { ORBIT_Z } from "../../orbit-z";

export function AnalysisGoalEditor({ profileId, initialGoal, onClose, onSaved }: {
  profileId: string; initialGoal: string; onClose: () => void; onSaved: (goal: string) => void;
}) {
  const { t } = useOrbitLanguage();
  const [baseline, setBaseline] = useState(initialGoal);
  const [draft, setDraft] = useState(initialGoal);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const modalRef = useOrbitModalA11y(() => { if (!pending.current) onClose(); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const changed = draft.trim() !== baseline.trim();
  const save = async () => {
    if (pending.current || !changed) return;
    const goal = draft.trim();
    pending.current = true; setStatus("saving");
    try {
      const response = await fetch("/api/profile", { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationshipGoal: goal }) });
      const result = z.object({ success: z.literal(true), data: z.object({ profile: z.object({ id: z.literal(profileId), relationshipGoal: z.literal(goal) }) }) }).parse(await response.json());
      if (!response.ok) throw new Error("Unconfirmed goal");
      if (!mounted.current) return;
      setBaseline(result.data.profile.relationshipGoal); setStatus("idle"); onSaved(result.data.profile.relationshipGoal);
    } catch { if (mounted.current) setStatus("error"); }
    finally { pending.current = false; }
  };
  const title = t({ zh: "编辑关系目标", en: "Edit relationship goal", ja: "関係づくりの目標を編集" });
  return <div style={{ position: "fixed", inset: 0, zIndex: ORBIT_Z.modal, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 18 }}>
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="card" style={{ width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", padding: 22 }}>
      <h2 className="h-section">{title}</h2>
      <label>{t({ zh: "关系目标", en: "Relationship goal", ja: "関係づくりの目標" })}<textarea aria-label={t({ zh: "关系目标", en: "Relationship goal", ja: "関係づくりの目標" })} value={draft} rows={4} disabled={status === "saving"} onChange={(event) => { setDraft(event.target.value); setStatus("idle"); }} style={{ display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", padding: 12, marginTop: 8, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "inherit" }} /></label>
      <p className="analysis-muted">{t({ zh: "写下你希望认识谁、推进什么合作。留空保存可清除目标。", en: "Describe who you want to meet and what you want to work on. Save an empty field to clear your goal.", ja: "会いたい相手や進めたい協力について入力してください。空欄で保存すると目標を削除できます。" })}</p>
      {status === "error" ? <p role="alert">{t({ zh: "未能确认保存结果。输入已保留，请重试。", en: "Could not confirm the save. Your input is still here; please retry.", ja: "保存結果を確認できませんでした。入力内容は残っています。再試行してください。" })}</p> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}><button className="btn btn-quiet" disabled={status === "saving"} onClick={onClose}>{t({ zh: "关闭", en: "Close", ja: "閉じる" })}</button><button className="btn btn-primary" data-analysis-goal-save disabled={status === "saving" || !changed} onClick={save}>{status === "saving" ? t({ zh: "正在保存…", en: "Saving…", ja: "保存中…" }) : t({ zh: "保存目标", en: "Save goal", ja: "目標を保存" })}</button></div>
    </div>
  </div>;
}
