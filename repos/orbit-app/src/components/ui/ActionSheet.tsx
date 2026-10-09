import { useRef } from "react";
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { UiText } from "./Text";

export type ActionSheetOption = { key: string; label: string; destructive?: boolean };

// 01-system ② / kit .actsheet: when an action needs its consequences listed, or
// there are 3+ choices. Title, consequence rows, then 46-tall buttons stacked:
// the destructive one on top, 「〜を続ける」/ cancel below (iOS action sheet).
// Screen-reader focus starts on the safe choice (`defaultFocusKey`, else the first
// non-destructive option), like the kit's focus on 「〜を続ける」 (R04 review M5).
export function ActionSheet({ visible, title, effects = [], options, defaultFocusKey, onSelect, onClose }: {
  visible: boolean;
  title: string;
  effects?: { icon: IconName; text: string }[];
  options: ActionSheetOption[];
  defaultFocusKey?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const { colors, styles } = useStyles();
  const focusKey = defaultFocusKey ?? options.find((option) => !option.destructive)?.key;
  const focusTarget = useRef<View>(null);
  const focused = useRef(false);
  if (!visible) focused.current = false;
  const focusOnce = () => {
    if (focused.current) return;
    focused.current = true;
    // One frame later: VoiceOver ignores focus requests during the presenting layout.
    requestAnimationFrame(() => { const handle = findNodeHandle(focusTarget.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); });
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>
      {effects.map((effect) => (
        <View key={effect.text} style={styles.effect}>
          <Icon name={effect.icon} size={16} color={colors.ink3Text} />
          <UiText style={styles.effectText}>{effect.text}</UiText>
        </View>
      ))}
      <View style={styles.buttons}>
        {options.map((option) => (
          <View key={option.key} ref={option.key === focusKey ? focusTarget : undefined} collapsable={false} onLayout={option.key === focusKey ? focusOnce : undefined}>
            <Button block label={option.label} onPress={() => onSelect(option.key)} variant={option.destructive ? "danger" : "secondary"} />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  title: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22, textAlign: "center", marginBottom: 8 },
  effect: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 4 },
  effectText: { flex: 1, color: colors.ink2, fontSize: 12.5, lineHeight: 19 },
  buttons: { gap: 8, marginTop: 14 },
}));
