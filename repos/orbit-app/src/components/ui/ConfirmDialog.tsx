import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, findNodeHandle, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useStandardCopy } from "../../i18n/standard-copy";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPortal } from "./Portal";
import { Scrim } from "./Scrim";
import { UiText } from "./Text";
import { useBackHandler } from "./useBackHandler";

// 01-system ② / kit .dialog: centred, 296 wide, radius 28. One irreversible action.
//   - title is a question 「〜しますか？」, body says the consequence and what stays;
//   - App order: キャンセル left, the action right (iOS alert); stacked when long;
//   - destructive: coral button, focus starts on キャンセル, backdrop taps do nothing;
//     Android back = cancel;
//   - non-destructive: the main button takes focus, a backdrop tap cancels.
// Reversible actions do not ask: do them and offer 元に戻す in a toast.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  stacked = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  stacked?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  const reduced = useReducedMotion();
  const focusTarget = useRef<View>(null);
  const appear = useRef(new Animated.Value(0)).current;
  const cancel = useCallback(() => onCancel(), [onCancel]);
  useBackHandler(visible, cancel);
  const focused = useRef(false);
  useEffect(() => {
    if (!visible) return;
    focused.current = false;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: durations.dialog, useNativeDriver: true }).start();
  }, [appear, visible]);
  // The dialog draws in the portal host after this component commits, so the
  // initial focus is set once the target has been laid out.
  const focusFirst = () => {
    if (focused.current) return;
    const node = findNodeHandle(focusTarget.current);
    if (!node) return;
    focused.current = true;
    // One frame later: VoiceOver ignores focus requests during the presenting layout.
    requestAnimationFrame(() => AccessibilityInfo.setAccessibilityFocus?.(node));
  };
  if (!visible) return null;
  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.96, 1] });
  const cancelButton = (
    <View ref={destructive ? focusTarget : undefined} collapsable={false} onLayout={destructive ? focusFirst : undefined} style={stacked ? null : styles.half}>
      <Button block label={cancelLabel ?? copy.action.cancel} onPress={cancel} variant="secondary" />
    </View>
  );
  const confirmButton = (
    <View ref={destructive ? undefined : focusTarget} collapsable={false} onLayout={destructive ? undefined : focusFirst} style={stacked ? null : styles.half}>
      <Button block label={confirmLabel} onPress={onConfirm} variant={destructive ? "danger" : "primary"} />
    </View>
  );
  return (
    <UiPortal>
      <View accessibilityViewIsModal style={styles.root}>
        <Scrim onPress={destructive ? undefined : cancel} />
        <Animated.View accessibilityRole="alert" style={[styles.dialog, { opacity: appear, transform: [{ scale }] }]}>
          <View style={[styles.iconBlock, destructive ? styles.iconDanger : styles.iconNeutral]}>
            <Icon name={destructive ? "trash" : "info"} size={24} color={destructive ? colors.coralText : colors.macApricotText} />
          </View>
          <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
          {message ? <UiText style={styles.message}>{message}</UiText> : null}
          {stacked ? <View style={styles.stack}>{confirmButton}{cancelButton}</View> : <View style={styles.row}>{cancelButton}{confirmButton}</View>}
        </Animated.View>
      </View>
    </UiPortal>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 296, maxWidth: "100%", borderRadius: radius.dialog, backgroundColor: colors.surface, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, alignItems: "center" },
  iconBlock: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  iconDanger: { backgroundColor: colors.coralSoft },
  iconNeutral: { backgroundColor: colors.macApricot },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22, textAlign: "center" },
  message: { color: colors.ink2, fontSize: 12.5, lineHeight: 20, textAlign: "center", marginTop: 6 },
  row: { flexDirection: "row", gap: 8, marginTop: 16, alignSelf: "stretch" },
  stack: { gap: 8, marginTop: 16, alignSelf: "stretch" },
  half: { flex: 1 },
}));
