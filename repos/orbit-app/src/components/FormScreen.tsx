import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppScreen } from "./AppScreen";
import { UiPressable } from "./ui/Pressable";
import { UiText } from "./ui/Text";
import { createThemedStyles } from "../design/theme";

// R31a (R11a request) → UR-E（2026-11-27 用户同意 App 跟手机网页一致）：the full-page edit container — kit .topbar with a
// ✕ round button (キャンセル) on the left and the centred title; 「保存」 is a text button at the bottom of the screen (no
// ✓ in the corner any more). The form itself (fields, sections) is the caller's.
export function FormScreen({ title, subtitle, cancelLabel, saveLabel, onCancel, onSave, saveDisabled = false, children }: {
  title: string;
  subtitle?: string;
  cancelLabel: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  /** while saving or with an invalid form: 「保存」 is dimmed and does nothing */
  saveDisabled?: boolean;
  children: ReactNode;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.page}>
      <AppScreen inset="kit" title={title} subtitle={subtitle} backIcon="x" backAccessibilityLabel={cancelLabel} onBack={onCancel}>
        {children}
        <View style={styles.spacer} />
      </AppScreen>
      <View pointerEvents="box-none" style={styles.foot}>
        <UiPressable accessibilityLabel={saveLabel} accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} onPress={onSave} style={[styles.save, saveDisabled && styles.off]} testID="form-save">
          <UiText style={styles.saveText}>{saveLabel}</UiText>
        </UiPressable>
      </View>
    </View>
  );
}

// kit .btn.primary.block.xl（50 高）在页面最下方，左右 18。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { flex: 1 },
  spacer: { height: 96 },
  foot: { bottom: 26, left: 18, position: "absolute", right: 18 },
  save: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 999, height: 50, justifyContent: "center" },
  saveText: { color: colors.bg, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  off: { opacity: 0.45 },
}));
