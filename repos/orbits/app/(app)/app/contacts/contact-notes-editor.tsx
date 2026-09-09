"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { contactNotesPayloadSchema } from "../../../../shared/api-schema/contact-notes";
import type { OrbitContactNoteView } from "../orbit-contacts-route-view-model";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { ORBIT_Z } from "../orbit-z";

export function ContactNotesEditor({ contactId, language, onClose, onSaved }: {
  contactId: string;
  language: "zh" | "en" | "ja";
  onClose: () => void;
  onSaved: (notes: OrbitContactNoteView[]) => void;
}) {
  const copy = {
    zh: { title: "添加联系人备注", privacy: "仅自己可见，不会发送给对方。", placeholder: "记下想留给自己看的信息", save: "保存备注", saving: "正在保存…", close: "关闭", saved: "备注已保存", error: "未能确认保存结果。备注内容已保留，请重试。" },
    en: { title: "Add contact note", privacy: "Only visible to you. Nothing is sent to this contact.", placeholder: "Write something to remember", save: "Save note", saving: "Saving…", close: "Close", saved: "Note saved", error: "Could not confirm the save. Your note is still here; please retry." },
    ja: { title: "連絡先メモを追加", privacy: "自分だけに表示されます。相手には送信されません。", placeholder: "覚えておきたいことを記入", save: "メモを保存", saving: "保存中…", close: "閉じる", saved: "メモを保存しました", error: "保存結果を確認できませんでした。内容は残っています。もう一度お試しください。" },
  }[language];
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const modalRef = useOrbitModalA11y(() => { if (!pending.current) onClose(); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function save() {
    const body = draft.trim();
    if (!body || pending.current) return;
    pending.current = true;
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: { body, authorLabel: "我" } }),
      });
      const result = z.object({ success: z.literal(true), data: contactNotesPayloadSchema }).parse(await response.json());
      const contact = result.data.contact;
      const saved = contact.notes.find((note) => note.privacy === "private" && note.body === body && note.authorLabel === "我");
      if (!response.ok || contact.id !== contactId || !saved) throw new Error("Unconfirmed contact note");
      if (!mounted.current) return;
      setDraft("");
      setStatus("saved");
      onSaved(contact.notes.filter((note) => note.privacy === "private").map((note) => ({ id: note.noteId, body: note.body, createdAt: note.createdAt, privacy: "private" })));
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: ORBIT_Z.modal, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 18 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1} className="card" style={{ width: "100%", maxWidth: 480, padding: 22 }}>
        <h2 className="h-section" style={{ margin: "0 0 12px" }}>{copy.title}</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>{copy.privacy}</p>
        <textarea aria-label={copy.title} disabled={status === "saving"} rows={5} value={draft} placeholder={copy.placeholder} onChange={(event) => { setDraft(event.target.value); setStatus("idle"); }} style={{ boxSizing: "border-box", width: "100%", resize: "vertical", minHeight: 120, maxHeight: "45dvh", padding: 12, color: "var(--text)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--r-md)", font: "inherit" }} />
        {status === "error" ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{copy.error}</p> : null}
        {status === "saved" ? <p role="status">{copy.saved}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-quiet" disabled={status === "saving"} onClick={onClose}>{copy.close}</button>
          <button type="button" className="btn btn-primary" data-contact-note-save disabled={status === "saving" || !draft.trim()} onClick={save}>{status === "saving" ? copy.saving : copy.save}</button>
        </div>
      </div>
    </div>
  );
}
