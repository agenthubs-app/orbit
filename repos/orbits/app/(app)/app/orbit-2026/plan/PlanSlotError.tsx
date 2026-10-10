"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy } from "../copy/plan";
import { Orbit2026Scope, RetryCard } from "../ui";
import { translator } from "./PlanParts";
import styles from "./plan.module.css";

/**
 * Task › プラン when the v2 plan could not be read (R23 review m10): say so and offer
 * 再試行 — never fall back to the old plan or the goal input on a read failure.
 */
export function PlanSlotError() {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  return (
    <Orbit2026Scope language={language} className={styles.slot}>
      <div data-plan-slot-error="">
        <RetryCard title={t(planFlowCopy.slotLoadFailed)} retrying={retrying} onRetry={() => { setRetrying(true); router.refresh(); window.setTimeout(() => setRetrying(false), 1500); }} />
      </div>
    </Orbit2026Scope>
  );
}
