import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { contactDraftConfirmPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  acquisitionResultToSummary,
  buildContactAcquisitionRequest,
  type ContactAcquisitionFormState,
  type ContactAcquisitionMode,
  type ContactAcquisitionSummary
} from "../../view-models/contact-acquisition";

const emptyForm: ContactAcquisitionFormState = {
  displayName: "",
  followUpHint: "",
  imageBase64: "",
  imageMimeType: "",
  imageName: "",
  imageSizeBytes: null,
  imageText: "",
  imageUri: "",
  note: "",
  organization: "",
  qrText: "",
  role: "",
  scanLabel: "",
  tagsText: ""
};

const modes: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  mode: ContactAcquisitionMode;
}> = [
  { icon: "card-outline", label: "名片", mode: "businessCard" },
  { icon: "qr-code-outline", label: "QR", mode: "qr" },
  { icon: "create-outline", label: "手动", mode: "manual" }
];

export function ContactAcquisitionScreen() {
  const router = useRouter();
  const client = useOrbitApiClient();
  const [form, setForm] = useState<ContactAcquisitionFormState>(emptyForm);
  const [mode, setMode] = useState<ContactAcquisitionMode>("businessCard");
  const [result, setResult] = useState<ContactAcquisitionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: keyof ContactAcquisitionFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function submitSource() {
    const request = buildContactAcquisitionRequest(mode, form);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setResult(acquisitionResultToSummary(response.data));
      } else {
        setError(response.error.message);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "来源暂时提交不了。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDraft(draftId: string) {
    if (!draftId) {
      setError("这条候选缺少草稿编号，暂时不能确认。");
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      const response = await client.post<unknown>(contactDraftConfirmPath(draftId));

      if (response.success) {
        setResult(acquisitionResultToSummary(response.data));
      } else {
        setError(response.error.message);
      }
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "这条候选暂时确认不了。"
      );
    } finally {
      setConfirming(false);
    }
  }

  async function pickBusinessCardImage() {
    setPickingImage(true);
    setError(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError("需要允许访问照片，才能选择名片图片。");
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        base64: true,
        mediaTypes: ["images"],
        quality: 0.86
      });

      if (pickerResult.canceled) {
        return;
      }

      applyPickedBusinessCardAsset(pickerResult.assets[0]);
    } catch (pickError) {
      setError(
        pickError instanceof Error ? pickError.message : "名片图片暂时选择不了。"
      );
    } finally {
      setPickingImage(false);
    }
  }

  async function captureBusinessCardImage() {
    setPickingImage(true);
    setError(null);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        setError("需要允许使用相机，才能拍摄名片。");
        return;
      }

      const cameraResult = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        base64: true,
        quality: 0.86
      });

      if (cameraResult.canceled) {
        return;
      }

      applyPickedBusinessCardAsset(cameraResult.assets[0]);
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : "名片暂时拍不了。"
      );
    } finally {
      setPickingImage(false);
    }
  }

  function applyPickedBusinessCardAsset(
    asset: ImagePicker.ImagePickerAsset | undefined
  ) {
    if (!asset?.base64) {
      setError("这张图片暂时读取不了，请换一张更清晰的名片。");
      return;
    }

    setForm((current) => ({
      ...current,
      imageBase64: asset.base64 ?? "",
      imageMimeType: asset.mimeType ?? "image/jpeg",
      imageName: asset.fileName || current.imageName || "business-card.jpg",
      imageSizeBytes: asset.fileSize ?? null,
      imageUri: asset.uri
    }));
  }

  return (
    <AppScreen eyebrow="来源采集" title="添加人脉">
      <DataCard detail="确认前不会写入联系人" title="选择来源">
        <View style={styles.modeRow}>
          {modes.map((item) => {
            const selected = item.mode === mode;

            return (
              <Pressable
                accessibilityRole="button"
                key={item.mode}
                onPress={() => setMode(item.mode)}
                style={({ pressed }) => [
                  styles.modeButton,
                  selected ? styles.modeButtonActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons
                  color={selected ? colors.onAccent : colors.accent}
                  name={item.icon}
                  size={18}
                />
                <Text
                  style={[
                    styles.modeButtonText,
                    selected ? styles.modeButtonTextActive : null
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DataCard>
      <DataCard detail={formDetail(mode)} title={formTitle(mode)}>
        {mode === "manual" ? (
          <ManualFields form={form} updateField={updateField} />
        ) : null}
        {mode === "qr" ? <QrFields form={form} updateField={updateField} /> : null}
        {mode === "businessCard" ? (
          <BusinessCardFields
            form={form}
            onCaptureImage={captureBusinessCardImage}
            onPickImage={pickBusinessCardImage}
            pickingImage={pickingImage}
            updateField={updateField}
          />
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={submitSource}
          style={({ pressed }) => [
            styles.primaryButton,
            submitting ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="add-outline" size={18} />
          <Text style={styles.primaryButtonText}>
            {submitting ? "提交中" : "生成待确认候选"}
          </Text>
        </Pressable>
      </DataCard>
      {result ? (
        <AcquisitionResultCard
          confirming={confirming}
          onBack={() => router.push("/contacts")}
          onConfirm={confirmDraft}
          result={result}
        />
      ) : null}
    </AppScreen>
  );
}

function formTitle(mode: ContactAcquisitionMode): string {
  if (mode === "qr") {
    return "粘贴 QR 内容";
  }

  if (mode === "businessCard") {
    return "识别名片";
  }

  return "手动记录关系";
}

function formDetail(mode: ContactAcquisitionMode): string {
  if (mode === "qr") {
    return "适合活动现场扫码后的文本";
  }

  if (mode === "businessCard") {
    return "拍照或上传图片，也可以粘贴文字";
  }

  return "适合刚聊完的人";
}

function ManualFields({
  form,
  updateField
}: {
  form: ContactAcquisitionFormState;
  updateField: (field: keyof ContactAcquisitionFormState, value: string) => void;
}) {
  return (
    <>
      <Input
        label="姓名"
        onChangeText={(value) => updateField("displayName", value)}
        placeholder="例如：王小雨"
        value={form.displayName}
      />
      <Input
        label="公司"
        onChangeText={(value) => updateField("organization", value)}
        placeholder="例如：Orbit"
        value={form.organization}
      />
      <Input
        label="职位"
        onChangeText={(value) => updateField("role", value)}
        placeholder="例如：市场负责人"
        value={form.role}
      />
      <Input
        label="关系备注"
        multiline
        onChangeText={(value) => updateField("note", value)}
        placeholder="在哪里认识、对方想找什么、你能提供什么。"
        value={form.note}
      />
      <Input
        label="下一步"
        onChangeText={(value) => updateField("followUpHint", value)}
        placeholder="例如：下周约 30 分钟交流"
        value={form.followUpHint}
      />
      <Input
        label="标签"
        onChangeText={(value) => updateField("tagsText", value)}
        placeholder="AI, 东京, 制造业"
        value={form.tagsText}
      />
    </>
  );
}

function QrFields({
  form,
  updateField
}: {
  form: ContactAcquisitionFormState;
  updateField: (field: keyof ContactAcquisitionFormState, value: string) => void;
}) {
  return (
    <>
      <Input
        label="QR 内容"
        multiline
        onChangeText={(value) => updateField("qrText", value)}
        placeholder="粘贴扫码得到的文本或链接"
        value={form.qrText}
      />
      <Input
        label="来源备注"
        onChangeText={(value) => updateField("scanLabel", value)}
        placeholder="例如：东京 AI 活动现场"
        value={form.scanLabel}
      />
    </>
  );
}

function BusinessCardFields({
  form,
  onCaptureImage,
  onPickImage,
  pickingImage,
  updateField
}: {
  form: ContactAcquisitionFormState;
  onCaptureImage: () => void;
  onPickImage: () => void;
  pickingImage: boolean;
  updateField: (field: keyof ContactAcquisitionFormState, value: string) => void;
}) {
  return (
    <>
      <View style={styles.cardImagePanel}>
        {form.imageUri ? (
          <Image
            accessibilityLabel="已选择的名片图片"
            source={{ uri: form.imageUri }}
            style={styles.cardImagePreview}
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons color={colors.accent} name="scan-outline" size={28} />
            <Text style={styles.placeholderText}>拍名片或选图片</Text>
          </View>
        )}
        <View style={styles.cardImageActions}>
          <Pressable
            accessibilityRole="button"
            disabled={pickingImage}
            onPress={onCaptureImage}
            style={({ pressed }) => [
              styles.secondaryButton,
              pickingImage ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="camera-outline" size={18} />
            <Text style={styles.secondaryButtonText}>
              {pickingImage ? "处理中" : "拍名片"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={pickingImage}
            onPress={onPickImage}
            style={({ pressed }) => [
              styles.secondaryButton,
              pickingImage ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.accent} name="image-outline" size={18} />
            <Text style={styles.secondaryButtonText}>
              {pickingImage ? "处理中" : "选图片"}
            </Text>
          </Pressable>
        </View>
        {form.imageName ? (
          <Text numberOfLines={1} style={styles.imageMetaText}>
            {[form.imageName, sizeLabel(form.imageSizeBytes)]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
      <Text style={styles.helperText}>
        图片会先生成待确认候选；你确认前不会写入联系人。
      </Text>
      <Input
        label="名片文字"
        multiline
        onChangeText={(value) => updateField("imageText", value)}
        placeholder={"图片不清楚时，可粘贴：姓名\n公司\n职位\n邮箱或电话"}
        value={form.imageText}
      />
      <Input
        label="备注名"
        onChangeText={(value) => updateField("imageName", value)}
        placeholder="例如：关西交流会名片"
        value={form.imageName}
      />
    </>
  );
}

function sizeLabel(value: number | null | undefined): string {
  if (!value || value <= 0) {
    return "";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.ceil(value / 1024)} KB`;
}

function Input({
  label,
  multiline,
  onChangeText,
  placeholder,
  value
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text4}
        style={[styles.input, multiline ? styles.textArea : null]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
  );
}

function AcquisitionResultCard({
  confirming,
  onBack,
  onConfirm,
  result
}: {
  confirming: boolean;
  onBack: () => void;
  onConfirm: (draftId: string) => void;
  result: ContactAcquisitionSummary;
}) {
  return (
    <DataCard
      detail={[result.stateLabel, result.writeState].filter(Boolean).join(" · ")}
      title={result.title}
    >
      {result.detail ? <Text style={styles.bodyText}>{result.detail}</Text> : null}
      {result.sourceLabel ? (
        <Text style={styles.sourceText}>{result.sourceLabel}</Text>
      ) : null}
      <Text style={styles.bodyText}>{result.confirmationText}</Text>
      <Text style={styles.bodyText}>{result.nextAction}</Text>
      {result.evidenceExcerpts.length > 0 ? (
        <View style={styles.evidenceStack}>
          {result.evidenceExcerpts.map((excerpt) => (
            <Text key={excerpt} style={styles.evidenceText}>
              {excerpt}
            </Text>
          ))}
        </View>
      ) : null}
      {result.canConfirm ? (
        <Pressable
          accessibilityRole="button"
          disabled={confirming}
          onPress={() => onConfirm(result.draftId)}
          style={({ pressed }) => [
            styles.primaryButton,
            confirming ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="checkmark-outline" size={18} />
          <Text style={styles.primaryButtonText}>
            {confirming ? "确认中" : result.confirmLabel}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.confirmedText}>{result.confirmLabel}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="people-outline" size={18} />
        <Text style={styles.secondaryButtonText}>回到人脉</Text>
      </Pressable>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  cardImageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  cardImagePanel: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.md
  },
  cardImagePlaceholder: {
    alignItems: "center",
    aspectRatio: 1.58,
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: "center"
  },
  cardImagePreview: {
    aspectRatio: 1.58,
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    width: "100%"
  },
  confirmedText: {
    alignSelf: "flex-start",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  disabled: {
    opacity: 0.55
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  evidenceStack: {
    gap: spacing.sm
  },
  evidenceText: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    overflow: "hidden",
    padding: spacing.md
  },
  helperText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  imageMetaText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  inputGroup: {
    gap: spacing.xs
  },
  inputLabel: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  modeButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.sm
  },
  modeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  modeButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  modeButtonTextActive: {
    color: colors.onAccent
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  placeholderText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  sourceText: {
    alignSelf: "flex-start",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  textArea: {
    minHeight: 96,
    paddingTop: spacing.md
  }
});
