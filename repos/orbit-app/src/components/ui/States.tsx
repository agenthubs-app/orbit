import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
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

export function Skeleton({ lines = 3, onRetry, presentation = "default" }: { lines?: number; onRetry?: () => void; presentation?: "default" | "kit" }) {
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
  if (presentation === "kit") return <View accessibilityLabel={copy.loading.loading} accessibilityRole="progressbar" style={styles.kitSkeleton}>
    <Animated.View style={[styles.bone, styles.kitSkeletonLabel, { opacity }]} />
    <Animated.View style={[styles.bone, styles.kitSkeletonTitle, { opacity }]} />
    {[78, 64, 70].map((width, index) => <View key={index} style={styles.kitSkeletonRow}>
      <Animated.View style={[styles.bone, styles.kitSkeletonAvatar, { opacity }]} />
      <View style={styles.kitSkeletonLines}><Animated.View style={[styles.bone, { width: `${width}%`, height: 11, opacity }]} /><Animated.View style={[styles.bone, { width: `${width - 22}%`, height: 9, marginTop: 7, opacity }]} /></View>
    </View>)}
  </View>;
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

export function OfflineBar({ offline, pending, previewSynced = false, presentation = "default", pendingText, syncedNote }: { offline: boolean; pending: number; previewSynced?: boolean; presentation?: "default" | "kit"; pendingText?: string; syncedNote?: string }) {
  const { colors, styles } = useStyles();
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
  if (!offline && !synced && !previewSynced) return null;
  if (presentation === "kit") return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.kitOffline, { backgroundColor: offline ? colors.macApricot : colors.macTeal }]}>
      <Icon name={offline ? "wifioff" : "check"} size={16} color={offline ? colors.macApricotText : colors.macTealText} />
      <UiText style={[styles.kitOfflineText, { color: offline ? colors.macApricotText : colors.macTealText }]}>{offline ? copy.offline.banner : copy.offline.synced}</UiText>
      {offline && pending > 0 ? <View style={styles.kitPending}><Icon name="clock" size={12} color={colors.macApricotText} /><UiText style={styles.kitPendingText}>{pendingText ?? fillCopy(copy.offline.pending, { count: pending })}</UiText></View> : syncedNote ? <UiText style={styles.kitSyncedNote}>{syncedNote}</UiText> : null}
    </View>
  );
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
export function RetryCard({ title, message, onRetry, retrying = false, onViewCached, presentation = "default" }: { title: string; message?: string; onRetry: () => void; retrying?: boolean; onViewCached?: () => void; presentation?: "default" | "kit" }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View accessibilityRole="alert" style={[styles.retry, presentation === "kit" && styles.kitRetry]}>
      <View style={[styles.retryIcon, presentation === "kit" && styles.kitRetryIcon]}><Icon name="alert" size={24} color={colors.coralText} /></View>
      <UiText accessibilityRole="header" style={[styles.title, presentation === "kit" && styles.kitRetryTitle]}>{title}</UiText>
      <UiText style={[styles.message, presentation === "kit" && styles.kitRetryMessage]}>{message ?? `${copy.error.checkConnection}${copy.error.inputKept}`}</UiText>
      <View style={[styles.retryActions, presentation === "kit" && styles.kitRetryActions]}>
        <Button icon="refresh" label={copy.action.retry} loading={retrying} onPress={onRetry} variant="primary" size={presentation === "kit" ? "sm" : "md"} />
        {onViewCached ? <Button label={copy.error.viewCached} onPress={onViewCached} variant="ghost" size={presentation === "kit" ? "sm" : "md"} /> : null}
      </View>
    </View>
  );
}

// 01-system ⑧ AI degraded: grey (not coral — not the user's fault), says what stopped
// and what still works.
export function DegradedCard({ title, message, onRetry, presentation = "default" }: { title?: string; message?: string; onRetry?: () => void; presentation?: "default" | "kit" }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View accessibilityRole="alert" style={[styles.degraded, presentation === "kit" && styles.kitDegraded]}>
      <Icon name="alert" size={16} color={colors.ink2} />
      <View style={styles.degradedBody}>
        <UiText style={[styles.degradedTitle, presentation === "kit" && styles.kitDegradedTitle]}>{title ?? copy.degraded.iorbitUnavailable}</UiText>
        <UiText style={[styles.message, presentation === "kit" && styles.kitDegradedMessage]}>{message ?? copy.degraded.iorbitStopped}</UiText>
        {presentation === "kit" && onRetry ? <View style={styles.kitDegradedRetry}><Button icon="refresh" label={copy.action.retry} onPress={onRetry} size="sm" variant="surface" /></View> : null}
      </View>
      {presentation !== "kit" && onRetry ? <Button label={copy.action.retry} onPress={onRetry} size="sm" variant="secondary" /> : null}
    </View>
  );
}

// Sample data marks (01-system 示例模式): a small apricot tag and a banner.
export function SampleTag({ presentation = "default" }: { presentation?: "default" | "kit" }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return <View style={styles.sampleTag}><UiText style={[styles.sampleText, presentation === "kit" && styles.kitSampleTagText]}>{copy.sample.tag}</UiText></View>;
}

export function SampleBar({ trailing, presentation = "default", onClose, emoji }: { trailing?: ReactNode; presentation?: "default" | "kit"; onClose?: () => void; emoji?: string }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View style={[styles.sampleBar, presentation === "kit" && styles.kitSampleBar]}>
      {presentation === "kit" && emoji ? <UiText style={styles.kitSampleEmoji}>{emoji}</UiText> : null}
      <UiText numberOfLines={presentation === "kit" ? 2 : undefined} adjustsFontSizeToFit={presentation === "kit"} minimumFontScale={0.9} style={[styles.sampleText, styles.sampleBarText, presentation === "kit" && styles.kitSampleBarText]}>{copy.sample.banner}</UiText>
      {trailing}
      {presentation === "kit" && onClose ? <UiPressable accessibilityRole="button" accessibilityLabel={copy.action.close} hitSlop={8} onPress={onClose} style={styles.kitSampleClose}><Icon name="x" size={16} color={styles.sampleText.color} /></UiPressable> : null}
    </View>
  );
}

// Quota (01-system 配额): 「今月あと N 回」, coral when used up.
export function QuotaChip({ left, presentation = "default" }: { left: number; presentation?: "default" | "kit" }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  const out = left <= 0;
  return (
    <View style={[styles.quota, out && styles.quotaOut, presentation === "kit" && styles.kitQuota, presentation === "kit" && out && styles.kitQuotaOut]}>
      {presentation === "kit" ? <View style={[styles.quotaDot, out && styles.quotaDotOut]} /> : null}
      <UiText style={[styles.quotaText, out && styles.quotaTextOut, presentation === "kit" && out && styles.kitQuotaTextOut]}>{out ? copy.quota.reached : fillCopy(copy.quota.left, { count: left })}</UiText>
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
  kitSkeleton: { backgroundColor: colors.surface, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  kitSkeletonLabel: { width: "40%", height: 11 },
  kitSkeletonTitle: { width: "52%", height: 30, marginTop: 10 },
  kitSkeletonRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  kitSkeletonAvatar: { width: 38, height: 38, borderRadius: 19 },
  kitSkeletonLines: { flex: 1 },
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
  kitSampleTagText: { fontSize: 9.5 },
  sampleBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.macApricot, borderRadius: 14, padding: 12 },
  sampleBarText: { flex: 1, fontSize: 12.5 },
  quota: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  quotaOut: { backgroundColor: colors.coralSoft },
  quotaText: { color: colors.ink2, fontSize: 11, fontWeight: "700" },
  quotaTextOut: { color: colors.coralText },
  kitOffline: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 10, paddingVertical: 9, borderRadius: 16 },
  kitOfflineText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  kitPending: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface },
  kitPendingText: { color: colors.macApricotText, fontSize: 11, fontWeight: "700" },
  kitSyncedNote: { color: colors.macTealText, opacity: 0.7, fontSize: 11.5 },
  kitRetry: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 24, gap: 0 },
  kitRetryIcon: { marginBottom: 12 },
  kitRetryTitle: { fontSize: 15 },
  kitRetryMessage: { textAlign: "center", fontSize: 12.5, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  kitRetryActions: { justifyContent: "center", marginTop: 0 },
  kitDegraded: { paddingHorizontal: 14, paddingVertical: 12 },
  kitDegradedTitle: { fontSize: 12 },
  kitDegradedMessage: { fontSize: 12, lineHeight: 18 },
  kitDegradedRetry: { marginTop: 8 },
  kitSampleBar: { gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16 },
  kitSampleBarText: { fontSize: 11.5, fontWeight: "700", letterSpacing: -0.2 },
  kitSampleEmoji: { fontSize: 16 },
  kitSampleClose: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kitQuota: { flexDirection: "row", alignItems: "center", gap: 5 },
  kitQuotaOut: { backgroundColor: colors.surface2 },
  kitQuotaTextOut: { color: colors.ink2 },
  quotaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.plum500 },
  quotaDotOut: { backgroundColor: colors.coral },
}));

