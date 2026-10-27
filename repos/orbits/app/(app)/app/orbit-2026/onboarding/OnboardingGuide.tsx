"use client";

// b1 A3 (Web): the five-screen stepper shared by the onboarding header (#16–#20), the
// 「おかえりなさい」 resume dialog (#21) and the home rail 「はじめかたガイド」 (#21 / #24).
import { useEffect, useState } from "react";

import type { ProfileOnboardingProgressContract } from "../../../../../shared/contract/profile";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Icon, MacTile, Modal } from "../ui";
import { fetchOnboardingProgress } from "./onboarding-client";
import styles from "./OnboardingGuide.module.css";

type Copy = { ja: string; zh: string; en: string };

export const ONBOARDING_STEP_LABELS: readonly Copy[] = [
  { ja: "基本情報", zh: "基本信息", en: "Basics" },
  { ja: "目標", zh: "目标", en: "Goals" },
  { ja: "強み・ニーズ", zh: "优势与需求", en: "Offer & seek" },
  { ja: "自己紹介", zh: "自我介绍", en: "Introduction" },
  { ja: "名刺の取り込み", zh: "导入名片", en: "Import cards" },
];

export const ONBOARDING_RESUME_HREF = "/app/profile/onboarding";
const RESUME_DISMISSED_KEY = "orbit.onboarding.resume-dismissed";

/** kit .wstp: done steps show a green ✓, the current one an accent number, the rest grey. */
export function OnboardingStepper({ current, confirmed, className }: { current: number; confirmed: number; className?: string }) {
  const { t } = useOrbitLanguage();
  return <ol className={`${styles.stepper} ${className ?? ""}`} aria-label={t({ ja: "設定の進捗", zh: "设置进度", en: "Setup progress" })}>
    {ONBOARDING_STEP_LABELS.map((label, index) => {
      const step = index + 1;
      const state = step === current ? styles.now : step <= confirmed ? styles.done : "";
      return <li key={label.en} className={`${styles.step} ${state}`} aria-current={step === current ? "step" : undefined}>
        {index ? <em aria-hidden /> : null}
        <span className={styles.num}>{step !== current && step <= confirmed ? <Icon name="check" size={16} /> : step}</span>
        <span className={styles.label}>{t(label)}</span>
      </li>;
    })}
  </ol>;
}

export type OnboardingFlowState = { kind: "loading" } | { kind: "none" } | { kind: "ready"; flow: ProfileOnboardingProgressContract };

// The last flow this tab read: the onboarding page and its import header start from it, so the
// stepper does not render empty and then fill in on every page change (the read still refreshes it).
let lastFlow: ProfileOnboardingProgressContract | null | undefined;

export function rememberOnboardingFlow(flow: ProfileOnboardingProgressContract | null): void {
  lastFlow = flow;
}

export function rememberedOnboardingFlow(): ProfileOnboardingProgressContract | null | undefined {
  return lastFlow;
}

/** The actor's profile onboarding flow; failures read as "none" so home never blocks on it. */
export function useProfileOnboardingFlow(): OnboardingFlowState {
  const [state, setState] = useState<OnboardingFlowState>(() => (lastFlow === undefined ? { kind: "loading" } : lastFlow ? { kind: "ready", flow: lastFlow } : { kind: "none" }));
  useEffect(() => {
    let active = true;
    fetchOnboardingProgress()
      .then((flow) => { rememberOnboardingFlow(flow); if (active) setState(flow ? { kind: "ready", flow } : { kind: "none" }); })
      .catch(() => { if (active) setState({ kind: "none" }); });
    return () => { active = false; };
  }, []);
  return state;
}

export function unfinishedOnboarding(state: OnboardingFlowState): ProfileOnboardingProgressContract | null {
  return state.kind === "ready" && !state.flow.finishedAt ? state.flow : null;
}

function currentScreen(flow: ProfileOnboardingProgressContract): number {
  return flow.currentScreen ?? Math.min(flow.lastConfirmedScreen + 1, 5);
}

/** b1 #21 / #24 rail: 🧭 はじめかたガイド — remaining steps, n / 5 bar, the five checks and 続きから再開. */
export function OnboardingGuideRail({ flow }: { flow: ProfileOnboardingProgressContract }) {
  const { t } = useOrbitLanguage();
  const done = flow.lastConfirmedScreen;
  const current = currentScreen(flow);
  const left = 5 - done;
  return <section className={styles.rail} aria-label={t({ ja: "はじめかたガイド", zh: "入门指南", en: "Getting started" })}>
    <h4 className={styles.railHead}><MacTile emoji="🧭" tone="lav" size="sm" />{t({ ja: "はじめかたガイド", zh: "入门指南", en: "Getting started" })}</h4>
    <div className={styles.railCard}>
      <div className={styles.between}><b>{t({ ja: `あと ${left} ステップ`, zh: `还差 ${left} 步`, en: `${left} steps to go` })}</b><span className={styles.lbl}>{done} / 5</span></div>
      <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={done}><i style={{ width: `${(done / 5) * 100}%` }} /></div>
      {ONBOARDING_STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const state = step <= done && step !== current ? styles.checkDone : step === current ? styles.checkNow : styles.checkWait;
        return <div key={label.en} className={`${styles.check} ${state}`}><span className={styles.box}>{state === styles.checkDone ? <Icon name="check" size={16} /> : step}</span>{t(label)}</div>;
      })}
      <a className={`btn ${styles.resume}`} href={ONBOARDING_RESUME_HREF}>{t({ ja: "続きから再開", zh: "从上次继续", en: "Resume setup" })}</a>
    </div>
  </section>;
}

/** b1 #21: 👋 おかえりなさい — shown on home while the flow was left unfinished; あとで hides it for this visit. */
export function OnboardingResumeDialog({ flow }: { flow: ProfileOnboardingProgressContract }) {
  const { t } = useOrbitLanguage();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem(RESUME_DISMISSED_KEY) === "1"; } catch { /* storage blocked: show it */ }
    setOpen(flow.deferred && !dismissed);
  }, [flow.deferred]);
  const later = () => {
    try { window.sessionStorage.setItem(RESUME_DISMISSED_KEY, "1"); } catch { /* the dialog still closes */ }
    setOpen(false);
  };
  const done = flow.lastConfirmedScreen;
  const title = t({ ja: "おかえりなさい", zh: "欢迎回来", en: "Welcome back" });
  return <Modal open={open} onClose={later} title={title} size={640} closable={false}
    header={<div className={styles.welcome}><MacTile emoji="👋" tone="lav" /><div><div className={styles.welcomeTitle}>{title}</div>
      <div className={styles.sub}>{t({ ja: `プロフィール設定が途中です（${done} / 5 完了）`, zh: `资料设置还没完成（已完成 ${done} / 5）`, en: `Your profile setup is unfinished (${done} / 5 done)` })}</div></div></div>}>
    <OnboardingStepper current={currentScreen(flow)} confirmed={done} className={styles.dialogStepper} />
    <div className={styles.actions}>
      <button type="button" className={`btn ${styles.secondaryXl}`} onClick={later}>{t({ ja: "あとで", zh: "稍后", en: "Later" })}</button>
      <a className={`btn ${styles.primaryXl}`} href={ONBOARDING_RESUME_HREF}>{t({ ja: "続きから再開", zh: "从上次继续", en: "Resume setup" })}</a>
    </div>
  </Modal>;
}
