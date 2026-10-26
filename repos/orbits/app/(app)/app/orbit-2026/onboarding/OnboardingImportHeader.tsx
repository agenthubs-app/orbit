"use client";

import Link from "next/link";

import { useOrbitLanguage } from "../../orbit-language-context";
import { OnboardingStepper, useProfileOnboardingFlow } from "./OnboardingGuide";
import styles from "./OnboardingFlow.module.css";

/**
 * R28: card import opened from onboarding step 5 (b1 #20 → the B import flow) keeps the
 * onboarding header instead of the app rail: Logo · stepper on 5 · 「設定に戻る」 back to step 5.
 */
export function OnboardingImportHeader({ returnTo }: { returnTo: string }) {
  const { t, preserveHref } = useOrbitLanguage();
  const flow = useProfileOnboardingFlow();
  const confirmed = flow.kind === "ready" ? flow.flow.lastConfirmedScreen : 0;
  return (
    <header className={styles.head} data-onboarding-import-head="">
      <span className={styles.brand}><span className={styles.logo} aria-hidden>O</span><b>Orbit</b></span>
      <OnboardingStepper current={5} confirmed={confirmed} className={styles.stepper} />
      <Link className={`btn ${styles.later}`} href={preserveHref(returnTo)}>{t({ ja: "設定に戻る", zh: "返回设置", en: "Back to setup" })}</Link>
    </header>
  );
}
