import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  contactDraftConfirmPath,
  contactDraftMergeSuggestionApplyPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventAttendeeContactDraftImportRequest,
  eventAttendeeContactDraftImportToView,
  type EventAttendeeDraftImportView
} from "../../view-models/event-attendees";
import {
  acquisitionResultToSummary,
  buildContactAcquisitionRequest,
  buildBusinessCardContactWriteRequest,
  buildContactDraftReviewRequest,
  buildExternalContactsImportRequest,
  buildContactMergeApplyRequest,
  buildRecommendedContactConfirmRequest,
  buildReferralRecommendationsRequest,
  businessCardContactWriteToView,
  contactExternalCandidatesToView,
  contactExternalImportToView,
  contactDraftQueueToView,
  contactDraftReviewFormFromSummary,
  contactMergeApplyToView,
  contactMergeReviewToView,
  contactReferralRecommendationsToView,
  recommendedContactConfirmationToView,
  type ContactAcquisitionFormState,
  type ContactAcquisitionMode,
  type ContactAcquisitionSummary,
  type ContactBusinessCardWriteView,
  type ContactDraftQueueView,
  type ContactDraftReviewFieldName,
  type ContactDraftReviewFormState,
  type ContactExternalCandidatesView,
  type ContactExternalCandidateView,
  type ContactExternalImportView,
  type ContactExternalSourceView,
  type ContactMergeApplyView,
  type ContactMergeSuggestionView,
  type ContactMergeReviewView,
  type ContactRecommendedConfirmView,
  type ContactReferralRecommendationsView,
  type ContactReferralSourceKind
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

const referralSourceOptions: Array<{
  countLabel: string;
  id: ContactReferralSourceKind;
  label: string;
}> = [
  { countLabel: "按来源生成", id: "founder_referral", label: "创始人引荐" },
  { countLabel: "按来源生成", id: "investor_intro", label: "投资人介绍" },
  { countLabel: "按来源生成", id: "community_referral", label: "社区引荐" }
];

const localDismissText = "本次先隐藏，刷新或重新生成后仍可复核。";

function firstParam(value?: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function keepBusinessCardWriteCandidate(
  next: ContactAcquisitionSummary,
  current: ContactAcquisitionSummary | null
): ContactAcquisitionSummary {
  if (next.contactWrite || !current?.contactWrite) {
    return next;
  }

  return {
    ...next,
    contactWrite: current.contactWrite,
    ...(current.contactWriteLabel
      ? { contactWriteLabel: current.contactWriteLabel }
      : {})
  };
}

export function ContactAcquisitionScreen() {
  const router = useRouter();
  const { eventId: eventIdParam } = useLocalSearchParams<{
    eventId?: string | string[];
  }>();
  const eventId = firstParam(eventIdParam);
  const client = useOrbitApiClient();
  const [form, setForm] = useState<ContactAcquisitionFormState>(emptyForm);
  const [mode, setMode] = useState<ContactAcquisitionMode>("businessCard");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [result, setResult] = useState<ContactAcquisitionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [businessCardWriteResult, setBusinessCardWriteResult] =
    useState<ContactBusinessCardWriteView | null>(null);
  const [contactsRefreshToken, setContactsRefreshToken] =
    useState<string | null>(null);
  const [dismissedDraftIds, setDismissedDraftIds] = useState<Set<string>>(
    () => new Set()
  );
  const [applyingMergeSuggestionId, setApplyingMergeSuggestionId] =
    useState<string | null>(null);
  const [externalImportResult, setExternalImportResult] =
    useState<ContactExternalImportView | null>(null);
  const [confirmingRecommendationId, setConfirmingRecommendationId] =
    useState<string | null>(null);
  const [importingExternalSource, setImportingExternalSource] =
    useState<string | null>(null);
  const [eventDraftImportResult, setEventDraftImportResult] =
    useState<EventAttendeeDraftImportView | null>(null);
  const [importingEventDrafts, setImportingEventDrafts] = useState(false);
  const [mergeApplyResult, setMergeApplyResult] =
    useState<ContactMergeApplyView | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [qrCameraOpen, setQrCameraOpen] = useState(false);
  const [qrPermissionPending, setQrPermissionPending] = useState(false);
  const qrPermissionRequestIdRef = useRef(0);
  const [qrScannerReady, setQrScannerReady] = useState(true);
  const [reviewFields, setReviewFields] =
    useState<ContactDraftReviewFormState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [referralResult, setReferralResult] =
    useState<ContactReferralRecommendationsView | null>(null);
  const [recommendedConfirmResult, setRecommendedConfirmResult] =
    useState<ContactRecommendedConfirmView | null>(null);
  const [selectedExternalSource, setSelectedExternalSource] =
    useState<string | null>(null);
  const [selectedReferralSource, setSelectedReferralSource] =
    useState<ContactReferralSourceKind | null>(null);
  const [stagingReferralSource, setStagingReferralSource] =
    useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [writingContact, setWritingContact] = useState(false);
  const externalCandidatesState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contactDraftExternalCandidates,
    (data) => contactExternalCandidatesToView(data).candidates.length === 0
  );
  const externalCandidates =
    externalCandidatesState.kind === "success" ||
    externalCandidatesState.kind === "empty"
      ? contactExternalCandidatesToView(externalCandidatesState.data)
      : null;
  const draftQueueState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contactDrafts,
    (data) => contactDraftQueueToView(data).drafts.length === 0
  );
  const draftQueue =
    draftQueueState.kind === "success" || draftQueueState.kind === "empty"
      ? contactDraftQueueToView(draftQueueState.data)
      : null;
  const mergeReviewState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contactDraftMergeSuggestions,
    (data) => contactMergeReviewToView(data).suggestions.length === 0
  );
  const mergeReview =
    mergeReviewState.kind === "success" || mergeReviewState.kind === "empty"
      ? contactMergeReviewToView(mergeReviewState.data)
      : null;

  useEffect(() => {
    if (result?.reviewFields?.length) {
      setReviewFields(contactDraftReviewFormFromSummary(result));
    } else {
      setReviewFields(null);
    }
  }, [result?.draftId, result?.reviewFields?.length]);

  useEffect(
    () => () => {
      qrPermissionRequestIdRef.current += 1;
    },
    []
  );

  function updateField(field: keyof ContactAcquisitionFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function openQrScanner() {
    const requestId = qrPermissionRequestIdRef.current + 1;
    qrPermissionRequestIdRef.current = requestId;
    setError(null);

    if (!cameraPermission?.granted) {
      setQrPermissionPending(true);

      try {
        const permission = await requestCameraPermission();

        if (requestId !== qrPermissionRequestIdRef.current) {
          return;
        }

        if (!permission.granted) {
          setError("需要允许使用相机，才能扫描 QR。");
          return;
        }
      } catch {
        if (requestId === qrPermissionRequestIdRef.current) {
          setError("相机权限暂时无法申请，请检查系统设置后再试。");
        }
        return;
      } finally {
        if (requestId === qrPermissionRequestIdRef.current) {
          setQrPermissionPending(false);
        }
      }
    }

    if (requestId !== qrPermissionRequestIdRef.current) {
      return;
    }

    setQrScannerReady(true);
    setQrCameraOpen(true);
  }

  function closeQrScanner() {
    qrPermissionRequestIdRef.current += 1;
    setQrCameraOpen(false);
    setQrPermissionPending(false);
    setQrScannerReady(true);
  }

  function selectMode(nextMode: ContactAcquisitionMode) {
    closeQrScanner();
    setMode(nextMode);
  }

  function handleQrBarcodeScanned(result: BarcodeScanningResult) {
    if (!qrScannerReady) {
      return;
    }

    const qrText = result.data?.trim();

    if (!qrText) {
      return;
    }

    setQrScannerReady(false);
    updateField("qrText", qrText);
    setMode("qr");
    setQrCameraOpen(false);
  }

  function refreshReviewSurfaces() {
    externalCandidatesState.refresh();
    draftQueueState.refresh();
    mergeReviewState.refresh();
  }

  function dismissDraft(draftId: string) {
    const cleanedDraftId = draftId.trim();

    if (!cleanedDraftId) {
      return;
    }

    setDismissedDraftIds((current) => {
      const next = new Set(current);
      next.add(cleanedDraftId);
      return next;
    });
    setResult((current) =>
      current?.draftId === cleanedDraftId ? null : current
    );
    setBusinessCardWriteResult(null);
    setError(null);
  }

  function onOpenContacts() {
    router.push({
      pathname: "/contacts/list",
      params: { refreshToken: contactsRefreshToken ?? Date.now().toString() }
    });
  }

  function onOpenContact(contactId: string) {
    router.push({
      pathname: "/contacts/[id]",
      params: { id: contactId }
    });
  }

  function updateReviewField(
    field: ContactDraftReviewFieldName,
    value: string
  ) {
    setReviewFields((current) =>
      current
        ? {
            ...current,
            [field]: value
          }
        : current
    );
  }

  async function saveReviewFields() {
    if (!result || !reviewFields) {
      return;
    }

    const request = buildContactDraftReviewRequest(result.draftId, reviewFields);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setReviewing(true);
    setError(null);

    try {
      const response = await client.patch<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        const nextSummary = acquisitionResultToSummary(response.data);
        setResult((current) =>
          keepBusinessCardWriteCandidate(nextSummary, current)
        );
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "名片字段暂时保存不了。"
      );
    } finally {
      setReviewing(false);
    }
  }

  async function submitSource() {
    const request = buildContactAcquisitionRequest(mode, form);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setSubmitting(true);
    setError(null);
    setBusinessCardWriteResult(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setResult(acquisitionResultToSummary(response.data));
        refreshReviewSurfaces();
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
    setBusinessCardWriteResult(null);

    try {
      const response = await client.post<unknown>(contactDraftConfirmPath(draftId));

      if (response.success) {
        const confirmedSummary = acquisitionResultToSummary(response.data);
        setResult(confirmedSummary);
        if (confirmedSummary.contactId) {
          setContactsRefreshToken(Date.now().toString());
        }
        refreshReviewSurfaces();
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

  async function writeBusinessCardContact(summary: ContactAcquisitionSummary) {
    const request = buildBusinessCardContactWriteRequest(summary, reviewFields);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setWritingContact(true);
    setError(null);
    setBusinessCardWriteResult(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setBusinessCardWriteResult(
          businessCardContactWriteToView(response.data)
        );
        setContactsRefreshToken(Date.now().toString());
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (writeError) {
      setError(
        writeError instanceof Error
          ? writeError.message
          : "这张名片暂时写入不了。"
      );
    } finally {
      setWritingContact(false);
    }
  }

  async function applyMergeSuggestion(suggestion: ContactMergeSuggestionView) {
    const request = buildContactMergeApplyRequest(suggestion.id);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setApplyingMergeSuggestionId(suggestion.id);
    setError(null);

    try {
      const response = await client.post<unknown>(
        request.request.endpoint ||
          contactDraftMergeSuggestionApplyPath(suggestion.id),
        {
          body: request.request.body
        }
      );

      if (response.success) {
        setMergeApplyResult(contactMergeApplyToView(response.data));
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "这条重复建议暂时确认不了。"
      );
    } finally {
      setApplyingMergeSuggestionId(null);
    }
  }

  async function importExternalContacts(sourceKind?: string | null) {
    const request = buildExternalContactsImportRequest(sourceKind);
    const importKey = sourceKind?.trim() || "all";

    setImportingExternalSource(importKey);
    setError(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setExternalImportResult(contactExternalImportToView(response.data));
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "外部候选暂时导入不了。"
      );
    } finally {
      setImportingExternalSource(null);
    }
  }

  async function importEventAttendeesAsDrafts() {
    const request = buildEventAttendeeContactDraftImportRequest(eventId);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setImportingEventDrafts(true);
    setError(null);

    try {
      const response = await client.post<unknown>(
        ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport,
        {
          body: request.request.body
        }
      );

      if (response.success) {
        setEventDraftImportResult(
          eventAttendeeContactDraftImportToView(response.data)
        );
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "活动名单暂时导入不了。"
      );
    } finally {
      setImportingEventDrafts(false);
    }
  }

  async function stageReferralRecommendations(
    sourceKind?: ContactReferralSourceKind | null
  ) {
    const request = buildReferralRecommendationsRequest(sourceKind);
    const sourceKey = sourceKind?.trim() || "all";

    setStagingReferralSource(sourceKey);
    setError(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setReferralResult(contactReferralRecommendationsToView(response.data));
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (referralError) {
      setError(
        referralError instanceof Error
          ? referralError.message
          : "引荐候选暂时生成不了。"
      );
    } finally {
      setStagingReferralSource(null);
    }
  }

  async function confirmReferralRecommendation(recommendationId: string) {
    const request = buildRecommendedContactConfirmRequest(recommendationId);

    if (!request.success) {
      setError(request.error);
      return;
    }

    setConfirmingRecommendationId(recommendationId);
    setError(null);

    try {
      const response = await client.post<unknown>(request.request.endpoint, {
        body: request.request.body
      });

      if (response.success) {
        setRecommendedConfirmResult(
          recommendedContactConfirmationToView(response.data)
        );
        refreshReviewSurfaces();
      } else {
        setError(response.error.message);
      }
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "这条引荐推荐暂时确认不了。"
      );
    } finally {
      setConfirmingRecommendationId(null);
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
    <AppScreen
      eyebrow="来源采集"
      refreshControl={
        <RefreshControl
          onRefresh={refreshReviewSurfaces}
          refreshing={
            externalCandidatesState.refreshing ||
            draftQueueState.refreshing ||
            mergeReviewState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="添加人脉"
    >
      <DataCard detail="确认前不会写入联系人" title="选择来源">
        <View accessibilityRole="tablist" style={styles.modeRow}>
          {modes.map((item) => {
            const selected = item.mode === mode;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                key={item.mode}
                onPress={() => selectMode(item.mode)}
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
        {mode === "qr" ? (
          <QrFields
            form={form}
            onCloseScanner={closeQrScanner}
            onOpenScanner={openQrScanner}
            onQrBarcodeScanned={handleQrBarcodeScanned}
            qrCameraOpen={qrCameraOpen}
            qrPermissionPending={qrPermissionPending}
            updateField={updateField}
          />
        ) : null}
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
      {eventId ? (
        <EventContextDraftImportCard
          eventId={eventId}
          importing={importingEventDrafts}
          onImport={importEventAttendeesAsDrafts}
          view={eventDraftImportResult}
        />
      ) : null}
      {externalCandidates ? (
        <ContactExternalCandidatesCard
          importingSource={importingExternalSource}
          onImport={importExternalContacts}
          onSelectSource={setSelectedExternalSource}
          selectedSource={selectedExternalSource}
          view={externalCandidates}
        />
      ) : null}
      {externalImportResult ? (
        <ContactExternalImportResultCard
          confirming={confirming}
          dismissedDraftIds={dismissedDraftIds}
          onConfirm={confirmDraft}
          onDismiss={dismissDraft}
          view={externalImportResult}
        />
      ) : null}
      <ReferralRecommendationsCard
        confirming={confirming}
        confirmingRecommendationId={confirmingRecommendationId}
        dismissedDraftIds={dismissedDraftIds}
        onConfirm={confirmDraft}
        onConfirmRecommendation={confirmReferralRecommendation}
        onDismiss={dismissDraft}
        onSelectSource={setSelectedReferralSource}
        onStage={stageReferralRecommendations}
        selectedSource={selectedReferralSource}
        stagingSource={stagingReferralSource}
        view={referralResult}
      />
      {recommendedConfirmResult ? (
        <RecommendedContactConfirmCard view={recommendedConfirmResult} />
      ) : null}
      {result ? (
        <AcquisitionResultCard
          contactWriteResult={businessCardWriteResult}
          confirming={confirming}
          onConfirm={confirmDraft}
          onDismiss={dismissDraft}
          onOpenContact={onOpenContact}
          onOpenContacts={onOpenContacts}
          onReviewFieldChange={updateReviewField}
          onSaveReview={saveReviewFields}
          onWriteContact={writeBusinessCardContact}
          reviewFields={reviewFields}
          reviewing={reviewing}
          result={result}
          writingContact={writingContact}
        />
      ) : null}
      {mergeReview ? (
        <ContactMergeReviewCard
          applyingSuggestionId={applyingMergeSuggestionId}
          onApply={applyMergeSuggestion}
          review={mergeReview}
        />
      ) : null}
      {mergeApplyResult ? (
        <ContactMergeApplyResultCard view={mergeApplyResult} />
      ) : null}
      {draftQueue ? (
        <ContactDraftQueueCard
          confirming={confirming}
          dismissedDraftIds={dismissedDraftIds}
          onConfirm={confirmDraft}
          onDismiss={dismissDraft}
          queue={draftQueue}
        />
      ) : null}
      {draftQueueState.kind === "failure" ||
      draftQueueState.kind === "offline" ? (
        <Text style={styles.errorText}>{draftQueueState.error.message}</Text>
      ) : null}
      {mergeReviewState.kind === "failure" ||
      mergeReviewState.kind === "offline" ? (
        <Text style={styles.errorText}>{mergeReviewState.error.message}</Text>
      ) : null}
      {externalCandidatesState.kind === "failure" ||
      externalCandidatesState.kind === "offline" ? (
        <Text style={styles.errorText}>{externalCandidatesState.error.message}</Text>
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
  onCloseScanner,
  onOpenScanner,
  onQrBarcodeScanned,
  qrCameraOpen,
  qrPermissionPending,
  updateField
}: {
  form: ContactAcquisitionFormState;
  onCloseScanner: () => void;
  onOpenScanner: () => void;
  onQrBarcodeScanned: (result: BarcodeScanningResult) => void;
  qrCameraOpen: boolean;
  qrPermissionPending: boolean;
  updateField: (field: keyof ContactAcquisitionFormState, value: string) => void;
}) {
  return (
    <>
      {qrCameraOpen ? (
        <View style={styles.qrScannerPanel}>
          <CameraView
            active={qrCameraOpen}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            onBarcodeScanned={onQrBarcodeScanned}
            style={styles.qrCamera}
          />
          <View style={styles.qrScanFrame}>
            <View style={styles.qrScanCorner} />
            <View style={[styles.qrScanCorner, styles.qrScanCornerRight]} />
            <View style={[styles.qrScanCorner, styles.qrScanCornerBottom]} />
            <View
              style={[
                styles.qrScanCorner,
                styles.qrScanCornerRight,
                styles.qrScanCornerBottom
              ]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onCloseScanner}
            style={({ pressed }) => [
              styles.scannerCloseButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="close-outline" size={18} />
            <Text style={styles.scannerCloseText}>关闭扫描</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={qrPermissionPending}
          onPress={onOpenScanner}
          style={({ pressed }) => [
            styles.secondaryButton,
            qrPermissionPending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="scan-outline" size={18} />
          <Text style={styles.secondaryButtonText}>
            {qrPermissionPending ? "等待相机权限" : "扫 QR"}
          </Text>
        </Pressable>
      )}
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
            resizeMode="cover"
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

function EventContextDraftImportCard({
  eventId,
  importing,
  onImport,
  view
}: {
  eventId: string;
  importing: boolean;
  onImport: () => void;
  view: EventAttendeeDraftImportView | null;
}) {
  return (
    <DataCard detail={eventId} title="导入活动名单">
      <Text style={styles.bodyText}>
        把这场活动的参会者先放入待确认候选，逐条复核后再决定是否写入联系人。
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={importing}
        onPress={onImport}
        style={({ pressed }) => [
          styles.secondaryButton,
          importing ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="person-add-outline" size={18} />
        <Text style={styles.secondaryButtonText}>
          {importing ? "导入中" : "导入为待确认候选"}
        </Text>
      </Pressable>
      {view ? (
        <View style={styles.draftQueueStack}>
          <Text style={styles.helperText}>{view.summary}</Text>
          {view.drafts.map((draft) => (
            <View key={draft.id} style={styles.draftQueueItem}>
              <View style={styles.draftQueueHeader}>
                <View style={styles.draftQueueTitleGroup}>
                  <Text numberOfLines={1} style={styles.draftQueueTitle}>
                    {draft.name}
                  </Text>
                  {draft.detail ? (
                    <Text numberOfLines={2} style={styles.draftQueueMeta}>
                      {draft.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.queueStateText}>{draft.statusLabel}</Text>
              </View>
              <Text style={styles.bodyText}>{draft.writeState}</Text>
              <Text style={styles.bodyText}>{draft.relationship}</Text>
              <Text style={styles.bodyText}>{draft.nextAction}</Text>
              {draft.evidence.length > 0 ? (
                <View style={styles.evidenceStack}>
                  {draft.evidence.map((evidence) => (
                    <Text key={`${draft.id}:${evidence}`} style={styles.evidenceText}>
                      {evidence}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <Text style={styles.helperText}>{view.nextAction}</Text>
          <Text style={styles.helperText}>
            这里仍是待确认候选，不会跳过复核直接写入联系人。
          </Text>
        </View>
      ) : null}
    </DataCard>
  );
}

function AcquisitionResultCard({
  contactWriteResult,
  confirming,
  onConfirm,
  onDismiss,
  onOpenContact,
  onOpenContacts,
  onReviewFieldChange,
  onSaveReview,
  onWriteContact,
  reviewFields,
  reviewing,
  result,
  writingContact
}: {
  contactWriteResult: ContactBusinessCardWriteView | null;
  confirming: boolean;
  onConfirm: (draftId: string) => void;
  onDismiss: (draftId: string) => void;
  onOpenContact: (contactId: string) => void;
  onOpenContacts: () => void;
  onReviewFieldChange: (field: ContactDraftReviewFieldName, value: string) => void;
  onSaveReview: () => void;
  onWriteContact: (summary: ContactAcquisitionSummary) => void;
  reviewFields: ContactDraftReviewFormState | null;
  reviewing: boolean;
  result: ContactAcquisitionSummary;
  writingContact: boolean;
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
      {result.reviewFields?.length && reviewFields ? (
        <BusinessCardReviewFields
          fields={result.reviewFields}
          form={reviewFields}
          onChange={onReviewFieldChange}
          onSave={onSaveReview}
          reviewing={reviewing}
          saveLabel={result.reviewLabel ?? "保存复核字段"}
        />
      ) : null}
      {result.evidenceExcerpts.length > 0 ? (
        <View style={styles.evidenceStack}>
          {result.evidenceExcerpts.map((excerpt) => (
            <Text key={excerpt} style={styles.evidenceText}>
              {excerpt}
            </Text>
          ))}
        </View>
      ) : null}
      {contactWriteResult ? (
        <ContactBusinessCardWriteResultCard
          onOpenContact={onOpenContact}
          view={contactWriteResult}
        />
      ) : null}
      {result.contactWrite ? (
        <Pressable
          accessibilityRole="button"
          disabled={writingContact}
          onPress={() => onWriteContact(result)}
          style={({ pressed }) => [
            styles.primaryButton,
            writingContact ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="person-add-outline" size={18} />
          <Text style={styles.primaryButtonText}>
            {writingContact ? "写入中" : result.contactWriteLabel ?? "写入联系人"}
          </Text>
        </Pressable>
      ) : null}
      {result.canConfirm && !result.contactWrite ? (
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
      ) : !result.contactWrite ? (
        <Text style={styles.confirmedText}>{result.confirmLabel}</Text>
      ) : null}
      {result.canConfirm ? (
        <DismissDraftButton onPress={() => onDismiss(result.draftId)} />
      ) : null}
      {result.contactId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenContact(result.contactId!)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="person-outline" size={18} />
          <Text style={styles.secondaryButtonText}>打开联系人</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenContacts}
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

function ContactBusinessCardWriteResultCard({
  onOpenContact,
  view
}: {
  onOpenContact: (contactId: string) => void;
  view: ContactBusinessCardWriteView;
}) {
  return (
    <View style={styles.contactWriteResult}>
      <View style={styles.contactWriteHeader}>
        <Text style={styles.contactWriteTitle}>{view.title}</Text>
        <Text style={styles.contactWriteStatus}>{view.statusLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{view.detail}</Text>
      <Text style={styles.helperText}>{view.nextAction}</Text>
      {view.contactId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenContact(view.contactId!)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="person-circle-outline" size={18} />
          <Text style={styles.secondaryButtonText}>
            {view.openContactLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BusinessCardReviewFields({
  fields,
  form,
  onChange,
  onSave,
  reviewing,
  saveLabel
}: {
  fields: NonNullable<ContactAcquisitionSummary["reviewFields"]>;
  form: ContactDraftReviewFormState;
  onChange: (field: ContactDraftReviewFieldName, value: string) => void;
  onSave: () => void;
  reviewing: boolean;
  saveLabel: string;
}) {
  return (
    <View style={styles.reviewPanel}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewTitle}>名片字段复核</Text>
        <Text style={styles.helperText}>保存后仍然只是候选，不会写入联系人。</Text>
      </View>
      {fields.map((field) => (
        <View key={field.field} style={styles.reviewFieldBlock}>
          <View style={styles.reviewFieldHeader}>
            <Text style={styles.inputLabel}>{field.label}</Text>
            <Text style={styles.reviewMetaText}>
              {field.confidenceLabel} · {field.stateLabel}
            </Text>
          </View>
          <TextInput
            onChangeText={(value) => onChange(field.field, value)}
            placeholder={field.value || field.label}
            placeholderTextColor={colors.text4}
            style={styles.input}
            value={form[field.field]}
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        disabled={reviewing}
        onPress={onSave}
        style={({ pressed }) => [
          styles.secondaryButton,
          reviewing ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="save-outline" size={18} />
        <Text style={styles.secondaryButtonText}>
          {reviewing ? "保存中" : saveLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function ContactExternalCandidatesCard({
  importingSource,
  onImport,
  onSelectSource,
  selectedSource,
  view
}: {
  importingSource: string | null;
  onImport: (sourceKind?: string | null) => void;
  onSelectSource: (sourceKind: string | null) => void;
  selectedSource: string | null;
  view: ContactExternalCandidatesView;
}) {
  const activeSource = selectedSource?.trim() || null;
  const visibleCandidates = activeSource
    ? view.candidates.filter((candidate) => candidate.sourceKind === activeSource)
    : view.candidates;
  const importKey = activeSource || "all";
  const importing = importingSource === importKey;

  return (
    <DataCard detail={view.summary} title="外部导入">
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      {view.sources.length > 0 ? (
        <View accessibilityRole="radiogroup" style={styles.externalSourceRow}>
          <SourceChip
            active={!activeSource}
            countLabel={`${view.candidates.length} 个候选`}
            label="全部"
            onPress={() => onSelectSource(null)}
          />
          {view.sources.map((source) => (
            <SourceChip
              active={activeSource === source.id}
              countLabel={source.countLabel}
              key={source.id}
              label={source.label}
              onPress={() => onSelectSource(source.id)}
              stateLabel={source.stateLabel}
            />
          ))}
        </View>
      ) : null}
      {view.emptyText ? (
        <Text style={styles.helperText}>{view.emptyText}</Text>
      ) : null}
      {visibleCandidates.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {visibleCandidates.map((candidate) => (
            <ExternalCandidateItem candidate={candidate} key={candidate.id} />
          ))}
        </View>
      ) : null}
      <Text style={styles.helperText}>生成待确认候选，不会直接写联系人。</Text>
      <Pressable
        accessibilityRole="button"
        disabled={Boolean(importingSource) || view.candidates.length === 0}
        onPress={() => onImport(activeSource)}
        style={({ pressed }) => [
          styles.primaryButton,
          Boolean(importingSource) || view.candidates.length === 0
            ? styles.disabled
            : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="cloud-upload-outline" size={18} />
        <Text style={styles.primaryButtonText}>
          {importing ? "导入中" : "导入为候选"}
        </Text>
      </Pressable>
    </DataCard>
  );
}

function SourceChip({
  active,
  countLabel,
  label,
  onPress,
  stateLabel
}: {
  active: boolean;
  countLabel: string;
  label: string;
  onPress: () => void;
  stateLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      aria-checked={active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sourceChip,
        active ? styles.sourceChipActive : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[styles.sourceChipTitle, active ? styles.sourceChipTitleActive : null]}>
        {label}
      </Text>
      <Text style={[styles.sourceChipMeta, active ? styles.sourceChipMetaActive : null]}>
        {[countLabel, stateLabel].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

function ExternalCandidateItem({
  candidate
}: {
  candidate: ContactExternalCandidateView;
}) {
  return (
    <View style={styles.externalCandidateItem}>
      <View style={styles.draftQueueHeader}>
        <View style={styles.draftQueueTitleGroup}>
          <Text numberOfLines={1} style={styles.draftQueueTitle}>
            {candidate.name}
          </Text>
          {candidate.detail ? (
            <Text numberOfLines={2} style={styles.draftQueueMeta}>
              {candidate.detail}
            </Text>
          ) : null}
        </View>
        <Text style={styles.mergeReviewBadge}>{candidate.confidenceLabel}</Text>
      </View>
      <View style={styles.externalMetaRow}>
        <Text style={styles.sourceText}>{candidate.sourceLabel}</Text>
        <Text style={styles.queueStateText}>{candidate.duplicateText}</Text>
      </View>
      <Text style={styles.bodyText}>{candidate.nextAction}</Text>
    </View>
  );
}

function ContactExternalImportResultCard({
  confirming,
  dismissedDraftIds,
  onConfirm,
  onDismiss,
  view
}: {
  confirming: boolean;
  dismissedDraftIds: Set<string>;
  onConfirm: (draftId: string) => void;
  onDismiss: (draftId: string) => void;
  view: ContactExternalImportView;
}) {
  const visibleDrafts = view.drafts.filter(
    (draft) => !dismissedDraftIds.has(draft.draftId)
  );

  return (
    <DataCard detail={view.summary} title={view.title}>
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <Text style={styles.helperText}>{view.safetyText}</Text>
      {visibleDrafts.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {visibleDrafts.map((draft) => (
            <View key={draft.draftId || draft.title} style={styles.draftQueueItem}>
              <View style={styles.draftQueueHeader}>
                <View style={styles.draftQueueTitleGroup}>
                  <Text numberOfLines={1} style={styles.draftQueueTitle}>
                    {draft.title}
                  </Text>
                  {draft.detail ? (
                    <Text numberOfLines={2} style={styles.draftQueueMeta}>
                      {draft.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.queueStateText}>{draft.stateLabel}</Text>
              </View>
              {draft.sourceLabel ? (
                <Text style={styles.sourceText}>{draft.sourceLabel}</Text>
              ) : null}
              <Text style={styles.bodyText}>{draft.confirmationText}</Text>
              <Text style={styles.bodyText}>{draft.nextAction}</Text>
              {draft.canConfirm ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={confirming}
                  onPress={() => onConfirm(draft.draftId)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    confirming ? styles.disabled : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    color={colors.accent}
                    name="checkmark-circle-outline"
                    size={18}
                  />
                  <Text style={styles.secondaryButtonText}>
                    {confirming ? "确认中" : draft.confirmLabel}
                  </Text>
                </Pressable>
              ) : null}
              {draft.canConfirm ? (
                <DismissDraftButton onPress={() => onDismiss(draft.draftId)} />
              ) : null}
            </View>
          ))}
        </View>
      ) : view.drafts.length > 0 ? (
        <Text style={styles.helperText}>{localDismissText}</Text>
      ) : null}
    </DataCard>
  );
}

function ReferralRecommendationsCard({
  confirming,
  confirmingRecommendationId,
  dismissedDraftIds,
  onConfirm,
  onConfirmRecommendation,
  onDismiss,
  onSelectSource,
  onStage,
  selectedSource,
  stagingSource,
  view
}: {
  confirming: boolean;
  confirmingRecommendationId: string | null;
  dismissedDraftIds: Set<string>;
  onConfirm: (draftId: string) => void;
  onConfirmRecommendation: (recommendationId: string) => void;
  onDismiss: (draftId: string) => void;
  onSelectSource: (sourceKind: ContactReferralSourceKind | null) => void;
  onStage: (sourceKind?: ContactReferralSourceKind | null) => void;
  selectedSource: ContactReferralSourceKind | null;
  stagingSource: string | null;
  view: ContactReferralRecommendationsView | null;
}) {
  const sources = view?.sources.length ? view.sources : referralSourceOptions;
  const activeSource = selectedSource;
  const visibleRecommendations = activeSource
    ? view?.recommendations.filter(
        (recommendation) => recommendation.sourceKind === activeSource
      ) ?? []
    : view?.recommendations ?? [];
  const visibleDrafts = activeSource
    ? view?.drafts.filter((draft) => draft.sourceLabel === "朋友引荐") ?? []
    : view?.drafts ?? [];
  const visibleReviewDrafts = visibleDrafts.filter(
    (draft) => !dismissedDraftIds.has(draft.draftId)
  );
  const sourceKey = activeSource ?? "all";
  const staging = stagingSource === sourceKey;

  return (
    <DataCard
      detail={view?.summary ?? "从可信推荐人生成候选"}
      title="朋友引荐"
    >
      <Text style={styles.bodyText}>
        {view?.nextAction ?? "选择一个引荐来源，先生成待确认候选。"}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.externalSourceRow}>
        <SourceChip
          active={!activeSource}
          countLabel={
            view ? `${view.recommendations.length} 条推荐` : "全部来源"
          }
          label="全部"
          onPress={() => onSelectSource(null)}
        />
        {sources.map((source) => (
          <SourceChip
            active={activeSource === source.id}
            countLabel={source.countLabel}
            key={source.id}
            label={source.label}
            onPress={() => onSelectSource(source.id)}
          />
        ))}
      </View>
      <Text style={styles.helperText}>
        {view?.safetyText ?? "只生成待确认候选，不会发消息，也不会写联系人。"}
      </Text>
      {view?.emptyText ? (
        <Text style={styles.helperText}>{view.emptyText}</Text>
      ) : null}
      {visibleRecommendations.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {visibleRecommendations.map((recommendation) => (
            <ReferralRecommendationItem
              confirming={confirmingRecommendationId === recommendation.id}
              key={recommendation.id}
              onConfirm={onConfirmRecommendation}
              recommendation={recommendation}
            />
          ))}
        </View>
      ) : null}
      {visibleReviewDrafts.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {visibleReviewDrafts.map((draft) => (
            <View key={draft.draftId || draft.title} style={styles.draftQueueItem}>
              <View style={styles.draftQueueHeader}>
                <View style={styles.draftQueueTitleGroup}>
                  <Text numberOfLines={1} style={styles.draftQueueTitle}>
                    {draft.title}
                  </Text>
                  {draft.detail ? (
                    <Text numberOfLines={2} style={styles.draftQueueMeta}>
                      {draft.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.queueStateText}>{draft.stateLabel}</Text>
              </View>
              <Text style={styles.sourceText}>{draft.sourceLabel}</Text>
              <Text style={styles.bodyText}>{draft.confirmationText}</Text>
              <Text style={styles.bodyText}>{draft.nextAction}</Text>
              {draft.canConfirm ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={confirming}
                  onPress={() => onConfirm(draft.draftId)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    confirming ? styles.disabled : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    color={colors.accent}
                    name="checkmark-circle-outline"
                    size={18}
                  />
                  <Text style={styles.secondaryButtonText}>
                    {confirming ? "确认中" : draft.confirmLabel}
                  </Text>
                </Pressable>
              ) : null}
              {draft.canConfirm ? (
                <DismissDraftButton onPress={() => onDismiss(draft.draftId)} />
              ) : null}
            </View>
          ))}
        </View>
      ) : visibleDrafts.length > 0 ? (
        <Text style={styles.helperText}>{localDismissText}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={Boolean(stagingSource)}
        onPress={() => onStage(activeSource)}
        style={({ pressed }) => [
          styles.primaryButton,
          Boolean(stagingSource) ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="git-network-outline" size={18} />
        <Text style={styles.primaryButtonText}>
          {staging ? "生成中" : "生成引荐候选"}
        </Text>
      </Pressable>
    </DataCard>
  );
}

function ReferralRecommendationItem({
  confirming,
  onConfirm,
  recommendation
}: {
  confirming: boolean;
  onConfirm: (recommendationId: string) => void;
  recommendation: ContactReferralRecommendationsView["recommendations"][number];
}) {
  return (
    <View style={styles.externalCandidateItem}>
      <View style={styles.draftQueueHeader}>
        <View style={styles.draftQueueTitleGroup}>
          <Text numberOfLines={1} style={styles.draftQueueTitle}>
            {recommendation.name}
          </Text>
          {recommendation.detail ? (
            <Text numberOfLines={2} style={styles.draftQueueMeta}>
              {recommendation.detail}
            </Text>
          ) : null}
        </View>
        <Text style={styles.mergeReviewBadge}>
          {recommendation.confidenceLabel}
        </Text>
      </View>
      <View style={styles.externalMetaRow}>
        <Text style={styles.sourceText}>{recommendation.sourceLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{recommendation.recommenderLine}</Text>
      <Text style={styles.bodyText}>{recommendation.reason}</Text>
      <Text style={styles.bodyText}>{recommendation.introductionPath}</Text>
      <Text style={styles.helperText}>{recommendation.nextAction}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={confirming}
        onPress={() => onConfirm(recommendation.id)}
        style={({ pressed }) => [
          styles.secondaryButton,
          confirming ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.accent} name="checkmark-outline" size={18} />
        <Text style={styles.secondaryButtonText}>
          {confirming ? "确认中" : "确认推荐"}
        </Text>
      </Pressable>
    </View>
  );
}

function RecommendedContactConfirmCard({
  view
}: {
  view: ContactRecommendedConfirmView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      {view.detail ? <Text style={styles.bodyText}>{view.detail}</Text> : null}
      <Text style={styles.sourceText}>确认人：{view.confirmedBy}</Text>
      {view.evidenceExcerpts.length > 0 ? (
        <View style={styles.evidenceStack}>
          {view.evidenceExcerpts.map((excerpt) => (
            <Text key={excerpt} style={styles.evidenceText}>
              {excerpt}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <Text style={styles.helperText}>{view.safetyText}</Text>
    </DataCard>
  );
}

function ContactDraftQueueCard({
  confirming,
  dismissedDraftIds,
  onConfirm,
  onDismiss,
  queue
}: {
  confirming: boolean;
  dismissedDraftIds: Set<string>;
  onConfirm: (draftId: string) => void;
  onDismiss: (draftId: string) => void;
  queue: ContactDraftQueueView;
}) {
  const visibleDrafts = queue.drafts.filter(
    (draft) => !dismissedDraftIds.has(draft.draftId)
  );

  return (
    <DataCard detail={queue.summary} title="待确认候选">
      <Text style={styles.bodyText}>{queue.nextAction}</Text>
      {queue.emptyText ? (
        <Text style={styles.helperText}>{queue.emptyText}</Text>
      ) : null}
      {visibleDrafts.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {visibleDrafts.map((draft) => (
            <View key={draft.draftId || draft.title} style={styles.draftQueueItem}>
              <View style={styles.draftQueueHeader}>
                <View style={styles.draftQueueTitleGroup}>
                  <Text numberOfLines={1} style={styles.draftQueueTitle}>
                    {draft.title}
                  </Text>
                  {draft.detail ? (
                    <Text numberOfLines={2} style={styles.draftQueueMeta}>
                      {draft.detail}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.queueStateText}>{draft.stateLabel}</Text>
              </View>
              {draft.sourceLabel ? (
                <Text style={styles.sourceText}>{draft.sourceLabel}</Text>
              ) : null}
              <Text style={styles.bodyText}>{draft.writeState}</Text>
              <Text style={styles.bodyText}>{draft.confirmationText}</Text>
              {draft.evidenceExcerpts.length > 0 ? (
                <View style={styles.evidenceStack}>
                  {draft.evidenceExcerpts.map((excerpt) => (
                    <Text key={excerpt} style={styles.evidenceText}>
                      {excerpt}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.bodyText}>{draft.nextAction}</Text>
              {draft.canConfirm ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={confirming}
                  onPress={() => onConfirm(draft.draftId)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    confirming ? styles.disabled : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    color={colors.accent}
                    name="checkmark-circle-outline"
                    size={18}
                  />
                  <Text style={styles.secondaryButtonText}>
                    {confirming ? "确认中" : draft.confirmLabel}
                  </Text>
                </Pressable>
              ) : null}
              {draft.canConfirm ? (
                <DismissDraftButton onPress={() => onDismiss(draft.draftId)} />
              ) : null}
            </View>
          ))}
        </View>
      ) : queue.drafts.length > 0 ? (
        <Text style={styles.helperText}>{localDismissText}</Text>
      ) : null}
    </DataCard>
  );
}

function DismissDraftButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.text3} name="archive-outline" size={18} />
      <Text style={styles.dismissButtonText}>暂不处理</Text>
    </Pressable>
  );
}

function ContactMergeReviewCard({
  applyingSuggestionId,
  onApply,
  review
}: {
  applyingSuggestionId: string | null;
  onApply: (suggestion: ContactMergeSuggestionView) => void;
  review: ContactMergeReviewView;
}) {
  return (
    <DataCard detail={review.summary} title="重复检查">
      <Text style={styles.bodyText}>{review.nextAction}</Text>
      {review.emptyText ? (
        <Text style={styles.helperText}>{review.emptyText}</Text>
      ) : null}
      {review.suggestions.length > 0 ? (
        <View style={styles.draftQueueStack}>
          {review.suggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.mergeReviewItem}>
              <View style={styles.mergeReviewHeader}>
                <View style={styles.draftQueueTitleGroup}>
                  <Text numberOfLines={2} style={styles.mergeReviewTitle}>
                    {suggestion.title}
                  </Text>
                  <Text style={styles.mergeReviewDecision}>
                    {suggestion.decisionLabel}
                  </Text>
                </View>
                <Text style={styles.mergeReviewBadge}>
                  {suggestion.confidenceLabel}
                </Text>
              </View>
              <Text style={styles.bodyText}>{suggestion.importedLabel}</Text>
              <Text style={styles.bodyText}>{suggestion.existingLabel}</Text>
              <Text style={styles.helperText}>{suggestion.reviewQuestion}</Text>
              {suggestion.fieldDecisions.length > 0 ? (
                <View style={styles.mergeFieldStack}>
                  {suggestion.fieldDecisions.map((line) => (
                    <Text key={line} style={styles.evidenceText}>
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.helperText}>{suggestion.guardrail}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={applyingSuggestionId === suggestion.id}
                onPress={() => onApply(suggestion)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  applyingSuggestionId === suggestion.id ? styles.disabled : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Ionicons
                  color={colors.accent}
                  name="git-merge-outline"
                  size={18}
                />
                <Text style={styles.secondaryButtonText}>
                  {applyingSuggestionId === suggestion.id
                    ? "确认中"
                    : "确认合并预览"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </DataCard>
  );
}

function ContactMergeApplyResultCard({
  view
}: {
  view: ContactMergeApplyView;
}) {
  return (
    <DataCard detail={view.summary} title={view.title}>
      {view.detail ? <Text style={styles.bodyText}>{view.detail}</Text> : null}
      <Text style={styles.sourceText}>确认人：{view.confirmedBy}</Text>
      {view.fieldDecisions.length > 0 ? (
        <View style={styles.mergeFieldStack}>
          {view.fieldDecisions.map((line) => (
            <Text key={line} style={styles.evidenceText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.bodyText}>{view.nextAction}</Text>
      <Text style={styles.helperText}>{view.safetyText}</Text>
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
  contactWriteHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  contactWriteResult: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  contactWriteStatus: {
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  contactWriteTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 20
  },
  disabled: {
    opacity: 0.55
  },
  dismissButtonText: {
    color: colors.text3,
    fontSize: typography.body,
    fontWeight: "700"
  },
  draftQueueHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  draftQueueItem: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  draftQueueMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 18
  },
  draftQueueStack: {
    gap: spacing.sm
  },
  draftQueueTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 21
  },
  draftQueueTitleGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0
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
  externalCandidateItem: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  externalMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  externalSourceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
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
    minHeight: 44,
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
  mergeFieldStack: {
    gap: spacing.xs
  },
  mergeReviewBadge: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    color: colors.amber,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  mergeReviewDecision: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  mergeReviewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  mergeReviewItem: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  mergeReviewTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 21
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
  queueStateText: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  qrCamera: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  qrScanCorner: {
    borderColor: colors.onAccent,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    height: 32,
    left: 0,
    position: "absolute",
    top: 0,
    width: 32
  },
  qrScanCornerBottom: {
    bottom: 0,
    top: "auto",
    transform: [{ rotate: "270deg" }]
  },
  qrScanCornerRight: {
    left: "auto",
    right: 0,
    transform: [{ rotate: "90deg" }]
  },
  qrScanFrame: {
    alignSelf: "center",
    aspectRatio: 1,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: radius.control,
    borderWidth: 1,
    height: "58%",
    pointerEvents: "none",
    position: "absolute",
    top: "18%"
  },
  qrScannerPanel: {
    aspectRatio: 0.82,
    backgroundColor: colors.ink,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative"
  },
  reviewFieldBlock: {
    gap: spacing.xs
  },
  reviewFieldHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  reviewHeader: {
    gap: spacing.xs
  },
  reviewMetaText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  reviewPanel: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  reviewTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 21
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
  },
  scannerCloseButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.md,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    position: "absolute"
  },
  scannerCloseText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800"
  },
  sourceChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: 3,
    minHeight: 50,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  sourceChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  sourceChipMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 17
  },
  sourceChipMetaActive: {
    color: colors.onAccent
  },
  sourceChipTitle: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 19
  },
  sourceChipTitleActive: {
    color: colors.onAccent
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
