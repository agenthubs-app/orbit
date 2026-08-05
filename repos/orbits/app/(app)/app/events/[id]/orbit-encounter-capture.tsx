"use client";

import { useRef, useState } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";

function newEncounterIdempotencyKey(): string {
  return `encounter:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function OrbitEncounterCapture({ contactId, eventId }: { contactId: string; eventId: string }) {
  const { t } = useOrbitLanguage();
  const [talked, setTalked] = useState<"yes" | "no" | "uncertain">("yes");
  const [noteText, setNoteText] = useState("");
  const [commitments, setCommitments] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [tags, setTags] = useState("");
  const idempotencyKey = useRef(newEncounterIdempotencyKey());
  const observedAt = useRef<string | null>(null);
  const lastSavedSnapshot = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const snapshot = JSON.stringify({
    commitments: commitments.split("\n").map((value) => value.trim()).filter(Boolean),
    nextStep: nextStep.trim(),
    noteText: noteText.trim(),
    talked,
    tags: tags.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
  });
  const beginEdit = () => setState((current) => current === "saving" ? current : "idle");
  return <form className="card-flat" data-human-encounter-capture onSubmit={async (event) => {
    event.preventDefault(); setState("saving");
    try {
      observedAt.current ??= new Date().toISOString();
      const response = await fetch("/api/encounters", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ commitments: commitments.split("\n").filter(Boolean), contactId, eventId, nextStep, noteText, observedAt: observedAt.current, privacy: "private", talked, tags: tags.split(/[,，]/).filter(Boolean) }) });
      if (!response.ok) throw new Error("capture-failed");
      lastSavedSnapshot.current = snapshot;
      idempotencyKey.current = newEncounterIdempotencyKey();
      observedAt.current = null;
      setState("saved");
    } catch { setState("failed"); }
  }} style={{ display: "grid", gap: 9, padding: 14 }}>
    <strong>{t({ en: "Record an encounter", zh: "记录一次真实交流" })}</strong>
    <small style={{ color: "var(--text-3)" }}>{t({ en: "Only your explicit input is recorded. Check-in and table placement never imply that you talked.", zh: "只记录你明确填写的内容；签到或同桌不会被推断为已经交流。" })}</small>
    <select aria-label={t({ en: "Did you talk?", zh: "是否聊过" })} className="field" onChange={(event) => { setTalked(event.target.value as typeof talked); beginEdit(); }} value={talked}><option value="yes">{t({ en: "Yes, we talked", zh: "是，聊过" })}</option><option value="no">{t({ en: "No", zh: "没有" })}</option><option value="uncertain">{t({ en: "Not sure", zh: "不确定" })}</option></select>
    <textarea aria-label={t({ en: "Encounter note", zh: "交流记录" })} className="field" onChange={(event) => { setNoteText(event.target.value); beginEdit(); }} placeholder={t({ en: "What was actually discussed?", zh: "实际聊了什么？" })} value={noteText} />
    <textarea aria-label={t({ en: "Commitments", zh: "双方承诺" })} className="field" onChange={(event) => { setCommitments(event.target.value); beginEdit(); }} placeholder={t({ en: "One commitment per line", zh: "每行一项承诺" })} value={commitments} />
    <input aria-label={t({ en: "Next step", zh: "下一步" })} className="field" onChange={(event) => { setNextStep(event.target.value); beginEdit(); }} placeholder={t({ en: "Concrete next action", zh: "明确的下一步行动" })} value={nextStep} />
    <input aria-label={t({ en: "Tags", zh: "标签" })} className="field" onChange={(event) => { setTags(event.target.value); beginEdit(); }} placeholder={t({ en: "Comma-separated tags", zh: "用逗号分隔标签" })} value={tags} />
    <small style={{ color: "var(--text-3)" }}>{t({ en: "Privacy: private to you. Relationship sharing is not configured.", zh: "隐私：仅自己可见；关系共享尚未配置。" })}</small>
    <button className="btn btn-primary btn-sm" disabled={state === "saving" || lastSavedSnapshot.current === snapshot || (!noteText.trim() && !nextStep.trim() && !commitments.trim())} style={{ justifySelf: "start" }} type="submit">{t({ en: "Save encounter", zh: "保存交流记录" })}</button>
    {state === "saved" ? <span style={{ color: "var(--success)", fontSize: 12 }}>{t({ en: "Saved. Timeline projection is pending.", zh: "已保存，正在投影到联系人时间线。" })}</span> : null}
    {state === "failed" ? <span style={{ color: "var(--danger)", fontSize: 12 }}>{t({ en: "Save failed; no placeholder was created.", zh: "保存失败，未创建任何占位记录。" })}</span> : null}
  </form>;
}
