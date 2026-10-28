"use client";

import { useEffect, useId, useState } from "react";

import type { AgentMemory } from "../../../../../features/agent/memory/contract";
import { profileBioLimit, profileBioWithinLimit, profileVisibleLength } from "../../../../../shared/api-schema/profile-bio";
import type { ProfilePayload } from "../../../../../features/profile/contract";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useOrbitLanguage } from "../../orbit-language-context";
import { fetchGlobalSearch, readSemanticPreference, searchUrl, writeSemanticPreference } from "../search/use-global-search";
import { Bone, Button, ConfirmDialog, Icon, MacTile, Toggle, WhyBody, WhyButton, useStandardCopy, useToast } from "../ui";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { useSavedPlanGoalAnswer } from "../plan/saved-goal";
import { settingsCopy } from "./settings-copy";
import styles from "./SettingsSecondary.module.css";

type MemoryResponse = { data?: { memories?: AgentMemory[] } };
type Goal = { text: string; kind: string };
// The four reads of this page in one answer (orbit-last-answer.ts), so they arrive — and come back — together.
type IorbitAnswer = { memories: AgentMemory[] | null; bio: string; goal: Goal | null; semanticAvailable: boolean };
const ANSWER_KEY = "settings:iorbit";

async function readMemories(): Promise<AgentMemory[]> {
  const response = await fetch("/api/agent/memory", { cache: "no-store" });
  const body = await response.json() as MemoryResponse;
  if (!response.ok || !Array.isArray(body.data?.memories)) throw new Error("Memory unavailable");
  return body.data.memories;
}

async function readIorbitAnswer(): Promise<IorbitAnswer> {
  const [memories, bio, goal, semantic] = await Promise.allSettled([
    readMemories(),
    fetch("/api/profile", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { success?: boolean; data?: ProfilePayload };
      return response.ok && body.success === true && body.data?.profile ? body.data.profile.bio ?? "" : "";
    }),
    fetch("/api/agent/plans/v2/summary", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { data?: unknown };
      const parsed = planV2SummaryResponseSchema.safeParse(body.data);
      return response.ok && parsed.success && parsed.data.current ? { text: parsed.data.current.goal, kind: parsed.data.current.goalKind } : null;
    }),
    fetchGlobalSearch(searchUrl({ query: "", filter: "all" })).then((result) => result.ok && result.data.semantic.available),
  ]);
  return {
    memories: memories.status === "fulfilled" ? memories.value : null,
    bio: bio.status === "fulfilled" ? bio.value : "",
    goal: goal.status === "fulfilled" ? goal.value : null,
    semanticAvailable: semantic.status === "fulfilled" && semantic.value,
  };
}

/** The page's cards as bones until its reads are in (the same grid, the same card heights). */
function IorbitSkeleton() {
  const copy = useStandardCopy();
  return <div className={styles.connGrid} role="progressbar" aria-busy="true" aria-label={copy.loading.loading}>
    <section className={`${styles.setCard} ${styles.half} ${styles.boneCard}`}><Bone width={80} height={14} /><Bone width="70%" height={40} /></section>
    <section className={`${styles.setCard} ${styles.half} ${styles.boneCard}`}><Bone width={80} height={14} /><Bone width="100%" height={52} /></section>
    <section className={`${styles.setCard} ${styles.full} ${styles.boneCard}`}><Bone width={120} height={20} /><Bone width="100%" height={18} /><Bone width="100%" height={18} /><Bone width="60%" height={18} /></section>
  </div>;
}

export function IorbitSettings() {
  const { language, preserveHref } = useOrbitLanguage();
  const t = settingsCopy(language);
  const toast = useToast();
  const [cached] = useState(() => lastAnswer<IorbitAnswer>(ANSWER_KEY));
  const [ready, setReady] = useState(Boolean(cached));
  const [memories, setMemories] = useState<AgentMemory[]>(cached?.memories ?? []);
  const [goal, setGoal] = useState<Goal | null>(cached?.goal ?? null);
  const savedGoalAnswer = useSavedPlanGoalAnswer();
  const savedGoal = savedGoalAnswer ?? null;
  const [savedBio, setSavedBio] = useState(cached?.bio ?? "");
  const [editingBio, setEditingBio] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const [semanticAvailable, setSemanticAvailable] = useState(cached?.semanticAvailable ?? false);
  const [semanticOn, setSemanticOn] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draft, setDraft] = useState(cached?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSemanticOn(readSemanticPreference());
    if (cached && answerFresh(ANSWER_KEY, FRESH.slow)) return;
    let alive = true;
    void readIorbitAnswer().then((answer) => {
      if (!alive) return;
      if (answer.memories) setMemories(answer.memories);
      else if (!cached) setError(t("failed"));
      setDraft((current) => current === savedBio ? answer.bio : current);
      setSavedBio(answer.bio);
      setGoal(answer.goal);
      setSemanticAvailable(answer.semanticAvailable);
      setReady(true);
      if (answer.memories) rememberAnswer(ANSWER_KEY, answer);
    });
    return () => { alive = false; };
  }, []); // once per visit; language changes navigate the page

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
  if (!ready || savedGoalAnswer === undefined) return <IorbitSkeleton />;
  return <>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.connGrid}>
      <section className={`${styles.setCard} ${styles.half}`}>
        <div className={styles.cardTopRow}><span className={styles.lbl}>{t("currentGoal")}</span><a className={`btn ${styles.smButton}`} href={preserveHref("/app/tasks?tab=plan")}><Icon name="edit" size={16} />{goal ? t("change") : savedGoal ? t("planFromGoal") : t("setGoal")}</a></div>
        {goal ? <div className={styles.goalRow}><MacTile emoji={goalEmoji[goal.kind] ?? "🎯"} tone="pink" /><b>{goal.text}</b></div>
          : savedGoal ? <div className={styles.goalRow}><MacTile emoji={(savedGoal.suggestedKind && goalEmoji[savedGoal.suggestedKind]) || "🎯"} tone="pink" /><div><b>{savedGoal.text}</b><div className={styles.meta}>{t("goalNoPlan")}</div></div></div> : null}
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
