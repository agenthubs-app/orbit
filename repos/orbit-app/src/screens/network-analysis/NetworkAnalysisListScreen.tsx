// R11b 下钻名单（App /contacts/analysis/[dimension]/[bucketId]; b5 #37）。
// ‹ · <bucket> / N人 · 人脈分析から; 段階の内訳 (知り合い / 関係構築 only — R11a §B-2); the orders the list offers; the people
// (tap → 連絡先詳細); さらに表示 pages by nextCursor; 「N人を人脈一覧で開く」 only for an industry (B-6). The order is state of
// this screen, so coming back from a contact keeps it. A direct link below 10 people shows the lock (the list answers 409 LOCKED).
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { NetworkAnalysisDimension, NetworkAnalysisPeopleDTO, NetworkAnalysisPeopleSort, NetworkAnalysisPersonRow } from "../../api/contract/network-analysis-view";
import { AppScreen } from "../../components/AppScreen";
import { Avatar, Button, Card, Chip, EmptyState, OfflineBar, RetryCard, Segmented, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { isLockedListFailure, readNetworkAnalysisPage, useNetworkAnalysisFirstPage, useNetworkAnalysisPeopleLocal, useNetworkAnalysisView, type CachedReadState } from "./analysis-api";
import { SORT_KEY, analysisDimensionFrom, bucketIdFrom, bucketLabel, contactHref, networkListHref } from "./analysis-labels";
import { LockedView } from "./AnalysisViews";

export function NetworkAnalysisListScreen() {
  const { t, language } = useOrbitLocale();
  const params = useLocalSearchParams<{ dimension?: string | string[]; bucketId?: string | string[] }>();
  const dimension = analysisDimensionFrom(params.dimension);
  const bucketId = bucketIdFrom(params.bucketId);
  const [total, setTotal] = useState<number | null>(null);
  // Locked (a direct link below 10 people): the page is 人脈分析 itself, like the dashboard.
  const [lockedRequired, setLockedRequired] = useState<number | null>(null);
  const title = dimension && lockedRequired === null ? bucketLabel(dimension, bucketId, t, language) : t("networkAnalysis.title");
  const subtitle = lockedRequired !== null ? t("networkAnalysis.subtitleLocked", { n: lockedRequired }) : total === null ? undefined : t("networkAnalysis.listFrom", { n: total });
  return (
    <AppScreen inset="kit" title={title} subtitle={subtitle}>
      <View testID="network-analysis-list">
        {dimension ? <DrillList dimension={dimension} bucketId={bucketId} onTotal={setTotal} onLocked={setLockedRequired} /> : <EmptyState title={t("networkAnalysis.loadFailed")} />}
      </View>
    </AppScreen>
  );
}

function DrillList({ dimension, bucketId, onTotal, onLocked }: { dimension: NetworkAnalysisDimension; bucketId: string; onTotal: (total: number | null) => void; onLocked: (required: number | null) => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [sort, setSort] = useState<NetworkAnalysisPeopleSort | null>(null);
  // LF3: on the device the list is computed from its own contacts (every page, so さらに表示 needs no network).
  const device = useNetworkAnalysisPeopleLocal(dimension, bucketId, sort);
  const remote = useNetworkAnalysisFirstPage(device.available ? null : dimension, bucketId, sort);
  const localFirst = device.available && !device.locked ? device.page(null) : null;
  const first: CachedReadState<NetworkAnalysisPeopleDTO> & { refresh: () => void } = device.available
    ? (localFirst ? { status: "ready", data: localFirst, offline: device.offline, verified: true, refresh: remote.refresh }
      : device.locked ? { status: "failed", error: { code: "CONFLICT", message: "locked", context: { reason: "LOCKED" } }, httpStatus: 409, offline: false, refresh: remote.refresh }
      : { status: "failed", error: { code: "NOT_FOUND", message: "unknown bucket" }, httpStatus: 404, offline: false, refresh: remote.refresh })
    : remote;
  const locked = isLockedListFailure(first);
  const lockView = useNetworkAnalysisView(locked && !device.available);
  // Further pages (さらに表示): appended to the first page of the current order; a new order starts over.
  const [more, setMore] = useState<{ key: string; items: NetworkAnalysisPersonRow[]; cursor: string | null; loading: boolean } | null>(null);
  const firstPage = first.status === "ready" ? first.data : null;
  const key = `${sort ?? ""}|${firstPage?.asOf ?? ""}`;
  const extra = more?.key === key ? more : null;
  const items = firstPage ? [...firstPage.items, ...(extra?.items ?? [])] : [];
  const cursor = extra ? extra.cursor : firstPage?.nextCursor ?? null;
  useEffect(() => { onTotal(firstPage ? firstPage.total : null); }, [firstPage?.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const lockedRequired = device.locked ? device.locked.required : locked && lockView.status === "ready" && lockView.data.lock.state === "locked" ? lockView.data.lock.required : null;
  useEffect(() => { onLocked(lockedRequired); }, [lockedRequired]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!firstPage || !cursor || extra?.loading) return;
    setMore({ key, items: extra?.items ?? [], cursor, loading: true });
    const next = device.available ? device.page(cursor) : await readNetworkAnalysisPage(client, dimension, bucketId, firstPage.sort, cursor);
    setMore(next ? { key, items: [...(extra?.items ?? []), ...next.items], cursor: next.nextCursor, loading: false } : { key, items: extra?.items ?? [], cursor, loading: false });
  }, [bucketId, client, cursor, device, dimension, extra, firstPage, key]);

  if (locked) {
    const lock = device.locked ?? (lockView.status === "ready" && lockView.data.lock.state === "locked" ? lockView.data.lock : null);
    if (!device.locked && lockView.status === "loading") return <Skeleton lines={4} />;
    if (!lock) return <RetryCard title={t("networkAnalysis.countFailed")} onRetry={first.refresh} />;
    return <LockedView total={lock.total} required={lock.required} missing={lock.missing} onAddCards={() => router.push("/contacts/new/scan" as Href)} />;
  }
  if (first.status === "loading") return <Skeleton lines={5} />;
  if (first.status === "failed") return <RetryCard title={t("networkAnalysis.loadFailed")} onRetry={first.refresh} />;
  const data = first.data;
  const listHref = networkListHref(dimension, bucketId);
  return (
    <View>
      {first.offline ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /></View> : null}
      <StageCard data={data} />
      {data.sorts.length > 1 ? (
        <View style={styles.sorts}>
          <Segmented accessibilityLabel={t("networkAnalysis.sortLabel")} value={data.sorts.includes(data.sort) ? data.sort : data.sorts[0]!} onChange={setSort}
            segments={data.sorts.map((value) => ({ key: value, label: t(SORT_KEY[value]) }))} />
        </View>
      ) : null}
      {items.length === 0 ? (
        <View style={styles.gapTop}><EmptyState title={t("networkAnalysis.listEmpty")} /></View>
      ) : (
        <Card style={styles.listCard}>
          {items.map((person, index) => <PersonRow key={person.id} person={person} first={index === 0} onPress={() => router.push(contactHref(person.id) as Href)} />)}
        </Card>
      )}
      {cursor && !first.offline ? <View style={styles.gapTop}><Button block label={t("networkAnalysis.more")} loading={extra?.loading ?? false} onPress={() => void loadMore()} /></View> : null}
      {listHref && data.total > 0 ? (
        <View style={styles.gapTop}>
          <Button block icon="users" label={t("networkAnalysis.openInNetwork", { n: data.total })} onPress={() => router.push(listHref as Href)} />
        </View>
      ) : null}
    </View>
  );
}

/** 段階の内訳 (b5 #37): only 知り合い (active) and 関係構築 (nurture) — R11a §B-2 has no 推進中 / 協業. */
function StageCard({ data }: { data: NetworkAnalysisPeopleDTO }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const total = data.stages.active + data.stages.nurture;
  if (total === 0) return null;
  return (
    <Card>
      <View testID="analysis-stages">
        <UiText style={styles.lbl}>{t("networkAnalysis.stageBreakdown")}</UiText>
        <View style={styles.stageBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {data.stages.active ? <View style={[styles.stageActive, { flex: data.stages.active }]} /> : null}
          {data.stages.nurture ? <View style={[styles.stageNurture, { flex: data.stages.nurture }]} /> : null}
        </View>
        <View style={styles.stageLegend}>
          <UiText style={styles.lbl}>{t("networkAnalysis.stageCount", { label: t("networkAnalysis.stageActive"), n: data.stages.active })}</UiText>
          <UiText style={styles.lbl}>{t("networkAnalysis.stageCount", { label: t("networkAnalysis.stageNurture"), n: data.stages.nurture })}</UiText>
        </View>
      </View>
    </Card>
  );
}

function PersonRow({ person, first, onPress }: { person: NetworkAnalysisPersonRow; first: boolean; onPress: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const subtitle = [person.organization, person.role].filter(Boolean).join(" · ");
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={person.name} onPress={onPress} style={styles.row} testID={`analysis-person-${person.id}`}>
      {first ? null : <View style={styles.divider} />}
      <Avatar name={person.name} />
      <View style={styles.meta}>
        <UiText numberOfLines={1} style={styles.name}>{person.name}</UiText>
        {subtitle ? <UiText numberOfLines={1} style={styles.sub}>{subtitle}</UiText> : null}
        {person.nextActionPreview ? <UiText numberOfLines={1} style={styles.note}>{person.nextActionPreview}</UiText> : null}
      </View>
      {person.needsFollowUp ? <Chip tone="pink" label={t("networkAnalysis.followUp")} />
        : person.stage === "nurture" ? <Chip tone="blue" label={t("networkAnalysis.stageNurture")} />
        : <Chip tone="apricot" label={t("networkAnalysis.stageActive")} />}
    </UiPressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  gapTop: { marginTop: 12 },
  gapBottom: { marginBottom: 12 },
  sorts: { marginTop: 14 },
  lbl: { fontSize: 13, color: colors.ink3Text, fontWeight: "500" },
  stageBar: { flexDirection: "row", height: 10, borderRadius: 6, overflow: "hidden", gap: 3, marginTop: 8 },
  stageActive: { backgroundColor: colors.plum300 },
  stageNurture: { backgroundColor: colors.plum500 },
  stageLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  // kit .list > .li inside a card (padding 6 / 16)
  listCard: { marginTop: 12, paddingVertical: 6, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  divider: { position: "absolute", top: 0, left: 50, right: 0, height: 1, backgroundColor: colors.line },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 14, color: colors.ink3Text },
  note: { marginTop: 2, fontSize: 14, color: colors.ink2 },
}));
