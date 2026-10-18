import { useRef } from "react";
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { MacTile } from "./MacTile";
import { UiText } from "./Text";

export type ActionSheetOption = { key: string; label: string; destructive?: boolean };

// 01-system ② / kit .actsheet: when an action needs its consequences listed, or
// there are 3+ choices. Title, consequence rows, then 46-tall buttons stacked:
// the destructive one on top, 「〜を続ける」/ cancel below (iOS action sheet).
// Screen-reader focus starts on the safe choice (`defaultFocusKey`, else the first
// non-destructive option), like the kit's focus on 「〜を続ける」 (R04 review M5).
// R31a: `emoji` draws the kit board header (01-system ② / b4 #19 / b12): a 40 macaron tile, the question left-aligned
// (15 / 700, line-height 1.4; b4 uses 16 via titleSize) and an optional .lbl line, with the consequences 12 below and
// the buttons 14 below them. Without it the question is centred above the consequences (older boards).
export function ActionSheet({ visible, title, subtitle, emoji, emojiTone = "lav", titleSize = 15, effects = [], options, defaultFocusKey, onSelect, onClose }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  emoji?: string;
  emojiTone?: "pink" | "apricot" | "blue" | "teal" | "lav";
  titleSize?: 15 | 16;
  effects?: { icon: IconName; text: string }[];
  options: ActionSheetOption[];
  defaultFocusKey?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const { colors, styles } = useStyles();
  const focusKey = defaultFocusKey ?? options.find((option) => !option.destructive)?.key;
  const destructive = options.some((option) => option.destructive);
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
    // 01-system ③: a destructive action sheet does not close on a backdrop tap or a drag (back / escape still cancel).
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={title} dismissOnBackdrop={!destructive} draggable={!destructive}>
      {emoji ? (
        <View style={styles.head}>
          <MacTile emoji={emoji} tone={emojiTone} />
          <View style={styles.headMeta}>
            <UiText accessibilityRole="header" style={[styles.headTitle, { fontSize: titleSize, lineHeight: titleSize * 1.4 }]}>{title}</UiText>
            {subtitle ? <UiText style={styles.headSub}>{subtitle}</UiText> : null}
          </View>
        </View>
      ) : <UiText accessibilityRole="header" style={styles.title}>{title}</UiText>}
      <View style={emoji ? styles.effects : null}>
        {effects.map((effect) => (
          <View key={effect.text} style={styles.effect}>
            {/* kit .eff: the icon takes the row's ink-2 */}
            <Icon name={effect.icon} size={16} color={colors.ink2} />
            <UiText style={styles.effectText}>{effect.text}</UiText>
          </View>
        ))}
      </View>
      <View style={[styles.buttons, emoji ? styles.buttonsAfterHead : null]}>
        {options.map((option) => (
          <View key={option.key} ref={option.key === focusKey ? focusTarget : undefined} collapsable={false} onLayout={option.key === focusKey ? focusOnce : undefined}>
            <Button block size="lg" label={option.label} onPress={() => onSelect(option.key)} variant={option.destructive ? "danger" : "secondary"} />
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
  buttonsAfterHead: { marginTop: 0 },
  head: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headMeta: { flex: 1, minWidth: 0 },
  headTitle: { color: colors.ink, fontWeight: "700" },
  headSub: { color: colors.ink3Text, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  effects: { marginTop: 12, marginBottom: 14 },
}));
