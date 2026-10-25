"use client";

import { useEffect, useId, useState } from "react";

import type { AgentMemory } from "../../../../../features/agent/memory/contract";
import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../../../../shared/api-schema/profile-bio";
import type { ProfilePayload } from "../../../../../features/profile/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { fetchGlobalSearch, readSemanticPreference, searchUrl, writeSemanticPreference } from "../search/use-global-search";
import { Button, ConfirmDialog, Icon, MacTile, Toggle, WhyBody, WhyButton, useToast } from "../ui";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { settingsCopy } from "./settings-copy";
import styles from "./SettingsSecondary.module.css";

type MemoryResponse = { data?: { memories?: AgentMemory[] } };

export function IorbitSettings() {
  const { language, preserveHref } = useOrbitLanguage();
  const t = settingsCopy(language);
  const toast = useToast();
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [goal, setGoal] = useState<{ text: string; kind: string } | null>(null);
  const [savedBio, setSavedBio] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const [semanticAvailable, setSemanticAvailable] = useState(false);
  const [semanticOn, setSemanticOn] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    const response = await fetch("/api/agent/memory", { cache: "no-store" });
    const body = await response.json() as MemoryResponse;
    if (!response.ok || !Array.isArray(body.data?.memories)) throw new Error("Memory unavailable");
    setMemories(body.data.memories);
  };
  useEffect(() => {
    void reload().catch(() => setError(t("failed")));
    void fetch("/api/profile", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { success?: boolean; data?: ProfilePayload };
      if (response.ok && body.success === true && body.data?.profile) {
        setDraft(body.data.profile.bio ?? "");
        setSavedBio(body.data.profile.bio ?? "");
      }
    }).catch(() => undefined);
    void fetch("/api/agent/plans/v2/summary", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { data?: unknown };
      const parsed = planV2SummaryResponseSchema.safeParse(body.data);
      if (response.ok && parsed.success && parsed.data.current) setGoal({ text: parsed.data.current.goal, kind: parsed.data.current.goalKind });
    }).catch(() => undefined);
    setSemanticOn(readSemanticPreference());
    void fetchGlobalSearch(searchUrl({ query: "", filter: "all" })).then((result) => {
      if (result.ok) setSemanticAvailable(result.data.semantic.available);
    }).catch(() => undefined);
  }, []);

  const removeMemory = async () => {
    const id = deleting;
    if (!id || busy) return;
    setDeleting(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/agent/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setMemories((current) => current.filter((item) => item.memoryId !== id));
      toast.success(t("saved"));
    } catch { toast.error(t("failed")); }
    finally { setBusy(false); }
  };
  const generateDraft = async () => {
    if (busy || language === "ja") return;
    setBusy(true);
    try {
      const response = await fetch("/api/profile/intro-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language }) });
      const body = await response.json() as { success?: boolean; data?: { bio?: string } };
      if (!response.ok || body.success !== true || typeof body.data?.bio !== "string") throw new Error("Draft failed");
      setDraft(body.data.bio);
    } catch { toast.error(t("failed")); }
    finally { setBusy(false); }
  };
  const saveDraft = async () => {
    if (!draft.trim() || !profileBioWithinLimit(draft.trim()) || busy) return;
    setBusy(true);
    try {
      const currentResponse = await fetch("/api/profile", { cache: "no-store" });
      const current = await currentResponse.json() as { success?: boolean; data?: ProfilePayload };
      if (!currentResponse.ok || current.success !== true || !current.data?.profile) throw new Error("Profile read failed");
      const mutationId = globalThis.crypto?.randomUUID?.() ?? `bio-${Date.now()}`;
      const response = await fetch("/api/profile", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bio: draft.trim(), expectedUpdatedAt: current.data.profile.updatedAt, mutationId }),
      });
      const result = await response.json() as { success?: boolean; data?: ProfilePayload };
      if (!response.ok || result.success !== true || result.data?.mutationId !== mutationId) throw new Error("Profile save failed");
      setSavedBio(draft.trim());
      setEditingBio(false);
      toast.success(t("saved"));
    } catch { toast.error(t("failed")); }
    finally { setBusy(false); }
  };

  // b12 W-R18a-02: 現在の目標 + 自己紹介 (span6 each), the memory table, the 意味検索 card.
  const goalEmoji: Record<string, string> = { fundraising: "💰", sales: "📈", hiring: "🧑‍💼", partnership: "🤝", launch: "🚀", career: "🧭" };
  const bioChanged = draft.trim() !== savedBio.trim();
  return <>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.connGrid}>
      <section className={`${styles.setCard} ${styles.half}`}>
        <div className={styles.cardTopRow}><span className={styles.lbl}>{t("currentGoal")}</span><a className={`btn ${styles.smButton}`} href={preserveHref("/app/tasks?tab=plan")}><Icon name="edit" size={16} />{goal ? t("change") : t("setGoal")}</a></div>
        {goal ? <div className={styles.goalRow}><MacTile emoji={goalEmoji[goal.kind] ?? "🎯"} tone="pink" /><b>{goal.text}</b></div> : null}
      </section>
      <section className={`${styles.setCard} ${styles.half}`}>
        <div className={styles.cardTopRow}><span className={styles.lbl}>{t("intro")}</span>
          {language !== "ja" ? <button type="button" className={`btn ${styles.smButton}`} disabled={busy} onClick={() => { setEditingBio(true); void generateDraft(); }}><Icon name="sparkle" size={16} />{t("polish")}</button>
            : <button type="button" className={`btn ${styles.smButton}`} onClick={() => setEditingBio(true)}><Icon name="edit" size={16} />{t("editIntro")}</button>}</div>
        {editingBio && language === "ja" ? <p className={styles.detail}>{t("draftJapaneseUnavailable")}</p> : null}
        {editingBio ? <>
          <textarea className={styles.introBox} aria-label={t("intro")} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className={styles.introFoot}><span className={styles.meta}>{profileVisibleLength(draft)}/{profileBioLimit(draft)}</span>
            {draft && !profileBioWithinLimit(draft) ? <span role="alert" className={styles.error}>{t("bioTooLong")}</span> : null}
            <Button label={t("cancel")} size="sm" variant="ghost" onClick={() => { setDraft(savedBio); setEditingBio(false); }} />
            <Button label={t("confirmBio")} size="sm" variant="primary" disabled={!bioChanged || !draft.trim() || !profileBioWithinLimit(draft) || busy} onClick={() => void saveDraft()} /></div>
        </> : <button type="button" className={`btn ${styles.introBox}`} onClick={() => setEditingBio(true)}>{savedBio || t("noIntro")}</button>}
      </section>
      <section className={`${styles.setCard} ${styles.full}`}>
        <div className={styles.memoryHead}><h2>{t("memory")}</h2><WhyButton open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} controls={whyId} /><span className={styles.lbl}>{t("memoryDeleteHint")}</span></div>
        <WhyBody id={whyId} open={whyOpen}>{t("memoryWhy")}</WhyBody>
        {memories.length === 0 ? <p className={styles.detail}>{t("noMemories")}</p> : <table className={styles.memoryTable}><tbody>{memories.map((item) => <tr key={item.memoryId}>
          <td><b>{item.content}</b></td>
          <td className={styles.lbl}>{item.source === "conversation" ? t("sourceConversation") : t("sourceManual")}{item.createdAt ? ` ${new Date(item.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}` : ""}</td>
          <td className={styles.memoryAction}><button type="button" className={`btn ${styles.lbtn}`} aria-label={t("delete")} disabled={busy} onClick={() => setDeleting(item.memoryId)}><Icon name="x" size={16} /></button></td>
        </tr>)}</tbody></table>}
      </section>
      {semanticAvailable ? <section className={`${styles.setCard} ${styles.full} ${styles.semanticCard}`}><div><b>{t("semantic")}</b><span className={styles.lbl}>{t("semanticNote")}</span></div><Toggle checked={semanticOn} label={t("semantic")} onChange={(next) => { writeSemanticPreference(next); setSemanticOn(next); }} /></section> : null}
    </div>
    <ConfirmDialog open={deleting !== null} title={t("deleteMemoryTitle")} confirmLabel={t("delete")} cancelLabel={t("cancel")} destructive onConfirm={() => void removeMemory()} onCancel={() => setDeleting(null)} />
  </>;
}
