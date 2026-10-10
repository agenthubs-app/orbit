// R24: small building blocks shared by the plan overview and the person-type page —
// the composition bar (solid / striped / overflow / grey), the event score ring, the
// three-cell stats, the read-only mail draft sheet. Components from
// src/components/ui and theme tokens only.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Linking, Share, StyleSheet, View } from "react-native";

import { BottomSheet, Button, CountUp, Icon, RingChart, UiPressable, UiText, useReducedMotion, useToast } from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import type { PlanScoreSegment } from "../../api/contract/plan-v2";
import { eventRingTone, mailtoHref, segmentPieces } from "./plan-overview-model";

const STRIPE_COUNT = 24;

/** Diagonal stripes (習熟済み): drawn with thin rotated bars, no gradients needed. */
export function Stripes({ color, background }: { color: string; background: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: background, overflow: "hidden" }]}>
      {Array.from({ length: STRIPE_COUNT }, (_, index) => (
        <View key={index} style={{ position: "absolute", top: -10, bottom: -10, left: index * 6 - 12, width: 2.5, backgroundColor: color, transform: [{ rotate: "35deg" }] }} />
      ))}
    </View>
  );
}

/**
 * The composition bar: one piece per segment, width = allocation (+ overflow). Inside
 * each: earned (solid, or striped when skipped), overflow (rose), the rest (grey).
 * Type segments open their page; the event segment does not.
 */
export function ScoreBar({ segments, onOpen, label }: { segments: readonly PlanScoreSegment[]; onOpen?: (key: string) => void; label: (segment: PlanScoreSegment) => string }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.bar}>
      {segments.map((segment) => {
        const piece = segmentPieces(segment);
        const body = (
          <View style={styles.piece}>
            {piece.earned > 0 ? (
              <View testID={`segment-${piece.kind}`} style={{ flex: piece.earned, backgroundColor: colors.plum700 }}>
                {piece.kind === "striped" ? <Stripes background={colors.plum300} color={colors.plum700} /> : null}
              </View>
            ) : null}
            {piece.overflow > 0 ? <View testID="segment-overflow" style={{ flex: piece.overflow, backgroundColor: colors.rose500 }} /> : null}
            {piece.rest > 0 ? <View testID="segment-rest" style={{ flex: piece.rest, backgroundColor: colors.surface3 }} /> : null}
          </View>
        );
        const open = onOpen && segment.key !== "event" ? () => onOpen(segment.key) : null;
        return open ? (
          <UiPressable key={segment.key} accessibilityRole="button" accessibilityLabel={label(segment)} hitSlop={{ top: 14, bottom: 14 }} onPress={open} style={[styles.slot, { flex: piece.flex }]}>{body}</UiPressable>
        ) : (
          <View key={segment.key} accessible accessibilityLabel={label(segment)} style={[styles.slot, { flex: piece.flex }]}>{body}</View>
        );
      })}
    </View>
  );
}

/** One legend entry of the bar. */
export function LegendItem({ kind, label }: { kind: "solid" | "striped" | "overflow" | "rest"; label: string }) {
  const { colors, styles } = useStyles();
  const fill = kind === "solid" ? colors.plum700 : kind === "overflow" ? colors.rose500 : kind === "rest" ? colors.surface3 : colors.plum300;
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: fill }]}>{kind === "striped" ? <Stripes background={colors.plum300} color={colors.plum700} /> : null}</View>
      <UiText style={styles.legendLabel}>{label}</UiText>
    </View>
  );
}

/** The big score: rolls up once; with 「減らす動き」 on it only fades in (RD-16). */
export function ScoreNumber({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) {
  const { styles } = useStyles();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(reduced ? 0 : 1)).current;
  useEffect(() => {
    if (reduced) Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [fade, reduced]);
  return (
    <Animated.View accessible accessibilityLabel={accessibilityLabel} testID="plan-score" style={{ opacity: fade }}>
      <CountUp value={value} style={styles.score} />
    </Animated.View>
  );
}

/** 人脈の候補 · 会える活動 · 紹介ルート (the first cell greys out as 人脈にいない at zero). */
export function StatCells({ candidates, events, routes }: { candidates: number; events: number; routes: number }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const cell = (value: string, label: string, muted = false) => (
    <View accessible accessibilityLabel={`${label} ${value}`} style={styles.cell}>
      <UiText style={[styles.cellValue, muted && styles.muted]}>{value}</UiText>
      <UiText numberOfLines={1} style={styles.cellLabel}>{label}</UiText>
    </View>
  );
  return (
    <View style={styles.cells}>
      {cell(t("plan.types.count", { count: candidates }), candidates > 0 ? t("plan.types.candidates") : t("plan.types.notInNetwork"), candidates === 0)}
      {cell(String(events), t("plan.types.events"))}
      {cell(String(routes), t("plan.types.routes"))}
    </View>
  );
}

/** The event score ring: ≥70 deep plum, 50–69 mid plum, <50 rose. */
export function EventRing({ total, accessibilityLabel }: { total: number; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  const tone = eventRingTone(total);
  const color = tone === "deep" ? colors.plum700 : tone === "mid" ? colors.plum500 : colors.rose500;
  return <RingChart size={52} stroke={5} accessibilityLabel={accessibilityLabel} center={String(total)} segments={[{ value: total, color }, { value: Math.max(0, 100 - total), color: colors.surface3 }]} />;
}

/** A plain section card with a title row. */
export function Section({ title, note, trailing, children, dashed = false }: { title: string; note?: string; trailing?: ReactNode; children: ReactNode; dashed?: boolean }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.section, dashed && styles.dashed]}>
      <View style={styles.sectionHead}>
        <View style={styles.grow}>
          <UiText accessibilityRole="header" style={styles.sectionTitle}>{title}</UiText>
          {note ? <UiText style={styles.sectionNote}>{note}</UiText> : null}
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );
}

/** コピー: the system share sheet (it has Copy) — the App ships no clipboard module. */
export function shareText(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

/**
 * A draft shown read-only: subject, body, コピー and メールアプリで開く. There is no
 * send button anywhere (Orbit never sends, UI-SPEC 面談を提案 / 依頼文).
 */
export function MailDraftView({ to, subject, body }: { to?: string | undefined; subject: string; body: string }) {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const openMail = () => {
    void Linking.openURL(mailtoHref(subject, body)).catch(() => toast.error(t("plan.mail.openFailed")));
  };
  return (
    <View style={styles.sheet} testID="mail-draft">
      {to ? <UiText style={styles.meta}>{t("plan.mail.to", { name: to })}</UiText> : null}
      <UiText style={styles.meta}>{t("plan.mail.subject", { subject })}</UiText>
      <View style={styles.draftBody}><UiText selectable style={styles.body}>{body}</UiText></View>
      <View style={styles.row}>
        <Button label={copy.action.copy} icon="copy" onPress={() => shareText(`${subject}\n\n${body}`)} variant="secondary" />
        <Button label={t("plan.mail.open")} icon="mail" onPress={openMail} variant="primary" />
      </View>
      <View style={styles.noteRow}>
        <Icon name="info" size={16} color={colors.ink3Text} />
        <UiText style={styles.sectionNote}>{t("plan.mail.noSend")}</UiText>
      </View>
    </View>
  );
}

export function MailDraftSheet({ visible, onClose, title, subtitle, to, subject, body }: { visible: boolean; onClose: () => void; title: string; subtitle?: string | undefined; to?: string | undefined; subject: string; body: string }) {
  const { styles } = useStyles();
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <View style={styles.sheet}>
        <UiText accessibilityRole="header" style={styles.sheetTitle}>{title}</UiText>
        {subtitle ? <UiText style={styles.sectionNote}>{subtitle}</UiText> : null}
        <MailDraftView to={to} subject={subject} body={body} />
      </View>
    </BottomSheet>
  );
}

/** A disclosure line: label + chevron, opens its children in place. */
export function Disclosure({ label, accessibilityLabel, children }: { label: string; accessibilityLabel?: string; children: ReactNode }) {
  const { colors, styles } = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <UiPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ expanded: open }} hitSlop={8} onPress={() => setOpen((value) => !value)} style={styles.disclosure}>
        <UiText style={styles.disclosureLabel}>{label}</UiText>
        <Icon name={open ? "up" : "down"} size={16} color={colors.ink3Text} />
      </UiPressable>
      {open ? children : null}
    </View>
  );
}

export const usePlanOverviewStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, gap: 10 },
  cardSoft: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 12, gap: 8 },
  dashedCard: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, borderRadius: radius.lg, padding: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  heading: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  strong: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  meta: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  points: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  pointsOf: { color: colors.ink3Text, fontSize: 12, fontWeight: "600" },
  emojiTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.macLav, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 20 },
  numberDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  numberDotText: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  numberSoft: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.plum100, alignItems: "center", justifyContent: "center" },
  numberSoftText: { color: colors.plum900, fontSize: 11, fontWeight: "800" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden", flexDirection: "row" },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
}));

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bar: { flexDirection: "row", gap: 3, height: 14 },
  slot: { minWidth: 6 },
  piece: { flex: 1, flexDirection: "row", borderRadius: 4, overflow: "hidden" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 14, height: 10, borderRadius: 3, overflow: "hidden" },
  legendLabel: { color: colors.ink2, fontSize: 11, fontWeight: "600" },
  score: { color: colors.ink, fontSize: 52, lineHeight: 58, fontWeight: "800" },
  cells: { flexDirection: "row", gap: 6 },
  cell: { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  cellValue: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cellLabel: { color: colors.ink3Text, fontSize: 11 },
  muted: { color: colors.ink4 },
  section: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, gap: 12 },
  dashed: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300 },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  sectionNote: { color: colors.ink3Text, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  grow: { flex: 1, minWidth: 0 },
  sheet: { gap: 10, paddingBottom: 8 },
  sheetTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  meta: { color: colors.ink2, fontSize: 13 },
  draftBody: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 12 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 28 },
  disclosureLabel: { color: colors.accentText, fontSize: 12, fontWeight: "700" },
}));
