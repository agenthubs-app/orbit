"use client";

// R11b 下钻名单 · 整页（Web /app/contacts/analysis/[dimension]/[bucketId]; < 768 from a legend row, and deep links）。
// b5 #37 on Web: ‹ 人脈分析 · <bucket> / N人 · 人脈分析から, 段階の内訳, every available order, the people, the list button (§6).
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { NetworkAnalysisDimension } from "../../../../../shared/contract/network-analysis-view";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { ContactDrawer } from "../network/ContactDrawer";
import { ShellPage } from "../shell/slots";
import { IconButton, Orbit2026Scope, ToastProvider } from "../ui";
import { bucketLabel, useAnalysisT } from "./analysis-labels";
import { LockedView } from "./AnalysisViews";
import { DrillList } from "./DrillList";
import styles from "./network-analysis.module.css";

export interface NetworkAnalysisListScreenProps {
  language: OrbitLanguage;
  dimension: NetworkAnalysisDimension;
  bucketId: string;
  /** Below 10 people the list is locked like the page (a direct link does not get around it). */
  lock: { state: "locked"; total: number; required: number; missing: number } | { state: "open" };
}

export function NetworkAnalysisListScreen(props: NetworkAnalysisListScreenProps) {
  return (
    <Orbit2026Scope language={props.language} className={styles.page}>
      <ToastProvider>
        <ListInner {...props} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function ListInner({ dimension, bucketId, lock }: NetworkAnalysisListScreenProps) {
  const t = useAnalysisT();
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const tab = dimension === "opportunity" ? "opportunities" : "structure";
  const back = <IconButton icon="left" label={t("title")} onClick={() => router.push(`/app/contacts/dashboard?tab=${tab}`)} />;
  if (lock.state === "locked") {
    return (
      <>
        <ShellPage title={t("title")} subtitle={t("subtitleLocked", { n: lock.required })} left={back} rightRail={false} />
        <LockedView total={lock.total} required={lock.required} missing={lock.missing} />
      </>
    );
  }
  return (
    <>
      <ShellPage title={bucketLabel(dimension, bucketId, t, language)} subtitle={total === null ? undefined : t("listFrom", { n: total })} left={back} rightRail={false} />
      <DrillList selection={{ dimension, bucketId }} compact={false} onOpenPerson={setContactId} onTotal={setTotal} />
      {contactId ? <ContactDrawer contactId={contactId} onClose={() => setContactId(null)} /> : null}
    </>
  );
}
