import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiText } from "./Text";

// 01-system ⑨ empty guide (kit .guide / .step / .ghost-row): what will appear here,
// the next step, and optionally a numbered path and ghost rows hinting the layout.
export function EmptyState({ title, message, action, steps, ghostRows = 0 }: {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  steps?: { label: string; state: "done" | "now" | "later" }[];
  ghostRows?: number;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.guide}>
      <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
      {message ? <UiText style={styles.message}>{message}</UiText> : null}
      {steps?.map((step, index) => (
        <View key={step.label} style={[styles.step, step.state === "now" && styles.stepNow]}>
          <View style={[styles.stepNumber, step.state === "done" && { backgroundColor: colors.ok }, step.state === "now" && { backgroundColor: colors.accent }]}>
            {step.state === "done" ? <Icon name="check" size={16} color={colors.onOk} /> : <UiText style={[styles.stepIndex, step.state === "now" && { color: colors.onAccent }]}>{index + 1}</UiText>}
          </View>
          <UiText style={styles.stepLabel}>{step.label}</UiText>
        </View>
      ))}
      {Array.from({ length: ghostRows }, (_, index) => <View key={index} style={styles.ghost}><View style={styles.ghostDot} /></View>)}
      {action ? <View style={styles.action}><Button label={action.label} onPress={action.onPress} variant="primary" /></View> : null}
    </View>
  );
}

// 01-system ⑦ skeleton: shapes match the real layout, shimmer 1.6 s, and after 8 s a
// line offers a retry. Reduce Motion: static blocks. Dark: surface-2 / surface-3 stay visible.
export const SKELETON_SLOW_MS = 8000;

export function Skeleton({ lines = 3, onRetry }: { lines?: number; onRetry?: () => void }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  const reduced = useReducedMotion();
  const shimmer = useRef(new Animated.Value(0)).current;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SKELETON_SLOW_MS);
    if (reduced) return () => clearTimeout(timer);
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: durations.shimmer, useNativeDriver: true }));
    loop.start();
    return () => { clearTimeout(timer); loop.stop(); };
  }, [reduced, shimmer]);
  const opacity = reduced ? 1 : shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.55, 1] });
  return (
    <View accessibilityLabel={copy.loading.loading} accessibilityRole="progressbar" style={styles.skeleton}>
      {slow ? (
        <View style={styles.slow}>
          <UiText style={styles.slowText}>{copy.loading.slow}</UiText>
          {onRetry ? <Button label={copy.action.retry} onPress={onRetry} size="sm" variant="secondary" /> : null}
        </View>
      ) : null}
      {Array.from({ length: lines }, (_, index) => (
        <Animated.View key={index} style={[styles.bone, { width: `${100 - index * 14}%`, opacity }]} />
      ))}
    </View>
  );
}

// 01-system ⑧ offline bar: apricot, under the page title, 「待機中 / 同期待ち N」; when
// the connection returns it turns mint 「同期しました」 and folds away after 2 s.
export const OFFLINE_SYNCED_MS = 2000;

export function OfflineBar({ offline, pending }: { offline: boolean; pending: number }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  const [synced, setSynced] = useState(false);
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline) {
      setSynced(true);
      const timer = setTimeout(() => setSynced(false), OFFLINE_SYNCED_MS);
      wasOffline.current = offline;
      return () => clearTimeout(timer);
    }
    wasOffline.current = offline;
  }, [offline]);
  if (!offline && !synced) return null;
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.bar, offline ? styles.barOffline : styles.barSynced]}>
      <Icon name={offline ? "wifioff" : "check"} size={16} color={offline ? styles.offlineText.color : styles.syncedText.color} />
      <UiText style={[styles.barText, offline ? styles.offlineText : styles.syncedText]}>{offline ? copy.offline.banner : copy.offline.synced}</UiText>
      {offline && pending > 0 ? <UiText style={[styles.pending, styles.offlineText]}>{fillCopy(copy.offline.pending, { count: pending })}</UiText> : null}
    </View>
  );
}

// 01-system ⑧ block error: 54 coral-soft icon block, 「〜を読み込めませんでした」, the
// reason and a reassurance, 再試行 (spins in the button), optional cached view.
export function RetryCard({ title, message, onRetry, retrying = false, onViewCached }: { title: string; message?: string; onRetry: () => void; retrying?: boolean; onViewCached?: () => void }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View accessibilityRole="alert" style={styles.retry}>
      <View style={styles.retryIcon}><Icon name="alert" size={24} color={colors.coralText} /></View>
      <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
      <UiText style={styles.message}>{message ?? `${copy.error.checkConnection}${copy.error.inputKept}`}</UiText>
      <View style={styles.retryActions}>
        <Button icon="refresh" label={copy.action.retry} loading={retrying} onPress={onRetry} variant="primary" />
        {onViewCached ? <Button label={copy.error.viewCached} onPress={onViewCached} variant="ghost" /> : null}
      </View>
    </View>
  );
}

// 01-system ⑧ AI degraded: grey (not coral — not the user's fault), says what stopped
// and what still works.
export function DegradedCard({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View accessibilityRole="alert" style={styles.degraded}>
      <Icon name="alert" size={16} color={colors.ink2} />
      <View style={styles.degradedBody}>
        <UiText style={styles.degradedTitle}>{title ?? copy.degraded.iorbitUnavailable}</UiText>
        <UiText style={styles.message}>{message ?? copy.degraded.iorbitStopped}</UiText>
      </View>
      {onRetry ? <Button label={copy.action.retry} onPress={onRetry} size="sm" variant="secondary" /> : null}
    </View>
  );
}

// Sample data marks (01-system 示例模式): a small apricot tag and a banner.
export function SampleTag() {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return <View style={styles.sampleTag}><UiText style={styles.sampleText}>{copy.sample.tag}</UiText></View>;
}

export function SampleBar({ trailing }: { trailing?: ReactNode }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View style={styles.sampleBar}>
      <UiText style={[styles.sampleText, styles.sampleBarText]}>{copy.sample.banner}</UiText>
      {trailing}
    </View>
  );
}

// Quota (01-system 配额): 「今月あと N 回」, coral when used up.
export function QuotaChip({ left }: { left: number }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  const out = left <= 0;
  return (
    <View style={[styles.quota, out && styles.quotaOut]}>
      <UiText style={[styles.quotaText, out && styles.quotaTextOut]}>{out ? copy.quota.reached : fillCopy(copy.quota.left, { count: left })}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  guide: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20, gap: 8 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  message: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface2 },
  stepNow: { backgroundColor: colors.accentSoft },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  stepIndex: { color: colors.ink2, fontSize: 12, fontWeight: "800" },
  stepLabel: { flex: 1, color: colors.ink, fontSize: 13.5, fontWeight: "600" },
  ghost: { height: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  ghostDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2 },
  action: { marginTop: 6 },
  skeleton: { gap: 10, padding: 4 },
  bone: { height: 14, borderRadius: 8, backgroundColor: colors.surface3 },
  slow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  slowText: { color: colors.ink2, fontSize: 12.5 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  barOffline: { backgroundColor: colors.macApricot },
  barSynced: { backgroundColor: colors.macTeal },
  barText: { flex: 1, fontSize: 12.5, fontWeight: "700" },
  offlineText: { color: colors.macApricotText },
  syncedText: { color: colors.macTealText },
  pending: { fontSize: 12, fontWeight: "700" },
  retry: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, gap: 8 },
  retryIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.coralSoft, alignItems: "center", justifyContent: "center" },
  retryActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  degraded: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.surface2, borderRadius: 18, padding: 14 },
  degradedBody: { flex: 1, gap: 2 },
  degradedTitle: { color: colors.ink, fontSize: 13.5, fontWeight: "800" },
  sampleTag: { alignSelf: "flex-start", backgroundColor: colors.macApricot, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  sampleText: { color: colors.macApricotText, fontSize: 10.5, fontWeight: "800" },
  sampleBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.macApricot, borderRadius: 14, padding: 12 },
  sampleBarText: { flex: 1, fontSize: 12.5 },
  quota: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  quotaOut: { backgroundColor: colors.coralSoft },
  quotaText: { color: colors.ink2, fontSize: 11, fontWeight: "700" },
  quotaTextOut: { color: colors.coralText },
}));

