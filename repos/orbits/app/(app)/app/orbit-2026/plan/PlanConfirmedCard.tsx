"use client";

import type { PlanGoalKindRead } from "../../../../../shared/contract/plan-v2";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy } from "../copy/plan";
import { Card, Chip, Orbit2026Scope } from "../ui";
import { goalKindLabel } from "./plan-model";
import { translator } from "./PlanParts";
import styles from "./plan.module.css";

/**
 * 「已確定」 minimal card (UI-SPEC): goal, type chip, total score and one line. R24
 * replaces it with the full plan overview.
 */
export function PlanConfirmedCard({ goal, goalKind, total }: { goal: string; goalKind: PlanGoalKindRead; total: number }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const kind = goalKindLabel(goalKind, language);
  return (
    <Orbit2026Scope language={language} className={styles.slot}>
      <Card data-plan-confirmed="">
        <div className={styles.confirmed}>
          <div className={styles.grow}>
            {kind ? <Chip label={kind} tone="lav" /> : null}
            <p className={styles.confirmedGoal}>{goal}</p>
            <p className={styles.muted}>{t(planFlowCopy.confirmedTitle)}</p>
          </div>
          <div>
            <div className={styles.label}>{t(planFlowCopy.confirmedScore)}</div>
            <div className={styles.bigNumber}>{total}</div>
            <div className={styles.label}>{t(planFlowCopy.confirmedScoreNote)}</div>
          </div>
        </div>
      </Card>
    </Orbit2026Scope>
  );
}
