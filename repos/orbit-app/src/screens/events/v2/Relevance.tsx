// 2026-11-15 活动不再打分（docs/designs/redesign-2026-10/event-relevance-proposal.html）：每个活动只列「跟你有关的事实」。
// 一处给两样东西：标签（探す 卡片 / 列表行 / 計画页行，最多 3 个）和「あなたに関係すること」卡（活动详情 / 评估结果）。
// 文字只由服务端的结构化字段（EventRelevance）拼；查不到的事实不出任何东西，一行都没有时整张卡不出。
import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { EventRelevance, EventRelevancePeople } from "../../../api/contract/event-relevance";
import { Chip, type ChipTone, Icon, UiPressable, UiText } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import type { MessageKey } from "../../../i18n/messages";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";

/** 完整键（`eventsV2.relChipKnown`）的翻译函数；测试直接传字典查表。 */
export type RelevanceT = (key: string, values?: Record<string, string | number>) => string;

export function useRelevanceT(): RelevanceT {
  const { t } = useOrbitLocale();
  return useMemo(() => (key: string, values?: Record<string, string | number>) => t(key as MessageKey, values), [t]);
}

export const RELEVANCE_CHIP_MAX = 3;
/** 「申込 N名」只在报名人数 ≥ 10 时出（避免「才 2 人」的反效果）。 */
export const REGISTRATION_CHIP_MIN = 10;

export type RelevanceChipKind = "people" | "known" | "topic" | "budget" | "travel";
export interface RelevanceChip { key: string; kind: RelevanceChipKind; tone: ChipTone; label: string }

const yen = (value: number) => `¥${value.toLocaleString("en-US")}`;

function peopleText(person: EventRelevancePeople, t: RelevanceT, chip: boolean): string {
  const values = { count: person.count, label: person.label };
  if (person.source === "exhibitors") return t("eventsV2.relChipPeopleExhibitors", values);
  if (person.source === "speakers" && chip) return t("eventsV2.relChipPeopleSpeakers", values);
  return t("eventsV2.relChipPeople", values);
}

/**
 * 标签：想见的人（最多 2）→ 认识的人 → 主题 → 提醒，最多 3 个；有提醒时总留一个位置给它。
 */
export function relevanceChips(relevance: EventRelevance | null | undefined, t: RelevanceT): RelevanceChip[] {
  if (!relevance) return [];
  const facts: RelevanceChip[] = [
    ...relevance.people.slice(0, 2).map((person): RelevanceChip => ({ key: `people-${person.typeKey}`, kind: "people", label: peopleText(person, t, true), tone: "lav" })),
    ...(relevance.known && relevance.known.count > 0 ? [{ key: "known", kind: "known" as const, label: t("eventsV2.relChipKnown", { n: relevance.known.count }), tone: "teal" as const }] : []),
    ...(relevance.topic && relevance.topic.labels.length ? [{ key: "topic", kind: "topic" as const, label: t("eventsV2.relChipTopic"), tone: "blue" as const }] : []),
  ];
  const warnings = relevance.warnings.map((warning): RelevanceChip => warning.kind === "budget"
    ? { key: "budget", kind: "budget", label: t("eventsV2.relChipBudget"), tone: "coral" }
    : { key: "travel", kind: "travel", label: t("eventsV2.relChipTravel"), tone: "coral" });
  const head = facts.slice(0, RELEVANCE_CHIP_MAX - (warnings.length ? 1 : 0));
  return [...head, ...warnings.slice(0, RELEVANCE_CHIP_MAX - head.length)];
}

/** 「申込 128名」（灰色，探す 卡片右上）；少于 10 人或不知道时不出。 */
export function registrationChipLabel(count: number | null | undefined, t: RelevanceT): string | null {
  return typeof count === "number" && count >= REGISTRATION_CHIP_MIN ? t("eventsV2.relChipRegistered", { n: count }) : null;
}

export type RelevanceRowKind = "people" | "known" | "topic" | "budget" | "travel" | "calendar";
export interface RelevanceRow { key: string; kind: RelevanceRowKind; glyph: string; main: string; basis: string | null }

/** 卡片的行：一行一件事实，小字写依据。 */
export function relevanceRows(relevance: EventRelevance | null | undefined, t: RelevanceT): RelevanceRow[] {
  if (!relevance) return [];
  const rows: RelevanceRow[] = [];
  if (relevance.people.length) {
    const list = relevance.people.map((person) => peopleText(person, t, false)).join(" · ");
    const sources = [...new Set(relevance.people.map((person) => person.source))];
    const basisKey = { exhibitors: "eventsV2.relBasisExhibitors", registrants: "eventsV2.relBasisRegistrants", speakers: "eventsV2.relBasisSpeakers" } as const;
    rows.push({ basis: sources.map((source) => t(basisKey[source])).join(" · "), glyph: "👥", key: "people", kind: "people", main: t("eventsV2.relPeopleLine", { list }) });
  }
  if (relevance.known && relevance.known.count > 0) {
    const names = relevance.known.names.filter(Boolean);
    rows.push({ basis: names.length ? names.join(t("eventsV2.relNamesSep")) : null, glyph: "🤝", key: "known", kind: "known", main: t("eventsV2.relKnownLine", { n: relevance.known.count }) });
  }
  if (relevance.topic && relevance.topic.labels.length) {
    const list = relevance.topic.labels.map((label, index) => t(index === 0 ? "eventsV2.relTopicItem" : "eventsV2.relTopicItemNext", { label })).join("");
    rows.push({ basis: t("eventsV2.relBasisDescription"), glyph: "#", key: "topic", kind: "topic", main: t("eventsV2.relTopicLine", { list }) });
  }
  for (const warning of relevance.warnings) {
    if (warning.kind === "budget") rows.push({ basis: t("eventsV2.relBudgetBasis", { fee: yen(warning.feeYen) }), glyph: "!", key: "budget", kind: "budget", main: t("eventsV2.relBudgetLine", { limit: yen(warning.limitYen) }) });
    else rows.push({ basis: null, glyph: "!", key: "travel", kind: "travel", main: t("eventsV2.relTravelLine", { limit: warning.limitMinutes, m: warning.minutes }) });
  }
  return rows;
}

/** 一排标签（换行排）；没有就不画。 */
export function RelevanceChips({ chips, style }: { chips: readonly RelevanceChip[]; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  if (!chips.length) return null;
  return <View style={[styles.chips, style]} testID="event-relevance-chips">{chips.map((chip) => <Chip key={chip.key} label={chip.label} tone={chip.tone} />)}</View>;
}

/**
 * 「あなたに関係すること」：一件事实一行（图标块 + 主句 + 灰色小字依据）。`extra` = 其他来源的提醒（如日历撞期，珊瑚色）。
 * 「会いたい人」那行可点（参加者 tab 的「プランに合う」）。一行都没有 → 不渲染。
 */
export function RelevanceCard({ relevance, t, extra = [], onPeople, style }: { relevance: EventRelevance | null | undefined; t: RelevanceT; extra?: readonly RelevanceRow[]; onPeople?: (() => void) | undefined; style?: StyleProp<ViewStyle> }) {
  const { styles, colors } = useStyles();
  const rows = [...relevanceRows(relevance, t), ...extra];
  if (!rows.length) return null;
  const tile = (kind: RelevanceRowKind) => kind === "people" ? [colors.macLav, colors.macLavInk] : kind === "known" ? [colors.macTeal, colors.macTealInk] : kind === "topic" ? [colors.macBlue, colors.macBlueInk] : [colors.coralSoft, colors.coral];
  return (
    <View style={[styles.card, style]} testID="event-relevance">
      <UiText accessibilityRole="header" style={styles.title}>{t("eventsV2.relTitle")}</UiText>
      {rows.map((row, index) => {
        const [bg, ink] = tile(row.kind);
        const warn = row.kind === "budget" || row.kind === "travel" || row.kind === "calendar";
        const body = (
          <>
            {index > 0 ? <View style={styles.line} /> : null}
            <View style={[styles.tile, { backgroundColor: bg }]}><UiText style={[styles.glyph, { color: ink }]}>{row.glyph}</UiText></View>
            <View style={styles.grow}>
              <UiText style={[styles.main, warn ? { color: colors.coral } : null]}>{row.main}</UiText>
              {row.basis ? <UiText style={styles.basis} numberOfLines={2}>{row.basis}</UiText> : null}
            </View>
          </>
        );
        return row.kind === "people" && onPeople ? (
          <UiPressable key={row.key} accessibilityRole="button" accessibilityLabel={row.main} onPress={onPeople} style={styles.row} testID={`event-relevance-${row.key}`}>
            {body}
            <Icon name="right" size={16} color={colors.ink3} />
          </UiPressable>
        ) : <View key={row.key} style={styles.row} testID={`event-relevance-${row.key}`}>{body}</View>;
      })}
    </View>
  );
}

// 设计稿 ②：.card 18 / r20，行 .li 11 0、图标块 32 r10、主句 15/700、依据 13 ink3。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 14 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25, marginBottom: 4 },
  row: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 10 },
  line: { backgroundColor: colors.line, height: 1, left: 44, position: "absolute", right: 0, top: 0 },
  tile: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  glyph: { fontSize: 16, fontWeight: "800", lineHeight: 22 },
  grow: { flex: 1, minWidth: 0 },
  main: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  basis: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
}));
