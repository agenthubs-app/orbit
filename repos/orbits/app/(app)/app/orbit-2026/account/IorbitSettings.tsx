"use client";

import { useEffect, useState } from "react";

import type { AgentMemory } from "../../../../../features/agent/memory/contract";
import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../../../../shared/api-schema/profile-bio";
import type { ProfilePayload } from "../../../../../features/profile/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { fetchGlobalSearch, readSemanticPreference, searchUrl, writeSemanticPreference } from "../search/use-global-search";
import { Button, Card, ConfirmDialog, Toggle, useToast } from "../ui";
import { settingsCopy } from "./settings-copy";
import styles from "./SettingsSecondary.module.css";

type MemoryResponse = { data?: { memories?: AgentMemory[] } };

export function IorbitSettings() {
  const { language, preserveHref } = useOrbitLanguage();
  const t = settingsCopy(language);
  const toast = useToast();
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [goal, setGoal] = useState("");
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
        setGoal(body.data.profile.relationshipGoal ?? "");
      }
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
      setDraft("");
      toast.success(t("saved"));
    } catch { toast.error(t("failed")); }
    finally { setBusy(false); }
  };

  return <>
    <div className={styles.page}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <Card title={t("goal")}><div className={styles.row}><span className={styles.rowLabel}>{goal}</span><a className={styles.back} href={preserveHref("/app/plan")}>{t("editGoal")} →</a></div></Card>
      <Card title={t("memory")}>
        {memories.length === 0 ? <p className={styles.detail}>{t("noMemories")}</p> : memories.map((item) => <div className={styles.memory} key={item.memoryId}>
          <div className={styles.memoryBody}><p>{item.content}</p><span className={styles.meta}>{item.source === "conversation" ? t("sourceConversation") : t("sourceManual")}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString(language)}` : ""}</span></div>
          <Button label={t("delete")} size="sm" variant="dangerGhost" disabled={busy} onClick={() => setDeleting(item.memoryId)} />
        </div>)}
      </Card>
      <Card title={t("bioDraft")}><div className={styles.controlGroup}>
        <p className={styles.detail}>{t("draftOnly")}</p>
        {language === "ja" ? <p className={styles.detail}>{t("draftJapaneseUnavailable")}</p> : null}
        <textarea className={styles.draft} aria-label={t("bioDraft")} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <span className={styles.meta}>{profileVisibleLength(draft)}/{profileBioLimit(draft)}</span>
        {draft && !profileBioWithinLimit(draft) ? <p role="alert" className={styles.error}>{t("bioTooLong")}</p> : null}
        <div className={styles.smallActions}><Button label={t("generate")} variant="secondary" loading={busy} disabled={language === "ja"} onClick={() => void generateDraft()} /><Button label={t("confirmBio")} variant="primary" disabled={!draft.trim() || !profileBioWithinLimit(draft) || busy} onClick={() => void saveDraft()} /></div>
      </div></Card>
      {semanticAvailable ? <Card title={t("semantic")}><div className={styles.row}><p className={styles.detail}>{t("semanticNote")}</p><Toggle checked={semanticOn} label={t("semantic")} onChange={(next) => { writeSemanticPreference(next); setSemanticOn(next); }} /></div></Card> : null}
    </div>
    <ConfirmDialog open={deleting !== null} title={t("deleteMemoryTitle")} confirmLabel={t("delete")} cancelLabel={t("cancel")} destructive onConfirm={() => void removeMemory()} onCancel={() => setDeleting(null)} />
  </>;
}
