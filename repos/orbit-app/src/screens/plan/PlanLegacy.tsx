// R25 以前のプラン (v1, read only). The card replaces the v1 branch of Task › プラン for
// people with a v1 plan and no v2 goal: goal, start date, Step progress and 会いたい人,
// plus 「新しいプランを作る」 (→ 目標入力). The page (App `/plans/legacy/<planId>`)
// shows the goal, the analysis summary and the items grouped by kind with their
// state — no edit, no re-analysis (v1 creation is closed; PLAN_V1_RETIRED).
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanLegacyDetail, PlanLegacyItem } from "../../api/contract/plan-v2";
import { planLegacyHref, planTaskSegmentHref } from "../../api/compute/plan-href";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { AppScreen } from "../../components/AppScreen";
import { Avatar, Icon, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { avatarTone, initials } from "../../components/ui/Avatar";
import { createThemedStyles } from "../../design/theme";
import type { OrbitTranslator } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { legacyGroups, legacyStatus, type LegacyKind, type LegacyStatus } from "./plan-review-model";
import { dateParts } from "./plan-review-ui";
import { KitButton, KitCard, KitChip, KitEmo, KitGradient, kitText, useKitStyles, type KitTone } from "./plan-kit";

const KIND_KEYS: Record<LegacyKind, "plan.legacy.kindAction" | "plan.legacy.kindNeed" | "plan.legacy.kindInfo" | "plan.legacy.kindEvent"> = {
  action: "plan.legacy.kindAction",
  event: "plan.legacy.kindEvent",
  info: "plan.legacy.kindInfo",
  network_need: "plan.legacy.kindNeed",
};
const STATUS: Record<LegacyStatus, { key: "plan.legacy.statusDone" | "plan.legacy.statusSkipped" | "plan.legacy.statusDismissed" | "plan.legacy.statusOpen"; tone: KitTone }> = {
  dismissed: { key: "plan.legacy.statusDismissed", tone: "neutral" },
  done: { key: "plan.legacy.statusDone", tone: "teal" },
  open: { key: "plan.legacy.statusOpen", tone: "neutral" },
  skipped: { key: "plan.legacy.statusSkipped", tone: "neutral" },
};

/** 「以前のプラン」 card(s) + 「新しいプランを作る」（b12 A-R25-15 .k-alg）。 */
export function PlanLegacyCard({ plans, onCreate }: { plans: readonly PlanLegacyItem[]; onCreate: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const router = useRouter();
  const { t, language } = useOrbitLocale();
  return (
    <View style={styles.page} testID="legacy-card">
      {plans.map((plan) => (
        <KitCard key={plan.planId} testID="legacy-row">
          <View style={styles.chips}>
            <KitChip label={t("plan.legacy.title")} />
            <KitChip label={t("plan.legacy.viewOnly")} />
            <KitChip label={t(plan.status === "active" ? "plan.legacy.active" : "plan.legacy.archived")} tone={plan.status === "active" ? "teal" : "neutral"} style={styles.chipRight} />
          </View>
          <UiText accessibilityRole="header" style={styles.goal}>{plan.goal}</UiText>
          <UiText style={kit.lbl}>{[t("plan.legacy.startedV2", { date: longDay(plan.startsOn, language) }), plan.phase ? t("plan.legacy.phase", { n: plan.phase.number }) : null].filter(Boolean).join(" · ")}</UiText>
          <View style={styles.grid2}>
            <View style={styles.cell}>
              <View style={styles.between}><UiText style={kit.lbl}>{t("plan.legacy.stepLabel")}</UiText><UiText style={styles.num}>{`${plan.actionsDone} / ${plan.actionsTotal}`}</UiText></View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${plan.actionsTotal ? (plan.actionsDone / plan.actionsTotal) * 100 : 0}%` }]}>
                  <KitGradient id="legacy-bar" from={colors.plum300} to={colors.plum700} />
                </View>
                <View style={[styles.barDot, { left: `${plan.actionsTotal ? (plan.actionsDone / plan.actionsTotal) * 100 : 0}%` }]} />
              </View>
            </View>
            <View style={styles.cell}>
              <View style={styles.between}><UiText style={kit.lbl}>{t("plan.legacy.kindNeed")}</UiText><UiText style={styles.num}>{String(plan.needs)}</UiText></View>
              {/* b12 画板 286 .v2avs：会いたい人对上的联系人（契约 needNames，≤4）。 */}
              {plan.needNames?.length ? <NeedAvatars names={plan.needNames} /> : null}
            </View>
          </View>
          <UiText style={styles.sub}>{t("plan.legacy.cardBodyV2")}</UiText>
          <UiPressable accessibilityRole="link" accessibilityLabel={t("plan.legacy.open", { goal: plan.goal })} onPress={() => router.push(planLegacyHref("app", plan.planId) as Href)} style={styles.open}>
            <UiText style={styles.openText}>{t("plan.legacy.details")}</UiText>
            <Icon name="right" size={16} color={colors.ink} />
          </UiPressable>
        </KitCard>
      ))}
      <KitButton xl primary icon="sparkle" label={t("plan.legacy.create")} onPress={onCreate} style={styles.create} testID="legacy-create" />
      <UiText style={[kit.lbl, styles.center]}>{t("plan.legacy.newNote")}</UiText>
    </View>
  );
}

function longDay(day: string, language: string): string {
  return new Date(`${day.slice(0, 10)}T00:00:00+09:00`).toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "long", timeZone: "Asia/Tokyo", year: "numeric" });
}

type Load = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready"; plan: PlanLegacyDetail };

export function PlanLegacyScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const read = useCallback(async () => {
    const result = await api.legacyDetail(planId);
    setLoad(result.ok ? { kind: "ready", plan: result.data } : { failure: result.failure, kind: "failed" });
  }, [api, planId]);

  useEffect(() => {
    if (!auth.ready || !server.ready) return;
    void read();
  }, [auth.ready, read, server.ready]);

  const close = () => (router.canGoBack() ? router.back() : openMainTab(router, planTaskSegmentHref("app")));

  return (
    <View style={styles.fill}>
    <AppScreen title={t("plan.legacy.title")} subtitle={t("plan.legacy.viewOnly")} onBack={close}>
      {load.kind === "loading" ? <Skeleton lines={6} /> : null}
      {load.kind === "failed" ? (
        <RetryCard
          title={load.failure.kind === "network" ? t("plan.flow.offlineTitle") : fillCopy(copy.error.loadFailed, { item: t("plan.legacy.title") })}
          {...(load.failure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })}
          onRetry={() => void read()}
        />
      ) : null}
      {load.kind === "ready" ? (
        <View style={styles.detail} testID="legacy-detail">
          <KitCard>
            <View style={styles.chips}>
              <KitChip label={t("plan.legacy.viewOnly")} />
              <KitChip label={t(load.plan.status === "active" ? "plan.legacy.active" : "plan.legacy.archived")} tone={load.plan.status === "active" ? "teal" : "neutral"} />
            </View>
            <UiText accessibilityRole="header" style={[styles.goal, styles.goalDetail]}>{load.plan.goal}</UiText>
            <UiText style={kit.lbl}>{[t("plan.legacy.startedV2", { date: longDay(load.plan.startsOn, language) }), t("plan.legacy.steps", { done: load.plan.actionsDone, total: load.plan.actionsTotal }), load.plan.archivedAt ? t("plan.legacy.ended", dateParts(load.plan.archivedAt)) : null].filter(Boolean).join(" · ")}</UiText>
            {load.plan.analysisSummary ? (
              <>
                <UiText style={[kit.lbl, styles.summaryLabel]}>{t("plan.legacy.summary")}</UiText>
                <UiText style={styles.summary}>{load.plan.analysisSummary}</UiText>
              </>
            ) : null}
          </KitCard>
          <View style={styles.note}><UiText style={styles.noteText}>{t("plan.legacy.readOnlyNoteV2")}</UiText></View>
          {legacyGroups(load.plan.items).map((group) => {
            const phaseOf = (item: PlanLegacyDetail["items"][number]) => (item.phaseNumber != null ? t("plan.legacy.phase", { n: item.phaseNumber }) : item.phase ? legacyPhaseLabel(item.phase, t) : null);
            const phases = group.kind === "action" ? [...new Set(group.items.map(phaseOf))] : [null];
            return (
              <KitCard key={group.kind} testID="legacy-group">
                <View style={styles.groupHead}>
                  <KitEmo emoji={group.kind === "action" ? "✅" : group.kind === "network_need" ? "👥" : group.kind === "event" ? "🎟️" : "📄"} tone={group.kind === "network_need" ? "lav" : "teal"} sm />
                  <UiText accessibilityRole="header" style={kit.h3}>{t(KIND_KEYS[group.kind])}</UiText>
                </View>
                {phases.map((phase) => (
                  <View key={String(phase)} style={phase === null ? styles.noPhase : undefined}>
                    {phase !== null ? <UiText style={[kit.lbl, styles.phase]}>{phase}</UiText> : null}
                    {group.items.filter((item) => group.kind !== "action" || phaseOf(item) === phase).map((item, index) => {
                      const status = STATUS[legacyStatus(item.status)];
                      return (
                        <View key={`${item.title}-${index}`} style={styles.li}>
                          {index > 0 ? <View style={styles.liSep} /> : null}
                          {group.kind === "network_need" ? (item.contactName ? <Avatar name={item.contactName} size="sm" /> : <View style={styles.unknown}><UiText style={styles.unknownText}>?</UiText></View>) : null}
                          <View style={kit.grow}>
                            <UiText style={styles.liTitle}>{group.kind === "network_need" && item.contactName ? item.contactName : item.title}</UiText>
                            {group.kind === "network_need" ? <UiText style={styles.liSub}>{item.contactName ? [item.organization, item.title].filter(Boolean).join(" · ") : t("plan.legacy.notInNetwork")}</UiText> : null}
                          </View>
                          <KitChip label={t(status.key)} tone={status.tone} style={styles.liChip} />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </KitCard>
            );
          })}
          {load.plan.items.length === 0 ? <UiText style={kit.lbl}>{t("plan.legacy.empty")}</UiText> : null}
        </View>
      ) : null}
    </AppScreen>
    </View>
  );
}

function NeedAvatars({ names }: { names: readonly string[] }) {
  const { styles, colors } = useStyles();
  const tones = { apricot: [colors.macApricot, colors.macApricotText], blue: [colors.macBlue, colors.macBlueText], lav: [colors.macLav, colors.macLavText], pink: [colors.macPink, colors.macPinkText], teal: [colors.macTeal, colors.macTealText] } as const;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={names.join("、")} style={styles.needAvs}>
      {names.slice(0, 4).map((name, index) => {
        const [background, ink] = tones[avatarTone(name)];
        return <View key={`${name}-${index}`} style={[styles.needAv, { backgroundColor: background }, index > 0 ? { marginLeft: -8 } : null]}><UiText maxFontSizeMultiplier={1} style={[styles.needAvText, { color: ink }]}>{initials(name)}</UiText></View>;
      })}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  fill: { flex: 1 },
  // AppScreen 内容区多 12 上边距、左右 16（kit 18）：同计划其他页先在页内抵消。
  page: { marginTop: -12, marginHorizontal: 2 },
  // .v2avs .av.sm：30（含 2px surface 边，border-box）、相互压 8。
  needAvs: { flexDirection: "row", marginTop: 6 },
  needAv: { alignItems: "center", borderColor: colors.surface, borderRadius: 15, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
  needAvText: { ...kitText(11.5, "800", 1.2) },
  detail: { gap: 14, marginTop: -12, marginHorizontal: 2 },
  chips: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipRight: { marginLeft: "auto" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goal: { color: colors.ink, ...kitText(17, "800", 1.4), marginTop: 12 },
  goalDetail: { marginTop: 10 },
  grid2: { flexDirection: "row", gap: 10, marginTop: 14 },
  cell: { flex: 1, minWidth: 0 },
  num: { color: colors.ink, ...kitText(14, "700") },
  // kit .bar（margin 8 0 4）：6 高、plum-300→700 渐变、末端 14 圆钮（白底、3px plum-700 边）。
  bar: { height: 6, borderRadius: 6, backgroundColor: colors.surface3, marginTop: 8, marginBottom: 4, justifyContent: "center" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6, overflow: "hidden" },
  barDot: { position: "absolute", width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.plum700 },
  sub: { color: colors.ink2, ...kitText(12.5, "400", 1.6), marginTop: 14 },
  open: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 999, backgroundColor: colors.surface2, marginTop: 12 },
  openText: { color: colors.ink, ...kitText(13, "700") },
  create: { height: 50, marginTop: 4 },
  center: { textAlign: "center", marginTop: 8 },
  summaryLabel: { marginTop: 12, fontWeight: "800" },
  summary: { color: colors.ink2, ...kitText(12.5, "400", 1.65), marginTop: 2 },
  note: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  noteText: { color: colors.ink2, ...kitText(12, "400", 1.6) },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  phase: { marginTop: 8, fontWeight: "800" },
  // 没有フェーズ标签的组（会いたい人 等）：第一行离组标题同样 12（标签的 8 + 卡片 gap 4）。
  noPhase: { marginTop: 8 },
  li: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }, // kit .li gap 12
  liChip: { alignSelf: "center" },
  // kit `.li + .li::before`：分隔线从左 50 起（有没有头像都一样）。
  liSep: { position: "absolute", top: 0, left: 50, right: 0, height: 1, backgroundColor: colors.line },
  liTitle: { color: colors.ink, ...kitText(13, "700") },
  liSub: { color: colors.ink3, ...kitText(12, "400") }, // kit .li .meta span
  unknown: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  unknownText: { color: colors.ink3, ...kitText(11.5, "800") },
}));

/** 旧计划的阶段 id 是 p1 / p2…（模拟器走查：直接显示内部代号用户看不懂）→「阶段 1」；其他格式原样。 */
export function legacyPhaseLabel(phase: string, t: OrbitTranslator): string {
  const match = /^p(\d+)$/i.exec(phase.trim());
  return match ? t("plan.legacy.phase", { n: Number(match[1]) }) : phase;
}
