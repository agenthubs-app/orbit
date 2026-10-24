// R11a 人脈（App 一級ページ; app.html #6 / #7 / #8 / #9 / #34, b5 #60 絞り込み, b1 #58 加载中）。
// 顶栏「🔍 · 人脈 / N人 · 今月 +M · ＋」（A-R05-02）；搜索框只在人脈里找（本机镜像），🔍 进全局搜索带上已输入的词（R11-15）；
// 页签 すべて / 目標に関係 / 要フォロー（§B-1）；絞り込み 四组 + 情報の濃さ；「＋」弹 AddContactSheet，背景是列表（R11-01 / R11-04）。
// 列表、页签、汇总、搜索都在本机按服务端同一规则算，飞行模式可用；计划与跟进 id 读时合并（useNetworkMerge）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ContactCardSummaryDTO } from "../../api/contract/contact-card-page";
import { AppScreen } from "../../components/AppScreen";
import { ShellTopBar } from "../../components/ShellTopBar";
import { Avatar, BottomSheet, Button, CategoryTabs, Chip, EmptyState, FilterOption, Icon, IconButton, OfflineBar, RetryCard, SampleTag, SearchField, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AddContactSheet } from "../add/AddContactSheet";
import { DensityDots } from "../add/add-ui";
import {
  EMPTY_NETWORK_FILTERS, NETWORK_DENSITY_OPTIONS, NETWORK_MET_OPTIONS, NETWORK_STAGE_OPTIONS, NETWORK_TOP_INDUSTRIES, NETWORK_TOP_REGIONS,
  filtersFromParams, industryOptionLabel, networkDirectoryQuery, networkFilterCount, networkHeaderCounts, networkRow, networkTabCounts,
  regionOptionLabel, toggleValue, tokyoMonthStart, topFacetOptions, type NetworkFilters, type NetworkRow, type NetworkTab,
} from "./network-model";
import { useNetworkList } from "./useNetworkList";
import { hiddenDeletedContactIds, subscribeContactDeleteQueue, takeAnnouncedContactDelete, unhideDeletedContact } from "./contact-delete-queue";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useSyncCoordinatorSession } from "../../hooks/useSyncedCollection";
import { useNetworkMerge } from "./useNetworkMerge";
import { NETWORK_ANALYSIS_UNLOCK_CONTACTS } from "../../api/compute/network-analysis-page-lock";
import { useNetworkDesignContacts } from "./network-design-fixture";

/** 人脈分析 opens from NETWORK_ANALYSIS_UNLOCK_CONTACTS people: below it the page shows the invite card and the locked 「人脈分析 · 10人から使えます · あと N人」 card
 *  (app.html #7, :469) instead of the density card (#8). R11b page-lock rule (shared/compute copy); not the 3-person analysis-threshold. */
export { NETWORK_ANALYSIS_UNLOCK_CONTACTS };

/** A-R05-10: the list keeps its tab, filters and search while a detail is open (the main tab unmounts when unfocused); AppScreen keeps the scroll. */
const memory = new Map<string, { tab: NetworkTab; filters: NetworkFilters; query: string }>();
export function resetNetworkScreenMemory(): void { memory.clear(); }

export function NetworkScreen({ scopeKey, now = () => Date.now() }: { scopeKey: string; now?: () => number }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ industry?: string | string[]; design?: string | string[] }>();
  const fixture = useNetworkDesignContacts();
  const remembered = memory.get(scopeKey);
  const [tab, setTab] = useState<NetworkTab>(remembered?.tab ?? "all");
  const [filters, setFilters] = useState<NetworkFilters>(() => {
    const fromParams = filtersFromParams(params);
    return fromParams.industries.length ? fromParams : remembered?.filters ?? EMPTY_NETWORK_FILTERS;
  });
  const [query, setQuery] = useState(remembered?.query ?? "");
  const [filterOpen, setFilterOpen] = useState(fixture.enabled && params.design === "filter");
  const [addOpen, setAddOpen] = useState(fixture.enabled && params.design === "add");
  useEffect(() => {
    if (!fixture.enabled) return;
    setFilterOpen(params.design === "filter");
    setAddOpen(params.design === "add");
  }, [fixture.enabled, params.design]);
  const designLoading = fixture.enabled && params.design === "loading";
  const visibleFixture = designLoading ? { ...fixture, data: null, loading: true } : fixture;
  const merge = useNetworkMerge();
  const monthStart = tokyoMonthStart(now());

  // その他 expands against the facets of the last summary (facets cover everyone, so they do not depend on the filters).
  const [facets, setFacets] = useState<ContactCardSummaryDTO | null>(null);
  const goalIds = fixture.enabled ? fixture.data?.goalRelatedIds ?? [] : merge.goalIds;
  const followUpIds = fixture.enabled ? fixture.data?.followUpContactIds ?? [] : merge.followUpIds;
  const directoryQuery = useMemo(() => networkDirectoryQuery({ query, tab, filters, summary: facets, merge: { goalIds, followUpIds, monthStart } }),
    [query, tab, filters, facets, goalIds, followUpIds, monthStart]);
  const list = useNetworkList(directoryQuery, visibleFixture);
  const deleted = useDeletedContacts();
  const summary: ContactCardSummaryDTO | null = list.summary ?? facets;
  useEffect(() => { if (list.summary && JSON.stringify(list.summary) !== JSON.stringify(facets)) setFacets(list.summary); }, [list.summary]); // eslint-disable-line react-hooks/exhaustive-deps
  const header = networkHeaderCounts(summary);
  const total = header?.total ?? 0;
  const empty = list.status === "ready" && total === 0;
  const rows = useMemo(() => {
    const goals = new Set(goalIds);
    const links = fixture.enabled ? new Map((fixture.data?.links ?? []).map((link) => [link.contactId, link])) : merge.links;
    return list.items.filter((card) => !deleted.has(card.id)).map((card) => networkRow(card, links, goals));
  }, [list.items, goalIds, merge.links, fixture.enabled, fixture.data, deleted]);

  useEffect(() => { memory.set(scopeKey, { tab, filters, query }); }, [scopeKey, tab, filters, query]);

  const subtitle = list.status === "loading" ? t("common.loading") : empty ? t("network.subtitleEmpty") : header ? t("network.subtitle", { total: header.total, added: header.added }) : undefined;
  const openSearch = () => router.push((query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search") as Href);
  const openContact = (id: string) => router.push(`/contacts/${encodeURIComponent(id)}` as Href);
  const counts = networkTabCounts(summary);

  return (
    <AppScreen inset="kit" title={t("network.title")}
      header={<ShellTopBar title={t("network.title")} subtitle={subtitle}
        left={<IconButton icon="search" accessibilityLabel={t("network.globalSearch")} onPress={openSearch} />}
        right={list.status === "loading" ? <IconButton icon="sliders" accessibilityLabel={t("network.filter")} onPress={() => setFilterOpen(true)} />
          : <IconButton icon="plus" accessibilityLabel={t("network.addPeople")} onPress={() => setAddOpen(true)} />} />}>
      <View testID="network-screen">
        {list.offline ? <View style={styles.gapBottom}><OfflineBar offline pending={0} /></View> : null}
        {list.status === "loading" ? <NetworkLoading /> : list.status === "failure" && rows.length === 0 && !empty ? (
          <RetryCard title={t("network.loadFailed")} {...(list.failure ? { message: list.failure } : {})} onRetry={list.refresh} />
        ) : empty ? (
          <NetworkEmpty onOpen={(href) => router.push(href as Href)} />
        ) : (
          <>
            <View style={styles.searchRow}>
              <View style={styles.grow}><SearchField value={query} onChangeText={setQuery} placeholder={t("network.searchPlaceholder")} accessibilityLabel={t("network.searchPlaceholder")}
                trailing={<UiPressable accessibilityRole="button" accessibilityLabel={t("network.filter")} hitSlop={12} onPress={() => setFilterOpen(true)}><Icon name="sliders" size={16} color={colors.ink3Text} /></UiPressable>} /></View>
            </View>
            {total >= NETWORK_ANALYSIS_UNLOCK_CONTACTS ? <DensityCard summary={summary} onAnalysis={() => router.push("/contacts/dashboard" as Href)} /> : null}
            <View style={styles.tabs} testID="network-tabs">
              <CategoryTabs accessibilityLabel={t("network.tabsLabel")} value={tab} onChange={setTab}
                options={[{ key: "all", label: t("network.tabAll"), count: counts.all }, { key: "goal", label: t("network.tabGoal"), count: counts.goal }, { key: "followUp", label: t("network.tabFollowUp"), count: counts.followUp }]} />
            </View>
            {total < NETWORK_ANALYSIS_UNLOCK_CONTACTS ? <InviteCard onInvite={() => router.push("/contacts/new/invite" as Href)} /> : null}
            {rows.length ? (
              <View style={[styles.listCard, total < NETWORK_ANALYSIS_UNLOCK_CONTACTS && styles.listAfterInvite]} testID="network-list">
                {rows.map((row, index) => <NetworkListRow key={row.id} row={row} first={index === 0} onPress={() => openContact(row.id)} />)}
                {list.hasMore ? <View style={styles.more}><Button variant="secondary" size="sm" label={t("network.loadMore", { n: Math.max(0, list.matched - rows.length) })} onPress={list.loadMore} /></View> : null}
              </View>
            ) : (
              <View style={styles.gapTop}><EmptyState title={t("network.noMatchTitle")} message={t("network.noMatchBody")} /></View>
            )}
            {total < NETWORK_ANALYSIS_UNLOCK_CONTACTS ? <AnalysisLockedCard missing={NETWORK_ANALYSIS_UNLOCK_CONTACTS - total} onPress={() => router.push("/contacts/dashboard" as Href)} /> : null}
          </>
        )}
      </View>
      <NetworkFilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} summary={summary} filters={filters} onChange={setFilters} matched={list.matched} />
      <AddContactSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </AppScreen>
  );
}

/** app.html :336 SRC — the kit .chip icon before each source label. */
export const NETWORK_CHIP_ICON = { meishi: "scan", linkedin: "link", phone: "phone", manual: "pen", self: "check", event: "calendar" } as const;
export const NETWORK_CHIP_COPY = { meishi: "network.chipMeishi", linkedin: "network.chipLinkedin", phone: "network.chipPhone", manual: "network.chipManual", self: "network.chipSelf", event: "network.chipEvent" } as const;
const MET_COPY = { event: "network.metEvent", referral: "network.metReferral", visit: "network.metVisit", other: "network.metOther" } as const;

/** SC-10 / LF12：「削除しました · 元に戻す」（Toast 挂在列表上，详情返回后已卸载）。离线删除在同步待发队列里，
 *  本机读联系人时已隐藏（local-contacts-source），随同步补发；这里只隐藏联网删除、墓碑还没同步到本机的人。 */
function useDeletedContacts(): ReadonlySet<string> {
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const session = useSyncCoordinatorSession(Boolean(auth.actorId));
  const toast = useToast();
  const { t } = useOrbitLocale();
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeContactDeleteQueue(() => setVersion((value) => value + 1)), []);
  useEffect(() => {
    const announced = takeAnnouncedContactDelete();
    if (!announced) return;
    toast.success(announced.queued ? t("network.delete.queued") : t("network.delete.done"), {
      undo: () => {
        void (async () => {
          const stillQueued = announced.queued && session ? await session.cancelOfflineContactDelete(announced.contactId).catch(() => false) : false;
          const restored = stillQueued || (await client.post(`/api/contacts/${encodeURIComponent(announced.contactId)}/restore`)).success;
          if (restored) { unhideDeletedContact(announced.contactId); toast.success(t("network.delete.restored")); }
          else toast.error(t("network.delete.failed"));
        })();
      },
    });
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => new Set(hiddenDeletedContactIds()), [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function NetworkListRow({ row, first, onPress }: { row: NetworkRow; first: boolean; onPress: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const chipKey = NETWORK_CHIP_COPY[row.chip];
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={row.name} onPress={onPress} style={styles.row} testID={`network-row-${row.id}`}>
      {first ? null : <View style={styles.divider} />}
      <Avatar name={row.name} />
      <View style={styles.meta}>
        <UiText numberOfLines={1} style={styles.name}>{row.name}</UiText>
        {row.subtitle ? <UiText numberOfLines={1} style={styles.sub}>{row.subtitle}</UiText> : <UiText numberOfLines={1} style={[styles.sub, styles.unregistered]}>{t("network.unregistered")}</UiText>}
        {row.goal ? <UiText numberOfLines={1} style={styles.goal}>{t(row.goal.talked ? "network.goalLineTalked" : "network.goalLine", { label: row.goal.label })}</UiText> : null}
      </View>
      <View style={styles.rend}>
        <DensityDots level={row.density} />
        <Chip label={t(chipKey)} icon={NETWORK_CHIP_ICON[row.chip]} tone={row.chip === "self" ? "teal" : "neutral"} />
      </View>
    </UiPressable>
  );
}

function DensityCard({ summary, onAnalysis }: { summary: ContactCardSummaryDTO | null; onAnalysis: () => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const counts = summary?.densityCounts ?? { 1: 0, 2: 0, 3: 0 };
  const header = networkHeaderCounts(summary);
  return (
    <View style={[styles.card, styles.gapTop, styles.densityCard]} testID="network-density-card">
      <View style={styles.between}>
        <View>
          <View style={styles.rowCenter}>
            <UiText style={styles.lbl}>{t("network.connections")}</UiText>
            <UiPressable accessibilityRole="link" accessibilityLabel={t("network.analysis")} onPress={onAnalysis} style={styles.rowCenter}>
              <UiText style={styles.moreLink}>{t("network.analysis")}</UiText><Icon name="right" size={16} color={colors.ink2} />
            </UiPressable>
          </View>
          <View style={styles.bigRow}><UiText style={styles.big}>{header?.total ?? 0}</UiText><UiText style={styles.bigUnit}>{t("network.peopleUnit")}</UiText></View>
        </View>
        <View style={styles.right}>
          <UiText style={styles.lbl}>{t("network.thisMonth")}</UiText>
          <UiText style={styles.mid}>+{header?.added ?? 0}</UiText>
        </View>
      </View>
      <View style={styles.stack}>
        {([1, 2, 3] as const).map((level) => counts[level] > 0 ? <View key={level} style={{ flex: counts[level], backgroundColor: level === 1 ? colors.plum300 : level === 2 ? colors.plum500 : colors.plum700 }} /> : null)}
      </View>
      <View style={styles.grid3}>
        {([1, 2, 3] as const).map((level) => (
          <View key={level} style={styles.grow}>
            <DensityDots level={level} />
            <UiText style={styles.densityLabel}>{t(`network.density${level}`)}</UiText>
            <UiText style={styles.densityCount}>{counts[level]}</UiText>
          </View>
        ))}
      </View>
      <View style={styles.dailyHint}>
        <UiText style={styles.hintEmoji}>💬</UiText>
        <UiText style={[styles.hintText, styles.grow]}><UiText style={styles.hintBold}>{t("network.dailyHintBold")}</UiText>{t("network.dailyHintRest")}</UiText>
      </View>
    </View>
  );
}

function InviteCard({ onInvite }: { onInvite: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={[styles.card, styles.gapTop, styles.rowCenter, styles.inviteCard]} testID="network-invite-card">
      <View style={[styles.emo, styles.emoPink]}><UiText style={styles.emoText}>🤝</UiText></View>
      <View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.inviteTitle")}</UiText><UiText style={styles.lbl}>{t("network.inviteSub")}</UiText></View>
      <Button variant="secondary" size="sm" label={t("network.inviteButton")} onPress={onInvite} />
    </View>
  );
}

function AnalysisLockedCard({ missing, onPress }: { missing: number; onPress: () => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={t("network.analysis")} onPress={onPress} style={[styles.card, styles.flatCard, styles.gapTop, styles.rowCenter]} testID="network-analysis-locked">
      <View style={[styles.emo, styles.emoLav]}><UiText style={styles.emoText}>📊</UiText></View>
      <View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.analysis")}</UiText><UiText style={styles.lbl}>{t("network.analysisLocked", { n: missing })}</UiText></View>
      <Icon name="right" size={16} color={colors.ink3} />
    </UiPressable>
  );
}

function NetworkEmpty({ onOpen }: { onOpen: (href: string) => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const sample: NetworkRow[] = [
    { id: "sample-1", name: t("network.sampleName1"), subtitle: t("network.sampleSub1"), goal: { label: t("network.sampleGoal1"), talked: true }, density: 3, chip: "meishi" },
    { id: "sample-2", name: t("network.sampleName2"), subtitle: t("network.sampleSub2"), goal: { label: t("network.sampleGoal2"), talked: false }, density: 1, chip: "linkedin" },
  ];
  return (
    <View testID="network-empty" style={styles.empty}>
      <View style={[styles.card, styles.guide]} testID="network-guide">
        <UiText style={styles.guideEmoji}>🪐</UiText>
        <UiText style={styles.guideTitle}>{t("network.guideTitle")}</UiText>
        <UiText style={styles.guideBody}>{t("network.guideBody")}</UiText>
        <View style={styles.guideAction}><Button variant="primary" size="lg" block icon="scan" label={t("network.scanCard")} onPress={() => onOpen("/contacts/new/scan")} /></View>
      </View>
      <View style={[styles.grid2, styles.gapTop]}>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("network.macInvite")} onPress={() => onOpen("/contacts/new/invite")} style={[styles.mac, styles.macPink]}>
          <UiText style={styles.emoText}>🤝</UiText><View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.macInvite")}</UiText><UiText style={styles.lbl}>{t("network.macInviteSub")}</UiText></View>
        </UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("network.macManual")} onPress={() => onOpen("/contacts/new/manual")} style={[styles.mac, styles.macLav]}>
          <UiText style={styles.emoText}>✍️</UiText><View style={styles.grow}><UiText style={styles.cardTitle}>{t("network.macManual")}</UiText><UiText style={styles.lbl}>{t("network.macManualSub")}</UiText></View>
        </UiPressable>
      </View>
      <View style={[styles.rowCenter, styles.gapTop]}>
        <UiText style={styles.lbl}>{t("network.otherWays")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("network.otherContacts")} onPress={() => onOpen("/contacts/new/import?kind=contacts")}><Chip label={t("network.otherContacts")} /></UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("network.otherLinkedin")} onPress={() => onOpen("/contacts/new/import?kind=linkedin")}><Chip label={t("network.otherLinkedin")} /></UiPressable>
      </View>
      <View style={[styles.card, styles.sampleCard]}>
        <View style={styles.rowCenter}><UiText style={styles.cardTitle}>{t("network.sampleTitle")}</UiText><SampleTag /></View>
        <View style={styles.faded}>{sample.map((row, index) => <NetworkListRow key={row.id} row={row} first={index === 0} onPress={() => undefined} />)}</View>
        <UiText style={styles.lbl}>{t("network.sampleDotsBefore")}<UiText style={[styles.lbl, styles.hintBold]}>{t("network.sampleDotsBold")}</UiText>{t("network.sampleDotsAfter")}</UiText>
      </View>
    </View>
  );
}

function NetworkLoading() {
  const { styles } = useStyles();
  return <View style={styles.loadingRoot} testID="network-loading">
    <View style={styles.loadingSearch} testID="network-loading-search" />
    <View style={[styles.card, styles.loadingSummary]} testID="network-loading-summary">
      <View style={[styles.loadingBar, { width: 60, height: 9 }]} />
      <View style={[styles.loadingBar, { width: 110, height: 37 }]} />
      <View style={[styles.loadingBar, { width: "100%", height: 9 }]} />
      <View style={[styles.loadingBar, { width: "70%", height: 9 }]} />
    </View>
    <View style={styles.loadingTabs} testID="network-loading-tabs">
      {[80, 100, 80].map((width, index) => <View key={index} style={[styles.loadingBar, { width, height: 27, borderRadius: 16 }]} />)}
    </View>
    <View style={styles.loadingList}>
      {Array.from({ length: 6 }, (_, index) => <View key={index} style={styles.loadingRow} testID={`network-loading-row-${index}`}>
        <View style={[styles.loadingBar, styles.loadingAvatar]} />
        <View style={styles.loadingRowLines}>
          <View style={[styles.loadingBar, { width: `${40 + index * 6}%`, height: 11 }]} />
          <View style={[styles.loadingBar, { width: `${54 + index * 4}%`, height: 9 }]} />
        </View>
        <View style={[styles.loadingBar, { width: 52, height: 23 }]} />
      </View>)}
    </View>
  </View>;
}

export function NetworkFilterSheet({ visible, onClose, summary, filters, onChange, matched }: {
  visible: boolean; onClose: () => void; summary: ContactCardSummaryDTO | null; filters: NetworkFilters; onChange: (filters: NetworkFilters) => void; matched: number;
}) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const industries = topFacetOptions(summary?.industries, NETWORK_TOP_INDUSTRIES);
  const regions = topFacetOptions(summary?.regions, NETWORK_TOP_REGIONS);
  const other = t("network.facetOther");
  const toggle = (group: keyof NetworkFilters, value: string) => onChange({ ...filters, [group]: toggleValue(filters[group], value) });
  const group = (label: string, key: keyof NetworkFilters, options: { key: string; label: string; count?: number }[]) => (
    <View style={styles.fgrp} key={key}>
      <UiText style={styles.lbl}>{label}</UiText>
      <View style={styles.chips}>{options.map((option) => <FilterOption key={option.key} label={option.label} {...(option.count !== undefined ? { count: option.count } : {})} selected={filters[key].includes(option.key)} onToggle={() => toggle(key, option.key)} />)}</View>
    </View>
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("network.filterTitle")}>
      <View testID="network-filter-sheet">
        <View style={styles.between}>
          <UiText style={styles.sheetTitle}>{t("network.filterTitle")}</UiText>
          <Button variant="ghost" size="sm" label={t("network.filterClear")} onPress={() => onChange(EMPTY_NETWORK_FILTERS)} disabled={networkFilterCount(filters) === 0} />
        </View>
        <UiText style={styles.lbl}>{t("network.filterHint")}</UiText>
        {group(t("network.groupStage"), "statuses", NETWORK_STAGE_OPTIONS.map((key) => ({ key, label: t(key === "active" ? "network.stageActive" : "network.stageNurture"), count: summary?.statuses[key] ?? 0 })))}
        {group(t("network.groupIndustry"), "industries", industries.map((option) => ({ key: option.key, label: industryOptionLabel(option.key, language, other), count: option.count })))}
        {group(t("network.groupRegion"), "regions", regions.map((option) => ({ key: option.key, label: regionOptionLabel(option.key, (city) => t(`network.city.${city}`), other), count: option.count })))}
        {group(t("network.groupMet"), "mets", NETWORK_MET_OPTIONS.map((key) => ({ key, label: t(MET_COPY[key]), count: summary?.metKinds?.[key] ?? 0 })))}
        {group(t("network.groupDensity"), "densities", NETWORK_DENSITY_OPTIONS.map((key) => ({ key, label: key === "1" ? "●○○" : key === "2" ? "●●○" : "●●●", count: summary?.densityCounts?.[Number(key) as 1 | 2 | 3] ?? 0 })))}
        <View style={styles.gapTop}><Button variant="primary" label={t("network.showPeople", { n: matched })} onPress={onClose} /></View>
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  gapTop: { marginTop: 12 },
  gapBottom: { marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -16 },
  tabs: { marginTop: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 18 },
  densityCard: { paddingBottom: 27 },
  flatCard: { backgroundColor: colors.surface2 },
  listCard: { backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 6, paddingHorizontal: 16, marginTop: 12 },
  listAfterInvite: { marginTop: 20 },
  inviteCard: { paddingVertical: 24 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  right: { alignItems: "flex-end" },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500" },
  moreLink: { color: colors.ink2, fontSize: 13, fontWeight: "700" },
  bigRow: { flexDirection: "row", alignItems: "baseline" },
  big: { color: colors.ink, fontSize: 38, fontWeight: "800", letterSpacing: -0.76, lineHeight: 40 },
  bigUnit: { color: colors.ink3, fontSize: 17, fontWeight: "700", marginLeft: 3 },
  mid: { color: colors.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.22 },
  stack: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2, marginTop: 10 },
  grid3: { flexDirection: "row", gap: 6, marginTop: 18 },
  densityLabel: { color: colors.ink3, fontSize: 13, marginTop: 3 },
  densityCount: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  dailyHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 23, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.macLav },
  hintEmoji: { fontSize: 14 },
  hintText: { color: colors.ink, fontSize: 14 },
  hintBold: { fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13.5 },
  divider: { position: "absolute", top: 0, left: 50, right: 0, height: 1, backgroundColor: colors.line },
  meta: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  sub: { color: colors.ink3, fontSize: 14 },
  unregistered: { color: colors.ink4, fontStyle: "normal" },
  goal: { color: colors.ink2, fontSize: 14, marginTop: 1 },
  rend: { alignItems: "flex-end", gap: 5 },
  more: { paddingVertical: 10, alignItems: "flex-start" },
  emo: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoPink: { backgroundColor: colors.macPink },
  emoLav: { backgroundColor: colors.macLav },
  emoText: { fontSize: 19 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  empty: { marginTop: -16 },
  guide: { alignItems: "center", gap: 8, paddingTop: 24, paddingBottom: 30 },
  guideEmoji: { fontSize: 50, lineHeight: 50 },
  guideTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  guideBody: { color: colors.ink2, fontSize: 15, textAlign: "center", marginBottom: 6 },
  guideAction: { alignSelf: "stretch", marginTop: 16 },
  grid2: { flexDirection: "row", gap: 10 },
  mac: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 16 },
  macPink: { backgroundColor: colors.macPink },
  macLav: { backgroundColor: colors.macLav },
  sampleCard: { marginTop: 20, paddingBottom: 33 },
  faded: { opacity: 0.55, marginVertical: 14 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  loadingBar: { borderRadius: 8, backgroundColor: colors.surface3 },
  loadingRoot: { marginTop: -16 },
  loadingSearch: { height: 44, borderRadius: 22, backgroundColor: colors.surface2 },
  loadingSummary: { height: 131, marginTop: 12, gap: 7 },
  loadingTabs: { flexDirection: "row", gap: 6, marginTop: 12 },
  loadingList: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 5 },
  loadingRow: { height: 63, flexDirection: "row", alignItems: "center", gap: 12 },
  loadingAvatar: { width: 38, height: 38, borderRadius: 19 },
  loadingRowLines: { flex: 1, gap: 5 },
  fgrp: { marginTop: 14, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
}));
