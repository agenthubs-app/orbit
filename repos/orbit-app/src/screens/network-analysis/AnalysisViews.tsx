// R11b 人脈分析（App）: the locked page (b5 #32), 構造 (#33 / #34 / #67 dark), 機会 (#35), インサイト (#36) and
// iOrbit の見立て (the snapshot; no board, its own states). Every number is a field of NetworkAnalysisViewDTO; every AI
// sentence is a snapshot block with its evidence; a card without data is left out (§2 B-5).
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Rect, Stop } from "../../components/ui/svg";

import type { NetworkAnalysisDistribution, NetworkAnalysisGap, NetworkAnalysisInsight, NetworkAnalysisOpportunity, NetworkAnalysisViewDTO } from "../../api/contract/network-analysis-view";
import { AvatarStack, Button, Card, Chip, Icon, MacTile, RingChart, SampleTag, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import type { MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import type { CachedReadState, NetworkSnapshotBlock, NetworkSnapshotView } from "./analysis-api";
import { bucketLabel, industryName, monthLabel, tokyoMonthDay } from "./analysis-labels";
import { LinearGradient } from "../plan/plan-svg";

/** A snapshot evidence person: keyed by the snapshot's record id; `contactId` opens the contact. */
export interface EvidencePerson { contactId: string; name: string }
export interface DrillSelection { dimension: NetworkAnalysisDistribution["dimension"] | "opportunity"; bucketId: string }

const ringColors = (colors: OrbitColors) => [colors.plum900, colors.plum700, colors.plum500, colors.plum300] as const;

/* ---------- shared bits ---------- */

/** kit .bar.thin (.rose): 4 tall on surface-3; first row plum, the rest rose. */
function ThinBar({ value, rose }: { value: number; rose?: boolean }) {
  const { styles, colors } = useStyles();
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(1, value)) * width;
  const from = rose ? colors.rose300 : colors.plum300;
  const to = rose ? colors.rose700 : colors.plum700;
  return (
    <View style={styles.barTrack} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {fill > 0 ? <Svg width={fill} height={4} style={StyleSheet.absoluteFill}>
        <Defs><LinearGradient id="analysisBar" x1={0} y1={0} x2={fill} y2={0} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={from} /><Stop offset={1} stopColor={to} /></LinearGradient></Defs>
        <Rect x={0} y={0} width={fill} height={4} rx={2} fill="url(#analysisBar)" />
      </Svg> : null}
    </View>
  );
}

/** kit .why (18) — the 「?」 next to a card title; the body (kit .why-body, 「根拠：…」) opens under the card. */
function useWhy() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((value) => !value) };
}
function WhyToggle({ why }: { why: ReturnType<typeof useWhy> }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={copy.aiCard.showWhy} accessibilityState={{ expanded: why.open }} hitSlop={13} onPress={why.toggle} style={styles.why}>
      <UiText maxFontSizeMultiplier={1.3} style={styles.whyMark}>?</UiText>
    </UiPressable>
  );
}
function WhyBody({ why, reason, onSurface }: { why: ReturnType<typeof useWhy>; reason: string; onSurface?: boolean }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  if (!why.open) return null;
  return <View style={[styles.whyBody, onSurface ? styles.whyBodyOnSurface : null]}><UiText style={styles.whyText}>{fillCopy(copy.aiCard.why, { reason })}</UiText></View>;
}

function CardHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.cardHead}><View style={styles.rowCenter}>{typeof title === "string" ? <UiText style={styles.h3}>{title}</UiText> : title}</View>{right}</View>;
}

/* ---------- 锁定 (b5 #32) ---------- */

const SAMPLE_ROWS = [["finance_investment", 105], ["manufacturing_supply_chain", 83], ["technology_internet", 63], ["trade_logistics", 35]] as const;

export function LockedView({ total, required, missing, onAddCards }: { total: number; required: number; missing: number; onAddCards: () => void }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const done = Math.min(total, required);
  return (
    <View testID="analysis-locked">
      <Card style={styles.guide}>
        <View style={styles.lockRing}>
          <RingChart size={120} stroke={12} accessibilityLabel={`${total}/${required}`}
            segments={[{ value: done, color: colors.plum700 }, { value: Math.max(0, required - done), color: colors.surface3 }]} />
          <View style={styles.ringCenter} pointerEvents="none">
            <UiText style={styles.lockNum}>{total}<UiText style={styles.lockOf}>/{required}</UiText></UiText>
          </View>
        </View>
        <UiText style={styles.lockTitle}>{t("networkAnalysis.lockTitle", { n: missing })}</UiText>
        <UiText style={styles.lockBody}>{t("networkAnalysis.lockBody")}</UiText>
        <Button variant="primary" size="lg" block icon="scan" label={t("networkAnalysis.lockAddCards")} onPress={onAddCards} />
      </Card>
      <Card style={styles.gapTop}>
        <CardHead title={t("networkAnalysis.unlockTitle")} />
        {(["networkAnalysis.previewStructure", "networkAnalysis.previewOpportunities", "networkAnalysis.previewInsight"] as const).map((key, index) => (
          <View key={key} style={[styles.ghostRow, index > 0 ? styles.ghostGap : null]}>
            <View style={styles.ghostDot} />
            <UiText numberOfLines={1} style={styles.ghostText}>{t(key)}</UiText>
          </View>
        ))}
      </Card>
      <Card style={styles.gapTop}>
        <CardHead title={<><UiText style={styles.h3}>{t("networkAnalysis.sampleTitle")}</UiText><SampleTag /></>} />
        <View style={styles.faded} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {SAMPLE_ROWS.map(([id, count]) => (
            <View key={id} style={styles.dim}>
              <UiText numberOfLines={1} style={styles.dimLabel}>{industryName(id, language)}</UiText>
              <View style={styles.grow}><ThinBar value={count / 105} /></View>
              <UiText style={styles.dimCount}>{count}</UiText>
              <View style={styles.chevronSlot} />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

/* ---------- 構造 (b5 #33 / #34) ---------- */

function DimensionCard({ title, distribution, onOpen, compactTop = false }: { title: string; distribution: NetworkAnalysisDistribution; onOpen: (selection: DrillSelection) => void; compactTop?: boolean }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  if (distribution.buckets.length === 0) return null;
  const max = Math.max(1, ...distribution.buckets.map((bucket) => bucket.count));
  return (
    <Card style={compactTop ? styles.afterGap : styles.gapTop}>
      <View testID={`analysis-dimension-${distribution.dimension}`}>
        <CardHead title={title} right={<Icon name="right" size={16} color={colors.ink3} />} />
        {distribution.buckets.map((bucket, index) => {
          const label = bucketLabel(distribution.dimension, bucket.id, t, language);
          return (
            <UiPressable key={bucket.id} accessibilityRole="button" accessibilityLabel={t("networkAnalysis.openDimension", { label })} onPress={() => onOpen({ dimension: distribution.dimension, bucketId: bucket.id })} style={styles.dim}>
              <UiText numberOfLines={1} style={styles.dimLabel}>{label}</UiText>
              <View style={styles.grow}><ThinBar value={bucket.count / max} rose={index > 0} /></View>
              <UiText style={styles.dimCount}>{bucket.count}</UiText>
              <Icon name="right" size={16} color={colors.ink3} />
            </UiPressable>
          );
        })}
      </View>
    </Card>
  );
}

function GapCard({ gap, total, block, names, onOpenPerson }: { gap: NetworkAnalysisGap; total: number; block: NetworkSnapshotBlock | null; names: Record<string, EvidencePerson>; onOpenPerson: (contactId: string) => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const why = useWhy();
  const route = block?.evidence.contactIds.map((id) => names[id]).find(Boolean);
  return (
    <View style={styles.gapCard} testID="analysis-gap">
      <View style={styles.rowCenter}>
        <UiText style={styles.gapEmoji}>🧩</UiText>
        <UiText style={[styles.gapTitle, styles.grow]}>{t("networkAnalysis.gapTitle", { title: gap.title })}</UiText>
        <WhyToggle why={why} />
      </View>
      <UiText style={styles.gapBody}>{t("networkAnalysis.gapBody", { target: gap.targetCount, linked: gap.linkedCount })}{block ? block.text : gap.linkedCount === 0 ? t("networkAnalysis.gapHint") : ""}</UiText>
      <WhyBody why={why} reason={t("networkAnalysis.gapWhy", { total })} onSurface />
      {route ? <View style={styles.gapButton}><Button size="sm" label={t("networkAnalysis.gapRoute")} onPress={() => onOpenPerson(route.contactId)} /></View> : null}
    </View>
  );
}

export function StructureView({ view, snapshot, names, onOpen, onOpenPerson }: {
  view: NetworkAnalysisViewDTO; snapshot: NetworkSnapshotView | null; names: Record<string, EvidencePerson>;
  onOpen: (selection: DrillSelection) => void; onOpenPerson: (contactId: string) => void;
}) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const structure = view.structure;
  if (!structure) return null;
  const industries = structure.industries;
  const palette = ringColors(colors);
  const gap = structure.gaps?.[0] ?? null;
  const gapBlock = gap ? snapshot?.blocks.find((block) => block.kind === "gap" && block.needId === gap.needId) ?? null : null;
  return (
    <View testID="analysis-structure">
      <Card>
        <View testID="analysis-dimension-industry">
          <CardHead title={t("networkAnalysis.industry")} right={<UiText style={styles.lbl}>{t("networkAnalysis.tapForList")}</UiText>} />
          <View style={styles.ringRow}>
            <View>
              <RingChart size={118} stroke={13} accessibilityLabel={`${t("networkAnalysis.industry")} ${industries.total}`}
                segments={industries.buckets.map((bucket, index) => ({ value: bucket.count, color: palette[Math.min(index, 3)]! }))} />
              <View style={styles.ringCenter} pointerEvents="none">
                <UiText style={styles.ringTotal}>{industries.total}</UiText>
                <UiText style={styles.lbl}>{t("networkAnalysis.peopleUnit")}</UiText>
              </View>
            </View>
            <View style={styles.grow}>
              {industries.buckets.map((bucket, index) => {
                const label = bucketLabel("industry", bucket.id, t, language);
                return (
                  <UiPressable key={bucket.id} accessibilityRole="button" accessibilityLabel={t("networkAnalysis.openDimension", { label })} onPress={() => onOpen({ dimension: "industry", bucketId: bucket.id })} style={[styles.leg, index > 0 ? styles.legLine : null]}>
                    <View style={[styles.legSwatch, { backgroundColor: palette[Math.min(index, 3)] }]} />
                    <UiText numberOfLines={1} style={[styles.legLabel, styles.grow]}>{label}</UiText>
                    <UiText style={styles.legCount}>{bucket.count}</UiText>
                    <Icon name="right" size={16} color={colors.ink3} />
                  </UiPressable>
                );
              })}
            </View>
          </View>
        </View>
      </Card>
      {gap ? <GapCard gap={gap} total={industries.total} block={gapBlock} names={names} onOpenPerson={onOpenPerson} /> : structure.gaps === null ? (
        <View style={styles.gapCard} testID="analysis-gap-unavailable"><UiText style={styles.gapBodyPlain}>{t("networkAnalysis.gapUnavailable")}</UiText></View>
      ) : null}
      <DimensionCard title={t("networkAnalysis.seniority")} distribution={structure.seniority} onOpen={onOpen} compactTop />
      <DimensionCard title={t("networkAnalysis.region")} distribution={structure.regions} onOpen={onOpen} />
      <DimensionCard title={t("networkAnalysis.met")} distribution={structure.mets} onOpen={onOpen} />
    </View>
  );
}

/* ---------- 機会 (b5 #35) ---------- */

const OPPORTUNITY_LOOK = {
  reconnect: { emoji: "🔁", tone: "pink", title: "networkAnalysis.oppReconnect", why: "networkAnalysis.oppReconnectWhy" },
  stalled: { emoji: "⏳", tone: "apricot", title: "networkAnalysis.oppStalled", why: "networkAnalysis.oppStalledWhy" },
} as const satisfies Record<NetworkAnalysisOpportunity["kind"], { emoji: string; tone: "pink" | "apricot"; title: MessageKey; why: MessageKey }>;

function OpportunityCard({ card, first, onOpen }: { card: NetworkAnalysisOpportunity; first: boolean; onOpen: (selection: DrillSelection) => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const why = useWhy();
  const look = OPPORTUNITY_LOOK[card.kind];
  const body = card.kind === "reconnect" ? t("networkAnalysis.oppReconnectBody") : t("networkAnalysis.oppStalledBody", { days: card.averageDays ?? 0 });
  const lead = card.preview[0];
  return (
    <Card style={first ? null : styles.gapTop}>
      <View testID={`analysis-opportunity-${card.kind}`}>
        <View style={styles.oppHead}>
          <MacTile emoji={look.emoji} tone={look.tone} />
          <View style={styles.grow}>
            <UiText style={styles.oppTitle}>{t(look.title)}</UiText>
            <UiText style={styles.lbl}>{body}</UiText>
          </View>
          <UiText style={styles.mid}>{card.count}<UiText style={styles.lbl}>{t("networkAnalysis.peopleUnit")}</UiText></UiText>
        </View>
        <View style={styles.oppFoot}>
          {card.preview.length ? <AvatarStack names={card.preview.map((person) => person.name)} max={3} /> : null}
          {lead ? <UiText numberOfLines={1} style={[styles.lbl, styles.shrink]}>{card.count > 1 ? t("networkAnalysis.others", { name: lead.name }) : lead.name}</UiText> : null}
          <View style={styles.pushRight}><WhyToggle why={why} /></View>
          <Button size="sm" label={t("networkAnalysis.openList")} onPress={() => onOpen({ dimension: "opportunity", bucketId: card.kind })} />
        </View>
        <WhyBody why={why} reason={t(look.why)} />
      </View>
    </Card>
  );
}

export function OpportunitiesView({ view, onOpen }: { view: NetworkAnalysisViewDTO; onOpen: (selection: DrillSelection) => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const cards = view.opportunities ?? [];
  return (
    <View testID="analysis-opportunities">
      {cards.length ? cards.map((card, index) => <OpportunityCard key={card.kind} card={card} first={index === 0} onOpen={onOpen} />)
        : <Card><UiText style={styles.lblBody}>{t("networkAnalysis.oppEmpty")}</UiText></Card>}
    </View>
  );
}

/* ---------- インサイト (b5 #36) ---------- */

function InsightCard({ insight, first }: { insight: NetworkAnalysisInsight; first: boolean }) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const why = useWhy();
  const industry = insight.industryId ? industryName(insight.industryId, language) : "";
  if (insight.kind === "met_path") {
    const top = Math.max(1, insight.eventRate ?? 0, insight.referralRate ?? 0);
    return (
      <Card style={first ? null : styles.gapTop}>
        <View testID="analysis-insight-met_path">
          <View style={styles.rowCenter}><Chip label={t("networkAnalysis.insightMetChip")} /><View style={styles.pushRight}><WhyToggle why={why} /></View></View>
          <UiText style={styles.headline}>{t("networkAnalysis.insightMetHeadline", { industry, share: insight.eventShare ?? 0, referral: insight.referralRate ?? 0, event: insight.eventRate ?? 0 })}</UiText>
          <View style={styles.cmp}><UiText numberOfLines={1} style={styles.cmpLabel}>{t("networkAnalysis.metEvent")}</UiText><View style={styles.grow}><ThinBar rose value={(insight.eventRate ?? 0) / top} /></View><UiText style={styles.cmpValue}>{insight.eventRate ?? 0}%</UiText></View>
          <View style={styles.cmp}><UiText numberOfLines={1} style={styles.cmpLabel}>{t("networkAnalysis.metReferral")}</UiText><View style={styles.grow}><ThinBar value={(insight.referralRate ?? 0) / top} /></View><UiText style={styles.cmpValue}>{insight.referralRate ?? 0}%</UiText></View>
          <UiText style={[styles.lbl, styles.caption]}>{t("networkAnalysis.insightMetCaption", { industry, n: insight.sample ?? 0 })}</UiText>
          <WhyBody why={why} reason={t("networkAnalysis.insightMetWhy", { industry, n: insight.sample ?? 0 })} />
        </View>
      </Card>
    );
  }
  const months = insight.months ?? [];
  const max = Math.max(1, ...months.map((month) => month.added));
  const headline = t("networkAnalysis.insightGrowthHeadline", { industry, n: insight.added ?? 0 });
  return (
    <Card style={first ? null : styles.gapTop}>
      <View testID="analysis-insight-growth">
        <View style={styles.rowCenter}><Chip label={t("networkAnalysis.insightGrowthChip")} /><View style={styles.pushRight}><WhyToggle why={why} /></View></View>
        <UiText style={styles.headline}>{insight.planNeedTitle ? t("networkAnalysis.insightGrowthPlan", { headline, title: insight.planNeedTitle }) : headline}</UiText>
        <View style={styles.minibars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {months.map((month, index) => <View key={month.month} style={[styles.minibar, index === months.length - 1 ? styles.minibarHi : null, { height: `${Math.max(4, (month.added / max) * 96)}%` }]} />)}
        </View>
        {months.length ? <View style={styles.between}><UiText style={styles.lbl}>{monthLabel(months[0]!.month, t, language)}</UiText><UiText style={styles.lbl}>{monthLabel(months[months.length - 1]!.month, t, language)}</UiText></View> : null}
        <WhyBody why={why} reason={t("networkAnalysis.insightGrowthWhy", { industry })} />
      </View>
    </Card>
  );
}

/** iOrbit の見立て (no board): diagnosis / insight / plan sentences with evidence people; its own status line (B-8). */
export function SnapshotCard({ snapshot, names, onOpenPerson, onRecompute, recomputing }: {
  snapshot: CachedReadState<NetworkSnapshotView>; names: Record<string, EvidencePerson>; onOpenPerson: (contactId: string) => void; onRecompute: () => void; recomputing: boolean;
}) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const ready = snapshot.status === "ready" ? snapshot.data : null;
  const blocks = (ready?.blocks ?? []).filter((block) => block.kind !== "gap");
  const status = snapshot.status === "failed" ? t("networkAnalysis.aiUnavailable")
    : !ready ? null
    : ready.freshness.recovering || ready.freshness.job === "queued" || ready.freshness.job === "running" ? t("networkAnalysis.aiUpdating")
    : ready.freshness.job === "deferred" ? t("networkAnalysis.aiDeferred")
    // B-7: a snapshot without sentences in this language (ja) shows no AI text at all — it says there is none yet.
    : ready.state === "ready" && ready.generatedAt && blocks.length ? t("networkAnalysis.aiAsOf", { date: tokyoMonthDay(ready.generatedAt) })
    : t("networkAnalysis.aiNone");
  return (
    <Card style={styles.gapTop}>
      <View testID={`analysis-snapshot-${snapshot.status === "failed" ? "failed" : ready?.state ?? "loading"}`}>
        <CardHead title={t("networkAnalysis.aiTitle")} right={status ? <UiText style={styles.lbl}>{status}</UiText> : null} />
        {snapshot.status === "loading" ? <Skeleton lines={2} /> : null}
        {blocks.map((block) => {
          const people = block.evidence.contactIds.flatMap((id) => (names[id] ? [names[id]!] : []));
          return (
            <View key={block.key} style={styles.aiBlock}>
              <UiText style={styles.aiText}>{block.text}</UiText>
              {people.length ? (
                <View style={styles.evidence}>
                  <UiText style={styles.lbl}>{t("networkAnalysis.aiEvidence", { names: "" })}</UiText>
                  {people.map((person) => (
                    <UiPressable key={person.contactId} accessibilityRole="link" accessibilityLabel={person.name} hitSlop={8} onPress={() => onOpenPerson(person.contactId)}>
                      <UiText style={styles.evidenceName}>{person.name}</UiText>
                    </UiPressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {ready?.freshness.stale && blocks.length ? <UiText style={[styles.lbl, styles.caption]}>{t("networkAnalysis.aiStale")}</UiText> : null}
        {ready && ready.state !== "unavailable" ? <View style={styles.gapButton}><Button size="sm" label={t("networkAnalysis.recompute")} loading={recomputing} onPress={onRecompute} /></View> : null}
      </View>
    </Card>
  );
}

export function InsightsView({ view, snapshotSlot }: { view: NetworkAnalysisViewDTO; snapshotSlot: ReactNode }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const insights = view.insights ?? [];
  const reference = view.lock.state === "open" && view.lock.reference;
  return (
    <View testID="analysis-insight">
      {insights.length ? insights.map((insight, index) => <InsightCard key={insight.kind} insight={insight} first={index === 0} />)
        : <Card><UiText style={styles.lblBody}>{reference ? t("networkAnalysis.insightsThin") : t("networkAnalysis.insightsNone")}</UiText></Card>}
      {snapshotSlot}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pushRight: { marginLeft: "auto" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  gapTop: { marginTop: 14 },
  afterGap: { marginTop: 2 },
  lbl: { fontSize: 11.5, color: colors.ink3Text, fontWeight: "500" },
  lblBody: { fontSize: 12.5, color: colors.ink3Text, lineHeight: 20 },
  caption: { marginTop: 4 },
  h3: { fontSize: 14.5, fontWeight: "800", color: colors.ink },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  // kit .bar.thin
  barTrack: { height: 4, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden" },
  // kit .why / .why-body
  why: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  whyMark: { fontSize: 10.5, fontWeight: "800", color: colors.ink3Text },
  whyBody: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  whyBodyOnSurface: { backgroundColor: colors.surface },
  whyText: { fontSize: 12, color: colors.ink2, lineHeight: 20 },
  // 锁定 (kit .guide, .ghost-row, .faded)
  guide: { alignItems: "stretch", paddingVertical: 24, paddingHorizontal: 20 },
  lockRing: { alignSelf: "center", width: 120, height: 120 },
  ringCenter: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  lockNum: { fontSize: 30, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  lockOf: { fontSize: 14, fontWeight: "700", color: colors.ink3Text },
  lockTitle: { marginTop: 12, fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
  lockBody: { marginTop: 6, marginBottom: 16, fontSize: 13, lineHeight: 21, color: colors.ink2, textAlign: "center" },
  ghostRow: { height: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  ghostGap: { marginTop: 8 },
  ghostDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2 },
  ghostText: { flex: 1, fontSize: 12, color: colors.ink3Text },
  faded: { opacity: 0.5 },
  // kit .dim (74 · bar · 34 · 16)
  dim: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5, minHeight: 30 },
  dimLabel: { width: 74, fontSize: 12, color: colors.ink3Text },
  dimCount: { width: 34, textAlign: "right", fontSize: 12, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  chevronSlot: { width: 16 },
  // 業界 ring + kit .leg
  ringRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  ringTotal: { fontSize: 26, fontWeight: "800", color: colors.ink, lineHeight: 29, fontVariant: ["tabular-nums"] },
  leg: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, minHeight: 34 },
  legLine: { borderTopWidth: 1, borderTopColor: colors.line },
  legSwatch: { width: 10, height: 10, borderRadius: 3 },
  legLabel: { fontSize: 12.5, color: colors.ink },
  legCount: { fontSize: 12.5, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  // 不足 (kit .mac.pink)
  gapCard: { marginTop: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.macPink },
  gapEmoji: { fontSize: 18 },
  gapTitle: { fontSize: 13.5, fontWeight: "800", color: colors.ink },
  gapBody: { marginTop: 6, fontSize: 12.5, lineHeight: 20, color: colors.ink },
  gapBodyPlain: { fontSize: 12.5, lineHeight: 20, color: colors.ink2 },
  gapButton: { marginTop: 10, alignItems: "flex-start" },
  // 機会
  oppHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  oppTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  mid: { fontSize: 22, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  oppFoot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  // インサイト (kit .cmp, .minibars)
  headline: { marginTop: 8, fontSize: 14, lineHeight: 22, fontWeight: "800", color: colors.ink },
  cmp: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  cmpLabel: { width: 70, fontSize: 11.5, color: colors.ink3Text },
  cmpValue: { width: 40, textAlign: "right", fontSize: 11.5, fontWeight: "800", color: colors.ink, fontVariant: ["tabular-nums"] },
  minibars: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 54, marginTop: 10 },
  minibar: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.plum300 },
  minibarHi: { backgroundColor: colors.plum700 },
  // iOrbit の見立て
  aiBlock: { marginTop: 4, marginBottom: 8 },
  aiText: { fontSize: 13.5, lineHeight: 22, color: colors.ink },
  evidence: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  evidenceName: { fontSize: 12, fontWeight: "700", color: colors.accentText },
}));
