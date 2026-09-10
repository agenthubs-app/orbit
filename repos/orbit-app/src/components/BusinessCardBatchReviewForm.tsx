import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { BusinessCardReviewIssueContract } from "../api/contract/business-card-batch";
import { createThemedStyles } from "../design/theme";
import { spacing, typography } from "../design/tokens";
import type { BusinessCardReviewFields } from "../view-models/business-card-batch";

export type BusinessCardReviewImage =
  | { status: "available"; uri: string }
  | { status: "loading" | "none" }
  | { status: "unavailable"; message: string };

export interface BusinessCardBatchReviewFormProps {
  fields: BusinessCardReviewFields | null;
  image: BusinessCardReviewImage;
  reviewIssues: readonly BusinessCardReviewIssueContract[];
  statusLabel: string;
  disabled: boolean;
  canConfirm: boolean;
  canSkip: boolean;
  canRetry: boolean;
  duplicateContactId: string | null;
  onChange: (fields: BusinessCardReviewFields) => void;
  onImageError: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onOverride: () => void;
  onOpenDuplicate: () => void;
}

const fieldLabels: ReadonlyArray<[keyof BusinessCardReviewFields, string]> = [
  ["displayName", "姓名"], ["organization", "公司"], ["role", "职位"],
  ["email", "邮箱"], ["phone", "电话"], ["relationshipContext", "认识背景"], ["notes", "备注"],
];

function ReviewButton({ label, icon, disabled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled: boolean; onPress: () => void }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Ionicons name={icon} size={20} color={colors.accent} /><Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

export function BusinessCardBatchReviewForm(props: BusinessCardBatchReviewFormProps) {
  const { colors, styles } = useStyles();
  const { fields, image, disabled } = props;
  return <View style={styles.section}>
    <Text style={styles.heading}>{props.statusLabel}</Text>
    <View style={styles.imageFrame}>
      {image.status === "available" ? <Image accessibilityLabel="名片图片" accessibilityRole="image" source={{ uri: image.uri }} onError={props.onImageError} resizeMode="contain" style={styles.image} />
        : <Text accessibilityLiveRegion="polite" style={styles.caption}>{image.status === "loading" ? "正在读取图片..." : image.status === "unavailable" ? image.message : "暂无名片图片"}</Text>}
    </View>
    {props.reviewIssues.map((issue, index) => <Text key={`${issue.code}-${index}`} style={styles.warning}>{issue.message}</Text>)}
    {fields ? fieldLabels.map(([field, label]) => <View key={field} style={styles.field}>
      <Text style={styles.caption}>{label}</Text>
      <TextInput accessibilityLabel={label} value={fields[field]} editable={!disabled} multiline={field === "notes" || field === "relationshipContext"} autoCapitalize={field === "email" ? "none" : "sentences"} keyboardType={field === "email" ? "email-address" : field === "phone" ? "phone-pad" : "default"} onChangeText={value => { if (!disabled) props.onChange({ ...fields, [field]: value }); }} placeholderTextColor={colors.text3} style={[styles.input, field === "notes" && styles.notes]} textAlignVertical="top" />
    </View>) : null}
    {props.duplicateContactId ? <View style={styles.section}>
      <Text style={styles.warning}>发现可能重复的联系人，尚未收录。</Text>
      <View style={styles.row}>
        <ReviewButton label="查看重复联系人" icon="person-outline" disabled={disabled} onPress={props.onOpenDuplicate} />
        <ReviewButton label="仍然收录" icon="checkmark-done-outline" disabled={disabled || !props.canConfirm} onPress={props.onOverride} />
      </View>
    </View> : null}
    <View style={styles.row}>
      {fields ? <ReviewButton label="确认收录" icon="checkmark-outline" disabled={disabled || !props.canConfirm || Boolean(props.duplicateContactId)} onPress={props.onConfirm} /> : null}
      <ReviewButton label="跳过名片" icon="play-skip-forward-outline" disabled={disabled || !props.canSkip} onPress={props.onSkip} />
      <ReviewButton label="重试识别" icon="refresh-outline" disabled={disabled || !props.canRetry} onPress={props.onRetry} />
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { gap: spacing.md },
  field: { gap: spacing.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heading: { fontSize: typography.body, fontWeight: "700", color: colors.ink },
  caption: { fontSize: typography.small, lineHeight: 20, color: colors.text3 },
  warning: { fontSize: typography.small, lineHeight: 20, color: colors.rose },
  input: { borderWidth: 1, borderColor: colors.border2, borderRadius: 6, backgroundColor: colors.surface, color: colors.ink, fontSize: typography.body, lineHeight: 23, minHeight: 48, minWidth: 0, padding: spacing.sm },
  notes: { minHeight: 140 },
  imageFrame: { width: "100%", aspectRatio: 1.6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, borderRadius: 6, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  button: { minHeight: 44, maxWidth: "100%", borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  buttonText: { color: colors.ink, fontSize: typography.small, lineHeight: 20, fontWeight: "700", flexShrink: 1 },
  disabled: { opacity: 0.45 },
}));
