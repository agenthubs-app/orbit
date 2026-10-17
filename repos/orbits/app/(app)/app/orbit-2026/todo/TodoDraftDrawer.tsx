"use client";

import { useState } from "react";
import { Button, Card, Drawer, TextField, WhyDisclosure, useScopeLanguage } from "../ui";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import styles from "./todo.module.css";

export interface ManualTodoDraft { to: string; subject: string; body: string }

/** Single recipient only. No headers inferred from private data or user text. */
export function draftMailto(draft: ManualTodoDraft): string | null {
  if (draft.to.length > 254 || !/^[^\s@,;<>?&#%:]+@[^\s@,;<>?&#%:]+\.[^\s@,;<>?&#%:]+$/u.test(draft.to)
    || /[\u0000-\u001f\u007f]/u.test(draft.to + draft.subject) || draft.subject.length > 998 || !draft.body.trim() || draft.body.length > 50000) return null;
  try {
    const href = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    return href.length <= 8000 ? href : null;
  } catch { return null; }
}

export function TodoDraftDrawer({ open, title, reason, value, onChange, onClose }: { open: boolean; title: string; reason?: string; value: ManualTodoDraft; onChange: (draft: ManualTodoDraft) => void; onClose: () => void }) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const [copied, setCopied] = useState<"ready" | "copying" | "done" | "failed">("ready");
  const mailto = draftMailto(value);
  const edit = (patch: Partial<ManualTodoDraft>) => { setCopied("ready"); onChange({ ...value, ...patch }); };
  async function copy() {
    setCopied("copying");
    try { await navigator.clipboard.writeText(value.body); setCopied("done"); }
    catch { setCopied("failed"); }
  }
  return <Drawer open={open} onClose={onClose} title={t(taskCopy.draftTitle)} size="lg" footer={<>
    <div className={styles.moveFoot}><Button label={t(taskCopy.draftSave)} variant="ghost" disabled /><Button label={t(taskCopy.draftCopy)} disabled={!value.body.trim() || copied === "copying"} onClick={() => { void copy(); }} />
      {mailto ? <a className={styles.draftLink} href={mailto}>{t(taskCopy.draftOpenMail)}</a> : null}</div>
    {!mailto ? <p className={styles.note}>{t(taskCopy.draftHandoffHint)}</p> : null}
    <p className={styles.note}>{t(taskCopy.draftNeverSends)}</p>
    {copied === "done" ? <p role="status" className={styles.note}>{t(taskCopy.draftCopied)}</p> : copied === "failed" ? <p role="alert" className={styles.note}>{t(taskCopy.draftCopyFailed)}</p> : null}
  </>}>
    <p className={styles.reason}>{title}</p>
    <p role="status" className={styles.note}>{t(taskCopy.draftAiUnavailable)}</p>
    <div className={styles.row} aria-label={t(taskCopy.draftTone)}><Button size="sm" label={t(taskCopy.draftPolite)} disabled /><Button size="sm" label={t(taskCopy.draftCasual)} disabled /><Button size="sm" label={t(taskCopy.draftRewrite)} disabled /></div>
    <Card className={styles.editorFields}><TextField label={t(taskCopy.draftTo)} type="email" maxLength={254} value={value.to} onChange={event => edit({ to: event.target.value })} /><TextField label={t(taskCopy.draftSubject)} maxLength={998} value={value.subject} onChange={event => edit({ subject: event.target.value })} /></Card>
    <label className={styles.editorLabel}>{t(taskCopy.draftBody)}<textarea className={styles.draftBody} value={value.body} maxLength={50000} onChange={event => edit({ body: event.target.value })} /></label>
    {reason ? <div className={styles.moveFoot}><span className={styles.reason}>{reason}</span><WhyDisclosure reason={reason} /></div> : null}
    <p className={styles.note}>{t(taskCopy.draftMemoryOnly)}</p>
  </Drawer>;
}
