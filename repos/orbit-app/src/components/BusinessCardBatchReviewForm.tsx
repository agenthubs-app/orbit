import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { BusinessCardReviewIssueContract, IngestCardFieldSourcesContract } from "../api/contract/business-card-batch";
import { createThemedStyles } from "../design/theme";
import { spacing } from "../design/tokens";
import type { BusinessCardFieldChoice, BusinessCardReviewFields } from "../view-models/business-card-batch";

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
  fieldSources?: IngestCardFieldSourcesContract;
  conflicts?: Partial<Record<keyof IngestCardFieldSourcesContract, readonly BusinessCardFieldChoice[]>>;
  unresolvedConflicts?: readonly (keyof IngestCardFieldSourcesContract)[];
  onSelectFieldSource?: (field: keyof IngestCardFieldSourcesContract, choice: BusinessCardFieldChoice) => void;
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

function ReviewButton({ label, icon, disabled, primary = false, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled: boolean; primary?: boolean; onPress: () => void }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && styles.disabled]}>
    {!primary ? <Ionicons name={icon} size={20} color={colors.accent} /> : null}<Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

export function BusinessCardBatchReviewForm(props: BusinessCardBatchReviewFormProps) {
  const { colors, styles } = useStyles();
  const { fields, image, disabled } = props;
  const large = useWindowDimensions().fontScale > 1.3;
  const [fieldHeights, setFieldHeights] = useState<Partial<Record<keyof BusinessCardReviewFields, number>>>({});
  return <View style={styles.section}>
    <View style={[styles.imageFrame, large && styles.imageFrameLarge]}>
      {image.status === "available" ? <Image accessibilityLabel="名片图片" accessibilityRole="image" source={{ uri: image.uri }} onError={props.onImageError} resizeMode="contain" style={styles.image} />
        : <Text accessibilityLiveRegion="polite" style={styles.caption}>{image.status === "loading" ? "正在读取图片..." : image.status === "unavailable" ? image.message : "暂无名片图片"}</Text>}
    </View>
    <View style={[styles.headingRow, large && styles.stacked]}>
      <Text accessibilityRole="header" style={styles.heading}>识别结果</Text>
      <Text style={styles.caption}>{props.statusLabel}</Text>
    </View>
    {props.unresolvedConflicts?.length ? <Text style={styles.warning}>正反面信息不一致，请选择来源。</Text> : null}
    {fields ? <View style={styles.fields}>{fieldLabels.map(([field, label]) => <View key={field} style={[styles.field, large && styles.stacked]}>
      <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
      <View style={styles.fieldValue}>
      <TextInput accessibilityLabel={label} value={fields[field]} editable={!disabled} multiline={large || field === "notes" || field === "relationshipContext"} numberOfLines={1} submitBehavior={field === "notes" || field === "relationshipContext" ? "newline" : "blurAndSubmit"} scrollEnabled={false} autoCapitalize={field === "email" ? "none" : "sentences"} keyboardType={field === "email" ? "email-address" : field === "phone" ? "phone-pad" : "default"} onChangeText={value => { if (!disabled) props.onChange({ ...fields, [field]: value }); }} onContentSizeChange={({ nativeEvent }) => {
        const height = Math.max(44, Math.ceil(nativeEvent.contentSize.height));
        setFieldHeights(current => current[field] === height ? current : { ...current, [field]: height });
      }} placeholderTextColor={colors.text3} style={[styles.input, large && styles.inputLarge, (large || field === "notes" || field === "relationshipContext") && { height: fieldHeights[field] ?? 44 }, field === "notes" && styles.notes]} textAlignVertical="top" />
      {field in (props.fieldSources ?? {}) ? <Text style={styles.caption}>来源：{props.unresolvedConflicts?.includes(field as keyof IngestCardFieldSourcesContract) ? "尚未选择" : props.fieldSources?.[field as keyof IngestCardFieldSourcesContract] ? props.conflicts?.[field as keyof IngestCardFieldSourcesContract]?.find(choice => choice.itemId === props.fieldSources?.[field as keyof IngestCardFieldSourcesContract])?.side === "back" ? "反面" : "正面" : "手动编辑"}</Text> : null}
      {props.conflicts?.[field as keyof IngestCardFieldSourcesContract]?.map(choice => <ReviewButton key={choice.itemId} label={`使用${choice.side === "front" ? "正面" : "反面"}${label}`} icon="swap-horizontal-outline" disabled={disabled} onPress={() => props.onSelectFieldSource?.(field as keyof IngestCardFieldSourcesContract, choice)} />)}
      </View>
    </View>)}</View> : null}
    {props.reviewIssues.map((issue, index) => <Text key={`${issue.code}-${index}`} style={styles.warning}>{issue.message}</Text>)}
    {props.duplicateContactId ? <View style={styles.section}>
      <Text style={styles.warning}>发现可能重复的联系人，尚未收录。</Text>
      <View style={styles.row}>
        <ReviewButton label="查看重复联系人" icon="person-outline" disabled={disabled} onPress={props.onOpenDuplicate} />
        <ReviewButton label="仍然收录" icon="checkmark-done-outline" disabled={disabled || !props.canConfirm} onPress={props.onOverride} />
      </View>
    </View> : null}
    <View style={styles.actions}>
      {fields ? <ReviewButton primary label="确认收录" icon="checkmark-outline" disabled={disabled || !props.canConfirm || Boolean(props.duplicateContactId)} onPress={props.onConfirm} /> : null}
      <View style={styles.row}>
        <ReviewButton label="跳过名片" icon="play-skip-forward-outline" disabled={disabled || !props.canSkip} onPress={props.onSkip} />
        <ReviewButton label="重试识别" icon="refresh-outline" disabled={disabled || !props.canRetry} onPress={props.onRetry} />
      </View>
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { gap: spacing.md },
  fields: { borderTopWidth: 1, borderTopColor: colors.border },
  field: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border2, paddingVertical: 2 },
  fieldValue: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 4 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  label: { width: 72, color: colors.text4, fontSize: 14, lineHeight: 20 },
  labelLarge: { width: "100%", paddingTop: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  heading: { fontSize: 15, lineHeight: 22, fontWeight: "800", color: colors.ink },
  caption: { fontSize: 12, lineHeight: 20, color: colors.text3, flexShrink: 1 },
  warning: { fontSize: 13, lineHeight: 20, color: colors.text2, backgroundColor: colors.surface2, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 0, borderWidth: 0, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, fontWeight: "600", lineHeight: 20, minHeight: 44, minWidth: 0, paddingVertical: 12, paddingHorizontal: 0 },
  inputLarge: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  notes: { minHeight: 96 },
  imageFrame: { width: "100%", height: 104, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  imageFrameLarge: { height: 144 },
  image: { width: "100%", height: "100%" },
  actions: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  button: { minHeight: 46, maxWidth: "100%", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  buttonText: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "600", flexShrink: 1 },
  primary: { minHeight: 50, width: "100%", backgroundColor: colors.ink, borderColor: colors.ink },
  primaryText: { color: colors.surface, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  disabled: { opacity: 0.45 },
}));
