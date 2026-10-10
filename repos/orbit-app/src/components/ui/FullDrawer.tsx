import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { useStandardCopy } from "../../i18n/standard-copy";
import { IconButton } from "./IconButton";
import { durations, useReducedMotion } from "./motion";
import { UiPortal } from "./Portal";
import { Scrim } from "./Scrim";
import { UiText } from "./Text";
import { useBackHandler } from "./useBackHandler";

// Full-height drawer, 318 wide, from the right (01-system: 全高抽屉 318). Backdrop
// tap and Android back close it. Reduce Motion: fades instead of sliding.
export function FullDrawer({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const close = useCallback(() => onClose(), [onClose]);
  useBackHandler(visible, close);
  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: durations.sheet, useNativeDriver: true }).start();
  }, [slide, visible]);
  if (!visible) return null;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 318, 0] });
  return (
    <UiPortal>
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={StyleSheet.absoluteFill}>
        <Scrim onPress={close} />
        <Animated.View style={[styles.drawer, { opacity: slide, transform: [{ translateX }] }]}>
          <View style={styles.header}>
            <UiText accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</UiText>
            <IconButton accessibilityLabel={copy.action.close} icon="x" onPress={close} size={34} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
        </Animated.View>
      </View>
    </UiPortal>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  drawer: { position: "absolute", top: 0, bottom: 0, right: 0, width: 318, maxWidth: "88%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, paddingTop: 54 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  title: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "800" },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
}));
