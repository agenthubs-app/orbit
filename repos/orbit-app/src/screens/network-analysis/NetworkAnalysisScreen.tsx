// R11b 人脈分析（App /contacts/dashboard; b5 #32 锁定 / #33 参考値 / #34 構造 / #35 機会 / #36 インサイト / #67 構造 dark）。
// ‹ · 人脈分析 / subtitle; [構造 | 機会 | インサイト] (?tab= deep links, 構造 by default — B-3); a bucket or 名簿を見る pushes
// the drill-down list. Below 10 people only the lock shows and neither the snapshot nor the list is read (B-1).
// The view is kept on the device and shown offline with the offline bar; a failed count without a copy is a retry, never a lock.
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppScreen } from "../../components/AppScreen";
import { Icon, OfflineBar, RetryCard, Segmented, Skeleton, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { recomputeNetworkSnapshot, useNetworkAnalysisViewLocalFirst, useNetworkSnapshot, type CachedReadState, type NetworkSnapshotView } from "./analysis-api";
import { ANALYSIS_TABS, ANALYSIS_TAB_KEY, analysisListHref, analysisTabFrom, contactHref, tokyoMonthDay, type AnalysisTab } from "./analysis-labels";
import { InsightsView, LockedView, OpportunitiesView, SnapshotCard, StructureView, type DrillSelection, type EvidencePerson } from "./AnalysisViews";
import { useNetworkDesignContacts } from "../network/network-design-fixture";

/** Snapshot evidence names: record id → the contact (local mirror rows: `id` = record id, `card.id` = contact id). Unknown ids show nothing. */
export function useEvidenceNames(): Record<string, EvidencePerson> {
  const local = useLocalContacts(false);
  const fixture = useNetworkDesignContacts();
  const rows = fixture.enabled ? fixture.data?.rows ?? [] : local.rows;
  return useMemo(() => Object.fromEntries(rows.flatMap((row) => (row.card ? [[row.id, { contactId: row.card.id, name: row.card.displayName }]] : []))), [rows]);
}

export function NetworkAnalysisScreen() {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const client = useOrbitApiClient();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const [tab, setTab] = useState<AnalysisTab>(() => analysisTabFrom(params.tab));
  // LF3: computed on the device from its contacts (plan needs from the kept server view).
  const view = useNetworkAnalysisViewLocalFirst();
  const data = view.status === "ready" ? view.data : null;
  const open = view.status === "ready" && view.verified === true && data?.lock.state === "open";
  const snapshotRead = useNetworkSnapshot(language, open);
  const [recomputed, setRecomputed] = useState<NetworkSnapshotView | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const snapshot: CachedReadState<NetworkSnapshotView> = recomputed ? { status: "ready", data: recomputed, offline: false }
    : view.status === "ready" && view.offline && !open ? { status: "failed", error: { code: "ORBIT_APP_NETWORK_ERROR", message: "offline" }, httpStatus: 0, offline: true }
    : snapshotRead;
  const readySnapshot = snapshot.status === "ready" ? snapshot.data : null;
  const names = useEvidenceNames();

  const push = useCallback((href: string) => router.push(href as Href), [router]);
  const openSelection = useCallback((selection: DrillSelection) => push(analysisListHref(selection.dimension, selection.bucketId)), [push]);
  const openPerson = useCallback((contactId: string) => push(contactHref(contactId)), [push]);
  const recompute = useCallback(async () => {
    setRecomputing(true);
    const outcome = await recomputeNetworkSnapshot(client, language);
    setRecomputing(false);
    if (outcome.kind === "ok") setRecomputed(outcome.snapshot);
    else toast.error(t(outcome.kind === "limited" ? "networkAnalysis.recomputeLimited" : outcome.kind === "needsContacts" ? "networkAnalysis.recomputeNeedsContacts" : "networkAnalysis.recomputeFailed"));
  }, [client, language, t, toast]);

  const subtitle = !data ? undefined
    : data.lock.state === "locked" ? t("networkAnalysis.subtitleLocked", { n: data.lock.required })
    : data.lock.reference ? t("networkAnalysis.subtitleReference", { total: data.lock.total })
    : readySnapshot?.state === "ready" && readySnapshot.generatedAt ? t("networkAnalysis.subtitleUpdated", { total: data.lock.total, date: tokyoMonthDay(readySnapshot.generatedAt) })
    : t("networkAnalysis.subtitleTotal", { total: data.lock.total });

  return (
    <AppScreen inset="kit" title={t("networkAnalysis.title")} subtitle={subtitle}>
      <View testID="network-analysis-screen">
        {view.status === "ready" && view.offline ? <View style={styles.offline}><OfflineBar offline pending={0} /></View> : null}
        {view.status === "loading" ? <Skeleton lines={5} /> : view.status === "failed" ? (
          <RetryCard title={t("networkAnalysis.countFailed")} onRetry={view.refresh} />
        ) : data?.lock.state === "locked" ? (
          <LockedView total={data.lock.total} required={data.lock.required} missing={data.lock.missing} onAddCards={() => push("/contacts/new/scan")} />
        ) : data ? (
          <>
            <Segmented accessibilityLabel={t("networkAnalysis.tabsLabel")} value={tab} onChange={setTab} segments={ANALYSIS_TABS.map((key) => ({ key, label: t(ANALYSIS_TAB_KEY[key]) }))} />
            {data.lock.state === "open" && data.lock.reference ? (
              <View style={styles.banner} testID="analysis-reference">
                <Icon name="chart" size={16} color={colors.ink2} />
                <UiText style={styles.bannerText}>{t("networkAnalysis.referenceBanner", { n: data.lock.total })}</UiText>
              </View>
            ) : null}
            <View style={styles.body}>
              {tab === "structure" ? <StructureView view={data} snapshot={readySnapshot} names={names} onOpen={openSelection} onOpenPerson={openPerson} /> : null}
              {tab === "opportunities" ? <OpportunitiesView view={data} onOpen={openSelection} /> : null}
              {tab === "insight" ? (
                <InsightsView view={data} snapshotSlot={<SnapshotCard snapshot={snapshot} names={names} onOpenPerson={openPerson} onRecompute={() => void recompute()} recomputing={recomputing} />} />
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  offline: { marginBottom: 12 },
  // kit .banner (b5 #33)
  banner: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  bannerText: { flex: 1, fontSize: 11.5, lineHeight: 18, color: colors.ink2 },
  body: { marginTop: 14 },
}));
