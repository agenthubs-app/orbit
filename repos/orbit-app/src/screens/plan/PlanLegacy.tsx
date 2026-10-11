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
import { Button, Chip, type ChipTone, Icon, RetryCard, Skeleton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import type { OrbitTranslator } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { legacyGroups, legacyStatus, type LegacyKind, type LegacyStatus } from "./plan-review-model";
import { dateParts } from "./plan-review-ui";
import { PlanFrame, usePlanStyles } from "./plan-ui";

const KIND_KEYS: Record<LegacyKind, "plan.legacy.kindAction" | "plan.legacy.kindNeed" | "plan.legacy.kindInfo" | "plan.legacy.kindEvent"> = {
  action: "plan.legacy.kindAction",
  event: "plan.legacy.kindEvent",
  info: "plan.legacy.kindInfo",
  network_need: "plan.legacy.kindNeed",
};
const STATUS: Record<LegacyStatus, { key: "plan.legacy.statusDone" | "plan.legacy.statusSkipped" | "plan.legacy.statusDismissed" | "plan.legacy.statusOpen"; tone: ChipTone }> = {
  dismissed: { key: "plan.legacy.statusDismissed", tone: "neutral" },
  done: { key: "plan.legacy.statusDone", tone: "ok" },
  open: { key: "plan.legacy.statusOpen", tone: "lav" },
  skipped: { key: "plan.legacy.statusSkipped", tone: "neutral" },
};

/** 「以前のプラン」 card(s) + 「新しいプランを作る」. */
export function PlanLegacyCard({ plans, onCreate }: { plans: readonly PlanLegacyItem[]; onCreate: () => void }) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const router = useRouter();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.page} testID="legacy-card">
      <View style={shared.card}>
        <View style={shared.row}>
          <Icon name="archive" size={20} color={colors.ink3Text} />
          <UiText accessibilityRole="header" style={[shared.title, shared.grow]}>{t("plan.legacy.title")}</UiText>
          <Chip label={t("plan.legacy.readOnly")} tone="neutral" />
        </View>
        <UiText style={shared.body2}>{t("plan.legacy.cardBody")}</UiText>
        {plans.map((plan) => (
          <UiPressable key={plan.planId} accessibilityRole="link" accessibilityLabel={t("plan.legacy.open", { goal: plan.goal })} onPress={() => router.push(planLegacyHref("app", plan.planId) as Href)} style={shared.softCard} testID="legacy-row">
            <View style={shared.row}>
              <UiText numberOfLines={2} style={[shared.title, shared.grow]}>{plan.goal}</UiText>
              <Icon name="right" size={16} color={colors.ink3Text} />
            </View>
            <UiText style={shared.caption}>{t("plan.legacy.started", dateParts(plan.startsOn))}</UiText>
            <View style={shared.wrap}>
              <Chip label={t("plan.legacy.steps", { done: plan.actionsDone, total: plan.actionsTotal })} tone="lav" />
              <Chip label={t("plan.legacy.needs", { count: plan.needs })} tone="neutral" />
            </View>
          </UiPressable>
        ))}
        <Button block icon="plus" label={t("plan.legacy.create")} onPress={onCreate} variant="primary" />
      </View>
    </View>
  );
}

type Load = { kind: "loading" } | { kind: "failed"; failure: PlanFailure } | { kind: "ready"; plan: PlanLegacyDetail };

export function PlanLegacyScreen({ planId }: { planId: string }) {
  const api = usePlanApi();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const shared = usePlanStyles().styles;
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
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
    <PlanFrame title={t("plan.legacy.title")} subtitle={load.kind === "ready" ? load.plan.goal : undefined} stage={null} onClose={close}>
      {load.kind === "loading" ? <Skeleton lines={6} /> : null}
      {load.kind === "failed" ? (
        <RetryCard
          title={load.failure.kind === "network" ? t("plan.flow.offlineTitle") : fillCopy(copy.error.loadFailed, { item: t("plan.legacy.title") })}
          {...(load.failure.kind === "network" ? {} : { message: t("plan.flow.loadFailedBody") })}
          onRetry={() => void read()}
        />
      ) : null}
      {load.kind === "ready" ? (
        <View style={styles.page} testID="legacy-detail">
          <View style={shared.card}>
            <View style={shared.row}>
              <UiText accessibilityRole="header" style={[shared.heading, shared.grow]}>{load.plan.goal}</UiText>
              <Chip label={t(load.plan.status === "active" ? "plan.legacy.active" : "plan.legacy.archived")} tone="neutral" />
            </View>
            <UiText style={shared.caption}>{t("plan.legacy.started", dateParts(load.plan.startsOn))}</UiText>
            {load.plan.archivedAt ? <UiText style={shared.caption}>{t("plan.legacy.ended", dateParts(load.plan.archivedAt))}</UiText> : null}
            <View style={shared.wrap}>
              <Chip label={t("plan.legacy.steps", { done: load.plan.actionsDone, total: load.plan.actionsTotal })} tone="lav" />
              <Chip label={t("plan.legacy.needs", { count: load.plan.needs })} tone="neutral" />
            </View>
            {load.plan.analysisSummary ? (
              <>
                <UiText style={shared.label}>{t("plan.legacy.summary")}</UiText>
                <UiText style={shared.body}>{load.plan.analysisSummary}</UiText>
              </>
            ) : null}
            <UiText style={shared.caption}>{t("plan.legacy.readOnlyNote")}</UiText>
          </View>
          {legacyGroups(load.plan.items).map((group) => (
            <View key={group.kind} style={shared.card} testID="legacy-group">
              <UiText accessibilityRole="header" style={shared.title}>{t(KIND_KEYS[group.kind])}</UiText>
              {group.items.map((item, index) => {
                const status = STATUS[legacyStatus(item.status)];
                return (
                  <View key={`${item.title}-${index}`} style={styles.item}>
                    <View style={shared.grow}>
                      <UiText style={shared.body}>{item.title}</UiText>
                      {item.phase ? <UiText style={shared.caption}>{legacyPhaseLabel(item.phase, t)}</UiText> : null}
                    </View>
                    <Chip label={t(status.key)} tone={status.tone} />
                  </View>
                );
              })}
            </View>
          ))}
          {load.plan.items.length === 0 ? <UiText style={shared.caption}>{t("plan.legacy.empty")}</UiText> : null}
        </View>
      ) : null}
    </PlanFrame>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
}));

/** 旧计划的阶段 id 是 p1 / p2…（模拟器走查：直接显示内部代号用户看不懂）→「阶段 1」；其他格式原样。 */
export function legacyPhaseLabel(phase: string, t: OrbitTranslator): string {
  const match = /^p(\d+)$/i.exec(phase.trim());
  return match ? t("plan.legacy.phase", { n: Number(match[1]) }) : phase;
}
