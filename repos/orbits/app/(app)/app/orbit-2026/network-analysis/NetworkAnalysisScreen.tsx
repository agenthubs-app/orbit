"use client";

// R11b 人脈分析（Web; b5 #38 锁定 / #39 少量 / #40 構造 / #41 機会 at 1440; 1024 / 390 per b12 g11 once drawn）。
// ShellPage: ‹ 人脈 · 人脈分析 / subtitle · [構造 | 機会 | インサイト]; the right rail is the drill-down list (1440), which the
// shell turns into its drawer below 1280; below 768 a legend row opens the full-page list instead. ?tab= keeps deep links.
// The view and the snapshot are read on the server (page.tsx); below 10 people neither the rows nor the snapshot are read.
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { NetworkSnapshotView } from "../../../../../features/network-analysis/contract";
import type { NetworkAnalysisViewDTO } from "../../../../../shared/contract/network-analysis-view";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { networkSnapshotViewSchema } from "../../../../../shared/api-schema/network-analysis-view";
import { ContactDrawer } from "../network/ContactDrawer";
import { ShellPage } from "../shell/slots";
import { Icon, IconButton, Orbit2026Scope, RetryCard, Segmented, ToastProvider, useToast } from "../ui";
import { ANALYSIS_TABS, analysisListHref, analysisTabFrom, tokyoMonthDay, useAnalysisT, type AnalysisTab } from "./analysis-labels";
import { InsightsView, LockedView, OpportunitiesView, SnapshotCard, StructureView, type EvidencePerson } from "./AnalysisViews";
import { DrillList, type DrillSelection } from "./DrillList";
import styles from "./network-analysis.module.css";

export interface NetworkAnalysisScreenProps {
  language: OrbitLanguage;
  /** null = the count could not be read (retry, never a 0-person lock). */
  view: NetworkAnalysisViewDTO | null;
  /** null while locked (never read); "failed" = the read failed (deterministic numbers still show). */
  snapshot: NetworkSnapshotView | "failed" | null;
  /** Names of the snapshot's evidence people (this owner's contacts only). */
  evidenceNames: Record<string, EvidencePerson>;
  initialTab: AnalysisTab;
  /** W0005 guide example (R28 owns it): the demo world's numbers, no drill-down reads. */
  demo?: boolean;
}

export function NetworkAnalysisScreen(props: NetworkAnalysisScreenProps) {
  return (
    <Orbit2026Scope language={props.language} className={styles.page}>
      <ToastProvider>
        <AnalysisInner {...props} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

function defaultSelection(view: NetworkAnalysisViewDTO | null, tab: AnalysisTab): DrillSelection | null {
  if (!view?.structure) return null;
  if (tab === "opportunities") {
    const first = view.opportunities?.[0];
    return first ? { dimension: "opportunity", bucketId: first.kind } : null;
  }
  const first = view.structure.industries.buckets[0];
  return first ? { dimension: "industry", bucketId: first.id } : null;
}

function AnalysisInner({ language, view, snapshot: initialSnapshot, evidenceNames, initialTab, demo = false }: NetworkAnalysisScreenProps) {
  const t = useAnalysisT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const wide = useWide();
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  const [selection, setSelection] = useState<DrillSelection | null>(() => defaultSelection(view, initialTab));
  const [contactId, setContactId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => { setTab(analysisTabFrom(params.get("tab"))); }, [params]);
  const chooseTab = useCallback((next: AnalysisTab) => {
    setTab(next);
    setSelection((current) => (next === "opportunities" ? defaultSelection(view, next) : current?.dimension === "opportunity" ? defaultSelection(view, next) : current));
    router.replace(`/app/contacts/dashboard?tab=${next}`, { scroll: false });
  }, [router, view]);
  const open = useCallback((next: DrillSelection) => {
    if (demo) return;
    if (wide) setSelection(next);
    else router.push(analysisListHref(next.dimension, next.bucketId));
  }, [demo, router, wide]);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const response = await fetch(`/api/network/snapshot/recompute?lang=${language}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `web-${Date.now().toString(36)}` }),
      });
      const body = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: { context?: { reason?: string } } } | null;
      if (response.ok && body?.success) setSnapshot(networkSnapshotViewSchema.parse(body.data) as NetworkSnapshotView);
      else if (response.status === 429) toast.error(t("recomputeLimited"));
      else if (body?.error?.context?.reason === "INSUFFICIENT_CONTACTS") toast.error(t("recomputeNeedsContacts"));
      else toast.error(t("recomputeFailed"));
    } catch {
      toast.error(t("recomputeFailed"));
    } finally {
      setRecomputing(false);
    }
  }, [language, t, toast]);

  const back = <IconButton icon="left" label={t("back")} onClick={() => router.push("/app/contacts")} />;
  const readySnapshot = snapshot && snapshot !== "failed" ? snapshot : null;

  const subtitle = useMemo(() => {
    if (!view) return undefined;
    if (view.lock.state === "locked") return t("subtitleLocked", { n: view.lock.required });
    if (view.lock.reference) return t("subtitleReference", { total: view.lock.total });
    if (readySnapshot?.state === "ready" && readySnapshot.generatedAt) return t("subtitleUpdated", { total: view.lock.total, date: tokyoMonthDay(readySnapshot.generatedAt) });
    return t("subtitleTotal", { total: view.lock.total });
  }, [view, readySnapshot, t]);

  if (!view) {
    return (
      <>
        <ShellPage title={t("title")} left={back} rightRail={false} />
        <RetryCard title={t("countFailed")} onRetry={() => router.refresh()} />
      </>
    );
  }
  if (view.lock.state === "locked") {
    return (
      <>
        <ShellPage title={t("title")} subtitle={subtitle} left={back} rightRail={false} />
        <LockedView total={view.lock.total} required={view.lock.required} missing={view.lock.missing} />
      </>
    );
  }
  const tabs = <Segmented variant="seg" label={t("tabsLabel")} value={tab} onChange={chooseTab} segments={ANALYSIS_TABS.map((key) => ({ key, label: t(key === "structure" ? "tabStructure" : key === "opportunities" ? "tabOpportunities" : "tabInsight") }))} data-analysis-tabs="" />;
  const rail = selection ? <DrillList key={`${selection.dimension}:${selection.bucketId}`} selection={selection} compact onOpenPerson={setContactId} /> : <p className={styles.lbl}>{t("listPick")}</p>;
  return (
    <>
      <ShellPage title={t("title")} subtitle={subtitle} left={back} right={tabs} rightRail={demo ? false : rail} />
      {view.lock.reference ? (
        <div className={styles.banner} style={{ marginBottom: 18 }} data-analysis-reference>
          <Icon name="chart" size={16} />
          <span>{t("referenceBanner", { n: view.lock.total })}</span>
        </div>
      ) : null}
      {tab === "structure" ? <StructureView view={view} snapshot={readySnapshot} names={evidenceNames} selected={selection} onOpen={open} onOpenPerson={setContactId} /> : null}
      {tab === "opportunities" ? <OpportunitiesView view={view} onOpen={open} /> : null}
      {tab === "insight" ? (
        <InsightsView view={view} snapshotSlot={<SnapshotCard snapshot={readySnapshot} failed={snapshot === "failed"} names={evidenceNames} onOpenPerson={setContactId} onRecompute={() => void recompute()} recomputing={recomputing} />} />
      ) : null}
      {contactId ? <ContactDrawer contactId={contactId} onClose={() => setContactId(null)} /> : null}
    </>
  );
}
