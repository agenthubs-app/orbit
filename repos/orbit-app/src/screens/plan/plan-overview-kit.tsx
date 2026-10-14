// R24 プラン概要 · 像素返工（RD-16）：app.html「Task · プラン 概要（進行中 46）」#23–#25 / 少量 #20–#22 的
// 卡片照 kit 源码搬（.gsw 目标行、.k-hero、確定した方案 .k-diag + .v22acts、今日のチャンス、.k-steps 时间线、
// .k-types 类型卡、.k-evs イベント）。数值见 plan-kit.tsx；每个数字仍来自 GET /api/agent/plans/v2/[planId]。
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanEventOption, PlanStepProgress, PlanV2Detail, PlanV2PersonType, PlanV2Step } from "../../api/contract/plan-v2";
import { unitPoints } from "../../api/compute/plan-allocation";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { cjkLift } from "../../components/ui/cjk-lift";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { closingStepNumbers, eventGatherTypeKeys, jaLatinGlue, stepChipsVisible } from "../../api/compute/plan-overview-labels";
import { goalKindLabel, PLAN_EVENT_EMOJI } from "./plan-model";
import { eventDay, KitRing } from "./plan-type-kit";
import { KitButton, KitCard, KitCardHead, KitChip, KitEmo, KitGradient, KitHatch, kitText, useKitStyles, useKitWhy, type KitTone } from "./plan-kit";

const TYPE_TONES = ["teal", "apricot", "pink", "lav", "blue"] as const;
export type TypeTone = (typeof TYPE_TONES)[number];
/** 类型的 mac 色按类型顺序轮换（同 Web overview-model typeTone）。 */
export const typeTone = (index: number): TypeTone => TYPE_TONES[((index % TYPE_TONES.length) + TYPE_TONES.length) % TYPE_TONES.length]!;

/** 得分里的基础分代表几人（或几次）：单位按顺序给（同 Web overview-model metCountOf）。 */
export function metCountOf(allocation: number, targetCount: number, earned: number, skipped = false): number {
  if (skipped) return targetCount;
  let sum = 0;
  let count = 0;
  for (const unit of unitPoints(allocation, targetCount)) {
    if (sum + unit > earned) break;
    sum += unit;
    count += 1;
  }
  return count;
}

function unitsOf(allocation: number, targetCount: number): { points: number; last: number | null } {
  const units = unitPoints(allocation, targetCount);
  const first = units[0] ?? 0;
  const last = units[units.length - 1] ?? 0;
  return { last: first === last ? null : last, points: first };
}

export type TypeCardView = { type: PlanV2PersonType; index: number; earned: number; overflow: number; met: number; candidates: number; events: number; routes: number; steps: number[] };

export function typeCards(plan: PlanV2Detail): TypeCardView[] {
  return plan.content.personTypes.map((type, index) => {
    const segment = plan.score.segments.find((entry) => entry.key === type.key);
    const stats = plan.typeStats?.find((entry) => entry.itemId === type.itemId);
    const earned = segment?.earned ?? 0;
    return {
      candidates: stats?.candidates ?? 0,
      earned,
      events: stats?.events ?? 0,
      index,
      met: metCountOf(type.allocation, type.targetCount, earned, type.skipped),
      overflow: segment?.overflow ?? 0,
      routes: stats?.introRoutes ?? type.introRoutes.length,
      steps: plan.content.steps.flatMap((step, n) => (step.personTypeKeys.includes(type.key) ? [n + 1] : [])),
      type,
    };
  });
}

/* ---------- 目标行 .gsw（「💰 シリーズA 資金調達（3億円）⌄」+「目標 1 / 2」） ---------- */

export function GoalRow({ plan, index, count, onOpen }: { plan: PlanV2Detail; index: number; count: number; onOpen: () => void }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const emoji = goalKindLabel(plan.goalKind, language)?.split(" ")[0] ?? "🎯";
  const text = `${emoji} ${plan.goal}`;
  return (
    <View style={styles.goalRow}>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.goals.open", { goal: plan.goal })} hitSlop={12} onPress={onOpen} style={styles.gsw} testID="goal-switcher-open">
        <UiText numberOfLines={1} style={[styles.gswText, cjkLift(text, 0, -0.5)]}>{`${emoji} `}<UiText style={styles.gswText}>{plan.goal}</UiText></UiText>
        <Icon name="down" size={16} color={colors.ink} />
      </UiPressable>
      {count > 0 ? <UiText style={styles.lbl}>{t("plan.goals.position", { count, index })}</UiText> : null}
    </View>
  );
}

/* ---------- スコア .k-hero ---------- */

export function HeroCard({ plan, score, onOpenType }: { plan: PlanV2Detail; score: ReactNode; onOpenType: (itemId: string) => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const s = plan.score;
  // Web ScoreCard（narrow）同一口径：0 分且今天开始 = 「今日つくったプラン」；否则「あと N で満点」/「満点に到達」+ 話して · スキップ。
  const fresh = s.total === 0 && plan.startsOn.slice(0, 10) === new Date().toISOString().slice(0, 10);
  return (
    <KitCard testID="score-head">
      <View style={styles.heroTop}>
        <View>
          <UiText style={kit.lbl}>{t("plan.overview.scoreLabel")}</UiText>
          <View style={styles.bigRow}>
            {score}
            {s.todayDelta !== 0 ? <KitChip tone={s.todayDelta > 0 ? "lav" : "neutral"} label={s.todayDelta > 0 ? t("plan.overview.today", { points: s.todayDelta }) : t("plan.overview.todayMinus", { points: Math.abs(s.todayDelta) })} style={styles.bigChip} /> : null}
          </View>
          <UiText style={kit.lbl}>{t("plan.overview.scoreOf")}</UiText>
        </View>
        <View style={styles.heroRight}>
          {fresh ? <KitChip tone="lav" label={t("plan.overview.createdToday")} style={styles.heroChip} /> : (
            <>
              <KitChip tone="lav" label={s.remainingToFull > 0 ? t("plan.overview.toFull", { points: s.remainingToFull }) : t("plan.overview.full")} style={styles.heroChip} />
              <UiText style={[kit.lbl, styles.heroBreak]}>{t("plan.overview.breakdown", { skipped: s.skipped, talked: s.talked })}</UiText>
            </>
          )}
        </View>
      </View>
      <ScoreBar plan={plan} onOpenType={onOpenType} />
      <View style={styles.v2lg}>
        <Legend kind="solid" label={t("plan.overview.legendTalked")} />
        <Legend kind="hatch" label={t("plan.overview.legendSkipped")} />
        {s.segments.some((segment) => segment.overflow > 0) ? <Legend kind="over" label={t("plan.overview.legendOverflow")} /> : null}
        <Legend kind="rest" label={t("plan.overview.legendRest")} />
      </View>
    </KitCard>
  );
}

/** kit V2.sbar（同 Web SegmentBar）：段宽 = 配点，实心 = 得分，斜纹 = 习熟，目标超过的半分在最后单独一段（玫红）+ 「満点 100」竖线。 */
function ScoreBar({ plan, onOpenType }: { plan: PlanV2Detail; onOpenType: (itemId: string) => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const byKey = new Map(plan.content.personTypes.map((type) => [type.key, type]));
  const bonus = plan.score.segments.reduce((sum, segment) => sum + Math.max(0, segment.overflow), 0);
  const scale = Math.max(100, 100 + bonus);
  return (
    <View style={styles.v2bar}>
      {plan.score.segments.map((segment) => {
        const type = byKey.get(segment.key);
        const earned = Math.min(segment.allocation, Math.max(0, segment.earned));
        const pieceStyle = [styles.sg, { flex: segment.allocation }];
        const fill = segment.skipped
          ? <KitHatch base={colors.plum100} line={colors.plum300} />
          : earned > 0 ? <View style={[styles.sgFill, { width: `${(earned / Math.max(1, segment.allocation)) * 100}%` }]} /> : null;
        const kind = segment.skipped ? "striped" : earned > 0 ? "solid" : "rest";
        const label = t("plan.overview.segmentA11y", { allocation: segment.allocation, earned: segment.earned + segment.overflow, label: type?.shortLabel ?? t("plan.event.title") });
        return type ? (
          <UiPressable key={segment.key} accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 14, bottom: 14 }} onPress={() => onOpenType(type.itemId)} style={pieceStyle} testID={`segment-${kind}`}>{fill}</UiPressable>
        ) : <View key={segment.key} accessible accessibilityLabel={label} style={pieceStyle} testID={`segment-${kind}`}>{fill}</View>;
      })}
      {bonus > 0 ? <View accessible accessibilityLabel={`+${bonus}`} style={[styles.sg, styles.bonus, { flex: bonus }]} testID="segment-overflow" /> : null}
      {bonus > 0 ? <View pointerEvents="none" style={[styles.m100, { left: `${(100 / scale) * 100}%` }]}><UiText style={styles.m100Text}>{t("plan.overview.fullMark")}</UiText></View> : null}
    </View>
  );
}

function Legend({ kind, label }: { kind: "solid" | "hatch" | "over" | "rest"; label: string }) {
  const { styles, colors } = useStyles();
  const bg = kind === "solid" ? colors.plum700 : kind === "over" ? colors.rose500 : colors.surface3;
  return (
    <View style={styles.lgItem}>
      <View style={[styles.v2sw, { backgroundColor: bg }]}>{kind === "hatch" ? <KitHatch base={colors.plum100} line={colors.plum300} /> : null}</View>
      <UiText style={styles.lgText}>{label}</UiText>
    </View>
  );
}

/* ---------- 確定した方案 .k-diag（结论一句 + 4 按钮 + 見直し说明 + iOrbit の会話を見る） ---------- */

export function DiagCard({ plan, busy, onPremise, onReview, onManual, onAchieve, onConversation, problem }: {
  plan: PlanV2Detail; busy: boolean; onPremise: () => void; onReview: () => void; onManual: () => void; onAchieve: () => void; onConversation: () => void; problem?: ReactNode;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const basis = [...plan.content.basis.map((item) => item.label), ...plan.content.allocationReasons].join(" · ");
  const why = useKitWhy(basis || null);
  const status = !plan.quota.manualEditAvailable
    ? t("plan.overview.statusManual")
    : plan.startsOn.slice(0, 10) === new Date().toISOString().slice(0, 10)
      ? t("plan.overview.statusToday")
      : t("plan.overview.statusDate", { date: new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(new Date(`${plan.startsOn.slice(0, 10)}T00:00:00`)) });
  return (
    <KitCard testID="plan-card">
      <View style={styles.diagHead}>
        <KitEmo emoji="🧭" tone="teal" sm />
        <UiText style={[styles.diagTitle, kit.grow]}>{t("plan.overview.planTitle")}</UiText>
        <KitChip label={status} />
        {why.button}
      </View>
      <UiText style={styles.diagText}>{plan.content.conclusion}</UiText>
      {why.body}
      <View style={styles.acts}>
        <KitButton icon="layers" label={t("plan.overview.premise")} onPress={onPremise} style={styles.act} />
        <KitButton icon="refresh" label={t("plan.overview.review")} badge={t("plan.overview.reviewBadge", { n: plan.quota.reviewMonthlyLimit })} onPress={onReview} style={styles.act} />
        <KitButton icon="edit" label={t("plan.overview.manualEdit")} onPress={onManual} disabled={busy || !plan.quota.manualEditAvailable} style={styles.act} />
        <KitButton icon="flag" label={t("plan.overview.achieve")} onPress={onAchieve} disabled={busy} style={styles.act} />
      </View>
      {!plan.quota.manualEditAvailable ? <UiText style={[kit.lbl, styles.note]}>{t("plan.overview.manualLocked")}</UiText> : null}
      <UiText style={[kit.lbl, styles.note]}>{t("plan.overview.reviewNote", { left: plan.quota.reviewLeftThisMonth, limit: plan.quota.reviewMonthlyLimit })}</UiText>
      {problem}
      <UiPressable accessibilityRole="link" accessibilityLabel={t("plan.overview.seeConversation")} hitSlop={10} onPress={onConversation} style={styles.v2go}>
        <UiText style={styles.v2goText}>{t("plan.overview.seeConversation")}</UiText>
        <Icon name="right" size={16} color={colors.ink2} />
      </UiPressable>
    </KitCard>
  );
}

/* ---------- 今日 +N のチャンス .k-today ---------- */

export function TodayCard({ plan, cards, onGo }: { plan: PlanV2Detail; cards: TypeCardView[]; onGo: () => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const chance = plan.todayChance;
  const why = useKitWhy(null);
  if (!chance) return null;
  const itemId = decodeURIComponent(chance.href.split("/types/")[1]?.split(/[?#]/)[0] ?? "");
  const card = cards.find((entry) => entry.type.itemId === itemId) ?? null;
  return (
    <View style={styles.today} testID="today-chance">
      <KitGradient id="plan-today" from={colors.macLav} to={colors.surface} stop={0.7} />
      <View style={styles.todayHead}>
        <KitEmo emoji="✨" tone="lav" sm />
        <UiText style={styles.diagTitle}>{chance.points > 0 ? t("plan.overview.chanceTitlePoints", { points: chance.points }) : t("plan.overview.chanceTitle")}</UiText>
        {why.button}
      </View>
      <UiText style={styles.todayText}>{chance.label}</UiText>
      <View style={styles.todayActs}>
        <KitButton sm primary label={t("plan.overview.chanceGo")} onPress={onGo} accessibilityLabel={t("plan.overview.chanceOpen", { label: chance.label })} />
        {card ? <KitChip label={t("plan.overview.chanceTag", { label: card.type.shortLabel, met: card.met, target: card.type.targetCount })} style={styles.todayTag} /> : null}
      </View>
    </View>
  );
}

/* ---------- ステップ .k-steps（.v2step 时间线 + .v22mey 目安 + 类型 chips） ---------- */

function stepChip(progress: PlanStepProgress | undefined, done: boolean, t: ReturnType<typeof useOrbitLocale>["t"]): { label: string; tone: KitTone } | null {
  if (!progress) return null;
  const parts = progress.parts ?? [];
  if (parts.length && parts.every((part) => part.skipped)) return { label: t("plan.step.known"), tone: "neutral" };
  const part = parts.find((item) => !item.skipped && item.done < item.total) ?? parts.find((item) => !item.skipped);
  const tone = (d: number, total: number): KitTone => (total > 0 && d >= total ? "teal" : d > 0 ? "lav" : "neutral");
  if (part) return { label: t(part.unit === "events" ? "plan.step.partEvents" : "plan.step.partPeople", { done: part.done, label: part.shortLabel, total: part.total }), tone: tone(part.done, part.total) };
  if (progress.total > 0) return { label: progress.label, tone: tone(progress.done, progress.total) };
  return done ? null : { label: t("plan.step.notStarted"), tone: "neutral" };
}

export function StepsCard({ plan, cards, onOpenType, onDoneMark, suggestion }: {
  plan: PlanV2Detail; cards: TypeCardView[]; onOpenType: (itemId: string) => void; onDoneMark: (step: PlanV2Step, n: number) => void; suggestion?: (step: PlanV2Step) => ReactNode;
}) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const progress = new Map((plan.stepProgress ?? []).map((item) => [item.stepKey, item]));
  const byKey = new Map(cards.map((card) => [card.type.key, card]));
  const steps = plan.content.steps;
  const chips = stepChipsVisible(plan.score.total, steps);
  return (
    <KitCard>
      <KitCardHead title={t("plan.step.title")} right={t("plan.step.note")} />
      {steps.map((step, index) => (
        <StepItem key={step.key} n={index + 1} last={index === steps.length - 1} step={step} chip={chips ? stepChip(progress.get(step.key), Boolean(step.completedAt), t) : null}
          types={step.personTypeKeys.flatMap((key) => (byKey.get(key) ? [byKey.get(key)!] : []))} hasEvent={step.personTypeKeys.includes("event")} closing={closingStepNumbers(steps, index, "event")}
          onOpenType={onOpenType} onDoneMark={() => onDoneMark(step, index + 1)} extra={suggestion?.(step)} kit={kit} styles={styles} />
      ))}
    </KitCard>
  );
}

function StepItem({ n, last, step, chip, types, hasEvent, closing, onOpenType, onDoneMark, extra, kit, styles }: {
  n: number; last: boolean; step: PlanV2Step; chip: { label: string; tone: KitTone } | null; types: TypeCardView[]; hasEvent: boolean; closing: number[];
  onOpenType: (itemId: string) => void; onDoneMark: () => void; extra?: ReactNode; kit: ReturnType<typeof useKitStyles>["styles"]; styles: ReturnType<typeof useStyles>["styles"];
}) {
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  const why = useKitWhy(step.why ?? null);
  const done = Boolean(step.completedAt);
  return (
    <View style={[styles.v2step, n > 1 && styles.v2stepNext]} testID="plan-step">
      {!last ? <View style={styles.v2line} /> : null}
      {done ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.step.done", { number: n })} hitSlop={8} onPress={onDoneMark} style={[styles.sn, styles.snDone]}><UiText style={styles.snText}>✓</UiText></UiPressable>
      ) : <View style={styles.sn}><UiText style={styles.snText}>{String(n)}</UiText></View>}
      <View style={styles.st}>
        <UiText style={[styles.stText, kit.grow]}>{step.title}</UiText>
        {why.button}
      </View>
      {why.body}
      <View style={styles.mey}>
        <Icon name="flag" size={16} color={colors.plum700} />
        <View style={kit.grow}>
          <UiText style={styles.meySmall}>{t("plan.step.criteria")}</UiText>
          <UiText style={styles.meyText}>{step.doneCriteria}</UiText>
        </View>
        {chip ? <KitChip label={chip.label} tone={chip.tone} /> : null}
      </View>
      {extra}
      {types.length || hasEvent ? (
        <View style={styles.stepChips}>
          {types.map((card) => (
            <UiPressable key={card.type.key} accessibilityRole="link" accessibilityLabel={t("plan.types.open", { label: card.type.shortLabel })} hitSlop={6} onPress={() => onOpenType(card.type.itemId)}>
              <KitChip label={`${card.type.emoji} ${card.type.shortLabel}`} tone={typeTone(card.index)} />
            </UiPressable>
          ))}
          {hasEvent ? <KitChip label={`${PLAN_EVENT_EMOJI} ${t("plan.event.title")}`} /> : null}
        </View>
      ) : <UiText style={[kit.lbl, styles.stepLbl]}>{closing.length ? t("plan.step.noNewPeopleClosing", { steps: closing.join("・") }) : t("plan.step.noNewPeople")}</UiText>}
    </View>
  );
}

/* ---------- 話すべき人のタイプ .k-types（.v22tc） ---------- */

export function TypesCard({ plan, cards, onOpenType }: { plan: PlanV2Detail; cards: TypeCardView[]; onOpenType: (itemId: string) => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const kind = goalKindLabel(plan.goalKind, language)?.replace(/^\S+\s+/u, "") ?? null;
  const reasons = plan.content.allocationReasons;
  const why = useKitWhy(reasons.length ? reasons.join(" · ") : null);
  const note = !kind ? t("plan.types.noteRole")
    : reasons.length === 0 && plan.quota.manualEditAvailable ? t("plan.types.templateKept", { kind })
      : t(plan.quota.manualEditAvailable ? "plan.types.templateAdjusted" : "plan.types.templateManual", { count: reasons.length, kind });
  return (
    <KitCard>
      <KitCardHead title={t("plan.types.title")} right={why.button} style={styles.typesHead} />
      <UiText style={[kit.lbl, styles.typesNote]}>{note}</UiText>
      {why.body ? <View style={styles.typesWhy}>{why.body}</View> : null}
      {cards.map((card, index) => <TypeCard key={card.type.itemId} card={card} first={index === 0} onOpen={() => onOpenType(card.type.itemId)} />)}
    </KitCard>
  );
}

function TypeCard({ card, first, onOpen }: { card: TypeCardView; first: boolean; onOpen: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const { type } = card;
  const steps = card.steps.join(t("plan.types.stepSeparator"));
  const units = unitsOf(type.allocation, type.targetCount);
  const unitText = units.last === null ? t("plan.types.unitsEven", { points: units.points }) : t("plan.types.unitsLast", { last: units.last, points: units.points });
  const cell = (value: number, label: string, people: boolean, zero: boolean) => (
    <View accessible accessibilityLabel={`${label} ${people ? t("plan.types.count", { count: value }) : String(value)}`} style={styles.m3cell}>
      <UiText style={[styles.m3b, zero && styles.m3z]}>{String(value)}{people ? <UiText style={styles.m3small}>{t("plan.types.cellPeople")}</UiText> : null}</UiText>
      <UiText numberOfLines={1} style={styles.m3span}>{label}</UiText>
    </View>
  );
  const fill = Math.min(100, (card.earned / Math.max(1, type.allocation)) * 100);
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.types.open", { label: type.shortLabel })} onPress={onOpen} style={[styles.tc, !first && styles.tcNext]} testID="type-card">
      <View style={styles.tcHead}>
        <KitEmo emoji={type.emoji} tone={typeTone(card.index)} sm />
        <View style={kit.grow}>
          <UiText numberOfLines={1} style={styles.tk}>{steps ? t("plan.types.keyStep", { label: type.shortLabel, steps }) : type.shortLabel}</UiText>
          <UiText style={styles.tn}>{type.roleSituation}</UiText>
        </View>
        <UiText style={styles.pp}>{String(card.earned + card.overflow)}<UiText style={styles.ppSmall}>{` / ${type.allocation}`}</UiText></UiText>
      </View>
      <View style={styles.m3}>
        {cell(card.candidates, card.candidates === 0 ? t("plan.types.notInNetwork") : t("plan.types.candidates"), true, card.candidates === 0)}
        {cell(card.events, t("plan.types.events"), false, card.events === 0)}
        {cell(card.routes, t("plan.types.routes"), false, card.routes === 0)}
      </View>
      <View style={styles.tf}>
        <UiText style={kit.lbl}>{type.skipped ? t("plan.types.skippedFull") : t("plan.types.progress", { met: card.met, target: type.targetCount, units: unitText })}</UiText>
        <View style={styles.mb}>
          {type.skipped ? <KitHatch base={colors.plum100} line={colors.plum300} /> : <View style={[styles.mbFill, { width: `${fill}%` }]} />}
        </View>
      </View>
    </UiPressable>
  );
}

/* ---------- イベント .k-evs ---------- */

export function EventsCard({ plan, onOpenEvent }: { plan: PlanV2Detail; onOpenEvent?: (event: PlanEventOption) => void }) {
  const { styles } = useStyles();
  const { colors } = useOrbitTheme();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const event = plan.content.event;
  if (event.allocation <= 0) return null;
  const labels = new Map(plan.content.personTypes.map((type) => [type.key, type.shortLabel]));
  const names = eventGatherTypeKeys(plan.content.personTypes).map((key) => labels.get(key) ?? key);
  const joined = language === "ja" ? jaLatinGlue(names.flatMap((name, k) => (k ? [t("plan.event.gatherJoin"), name] : [name]))) : names.join(t("plan.event.gatherJoin"));
  const gather = names.length ? (language === "ja" ? jaLatinGlue([joined, t("plan.event.gather", { types: "" })]) : t("plan.event.gather", { types: joined })) : "";
  // 「今夜 19:00」：当天 17 点后的活动（同 Web RecommendedEvents）。
  const when = (iso: string) => {
    const start = new Date(iso);
    if (start.toDateString() === new Date().toDateString() && start.getHours() >= 17) return t("plan.event.tonight", { time: `${start.getHours()}:${String(start.getMinutes()).padStart(2, "0")}` });
    return eventDay(iso, language);
  };
  const segment = plan.score.segments.find((entry) => entry.key === "event");
  const earned = segment?.earned ?? 0;
  const count = metCountOf(event.allocation, event.targetCount, earned);
  const unit = unitsOf(event.allocation, event.targetCount).points;
  const fill = Math.min(100, (earned / Math.max(1, event.allocation)) * 100);
  return (
    <KitCard testID="event-card">
      <View style={[kit.cardH, styles.evHead]}>
        <View style={styles.evTitle}>
          <KitEmo emoji={PLAN_EVENT_EMOJI} tone="apricot" sm />
          <UiText accessibilityRole="header" style={kit.h3}>{t("plan.event.title")}</UiText>
        </View>
        <UiText style={styles.pp}>{String(earned + (segment?.overflow ?? 0))}<UiText style={styles.ppSmall}>{` / ${event.allocation}`}</UiText></UiText>
      </View>
      <UiText style={kit.lbl}>{[gather, t("plan.event.rule", { count, target: event.targetCount, unit })].filter(Boolean).join(" · ")}</UiText>
      <View style={[styles.mb, styles.evBar]}><View style={[styles.mbFill, { width: `${fill}%` }]} /></View>
      {/* R26（D53）：推荐活动（app.html V2.evCard22 · EVREC 3 行，按规则分降序）。 */}
      {(plan.recommendedEvents ?? []).slice(0, 3).map((item, index) => (
        <UiPressable key={item.eventId} accessibilityRole="button" accessibilityLabel={t("plan.type.eventScoreA11y", { score: item.score.total, title: item.title })} disabled={!onOpenEvent} onPress={() => onOpenEvent?.(item)} pressedScale={0.99} style={[styles.evRow, index > 0 && styles.evRowNext]} testID="plan-recommended-event">
          <KitRing size={42} score={item.score.total} color={item.score.total >= 70 ? colors.plum700 : item.score.total >= 50 ? colors.plum500 : colors.rose500} />
          <View style={kit.grow}>
            <UiText numberOfLines={1} style={styles.evRowTitle}>{item.title}</UiText>
            <UiText numberOfLines={1} style={kit.lbl}>{[when(item.startsAt), item.venue].filter(Boolean).join("· ")}</UiText>
            {item.fitLabel ? <KitChip label={item.fitLabel} tone="lav" style={styles.evRowChip} /> : null}
          </View>
        </UiPressable>
      ))}
    </KitCard>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  lbl: { color: colors.ink3, ...kitText(11.5, "500") },
  // kit：.tswipe 下 12 → 目标行（margin 0 2 2）→ 卡片紧跟（只有 card + card 才隔 --gap 14）。父级 gap 14，这里 −12 回到 2。
  goalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: -12 },
  gsw: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  gswText: { color: colors.ink, ...kitText(13, "800"), flexShrink: 1 },

  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  bigRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bigChip: { alignSelf: "center" },
  bonus: { backgroundColor: colors.rose500 },
  m100: { position: "absolute", top: -5, bottom: -5, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: colors.ink2, zIndex: 2, alignItems: "center", overflow: "visible" },
  m100Text: { position: "absolute", top: -16, width: 60, textAlign: "center", color: colors.ink2, ...kitText(9.5, "800") },
  heroRight: { alignItems: "flex-end" },
  heroChip: { alignSelf: "flex-end" },
  heroBreak: { marginTop: 6, textAlign: "right" },
  v2bar: { flexDirection: "row", gap: 3, height: 14, marginTop: 18 },
  sg: { borderRadius: 5, backgroundColor: colors.surface3, overflow: "hidden", minWidth: 6 },
  sgFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.plum700 },
  v2lg: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6, marginTop: 12 },
  lgItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  lgText: { color: colors.ink2, ...kitText(11, "600") },
  v2sw: { width: 14, height: 9, borderRadius: 3, overflow: "hidden" },

  diagHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  diagTitle: { color: colors.ink, ...kitText(13, "800") },
  diagText: { color: colors.ink, ...kitText(13.5, "700", 1.6), marginTop: 8 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  act: { width: "48.5%", flexGrow: 1, flexBasis: "40%", paddingHorizontal: 6, gap: 4 },
  note: { marginTop: 8 },
  v2go: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, alignSelf: "flex-start" },
  v2goText: { color: colors.ink2, ...kitText(12, "700") },

  today: { borderRadius: 24, padding: 18, overflow: "hidden", backgroundColor: colors.surface },
  todayHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  todayText: { color: colors.ink, ...kitText(14.5, "700", 1.55) },
  todayActs: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  todayTag: { marginLeft: "auto" },

  v2step: { position: "relative", paddingLeft: 40 },
  v2stepNext: { marginTop: 16 },
  v2line: { position: "absolute", left: 13, top: 32, bottom: -16, width: 2, borderRadius: 1, backgroundColor: colors.surface3 },
  sn: { position: "absolute", left: 0, top: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  snDone: { backgroundColor: colors.ok },
  snText: { color: colors.bg, ...kitText(12.5, "800") },
  st: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingTop: 4 },
  stText: { color: colors.ink, ...kitText(14.5, "800", 1.4) },
  mey: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.surface2 },
  meySmall: { color: colors.ink3, ...kitText(10.5, "700", 1.55) },
  meyText: { color: colors.ink, ...kitText(12.5, "400", 1.55) },
  stepChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  stepLbl: { marginTop: 8 },

  typesHead: { marginBottom: 4 },
  typesNote: { marginBottom: 10 },
  typesWhy: { marginTop: -10, marginBottom: 10 },
  tc: { backgroundColor: colors.surface2, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, minWidth: 0 },
  tcNext: { marginTop: 8 },
  tcHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tk: { color: colors.ink3, ...kitText(10.5, "800", 1.5, 0.04) },
  tn: { color: colors.ink, ...kitText(13.5, "800", 1.5) },
  pp: { color: colors.ink, ...kitText(15, "800") },
  ppSmall: { color: colors.ink3, ...kitText(11, "700") },
  m3: { flexDirection: "row", gap: 6, marginTop: 10 },
  m3cell: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 },
  m3b: { color: colors.ink, ...kitText(17, "800", 1.2) },
  m3z: { color: colors.ink4 },
  m3small: { color: colors.ink3, ...kitText(10.5, "700", 1.2) },
  m3span: { color: colors.ink3, ...kitText(10.5, "600") },
  tf: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },
  mb: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden", flexDirection: "row" },
  mbFill: { height: "100%", backgroundColor: colors.plum700 },

  evHead: { marginBottom: 2 },
  evTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  evBar: { flex: 0, marginTop: 4 },
  evRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  evRowNext: { borderTopWidth: 1, borderTopColor: colors.line },
  evRowTitle: { color: colors.ink, ...kitText(13, "700") },
  evRowChip: { marginTop: 4, alignSelf: "flex-start" },
}));
