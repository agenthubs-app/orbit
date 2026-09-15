import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function ProfilePageFrame({
  backLabel,
  children,
  footer,
  onBack,
  rightAction,
  title,
}: {
  backLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack: () => void;
  rightAction?: ReactNode;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <View style={styles.navigation}>
        <Pressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
          <Ionicons color={colors.accent} name="chevron-back" size={20} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.navigationTitle}>{title}</Text>
        <View style={styles.navAction}>{rightAction}</View>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function ProfileSection({ children, detail, title }: { children: ReactNode; detail?: string; title: string }) {
  const { styles } = useStyles();
  return <View style={styles.section}>
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>;
}

export function ProfileTextField({ containerStyle, label, helper, ...props }: TextInputProps & { containerStyle?: StyleProp<ViewStyle>; helper?: string; label: string }) {
  const { colors, styles } = useStyles();
  return <View style={[styles.field, containerStyle]}>
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.text4} style={[styles.input, props.multiline ? styles.multiline : null]} {...props} />
  </View>;
}

export function ProfileNavRow({ detail, disabled = false, icon, label, onPress, value }: {
  detail?: string;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  value?: string;
}) {
  const { colors, styles } = useStyles();
  const content = <>
    {icon ? <Ionicons color={colors.text3} name={icon} size={19} /> : null}
    <View style={styles.rowCopy}>
      <Text style={styles.rowLabel}>{label}</Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
    {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    {onPress && !disabled ? <Ionicons color={colors.text4} name="chevron-forward" size={16} /> : null}
  </>;
  return onPress ? <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={styles.row}>{content}</View>;
}

export function ProfilePrimaryButton({ disabled = false, label, onPress, secondary = false }: { disabled?: boolean; label: string; onPress?: () => void; secondary?: boolean }) {
  const { styles } = useStyles();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.primaryButtonText, secondary && styles.secondaryButtonText]}>{label}</Text>
  </Pressable>;
}

export function ProfileTags({ values }: { values: readonly string[] }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  return <View style={styles.tags}>{values.map(value => <Text key={value} style={styles.tag}>{locale.t.literal(value)}</Text>)}</View>;
}

export function ProfileNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const { styles } = useStyles();
  return <Text accessibilityRole={error ? "alert" : "text"} style={[styles.notice, error && styles.noticeError]}>{children}</Text>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safeArea: { backgroundColor: colors.surface, flex: 1 },
  navigation: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 48, paddingHorizontal: 8 },
  navButton: { alignItems: "center", flexDirection: "row", minHeight: 44, minWidth: 72, paddingHorizontal: 4 },
  backText: { color: colors.accent, fontSize: 14, lineHeight: 20 },
  navigationTitle: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "800", lineHeight: 22, textAlign: "center" },
  navAction: { alignItems: "flex-end", minWidth: 72 },
  content: { alignSelf: "center", gap: 24, maxWidth: 820, paddingBottom: 48, paddingHorizontal: 16, paddingTop: 20, width: "100%" },
  contentWithFooter: { paddingBottom: 104 },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  section: { gap: 8 },
  sectionHeading: { alignItems: "baseline", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, flexShrink: 1, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  sectionDetail: { color: colors.text4, flexShrink: 1, fontSize: 12, lineHeight: 18, textAlign: "right" },
  sectionBody: { borderTopColor: colors.border, borderTopWidth: 1 },
  field: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 7, paddingVertical: 12 },
  fieldHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  fieldLabel: { color: colors.text3, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  fieldHelper: { color: colors.text4, fontSize: 12, lineHeight: 18 },
  input: { backgroundColor: colors.surface, borderWidth: 0, color: colors.ink, fontSize: 15, lineHeight: 22, minHeight: 48, paddingHorizontal: 0, paddingVertical: 11 },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  row: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 52, paddingVertical: 10 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: colors.ink, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  rowDetail: { color: colors.text4, fontSize: 12, lineHeight: 18, marginTop: 2 },
  rowValue: { color: colors.text3, flexShrink: 1, fontSize: 13, lineHeight: 19, maxWidth: "45%", textAlign: "right" },
  primaryButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: 12, justifyContent: "center", minHeight: 50, paddingHorizontal: 18 },
  primaryButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: "800", lineHeight: 22 },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  secondaryButtonText: { color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 12 },
  tag: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 13, lineHeight: 19, maxWidth: "100%", overflow: "hidden", paddingHorizontal: 11, paddingVertical: 7 },
  notice: { color: colors.text3, fontSize: 13, lineHeight: 20 },
  noticeError: { color: colors.rose },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.68 },
}));
