// R24 人物タイプ詳細 · 像素返工（RD-16）：b4「① 人脈にいる · VC」#4、「② 人脈にいない · CVC」#7、
// 「③ スキップ」#9 / #10 与 app.html #27 的卡片照 kit 源码搬（.k-thead 头卡 + .v22m3、.v22cand 候补、
// なぜこの人か、.v22qn 聞くこと、.v22rule 話せたの判定、.v22sig 見分け方、.v22route 紹介ルート、
// .v22ev 会える活動、.kv 人物像、.quote 開口一番、.foot 选择底栏）。数值见 plan-kit.tsx。
// 每个数字仍来自 GET /api/agent/plans/v2/[planId]/types/[itemId]。
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlanCandidateView, PlanEventOption, PlanIntroRouteView, PlanPersonTypeDetail, PlanTalkedView } from "../../api/contract/plan-v2";
import { unitPoints } from "../../api/compute/plan-allocation";
import { Avatar, Checkbox, Icon, UiPressable, UiText } from "../../components/ui";
import Svg, { Circle } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { KitButton, KitCard, KitCardHead, KitChip, KitEmo, KitGradient, KitHatch, KitSampleTag, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import type { TypeTone } from "./plan-overview-kit";

type T = ReturnType<typeof useOrbitLocale>["t"];

/** 「ラベル：値」 lines (persona, recognize hints) become label / value rows; other text stays one line (same as Web). */
export function labelledLines(text: string): { label: string | null; value: string }[] {
  return text.split(/\n+/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^([^：:]{1,10})[：:]\s*(.+)$/u.exec(line);
    return match ? { label: match[1]!, value: match[2]! } : { label: null, value: line };
  });
}

/** Candidates first when there is a list to choose from (b4 #4 / app #27); one or none → why and questions first (b4 #9 / #10). */
export const candidatesFirst = (detail: Pick<PlanPersonTypeDetail, "candidates" | "skipped">) => !detail.skipped && detail.candidates.length > 1;

/* ---------- 人脈にまだいません（.card.flat） ---------- */

export function NoneBanner() {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <View accessible style={styles.flat} testID="type-none">
      <View style={styles.flatRow}>
        <KitEmo emoji="🔭" tone="blue" sm />
        <View style={kit.grow}>
          <UiText style={styles.b135}>{t("plan.type.notInNetwork")}</UiText>
          <UiText style={kit.lbl}>{t("plan.type.notInNetworkBody")}</UiText>
        </View>
      </View>
    </View>
  );
}

/* ---------- 头卡 .k-thead ---------- */

export function TypeHeadCard({ detail, tone, kicker, events, busy, onUnskip }: {
  detail: PlanPersonTypeDetail;
  tone: TypeTone;
  kicker: string;
  events: number;
  busy: boolean;
  onUnskip: () => void;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  const units = unitPoints(detail.allocation, detail.targetCount);
  const unit = units[0] ?? 0;
  const candidates = detail.candidates.length;
  const routes = detail.introRoutes.length;
  const points = detail.earned + detail.overflow;
  const fill = detail.skipped ? 100 : (Math.min(detail.allocation, detail.earned) / Math.max(1, detail.allocation)) * 100;
  const scoreText = detail.skipped
    ? t("plan.type.scoreSkippedUnit", { allocation: detail.allocation, unit })
    : t("plan.type.scoreOf", { allocation: detail.allocation, met: detail.metCount, target: detail.targetCount, unit });
  return (
    <KitCard testID="type-head">
      <View style={styles.headRow}>
        <KitEmo emoji={detail.emoji} tone={tone} />
        <View style={kit.grow}>
          <UiText numberOfLines={1} style={styles.tk}>{kicker}</UiText>
          <UiText accessibilityRole="header" style={styles.tn}>{detail.roleSituation}</UiText>
        </View>
        {detail.skipped ? <KitChip label={t("plan.type.skippedChip")} /> : null}
        {/* 示例标不占标题宽度（标题折行与画板一致）；スキップ済み chip 在时并排。 */}
        {detail.sample ? <KitSampleTag style={detail.skipped ? undefined : styles.sampleCorner} /> : null}
      </View>
      <View style={styles.scoreRow}>
        <UiText style={styles.mid}>{String(points)}</UiText>
        <UiText style={[kit.lbl, styles.scoreLbl]}>{scoreText}</UiText>
        {candidates > 0
          ? <KitChip label={t("plan.type.inNetwork", { count: candidates })} tone="lav" style={styles.chipRight} />
          : <KitChip label={t("plan.type.notInNetwork")} style={styles.chipRight} />}
      </View>
      <View style={styles.mb}>
        {detail.skipped ? <KitHatch line={colors.plum300} base={colors.plum100} /> : <View style={[styles.mbFill, { width: `${fill}%` }]} />}
      </View>
      <View style={styles.m3}>
        <Cell value={candidates} small={t("plan.type.cellPeople")} label={t(candidates === 0 ? "plan.type.cellNone" : "plan.type.cellCandidates")} />
        <Cell value={events} label={t("plan.type.cellEvents")} />
        <Cell value={routes} label={t("plan.type.cellRoutes")} />
      </View>
      {detail.skipped ? (
        <View style={styles.skipped} testID="type-skipped">
          <View style={styles.sw}><KitHatch line={colors.plum300} base={colors.plum100} /></View>
          <View style={kit.grow}>
            <UiText style={styles.skippedTitle}>{t("plan.type.skippedTitle")}</UiText>
            <UiText style={kit.lbl}>{detail.skippedAt ? t("plan.type.skippedNoteAt", { date: new Date(detail.skippedAt).toLocaleDateString(locale, { day: "numeric", month: "long" }) }) : t("plan.type.skippedNote")}</UiText>
          </View>
          <KitButton sm label={t("plan.type.unskipShort")} accessibilityLabel={t("plan.type.unskip")} onPress={onUnskip} disabled={busy} testID="type-unskip" />
        </View>
      ) : null}
    </KitCard>
  );
}

function Cell({ value, small, label }: { value: number; small?: string; label: string }) {
  const { styles } = useStyles();
  return (
    <View accessible style={styles.m3cell}>
      {/* 数字与「人」分两段按基线排（嵌套 Text 混两种字号时 iOS 把行盒撑高约 3pt）。 */}
      <View style={styles.m3row}>
        <UiText style={[styles.m3b, value === 0 && styles.m3z]}>{String(value)}</UiText>
        {small ? <UiText style={styles.m3small}>{small}</UiText> : null}
      </View>
      <UiText numberOfLines={1} style={styles.m3span}>{label}</UiText>
    </View>
  );
}

/* ---------- あなたの人脈の候補 .v22cand ---------- */

export function CandidatesCard({ detail, selected, faded, onToggle, onMenu, onAction, talkedOpen, onTalkedToggle }: {
  detail: PlanPersonTypeDetail;
  selected: readonly string[];
  faded: boolean;
  onToggle: (contactId: string) => void;
  onMenu: (candidate: PlanCandidateView) => void;
  /** 读屏：长按菜单的三项也作为无障碍操作（VoiceOver 上下滑选择）。 */
  onAction: (candidate: PlanCandidateView, key: "accept" | "talked" | "dismiss") => void;
  talkedOpen: boolean;
  onTalkedToggle: () => void;
}) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const candidates = [...detail.candidates].sort((a, b) => b.recommendScore - a.recommendScore);
  const many = candidates.length > 1;
  return (
    <KitCard style={[styles.candCard, faded && styles.faded]} testID="type-candidates">
      <KitCardHead style={styles.candHead} title={t("plan.type.candidatesTitle")} right={many ? t("plan.type.candidatesNote", { count: candidates.length }) : t("plan.type.peopleCount", { count: candidates.length })} />
      {candidates.map((candidate, index) => (
        <CandidateRow key={candidate.candidateId} candidate={candidate} first={index === 0} on={selected.includes(candidate.contactId)} disabled={faded} onToggle={() => onToggle(candidate.contactId)} onMenu={() => onMenu(candidate)} onAction={(key) => onAction(candidate, key)} />
      ))}
      {detail.talked.length > 0 ? (
        <>
          <UiPressable accessibilityRole="button" accessibilityState={{ expanded: talkedOpen }} onPress={onTalkedToggle} style={styles.talkedRow} testID="type-talked">
            <View style={styles.okmark}><Icon name="check" size={16} color={colors.surface} /></View>
            <UiText numberOfLines={1} style={[styles.talkedText, kit.grow]}>{talkedLine(detail.talked, t)}</UiText>
            <Icon name={talkedOpen ? "up" : "down"} size={16} color={colors.ink} />
          </UiPressable>
        </>
      ) : null}
    </KitCard>
  );
}

function talkedLine(talked: readonly PlanTalkedView[], t: T): string {
  const first = talked.find((entry) => !entry.anonymous && entry.name)?.name ?? t("plan.type.anonymous");
  return talked.length > 1 ? t("plan.type.talkedLineMany", { count: talked.length, name: first }) : t("plan.type.talkedLineOne", { name: first });
}

function CandidateRow({ candidate, first, on, disabled, onToggle, onMenu, onAction }: { candidate: PlanCandidateView; first: boolean; on: boolean; disabled: boolean; onToggle: () => void; onMenu: () => void; onAction: (key: "accept" | "talked" | "dismiss") => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const reason = candidate.basis.map((item) => item.label).filter(Boolean).join(" · ");
  const why = useKitWhy(reason ? t("plan.type.basis", { reason }) : null);
  const meta = [candidate.company, candidate.role].filter(Boolean).join(" · ");
  const last = candidate.lastContactAt ? t("plan.type.lastContact", { date: relativeDays(candidate.lastContactAt, language, t) }) : null;
  return (
    <UiPressable accessible={false} disabled={disabled} delayLongPress={350} onLongPress={onMenu} pressedScale={1} testID="candidate-row">
      <View style={[styles.cand, !first && styles.candLine]}>
        <Checkbox checked={on} onChange={onToggle} accessibilityLabel={t("plan.type.select", { name: candidate.name })} />
        <Avatar name={candidate.name} size="sm" />
        <View
          accessible
          accessibilityLabel={[candidate.name, [candidate.company, candidate.role].filter(Boolean).join(" · ")].filter(Boolean).join("、")}
          accessibilityActions={disabled ? [] : [{ name: "accept", label: t("plan.type.accept") }, { name: "talked", label: t("plan.type.alreadyTalked") }, { name: "dismiss", label: t("plan.type.dismiss") }]}
          onAccessibilityAction={(event) => { const name = event.nativeEvent.actionName; if (name === "accept" || name === "talked" || name === "dismiss") onAction(name); }}
          style={kit.grow}
        >
          <View style={styles.nameRow}>
            <UiText numberOfLines={1} style={styles.candName}>{candidate.name}</UiText>
            {candidate.isOrbitUser ? <KitChip label={t("plan.type.orbitUser")} tone="teal" /> : null}
          </View>
          {meta ? <UiText numberOfLines={1} style={styles.sub2}>{meta}</UiText> : null}
        </View>
        <View accessible accessibilityLabel={t("plan.type.recommendA11y", { score: candidate.recommendScore })} style={styles.rec}>
          <UiText style={styles.recB}>{String(candidate.recommendScore)}</UiText>
          <UiText style={styles.recSpan}>{t("plan.type.recommend")}</UiText>
        </View>
        {why.button ?? <View style={styles.whySpace} />}
      </View>
      <View style={styles.cdet}>
        {candidate.reason ? <UiText style={styles.cdetText}>{candidate.reason}</UiText> : null}
        {candidate.opener ? (
          <View style={styles.op}>
            <UiText style={styles.cdetText}>💬</UiText>
            <UiText style={[styles.cdetText, kit.grow]}>
              <PunctTrim text={t("plan.type.openingLabel")} next={t("plan.type.quote", { text: candidate.opener })} size={12} />
              <UiText style={styles.opB}>{t("plan.type.quote", { text: candidate.opener })}</UiText>
              {last ? <UiText style={styles.opLbl}>{` · ${last}`}</UiText> : null}
            </UiText>
          </View>
        ) : last ? <UiText style={styles.opLbl}>{last}</UiText> : null}
      </View>
      {why.body ? <View style={styles.candWhy}>{why.body}</View> : null}
    </UiPressable>
  );
}

/**
 * Chrome 的 text-spacing-trim：全角「：」后面紧跟「「」时挤掉半个字宽，iOS 不挤。
 * 把「：」的字距设为 −半字宽，排出来与设计稿一致；其他组合原样输出。
 */
function PunctTrim({ text, next, size }: { text: string; next: string; size: number }) {
  if (!text.endsWith("：") || !next.startsWith("「")) return <>{text}</>;
  return <>{text.slice(0, -1)}<UiText style={{ letterSpacing: -size / 2 }}>：</UiText></>;
}

/** 「最終接点 2日前 / 3週間前」 like the kit (days, then weeks, then the date). */
function relativeDays(iso: string, language: string, t: T): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 14) return t("plan.type.daysAgo", { count: days });
  if (days < 56) return t("plan.type.weeksAgo", { count: Math.round(days / 7) });
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/* ---------- なぜこの人か ---------- */

export function WhyCard({ detail, basis }: { detail: PlanPersonTypeDetail; basis: string | null }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const why = useKitWhy(basis);
  return (
    <KitCard style={styles.pad1416}>
      <View style={styles.titleRow}>
        <UiText accessibilityRole="header" style={[styles.b135, kit.grow]}>{t("plan.type.why")}</UiText>
        {why.button}
      </View>
      <UiText style={styles.whyText}>{detail.why}</UiText>
      {why.body}
    </KitCard>
  );
}

/* ---------- 聞くこと .v22qn ---------- */

export function QuestionsCard({ questions, onCopy }: { questions: readonly string[]; onCopy: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <KitCard style={styles.pad1216}>
      <View style={styles.secHead}>
        <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.questions")}</UiText>
        <CopyButton onPress={onCopy} />
      </View>
      {questions.map((question, index) => (
        <View key={index} style={[styles.qn, index > 0 && styles.line]}>
          <View style={styles.qnN}><UiText style={styles.qnNText}>{String(index + 1)}</UiText></View>
          <UiText style={[styles.qnText]}>{question}</UiText>
        </View>
      ))}
    </KitCard>
  );
}

function CopyButton({ onPress }: { onPress: () => void }) {
  const { styles, colors } = useStyles();
  const copy = useStandardCopy();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={copy.action.copy} hitSlop={8} onPress={onPress} style={styles.copyBtn}>
      <Icon name="copy" size={16} color={colors.ink2} />
      <UiText style={styles.copyText}>{copy.action.copy}</UiText>
    </UiPressable>
  );
}

/* ---------- 話せたの判定 .v22rule ---------- */

export function CountRulesCard({ detail }: { detail: PlanPersonTypeDetail }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const units = unitPoints(detail.allocation, detail.targetCount);
  const first = units[0] ?? 0;
  const last = units[units.length - 1] ?? 0;
  const base = first === last ? `+${first}` : `+${first} / +${last}`;
  const rows: { icon: "check" | "plus" | "user"; text: string; pt: string }[] = [
    { icon: "check", pt: base, text: t("plan.type.countBase") },
    { icon: "plus", pt: `+${Math.floor(first / 2)}`, text: t("plan.type.countOverflow", { target: detail.targetCount }) },
    { icon: "user", pt: `+${first}`, text: t("plan.type.countAnonymous", { target: detail.targetCount }) },
  ];
  return (
    <KitCard style={styles.pad1416}>
      <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.countRule")}</UiText>
      <UiText style={[kit.lbl, styles.lblNote]}>{t("plan.type.countRuleNoteV2")}</UiText>
      {rows.map((row, index) => (
        <View key={row.icon} style={[styles.rule, index > 0 && styles.ruleNext]}>
          <Icon name={row.icon} size={16} color={colors.ink} />
          <UiText style={[styles.ruleText, kit.grow]}>{row.text}</UiText>
          <UiText style={styles.pt}>{row.pt}</UiText>
        </View>
      ))}
    </KitCard>
  );
}

/* ---------- 見分け方 .v22sig ---------- */

export function HintsCard({ hints }: { hints: readonly string[] }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <KitCard style={styles.pad1216}>
      <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.hints")}</UiText>
      <UiText style={[kit.lbl, styles.lblHints]}>{t("plan.type.hintsNote")}</UiText>
      {hints.map((hint, index) => {
        const [line] = labelledLines(hint);
        const chips = (line?.value ?? hint).split(/\s*[/／]\s*/u).filter(Boolean);
        return (
          <View key={hint} style={[styles.sig, index > 0 && styles.line]}>
            {line?.label ? <UiText style={[kit.lbl, styles.sigLabel]}>{line.label}</UiText> : null}
            <View style={styles.chips}>{chips.map((chip) => <KitChip key={chip} label={chip} />)}</View>
          </View>
        );
      })}
    </KitCard>
  );
}

/* ---------- 紹介ルート .v22route ---------- */

export function RoutesCard({ routes, none, note, busy, onDraft }: { routes: readonly PlanIntroRouteView[]; none: boolean; note: string; busy: boolean; onDraft: (viaContactId: string) => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <KitCard style={styles.pad1416}>
      <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.routesTitle")}</UiText>
      <UiText style={[kit.lbl, styles.lblNote]}>{note}</UiText>
      {routes.map((route, index) => none ? (
        <View key={route.viaContactId} style={[styles.route, index > 0 && styles.routeNext]}>
          <Avatar name={route.viaName} size="sm" />
          <UiText style={styles.rm}><UiText style={styles.rmB}>{route.viaName}</UiText>{`\n${route.why}`}</UiText>
          <KitButton sm label={t("plan.type.draftShort")} accessibilityLabel={t("plan.type.makeDraftA11y", { name: route.viaName })} onPress={() => onDraft(route.viaContactId)} disabled={busy} />
        </View>
      ) : (
        <View key={route.viaContactId} style={index > 0 ? styles.routeNext : null}>
          <View style={styles.route}>
            <Avatar name={route.viaName} size="sm" />
            <Icon name="right" size={16} color={colors.ink4} />
            <View style={styles.ghavs}>{["?", "?"].map((mark, n) => <View key={n} style={[styles.ghav, n > 0 && styles.ghavNext]}><UiText style={styles.ghavText}>{mark}</UiText></View>)}</View>
            <UiText style={styles.rm}><UiText style={styles.rmB}>{t("plan.type.routeVia", { name: route.viaName })}</UiText>{`\n${route.why}`}</UiText>
          </View>
          <KitButton sm icon="mail" label={t("plan.type.makeDraftLong")} accessibilityLabel={t("plan.type.makeDraftA11y", { name: route.viaName })} onPress={() => onDraft(route.viaContactId)} disabled={busy} style={styles.routeBtn} />
        </View>
      ))}
    </KitCard>
  );
}

/* ---------- 会える活動 .v22ev ---------- */

export function EventsListCard({ events, ring, bonus, onOpen }: { events: readonly PlanEventOption[]; ring: number; bonus: number | null; onOpen: (event: PlanEventOption) => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const ringColor = (score: number) => (score >= 70 ? colors.plum700 : score >= 50 ? colors.plum500 : colors.rose500);
  return (
    <KitCard style={styles.candCard}>
      <KitCardHead style={styles.evHead} title={t("plan.type.eventsTitle")} right={t("plan.type.eventsNoteV2")} />
      {events.map((event, index) => (
        <UiPressable key={event.eventId} accessibilityRole="button" accessibilityLabel={t("plan.type.eventScoreA11y", { score: event.score.total, title: event.title })} onPress={() => onOpen(event)} pressedScale={0.99} style={[styles.ev, index > 0 && styles.line]} testID="event-row">
          <KitRing size={ring} score={event.score.total} color={ringColor(event.score.total)} />
          <View style={kit.grow}>
            <UiText numberOfLines={1} style={styles.evB}>{event.title}</UiText>
            <UiText numberOfLines={1} style={kit.lbl}>{[eventDay(event.startsAt, language), event.venue].filter(Boolean).join(" · ")}</UiText>
            {event.expectedCount ? <KitChip label={t("plan.type.eventExpectedV2", { count: event.expectedCount })} tone="lav" style={styles.evChip} /> : null}
          </View>
          <Icon name="right" size={16} color={colors.ink3} />
        </UiPressable>
      ))}
      <UiText style={[kit.lbl, styles.evBonus]}>{bonus ? t("plan.type.eventBonusV2", { points: bonus }) : t("plan.type.eventBonus")}</UiText>
    </KitCard>
  );
}

/** kit .ring：底圈 surface-3、分数弧 round cap（score / 100），中间 12px 800 数字。 */
export function KitRing({ size, score, color }: { size: number; score: number; color: string }) {
  const { styles, colors } = useStyles();
  const r = (size - 5) / 2;
  const length = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={5} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * length} ${length}`} />
      </Svg>
      <UiText style={styles.ringText}>{String(score)}</UiText>
    </View>
  );
}

/** 「10月16日（金）」 in Japanese (full-width brackets as in the design); the platform's format elsewhere (same as Web). */
export function eventDay(startsAt: string, language: string): string {
  const date = new Date(startsAt);
  if (language !== "ja") return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { day: "numeric", month: "long", weekday: "short" });
  return `${date.toLocaleDateString("ja-JP", { day: "numeric", month: "long" })}（${date.toLocaleDateString("ja-JP", { weekday: "short" })}）`;
}

/* ---------- 人物像 .kv / 開口一番 .quote ---------- */

export function PersonaCard({ persona, basis }: { persona: string; basis: string | null }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const why = useKitWhy(basis);
  return (
    <KitCard style={styles.persona} testID="type-persona">
      <KitCardHead style={styles.personaHead} title={t("plan.type.persona")} right={why.button} />
      {why.body ? <View style={styles.personaWhy}>{why.body}</View> : null}
      {labelledLines(persona).map((line, index) => (
        <View key={index} style={[styles.kv, index > 0 && styles.line]}>
          {line.label ? <UiText style={[kit.lbl, styles.kvLabel]}>{line.label}</UiText> : null}
          <UiText style={[styles.kvValue, kit.grow]}>{line.value}</UiText>
        </View>
      ))}
    </KitCard>
  );
}

export function OpenerCard({ opener, judge, onCopy }: { opener: string; judge: string | null; onCopy: () => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <KitCard style={styles.pad1416} testID="type-opener">
      <View style={styles.between}>
        <UiText accessibilityRole="header" style={styles.b135}>{t("plan.type.opener")}</UiText>
        <CopyButton onPress={onCopy} />
      </View>
      <View style={styles.quote}><UiText style={styles.quoteText}>{t("plan.type.quote", { text: opener })}</UiText></View>
      {judge ? <UiText style={[kit.lbl, styles.judge]}>{judge}</UiText> : null}
    </KitCard>
  );
}

/* ---------- この分野はもう詳しい（.btn.ghost.block） / 底栏 .foot ---------- */

export function SkipButton({ onPress }: { onPress: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <UiPressable accessibilityRole="button" hitSlop={2} onPress={onPress} style={styles.skipBtn} testID="type-skip">
      <UiText style={styles.skipText}>{t("plan.type.skipAction")}</UiText>
    </UiPressable>
  );
}

export function SelectionFoot({ count, canRecord, onRecord, onPropose }: { count: number; canRecord: boolean; onRecord: () => void; onPropose: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.foot, { paddingBottom: Math.max(30, insets.bottom - 4) }]} testID="selection-bar">
      <View pointerEvents="none" style={styles.footFade}><KitGradient id="type-foot" from={colors.bg} fromOpacity={0} to={colors.bg} stop={0.26} vertical /></View>
      <View style={styles.footRow}>
        <UiText style={[kit.lbl, kit.grow]}><UiText style={styles.footCount}>{t("plan.type.selectedCount", { count })}</UiText>{t("plan.type.selectedSuffix")}</UiText>
        <KitButton label={t("plan.type.alreadyTalked")} onPress={onRecord} disabled={!canRecord} testID="selection-record" />
        <KitButton primary label={t("plan.type.propose")} onPress={onPropose} testID="selection-propose" />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  b135: { color: colors.ink, ...kitText(13.5, "700") },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  faded: { opacity: 0.5 },
  pad1416: { paddingVertical: 14, paddingHorizontal: 16 },
  pad1216: { paddingVertical: 12, paddingHorizontal: 16 },
  lblNote: { marginTop: 2, marginBottom: 10 },
  lblHints: { marginTop: 2, marginBottom: 4 },

  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16 },
  flatRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  sampleCorner: { position: "absolute", top: 0, right: 0 },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tk: { color: colors.ink3, ...kitText(10.5, "800", 1.5, 0.04) },
  tn: { color: colors.ink2, ...kitText(16.5, "600", 1.5), marginTop: 12 },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 12 },
  mid: { color: colors.ink, ...kitText(22, "800", 1.5, -0.01) },
  scoreLbl: { flexShrink: 1 },
  chipRight: { marginLeft: "auto", alignSelf: "baseline" },
  mb: { height: 5, borderRadius: 3, backgroundColor: colors.surface3, marginTop: 4, overflow: "hidden", flexDirection: "row" },
  mbFill: { height: "100%", backgroundColor: colors.plum700 },
  m3: { flexDirection: "row", gap: 6, marginTop: 10 },
  m3cell: { flex: 1, minWidth: 0, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 },
  m3b: { color: colors.ink, ...kitText(17, "800", 1.2) },
  m3z: { color: colors.ink4 },
  // CSS 里 b 是 line-height 1.2 的块（20.4）：固定行高，基线对齐的小字不再把它撑高。
  m3row: { flexDirection: "row", alignItems: "baseline", height: 20.4, overflow: "visible" },
  m3small: { color: colors.ink3, ...kitText(10.5, "700", 1.2), marginLeft: 1 },
  m3span: { color: colors.ink3, ...kitText(10.5, "600") },
  skipped: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  sw: { width: 22, height: 14, borderRadius: 3, overflow: "hidden" },
  skippedTitle: { color: colors.ink, ...kitText(12.5, "700") },

  candCard: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 },
  candHead: { marginTop: 4, marginBottom: 0 },
  cand: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 11, paddingBottom: 4 },
  candLine: { borderTopWidth: 1, borderTopColor: colors.line },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 0 },
  candName: { color: colors.ink, ...kitText(13.5, "700"), flexShrink: 1, marginRight: 4 },
  sub2: { color: colors.ink3, ...kitText(11.5, "400") },
  rec: { alignItems: "flex-end" },
  recB: { color: colors.ink, ...kitText(18, "800", 1.1) },
  recSpan: { color: colors.ink3, ...kitText(9.5, "700", 1.1) },
  whySpace: { width: 18 },
  cdet: { paddingLeft: 64, paddingBottom: 10 },
  cdetText: { color: colors.ink2, ...kitText(12, "400", 1.55) },
  op: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 5 },
  opB: { color: colors.ink, fontWeight: "700" },
  opLbl: { color: colors.ink3, ...kitText(11.5, "500", 1.55) },
  candWhy: { marginLeft: 64, marginTop: -10, marginBottom: 10 },
  talkedRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  okmark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ok, alignItems: "center", justifyContent: "center" },
  talkedText: { color: colors.ink, ...kitText(12.5, "400") },

  whyText: { color: colors.ink2, ...kitText(12.5, "400", 1.7), marginTop: 6 },
  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 2 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 999 },
  copyText: { color: colors.ink2, ...kitText(12, "700") },
  qn: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9 },
  qnN: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginTop: 1 },
  qnNText: { color: colors.plum700, ...kitText(11, "800") },
  qnText: { color: colors.ink, ...kitText(13, "400", 1.6), flex: 1, minWidth: 0 },

  rule: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface2 },
  ruleNext: { marginTop: 6 },
  ruleText: { color: colors.ink, ...kitText(12, "400") },
  pt: { color: colors.plum700, ...kitText(14, "900") },

  sig: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 7 },
  sigLabel: { width: 70 },
  chips: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 4 },

  route: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface2 },
  routeNext: { marginTop: 8 },
  rm: { flex: 1, minWidth: 0, color: colors.ink2, ...kitText(12, "400", 1.55) },
  rmB: { color: colors.ink, ...kitText(13, "700", 1.55) },
  ghavs: { flexDirection: "row" },
  ghav: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  ghavNext: { marginLeft: -6 },
  ghavText: { color: colors.plum500, ...kitText(11, "800") },
  routeBtn: { marginTop: 10, alignSelf: "stretch" },

  evHead: { marginTop: 4, marginBottom: 2 },
  ev: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  evB: { color: colors.ink, ...kitText(13, "700") },
  evChip: { marginTop: 4 },
  evBonus: { paddingVertical: 8 },
  ringSvg: { position: "absolute", transform: [{ rotate: "-90deg" }] },
  ringText: { color: colors.ink, ...kitText(12, "800", 1.1) },

  persona: { paddingVertical: 8, paddingHorizontal: 16 },
  personaHead: { marginTop: 8, marginBottom: 2 },
  personaWhy: { marginBottom: 8, marginTop: -10 },
  // .v22x .kv：78px 标签列、上下 9。
  kv: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  kvLabel: { width: 78, paddingTop: 1, lineHeight: 18.4, transform: [{ translateY: -3 }] },
  kvValue: { color: colors.ink, ...kitText(12.5, "400", 1.6) },
  quote: { marginTop: 8, paddingVertical: 4, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.plum300 },
  quoteText: { color: colors.ink, ...kitText(15, "800", 1.6) },
  judge: { marginTop: 8 },

  skipBtn: { height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: -8 },
  skipText: { color: colors.ink2, ...kitText(13, "700") },

  foot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 22, paddingHorizontal: 18 },
  footFade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footCount: { color: colors.ink, fontWeight: "700" },
}));
