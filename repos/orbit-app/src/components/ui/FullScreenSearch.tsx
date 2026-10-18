import type { ReactNode } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { ShellBackground } from "../ShellBackground";
import { SHELL_GUTTER } from "../ShellTopBar";
import { Icon } from "./Icon";
import { UiPortal } from "./Portal";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";
import { useBackHandler } from "./useBackHandler";

// R31a (G23 / R27-04 / R30): the full-screen search page — safe area, the page fog (kit .phone), a search row
// (44 pill field with 🔍, clear ✕ and the ghost キャンセル), an optional chip row, then the results the caller draws.
// Two kit boards, two row variants:
//   kind "global" — b5 #53–#56 .sbar: padding 6 0 12, gap 10, キャンセル = .btn.ghost (40, 0 / 4, 13 / 700);
//   kind "events" — b2 探す search: same padding, gap 8, the field focused (.search.on: 2px plum-300 ring, 48 tall),
//                   キャンセル = .btn.ghost.sm (32, 0 / 12, 12 / 700).
// \`overlay\` draws it above the current page in the root portal (DiscoverPage's in-page search; no RN <Modal>), with
// Android back = キャンセル; without it, it is the page itself (/search).
export function FullScreenSearch({
  kind = "global",
  overlay = false,
  visible = true,
  value,
  onChangeText,
  onSubmitEditing,
  placeholder,
  clearLabel,
  cancelLabel,
  onCancel,
  showSoftInputOnFocus = true,
  topGap = 0,
  chips,
  children,
  testID,
  inputTestID,
}: {
  kind?: "global" | "events";
  overlay?: boolean;
  visible?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  clearLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  /** false: focus without the software keyboard (the `no-keyboard` dev switch: boards never draw a keyboard). */
  showSoftInputOnFocus?: boolean;
  /** extra space under the safe area (the shell's top gap on a page). */
  topGap?: number;
  chips?: ReactNode;
  children?: ReactNode;
  testID?: string;
  inputTestID?: string;
}) {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  useBackHandler(overlay && visible, onCancel);
  if (!visible) return null;
  const events = kind === "events";
  const iconColor = events ? colors.ink3Text : colors.ink3;
  const page = (
    <View style={[styles.page, { paddingTop: insets.top + topGap }]} testID={testID}>
      <ShellBackground />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.sbar, events && styles.sbarEvents]}>
          <View style={styles.search}>
            {events ? <View pointerEvents="none" style={styles.searchRing} /> : null}
            <Icon name="search" size={16} color={iconColor} />
            <TextInput value={value} onChangeText={onChangeText} autoFocus showSoftInputOnFocus={showSoftInputOnFocus} onSubmitEditing={onSubmitEditing} placeholder={placeholder} placeholderTextColor={colors.ink3Text} accessibilityLabel={placeholder} returnKeyType="search" style={styles.input} {...(inputTestID ? { testID: inputTestID } : {})} />
            {value ? <UiPressable accessibilityRole="button" accessibilityLabel={clearLabel} onPress={() => onChangeText("")} hitSlop={8}><Icon name="x" size={16} color={iconColor} /></UiPressable> : null}
          </View>
          <UiPressable accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={onCancel} hitSlop={events ? 6 : 2} style={[styles.cancel, events && styles.cancelSm]}>
            <UiText style={[styles.cancelText, events && styles.cancelTextSm]}>{cancelLabel}</UiText>
          </UiPressable>
        </View>
        {chips}
        {children}
      </ScrollView>
    </View>
  );
  return overlay ? <UiPortal><View style={StyleSheet.absoluteFill}>{page}</View></UiPortal> : page;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { backgroundColor: colors.bg, flex: 1 },
  scroll: { paddingBottom: 130, paddingHorizontal: SHELL_GUTTER },
  sbar: { alignItems: "center", flexDirection: "row", gap: 10, paddingBottom: 12, paddingTop: 6 },
  sbarEvents: { gap: 8 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 16 },
  // kit .search.on uses an outer box-shadow; draw its 2px ring outside the 44pt field.
  searchRing: { position: "absolute", top: -2, right: -2, bottom: -2, left: -2, borderColor: colors.plum300, borderRadius: radius.pill, borderWidth: 2 },
  input: { color: colors.ink, flex: 1, fontSize: 13.5, padding: 0 },
  cancel: { alignItems: "center", borderRadius: radius.pill, height: 40, justifyContent: "center", paddingHorizontal: 4 },
  cancelSm: { height: 32, paddingHorizontal: 12 },
  cancelText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  cancelTextSm: { fontSize: 12, lineHeight: 18 },
}));
