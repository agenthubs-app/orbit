"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { ORBIT_Z } from "../orbit-z";

export function ContactTagEditor({ contactId, initialTags, language, onClose, onSaved }: {
  contactId: string;
  initialTags: readonly { value: string; label: string }[];
  language: "zh" | "en" | "ja";
  onClose: () => void;
  onSaved: (tags: string[]) => void;
}) {
  const copy = {
    zh: { title: "自定义标签", add: "添加标签", remove: "移除标签：", save: "保存标签", saving: "正在保存…", close: "关闭", empty: "暂无标签", saved: "标签已保存", duplicate: "这个标签已经存在。", limit: "最多 20 个标签，每个新标签不超过 32 个字。", error: "未能确认保存结果。你的修改已保留，请重试。" },
    en: { title: "Custom tags", add: "Add tag", remove: "Remove tag: ", save: "Save tags", saving: "Saving…", close: "Close", empty: "No tags yet", saved: "Tags saved", duplicate: "This tag already exists.", limit: "Keep up to 20 tags, with no more than 32 characters per new tag.", error: "Could not confirm the save. Your changes are still here; please retry." },
    ja: { title: "カスタムタグ", add: "タグを追加", remove: "タグを削除：", save: "タグを保存", saving: "保存中…", close: "閉じる", empty: "タグはありません", saved: "タグを保存しました", duplicate: "このタグは既にあります。", limit: "タグは20個まで、新しいタグは32文字以内で追加できます。", error: "保存結果を確認できませんでした。変更内容は残っています。もう一度お試しください。" },
  }[language];
  const [labels] = useState(() => new Map(initialTags.map((tag) => [tag.value, tag.label])));
  const [tags, setTags] = useState(() => initialTags.map((tag) => tag.value));
  const [savedTags, setSavedTags] = useState(() => initialTags.map((tag) => tag.value));
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const pending = useRef(false);
  const mounted = useRef(true);
  const modalRef = useOrbitModalA11y(() => { if (!pending.current) onClose(); });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const addTags = tags.filter((tag) => !savedTags.includes(tag));
  const removeTags = savedTags.filter((tag) => !tags.includes(tag));

  function add() {
    if (pending.current || !input.trim()) return;
    const value = input.trim();
    if (tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) { setError(copy.duplicate); return; }
    if (tags.length >= 20 || Array.from(value).length > 32) { setError(copy.limit); return; }
    setTags([...tags, value]);
    setInput("");
    setError(null);
    setStatus("idle");
  }

  async function save() {
    if (pending.current || (!addTags.length && !removeTags.length)) return;
    pending.current = true;
    setError(null);
    setStatus("saving");
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(addTags.length ? { addTags } : {}), ...(removeTags.length ? { removeTags } : {}) }),
      });
      const result = z.object({ success: z.literal(true), data: z.object({ contact: z.object({
        id: z.literal(contactId), tags: z.array(z.string().min(1)),
      }) }) }).parse(await response.json());
      const next = result.data.contact.tags;
      const missingAddition = addTags.some((tag) => !next.some((saved) => saved.toLocaleLowerCase() === tag.toLocaleLowerCase()));
      const retainedRemoval = removeTags.some((tag) => {
        const replacement = addTags.find((added) => added.toLocaleLowerCase() === tag.toLocaleLowerCase());
        return replacement
          ? next.includes(tag) || !next.includes(replacement)
          : next.some((saved) => saved.toLocaleLowerCase() === tag.toLocaleLowerCase());
      });
      if (!response.ok || missingAddition || retainedRemoval) throw new Error("Unconfirmed tags");
      if (!mounted.current) return;
      setTags(next);
      setSavedTags(next);
      setStatus("saved");
      onSaved(next);
    } catch {
      if (mounted.current) { setError(copy.error); setStatus("idle"); }
    } finally {
      pending.current = false;
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: ORBIT_Z.modal, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 18 }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={copy.title} tabIndex={-1} className="card" style={{ width: "100%", maxWidth: 460, maxHeight: "85dvh", overflowY: "auto", padding: 22 }}>
        <h2 className="h-section" style={{ margin: "0 0 18px" }}>{copy.title}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tags.map((tag) => <span key={tag} data-tag-value={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", background: "var(--surface-2)", padding: "4px 8px", borderRadius: "var(--r-md)" }}>
            <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{labels.get(tag) ?? tag}</span>
            <button type="button" className="btn btn-quiet btn-sm" aria-label={`${copy.remove}${labels.get(tag) ?? tag}`} disabled={status === "saving"} onClick={() => { if (!pending.current) { setTags(tags.filter((value) => value !== tag)); setError(null); setStatus("idle"); } }}>×</button>
          </span>)}
          {!tags.length ? <p style={{ color: "var(--text-3)" }}>{copy.empty}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <input aria-label={copy.add} value={input} disabled={status === "saving"} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} style={{ flex: 1, minWidth: 0, minHeight: 44, padding: "8px 10px", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: "var(--r-md)" }} />
          <button type="button" className="btn btn-quiet" data-tag-add disabled={status === "saving" || !input.trim()} onClick={add}>{copy.add}</button>
        </div>
        {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p> : null}
        {status === "saved" ? <p role="status">{copy.saved}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-quiet" disabled={status === "saving"} onClick={onClose}>{copy.close}</button>
          <button type="button" className="btn btn-primary" data-tags-save disabled={status === "saving" || (!addTags.length && !removeTags.length)} onClick={save}>{status === "saving" ? copy.saving : copy.save}</button>
        </div>
      </div>
    </div>
  );
}
