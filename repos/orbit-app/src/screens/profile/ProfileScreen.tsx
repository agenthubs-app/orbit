import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  ORBIT_API_ENDPOINTS,
  profileUpdateSuggestionAcceptPath
} from "../../api/endpoints";
import { profileContactsCount, profileDetailSchema, profileExtractionReceiptSchema, profileSaveReceiptSchema, profileSuggestionReceiptSchema, profileSuggestionsSchema, profileTodayTasksCount, profileUpcomingScheduleCount,
  type AcceptedProfileSuggestion, type ProfileDetail, type ProfileExtraction, type ProfileSaveRequest, type ProfileSuggestions } from "../../api/profile-detail-contract";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { OrbitTabBar } from "../../components/OrbitTabBar";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { radius, spacing, textStyles, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { IndustrySelectionContract } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel, validateIndustrySelection } from "../../api/domain/industries";
import {
  buildProfileDocumentExtractionRequest,
  buildProfileUpdateRequest,
  profileAcceptedPatchToView,
  profileBusinessCard,
  profileDocumentExtractionToView,
  profileSummaryToEditDraft,
  profileToSummary,
  profileUpdateSuggestionsToView,
  type ProfileAcceptedPatchView,
  type ProfileBusinessCardTagGroup,
  type ProfileDocumentExtractionKind,
  type ProfileDocumentExtractionInput,
  type ProfileDocumentExtractionView,
  type ProfileManualEditDraft,
  type ProfileSummary
} from "../../view-models/profile";

type ProfileDraft = ProfileManualEditDraft & { birthDate: string; targetRelationshipTypesText: string; preferredFollowUpWindow: string; preferredIntroChannelsText: string };
type SaveProfile = (draft: ProfileDraft, base: ProfileDetail, isDraftCurrent: () => boolean) => Promise<ProfileDetail | null>;
type DraftChanged = (field: keyof ProfileDraft, quiet?: boolean) => void;
const suggestionDraftFields = { headline: "headline", homeMarket: "timezone", relationshipGoal: "relationshipGoal", targetRelationshipTypes: "targetRelationshipTypesText", preferredFollowUpWindow: "preferredFollowUpWindow", preferredIntroChannels: "preferredIntroChannelsText" } as const;
const suggestionFieldLabelKeys = { headline: "profile.headline", homeMarket: "profile.primaryIndustry", relationshipGoal: "profile.relationshipGoal", targetRelationshipTypes: "profile.targetRelationshipTypes", preferredFollowUpWindow: "profile.followUpWindow", preferredIntroChannels: "profile.introChannels" } as const satisfies Record<keyof typeof suggestionDraftFields, MessageKey>;
const missingFieldKeys = { displayName: "profile.name", primaryIndustryId: "profile.primaryIndustry", secondaryIndustryId: "profile.secondaryIndustry", birthDate: "profile.birthDate" } as const satisfies Record<string, MessageKey>;

function profileBusinessText(value: string, language: string): string {
  const text = value.trim();
  if (language !== "zh") return text;
  // Exact service-authored explanations, never a keyword filter on user data.
  const copy: Record<string, string> = {
    "The strongest generated relationship graph edges cluster around operators, founders, and community introduction paths.": "近期关系记录主要涉及运营者、创始人和社群引荐。",
    "Recent chat notes repeatedly frame Orbit's value around concrete follow-up decisions.": "最近的交流多次提到希望明确下一步联系安排。",
    "Recent interaction memory includes follow-up requests, so the operator should review a shorter follow-up window.": "近期交流中有继续联系的请求，可以考虑更早联系。",
    "High confidence because the mock resume fixture includes a name, role, market, and relationship goal.": "识别到了姓名、职位、市场和关系目标，请逐项核对。",
    "Medium confidence because the mock business card fixture has clear identity fields but lighter relationship context.": "身份信息较清楚，关系背景仍需补充。",
    "No profile draft was produced because the mock resume fixture is empty.": "未提供可提取的原文，暂时没有资料草稿。",
    "The mock business card is queued for manual review before an onboarding draft is available.": "这张名片正在等待复核，资料草稿尚未就绪。",
    "Image extraction is not available in this profile form because no document bytes were uploaded.": "此处尚未读取图片内容，请粘贴原文。",
    "Chat signal": "聊天记录", "Activity signal": "活动记录", "Contact signal": "人脉记录",
    "Paste source text before extracting profile fields.": "请先粘贴需要提取的原文。",
    "No explicit supported fields were found; unlabeled prose is not guessed into profile data.": "没有识别到明确的资料字段，请给原文补充字段名称。",
    "Use the contact import hub for business-card scanning.": "需要扫描名片时，请使用人脉导入入口。",
    "Paste structured profile text with explicit field labels.": "请粘贴带有姓名、公司等字段名称的原文。",
    "Add labels such as 姓名、公司、职位、市场、关系目标、联系方式 and try again.": "请补上姓名、公司、职位、市场、关系目标或联系方式等字段名称，再试一次。",
    "Review every extracted field in the form before saving the profile.": "请在编辑表单中逐项核对后保存资料。",
    "Review the extracted profile draft before using it to personalize relationship follow-up.": "请先核对提取草稿，再决定是否用于后续联系。",
    "Confirm the card owner and add context from the event before creating follow-up tasks.": "先确认名片归属并补充交流背景，再安排后续联系。",
    "Add a resume document or paste profile text before extracting onboarding fields.": "请粘贴简历原文后再提取资料。",
    "Keep the card in review until the operator confirms which lines should become profile fields.": "请继续复核名片，确认哪些内容需要放入资料。",
    "Review each suggestion before applying any change to the profile.": "逐条核对来源，再决定是否放入编辑表单。",
    "Apply this patch only after the operator confirms the profile save.": "这些改动尚未保存，请检查编辑表单后另行保存。"
  };
  if (Object.prototype.hasOwnProperty.call(copy, text)) return copy[text]!;
  const count = /^(\d+) explicit profile fields were extracted with (?:high|medium|low) confidence\.$/u.exec(text);
  return count ? `识别到 ${count[1]} 项资料，请逐项核对。` : text;
}

function profileFieldLabel(field: string, t: OrbitTranslator): string {
  const keys: Record<string, MessageKey> = {
    displayName: "profile.name",
    email: "profile.email",
    headline: "profile.headline",
    homeMarket: "profile.primaryIndustry",
    organization: "profile.organization",
    phone: "profile.phone",
    preferredFollowUpWindow: "profile.followUpWindow",
    preferredIntroChannels: "profile.introChannels",
    relationshipGoal: "profile.relationshipGoal",
    role: "profile.role",
    targetRelationshipTypes: "profile.targetRelationshipTypes",
    website: "profile.website",
  };
  return t(keys[field] ?? "profile.fieldDefault");
}

function profileConfidenceLabel(confidence: string, t: OrbitTranslator): string {
  if (confidence === "high") return t("profile.confidenceHigh");
  if (confidence === "low") return t("profile.confidenceLow");
  if (confidence === "medium") return t("profile.confidenceMedium");
  return t("profile.confidencePending");
}

function profileExtractionStateLabel(state: string, hasDraft: boolean, t: OrbitTranslator): string {
  if (state === "pending") return t("profile.extractionStatePending");
  if (!hasDraft || state === "empty") return t("profile.extractionStateEmpty");
  return t("profile.extractionStateReview");
}

function profileSuggestionStateLabel(state: string, count: number, t: OrbitTranslator): string {
  if (count === 0 || state === "empty") return t("profile.suggestionStateEmpty");
  if (state === "pending") return t("profile.suggestionStatePending");
  return t("profile.suggestionStateReview");
}

function profileSuggestionStatusLabel(status: string, t: OrbitTranslator): string {
  if (status === "accepted") return t("profile.suggestionStatusAccepted");
  if (status === "dismissed") return t("profile.suggestionStatusDismissed");
  return t("profile.suggestionStatusPending");
}

function profileSignalSourceLabel(source: string, t: OrbitTranslator): string {
  if (source === "chat") return t("profile.signalSourceChat");
  if (source === "activity") return t("profile.signalSourceActivity");
  if (source === "contact") return t("profile.signalSourceContact");
  return t("profile.signalSourceDefault");
}

function profileDraftFromDetail(data: ProfileDetail): ProfileDraft {
  return { ...profileSummaryToEditDraft(profileToSummary(data)), birthDate: data.profile?.birthDate ?? "", targetRelationshipTypesText: data.profile?.targetRelationshipTypes.join("\n") ?? "",
    preferredFollowUpWindow: data.profile?.preferredFollowUpWindow ?? "", preferredIntroChannelsText: data.profile?.preferredIntroChannels.join("\n") ?? "" };
}

function profileDraftToRequest(draft: ProfileDraft, data: ProfileDetail): ProfileSaveRequest | null {
  const request = buildProfileUpdateRequest(draft);
  if (!request) return null;
  const result: ProfileSaveRequest = { ...request,
    ...(draft.birthDate.trim() || data.profile?.birthDate !== undefined ? { birthDate: draft.birthDate.trim() || null } : {}),
    targetRelationshipTypes: draft.targetRelationshipTypesText.split(/\n|,|，|、/u).map(value => value.trim()).filter(Boolean),
    preferredFollowUpWindow: draft.preferredFollowUpWindow.trim(),
    preferredIntroChannels: draft.preferredIntroChannelsText.split(/\n|,|，|、/u).map(value => value.trim()).filter(Boolean) };
  // Sparse public fields that were never present or filled in remain absent.
  for (const field of ["bio", "industry", "offering", "seeking", "topics"] as const) {
    if (data.profile?.[field] === undefined && !result[field]?.length) delete result[field];
  }
  return result;
}

function useProfileOperation(scopeKey: string, isScopeCurrent: () => boolean) {
  const scope = useMemo(() => ({ scopeKey }), [scopeKey]);
  const latest = useRef(scope); latest.current = scope;
  const parent = useRef(isScopeCurrent); parent.current = isScopeCurrent;
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); request.current = null; };
  }, [scope]);
  const isCurrent = () => mounted.current && latest.current === scope && parent.current();
  return {
    isCurrent,
    start() { if (!isCurrent() || request.current) return null; const controller = new AbortController(); request.current = controller; return controller; },
    owns(controller: AbortController) { return isCurrent() && request.current === controller && !controller.signal.aborted; },
    finish(controller: AbortController) { if (request.current === controller) request.current = null; }
  };
}

export function ProfileScreen({ scopeKey = "profile", isScopeCurrent = () => true, completionNext = null }: { scopeKey?: string; isScopeCurrent?: () => boolean; completionNext?: string | null } = {}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const mounted = useRef(true);
  const parentScope = useRef(isScopeCurrent);
  parentScope.current = isScopeCurrent;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [refreshKey, setRefreshKey] = useState(0);
  const readScope = JSON.stringify([scopeKey, refreshKey]);
  const scope = useMemo(() => ({ readScope }), [readScope]);
  const latestScope = useRef(scope); latestScope.current = scope;
  const current = () => mounted.current && parentScope.current() && latestScope.current === scope;
  const saveOperation = useProfileOperation(readScope, current);
  const suggestionOperation = useProfileOperation(readScope, current);
  const extractionOperation = useProfileOperation(readScope, current);
  const client = useOrbitApiClient({ scopeKey: readScope });
  const [acceptingSuggestionId, setAcceptingSuggestionId] = useState<
    string | null
  >(null);
  const [suggestionActionError, setSuggestionActionError] = useState<
    string | null
  >(null);
  const [suggestionActionMessage, setSuggestionActionMessage] = useState<
    string | null
  >(null);
  const [acceptedProfilePatch, setAcceptedProfilePatch] = useState<AcceptedProfileSuggestion | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const pendingSave = useRef<{ fingerprint: string; request: ProfileSaveRequest } | null>(null);
  const [profileActionError, setProfileActionError] = useState<string | null>(
    null
  );
  const [profileActionMessage, setProfileActionMessage] = useState<
    string | null
  >(null);
  const [extractingProfileDocumentKind, setExtractingProfileDocumentKind] =
    useState<ProfileDocumentExtractionKind | null>(null);
  const [profileExtractionError, setProfileExtractionError] = useState<
    string | null
  >(null);
  const [profileExtractionResult, setProfileExtractionResult] =
    useState<ProfileExtraction | null>(null);
  const latestExtraction = useRef(profileExtractionResult); latestExtraction.current = profileExtractionResult;
  const fieldRevisions = useRef<Partial<Record<keyof ProfileDraft, number>>>({});
  const [appliedProfileExtraction, setAppliedProfileExtraction] =
    useState<ProfileExtraction | null>(null);
  const state = validateApiResourceState(useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false, { scopeKey: readScope }), profileDetailSchema);
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const suggestionsResource = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profileUpdateSuggestions,
    () => false,
    { scopeKey: JSON.stringify([readScope, suggestionAttempt]) }
  ), profileSuggestionsSchema);
  const suggestionsState = { ...suggestionsResource, refresh: () => { if (current()) setSuggestionAttempt(value => value + 1); } };
  const loadedData = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const [savedData, setSavedData] = useState<{ scope: string; data: ProfileDetail } | null>(null);
  const lastData = useRef<ProfileDetail | null>(null);
  const freshData = savedData?.scope === readScope ? savedData.data : loadedData;
  if (freshData) lastData.current = freshData;
  const data = freshData ?? lastData.current;
  const canEdit = loadedData !== null && loadedData.state !== "pending" && (loadedData.state === "empty" || loadedData.editor.canSave);
  const editable = useRef(canEdit); editable.current = canEdit;
  const canAct = () => current() && editable.current;
  const completionHandled = useRef(false);

  useEffect(() => {
    if (!completionNext || completionHandled.current || !current()
      || loadedData?.onboarding?.status !== "complete") return;
    completionHandled.current = true;
    router.replace(completionNext as Href);
  }, [completionNext, loadedData?.onboarding?.status]);

  useEffect(() => {
    setAcceptingSuggestionId(null); setSavingProfile(false); setExtractingProfileDocumentKind(null);
    setSuggestionActionError(null); setSuggestionActionMessage(null); setAcceptedProfilePatch(null);
    setProfileActionError(null); setProfileActionMessage(null); setProfileExtractionError(null);
    setProfileExtractionResult(null); setAppliedProfileExtraction(null);
  }, [readScope]);

  async function onAcceptSuggestion(id: string) {
    if (!canAct() || (suggestionsState.kind !== "success" && suggestionsState.kind !== "empty") || suggestionsState.data.state !== "success") return;
    const suggestion = suggestionsState.data.suggestions.find(item => item.id === id && item.status === "pending");
    if (!suggestion) return;
    const field = suggestionDraftFields[suggestion.targetProfileField];
    const revision = fieldRevisions.current[field] ?? 0;
    const controller = suggestionOperation.start();
    if (!controller) return;
    setAcceptingSuggestionId(id);
    setSuggestionActionError(null);
    setSuggestionActionMessage(null);

    try {
      const result = await client.post<unknown>(
        profileUpdateSuggestionAcceptPath(id), { signal: controller.signal }
      );
      if (!suggestionOperation.owns(controller)) return;
      const receipt = result.success && result.status >= 200 && result.status < 300 ? profileSuggestionReceiptSchema(suggestion).safeParse(result.data) : null;
      if (!receipt?.success) {
        setSuggestionActionError(locale.t("profile.suggestionUnconfirmed"));
        return;
      }

      if ((fieldRevisions.current[field] ?? 0) === revision) {
        setAcceptedProfilePatch(receipt.data);
        setSuggestionActionMessage(locale.t("profile.suggestionApplied"));
      } else {
        setSuggestionActionMessage(locale.t("profile.suggestionPreserved", { field: locale.t(suggestionFieldLabelKeys[suggestion.targetProfileField]) }));
      }
      suggestionsState.refresh();
    } catch {
      if (suggestionOperation.owns(controller)) setSuggestionActionError(locale.t("profile.suggestionUnconfirmed"));
    } finally {
      if (suggestionOperation.owns(controller)) setAcceptingSuggestionId(null);
      suggestionOperation.finish(controller);
    }
  }

  async function onExtractProfileDocument(
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) {
    if (!canAct()) return;
    const request = buildProfileDocumentExtractionRequest(kind, input);

    if (!request) {
      setProfileExtractionError(locale.t("profile.extractionPasteFirst"));
      setProfileExtractionResult(null);
      return;
    }
    const controller = extractionOperation.start();
    if (!controller) return;

    setExtractingProfileDocumentKind(kind);
    setAppliedProfileExtraction(null);
    setProfileExtractionError(null);
    latestExtraction.current = null;
    setProfileExtractionResult(null);

    try {
      const result = await client.post<unknown>(request.endpoint, {
        body: request.body, signal: controller.signal
      });
      if (!extractionOperation.owns(controller)) return;
      const receipt = result.success && result.status >= 200 && result.status < 300 ? profileExtractionReceiptSchema(kind).safeParse(result.data) : null;
      if (!receipt?.success) {
        setProfileExtractionError(locale.t("profile.extractionUnconfirmed"));
        return;
      }

      setProfileExtractionResult(receipt.data);
    } catch {
      if (extractionOperation.owns(controller)) setProfileExtractionError(locale.t("profile.extractionUnconfirmed"));
    } finally {
      if (extractionOperation.owns(controller)) setExtractingProfileDocumentKind(null);
      extractionOperation.finish(controller);
    }
  }

  function onApplyProfileExtraction() {
    if (!canAct() || latestExtraction.current !== profileExtractionResult || profileExtractionResult?.state !== "success" || !profileExtractionResult.draft) {
      return;
    }

    setAppliedProfileExtraction(profileExtractionResult);
    setProfileActionError(null);
    setProfileActionMessage(locale.t("profile.extractionApplied"));
  }

  async function onSaveProfile(draft: ProfileDraft, base: ProfileDetail, isDraftCurrent: () => boolean): Promise<ProfileDetail | null> {
    if (!canAct() || !data) return null;
    const fields = profileDraftToRequest(draft, base);

    if (!fields) {
      setProfileActionError(locale.t("profile.nameRequired"));
      setProfileActionMessage(null);
      return null;
    }
    const versioned = { ...fields, expectedUpdatedAt: base.profile?.updatedAt ?? null };
    const fingerprint = JSON.stringify(versioned);
    if (pendingSave.current?.fingerprint !== fingerprint) {
      try {
        pendingSave.current = { fingerprint, request: { ...versioned, mutationId: `ios:profile:${Crypto.randomUUID()}` } };
      } catch {
        setProfileActionError(locale.t("profile.savePrepareFailed"));
        return null;
      }
    }
    const request = pendingSave.current.request;
    const controller = saveOperation.start();
    if (!controller) return null;

    setSavingProfile(true);
    setProfileActionError(null);
    setProfileActionMessage(null);

    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, {
        body: request, signal: controller.signal
      });
      if (!saveOperation.owns(controller)) return null;
      if (result.status === 409) {
        setProfileActionError(locale.t("profile.saveConflict"));
        return null;
      }
      const receipt = result.success && result.status >= 200 && result.status < 300 ? profileSaveReceiptSchema(base.profile?.id ?? null, request).safeParse(result.data) : null;
      if (!receipt?.success) {
        setProfileActionError(locale.t("profile.saveUnconfirmed"));
        return null;
      }

      setSavedData({ scope: readScope, data: receipt.data });
      if (isDraftCurrent()) setProfileActionMessage(locale.t("profile.saved"));
      setAcceptedProfilePatch(null);
      setAppliedProfileExtraction(null);
      if (completionNext && receipt.data.onboarding?.status === "complete" && isDraftCurrent()) {
        completionHandled.current = true;
        router.replace(completionNext as Href);
      }
      return receipt.data;
    } catch {
      if (saveOperation.owns(controller)) setProfileActionError(locale.t("profile.saveUnconfirmed"));
      return null;
    } finally {
      if (saveOperation.owns(controller)) setSavingProfile(false);
      saveOperation.finish(controller);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        refreshControl={
        <RefreshControl
          onRefresh={() => {
            if (!current()) return;
            setSuggestionActionError(null);
            setSuggestionActionMessage(null);
            setAcceptedProfilePatch(null);
            setAppliedProfileExtraction(null);
            setProfileActionError(null);
            setProfileActionMessage(null);
            setProfileExtractionError(null);
            setProfileExtractionResult(null);
            setRefreshKey(value => value + 1);
          }}
          refreshing={state.refreshing || suggestionsState.refreshing}
          tintColor={colors.accent}
        />
        }
      >
      <View style={styles.pageHeader}>
        <Text accessibilityRole="header" style={styles.pageTitle}>{locale.t("profile.title")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.settings")} onPress={() => { if (current()) router.push("/settings" as Href); }} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
          <Ionicons name="sunny-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>
      {!auth.ready ? <LoadingState accessibilityLabel={locale.t("common.loadingLabel")} /> : null}
      {auth.ready && !auth.signedIn ? (
        <DataCard
          detail={locale.t("profile.signedOutDetail")}
          title={locale.t("profile.signedOutTitle")}
        >
          <Text style={styles.bodyText}>
            {locale.t("profile.signedOutBody")}
          </Text>
          <Pressable
            accessibilityLabel={locale.t("profile.login")}
            accessibilityRole="button"
            onPress={() =>
              router.push("/account/login?next=%2Fprofile" as Href)
            }
            style={({ pressed }) => [
              styles.profileLoginButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.onAccent} name="log-in-outline" size={16} />
            <Text style={styles.profileLoginButtonText}>{locale.t("profile.login")}</Text>
          </Pressable>
        </DataCard>
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.pageNotice}>{locale.t("profile.loading")}</Text> : null}
      {auth.signedIn && loadedData?.state === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.pageNotice}>{locale.t("profile.pending")}</Text> : null}
      {auth.signedIn && completionNext && loadedData && !loadedData.onboarding ? <Text accessibilityRole="alert" style={styles.profileActionError}>{locale.t("profile.completionUnconfirmed")}</Text> : null}
      {auth.signedIn && completionNext && data?.onboarding?.status === "incomplete" ? <Text style={styles.pageNotice}>{locale.t("profile.missingPrefix")}{data.onboarding.missingFields.map(field => locale.t(missingFieldKeys[field])).join("、")}</Text> : null}
      {auth.signedIn && (state.kind === "offline" || state.kind === "failure") ? (
        <View style={styles.pageNotice}>
          <Text accessibilityRole="alert" style={styles.profileActionError}>{locale.t("profile.readError")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.retry")} onPress={() => { if (current()) setRefreshKey(value => value + 1); }} style={styles.profileExtractionButton}>
            <Text style={styles.profileExtractionButtonText}>{locale.t("profile.retry")}</Text>
          </Pressable>
        </View>
      ) : null}
      {auth.signedIn && data ? (
        <ProfileCard
          scopeKey={readScope}
          isScopeCurrent={current}
          canEdit={canEdit}
          onDraftChanged={(field, quiet) => {
            if (!current()) return;
            fieldRevisions.current[field] = (fieldRevisions.current[field] ?? 0) + 1;
            if (!quiet) { setProfileActionError(null); setProfileActionMessage(null); }
          }}
          acceptingSuggestionId={acceptingSuggestionId}
          actionError={suggestionActionError}
          actionMessage={suggestionActionMessage}
          acceptedProfilePatch={acceptedProfilePatch}
          appliedProfileExtraction={appliedProfileExtraction}
          data={data}
          onAcceptSuggestion={onAcceptSuggestion}
          onApplyExtraction={onApplyProfileExtraction}
          onExtractProfileDocument={onExtractProfileDocument}
          onOpenAccount={() => { if (current()) router.push("/account" as Href); }}
          onSaveProfile={onSaveProfile}
          profileExtractionError={profileExtractionError}
          profileExtractionResult={profileExtractionResult}
          profileActionError={profileActionError}
          profileActionMessage={profileActionMessage}
          profileDocumentExtractionKind={extractingProfileDocumentKind}
          savingProfile={savingProfile}
          suggestionsState={suggestionsState}
          startEditing={Boolean(completionNext && data.onboarding?.status === "incomplete")}
        />
      ) : null}
      </ScrollView>
      <OrbitTabBar active="profile" />
    </SafeAreaView>
  );
}

function ProfileCard({
  scopeKey,
  isScopeCurrent,
  canEdit,
  onDraftChanged,
  acceptingSuggestionId,
  actionError,
  actionMessage,
  acceptedProfilePatch,
  appliedProfileExtraction,
  data,
  onAcceptSuggestion,
  onApplyExtraction,
  onExtractProfileDocument,
  onOpenAccount,
  onSaveProfile,
  profileDocumentExtractionKind,
  profileExtractionError,
  profileExtractionResult,
  profileActionError,
  profileActionMessage,
  savingProfile,
  suggestionsState,
  startEditing
}: {
  scopeKey: string;
  isScopeCurrent: () => boolean;
  canEdit: boolean;
  onDraftChanged: DraftChanged;
  acceptingSuggestionId: string | null;
  actionError: string | null;
  actionMessage: string | null;
  acceptedProfilePatch: AcceptedProfileSuggestion | null;
  appliedProfileExtraction: ProfileExtraction | null;
  data: ProfileDetail;
  onAcceptSuggestion: (id: string) => void;
  onApplyExtraction: () => void;
  onExtractProfileDocument: (
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) => void;
  onOpenAccount: () => void;
  onSaveProfile: SaveProfile;
  profileDocumentExtractionKind: ProfileDocumentExtractionKind | null;
  profileExtractionError: string | null;
  profileExtractionResult: ProfileExtraction | null;
  profileActionError: string | null;
  profileActionMessage: string | null;
  savingProfile: boolean;
  suggestionsState: ApiResourceState<ProfileSuggestions>;
  startEditing: boolean;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const [editing, setEditing] = useState(startEditing);
  const [editorMounted, setEditorMounted] = useState(startEditing);
  const storedProfile = profileToSummary(data);
  const displayProfile = storedProfile;

  return (
    <>
      {!editing ? <>
        <OrbitBusinessCard profile={displayProfile} onEdit={() => { if (isScopeCurrent()) { setEditorMounted(true); setEditing(true); } }} />
        <ProfileStatistics scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} />
        {!storedProfile.displayName ? <Text style={styles.pageNotice}>{locale.t("profile.empty")}</Text> : null}
        <View style={styles.basicSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{locale.t("profile.basic")}</Text>
          <View style={styles.basicRows}>
            {[[locale.t("profile.industry"), displayProfile.secondaryIndustryId ? secondaryIndustryLabel(displayProfile.secondaryIndustryId, locale.language) : displayProfile.primaryIndustryId ? `${industryLabel(displayProfile.primaryIndustryId, locale.language)} · ${locale.t("profile.secondaryMissing")}` : displayProfile.industry], [locale.t("profile.organization"), displayProfile.organization], [locale.t("profile.role"), displayProfile.role], [locale.t("profile.bio"), displayProfile.bio]].map(([label, value], index) => (
              <View key={label} style={[styles.basicRow, index === 3 && styles.bioRow]}>
                <Text style={styles.basicLabel}>{label}</Text>
                <Text style={[styles.basicValue, index === 3 && styles.bioValue]}>{value || locale.t("profile.notFilled")}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.previewTags}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{locale.t("profile.tagSummary")}</Text>
          <View style={styles.previewTagGroups}>
            {[[locale.t("profile.offering"), displayProfile.offering], [locale.t("profile.seeking"), displayProfile.seeking], [locale.t("profile.topics"), displayProfile.topics]].map(([label, values], index) => (
              <View key={label as string} accessibilityLabel={label as string} style={styles.previewTagGroup}>
                {(values as string[]).map((item, itemIndex) => <Text key={itemIndex} style={[styles.previewTag, index === 0 && styles.offeringTag]}>{item}</Text>)}
              </View>
            ))}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.accountWorkspace")} onPress={onOpenAccount} style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}>
          <Text style={styles.accountTitle}>{locale.t("profile.accountWorkspace")}</Text>
          <Ionicons name="chevron-forward" size={16} color={styles.basicLabel.color} />
        </Pressable>
        {displayProfile.relationshipGoal ? <View style={styles.extraSection}><Text style={styles.sectionTitle}>{locale.t("profile.relationshipGoal")}</Text><Text style={styles.bodyText}>{locale.t.literal(displayProfile.relationshipGoal)}</Text></View> : null}
      </> : <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.backToPreview")} onPress={() => { if (isScopeCurrent()) setEditing(false); }} style={styles.previewBack}>
        <Text style={styles.profileExtractionButtonText}>{locale.t("profile.backToPreview")}</Text>
      </Pressable>}
      {editorMounted ? <View style={[styles.editorSections, !editing && styles.hidden]}>
      <ProfileManualEditCard
        actionError={profileActionError}
        actionMessage={profileActionMessage}
        acceptedPatch={acceptedProfilePatch}
        appliedProfileExtraction={appliedProfileExtraction}
        onSave={onSaveProfile}
        data={data}
        isScopeCurrent={isScopeCurrent}
        canEdit={canEdit}
        onDraftChanged={onDraftChanged}
        saving={savingProfile}
      />
      <ProfileDocumentExtractionCard
        scopeKey={scopeKey}
        isScopeCurrent={isScopeCurrent}
        canEdit={canEdit}
        actionError={profileExtractionError}
        extractingKind={profileDocumentExtractionKind}
        onApplyExtraction={onApplyExtraction}
        onExtract={onExtractProfileDocument}
        result={profileExtractionResult}
      />
      <ProfileUpdateSuggestionsCard
        canEdit={canEdit}
        isScopeCurrent={isScopeCurrent}
        acceptingSuggestionId={acceptingSuggestionId}
        actionError={actionError}
        actionMessage={actionMessage}
        onAcceptSuggestion={onAcceptSuggestion}
        state={suggestionsState}
      />
      </View> : null}
    </>
  );
}

function ProfileDocumentExtractionCard({
  scopeKey,
  isScopeCurrent,
  canEdit,
  actionError,
  extractingKind,
  onApplyExtraction,
  onExtract,
  result
}: {
  scopeKey: string;
  isScopeCurrent: () => boolean;
  canEdit: boolean;
  actionError: string | null;
  extractingKind: ProfileDocumentExtractionKind | null;
  onApplyExtraction: () => void;
  onExtract: (
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) => void;
  result: ProfileExtraction | null;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const [sourceText, setSourceText] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerPending, setPickerPending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ kind: ProfileDocumentExtractionKind; fileName: string; mimeType: string } | null>(null);
  const editable = useRef(canEdit); editable.current = canEdit;
  const source = useRef(sourceText); source.current = sourceText;
  const picker = useProfileOperation(scopeKey, isScopeCurrent);
  const baseView = result ? profileDocumentExtractionToView(result) : null;
  const kindLabel = result?.kind === "business-card" ? locale.t("profile.kindCard") : locale.t("profile.kindResume");
  const view = baseView && result ? { ...baseView,
    confidenceLabel: profileConfidenceLabel(result.draft?.confidence ?? "", locale.t),
    nextAction: profileBusinessText(result.nextAction, locale.language) || (result.state === "empty" ? locale.t("profile.extractionNextEmpty") : result.state === "pending" ? locale.t("profile.extractionNextPending") : result.kind === "business-card" ? locale.t("profile.extractionNextCard") : locale.t("profile.extractionNextResume")),
    stateLabel: profileExtractionStateLabel(result.state, !!result.draft, locale.t),
    summary: profileBusinessText(result.confidenceSummary, locale.language) || (!result.draft ? locale.t("profile.extractionSummaryNone") : result.kind === "business-card" && result.draft.confidence === "medium" ? locale.t("profile.extractionSummaryCardMedium") : result.kind === "business-card" ? locale.t("profile.extractionSummaryCard") : result.draft.confidence === "high" ? locale.t("profile.extractionSummaryResumeHigh") : locale.t("profile.extractionSummaryPartial")),
    title: locale.t("profile.extractionResultNamed", { name: kindLabel }),
    draft: baseView.draft && result.draft ? { ...baseView.draft,
      displayName: result.draft.displayName || locale.t("profile.unrecognizedName"), kindLabel, metaLine: [result.draft.role, result.draft.organization].filter(Boolean).join(" · "),
      relationshipGoal: result.draft.relationshipGoal,
      suggestedFields: Object.entries(result.draft.suggestedProfileFields).map(([field, value]) => ({ label: profileFieldLabel(field, locale.t), value: Array.isArray(value) ? value.join("、") : value ?? "" })).filter(field => field.value),
      evidence: result.draft.evidence.map(item => ({ label: profileFieldLabel(item.field, locale.t), excerpt: item.excerpt }))
    } : null } : null;
  const actionDisabled = !canEdit || extractingKind !== null || pickerPending;
  const actionsBusy = useRef(actionDisabled); actionsBusy.current = actionDisabled;
  useEffect(() => { setPickerPending(false); setPickerError(null); }, [scopeKey]);
  const resumeDocumentTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ];

  async function pickProfileDocumentImage(kind: ProfileDocumentExtractionKind) {
    if (actionsBusy.current || !editable.current) return;
    const controller = picker.start(); if (!controller) return;
    setPickerPending(true);
    setPickerError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.86
      });
      if (!picker.owns(controller)) return;
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPickerError(locale.t("profile.imageMissing"));
        return;
      }

      const file = { kind, fileName: asset.fileName || (kind === "business-card" ? "business-card.jpg" : "resume.jpg"), mimeType: asset.mimeType || "image/jpeg" };
      setSelectedFile(file);
      if (source.current.trim() && editable.current) onExtract(kind, { fileName: file.fileName, mimeType: file.mimeType, text: source.current });
    } catch {
      if (picker.owns(controller)) setPickerError(locale.t("profile.imageReadFailure"));
    } finally {
      if (picker.owns(controller)) setPickerPending(false);
      picker.finish(controller);
    }
  }

  async function pickProfileDocumentFile() {
    if (actionsBusy.current || !editable.current) return;
    const controller = picker.start(); if (!controller) return;
    setPickerPending(true);
    setPickerError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: resumeDocumentTypes
      });
      if (!picker.owns(controller)) return;
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPickerError(locale.t("profile.fileMissing"));
        return;
      }

      const file = { kind: "resume" as const, fileName: asset.name || "resume.pdf", mimeType: asset.mimeType || "application/pdf" };
      setSelectedFile(file);
      if (source.current.trim() && editable.current) onExtract("resume", { fileName: file.fileName, mimeType: file.mimeType, text: source.current });
    } catch {
      if (picker.owns(controller)) setPickerError(locale.t("profile.fileReadFailure"));
    } finally {
      if (picker.owns(controller)) setPickerPending(false);
      picker.finish(controller);
    }
  }

  return (
    <DataCard detail={locale.t("profile.extractionDetail")} title={locale.t("profile.extractionTitle")} variant="inset">
      <View style={styles.profileExtractionStack}>
        <Text style={styles.evidenceText}>{locale.t("profile.extractionGuidance")}</Text>
        {selectedFile ? <Text style={styles.bodyText}>{locale.t(sourceText.trim() ? "profile.selectedWithText" : "profile.selectedNeedsText", { name: selectedFile.fileName })}</Text> : null}
        <ProfileTextInput
          label={locale.t("profile.extractionInput")}
          multiline
          onChangeText={value => { if (picker.isCurrent()) setSourceText(value); }}
          placeholder={locale.t("profile.extractionPlaceholder")}
          value={sourceText}
        />
        {actionError ? (
          <Text style={styles.profileActionError}>{actionError}</Text>
        ) : null}
        <View style={styles.profileExtractionActions}>
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="id-card-outline"
            label={extractingKind === "business-card" ? locale.t("profile.extracting") : locale.t("profile.extractCard")}
            onPress={() => { if (picker.isCurrent() && !actionsBusy.current) onExtract("business-card", { text: sourceText, ...(selectedFile?.kind === "business-card" ? { fileName: selectedFile.fileName, mimeType: selectedFile.mimeType } : {}) }); }}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="document-text-outline"
            label={extractingKind === "resume" ? locale.t("profile.extracting") : locale.t("profile.extractResume")}
            onPress={() => { if (picker.isCurrent() && !actionsBusy.current) onExtract("resume", { text: sourceText, ...(selectedFile?.kind === "resume" ? { fileName: selectedFile.fileName, mimeType: selectedFile.mimeType } : {}) }); }}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="image-outline"
            label={locale.t("profile.chooseCardImage")}
            onPress={() => pickProfileDocumentImage("business-card")}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="images-outline"
            label={locale.t("profile.chooseResumeImage")}
            onPress={() => pickProfileDocumentImage("resume")}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="document-attach-outline"
            label={locale.t("profile.chooseResumeFile")}
            onPress={pickProfileDocumentFile}
          />
        </View>
        {pickerError ? (
          <Text style={styles.profileActionError}>{pickerError}</Text>
        ) : null}
        {view ? (
          <ProfileDocumentExtractionResult
            onApply={onApplyExtraction}
            canApply={canEdit && result?.state === "success"}
            view={view}
          />
        ) : null}
      </View>
    </DataCard>
  );
}

function ProfileExtractionButton({
  disabled,
  icon,
  label,
  onPress
}: {
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useStyles();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileExtractionButton,
        disabled ? styles.profileExtractionButtonDisabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.text} name={icon} size={16} />
      <Text style={styles.profileExtractionButtonText}>{label}</Text>
    </Pressable>
  );
}

function ProfileDocumentExtractionResult({
  onApply,
  canApply,
  view
}: {
  onApply: () => void;
  canApply: boolean;
  view: ProfileDocumentExtractionView;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  return (
    <View style={styles.profileExtractionResult}>
      <View style={styles.profileExtractionResultHeader}>
        <Text style={styles.profileExtractionTitle}>{view.title}</Text>
        <Text style={styles.profileExtractionStatus}>
          {view.stateLabel} · {view.confidenceLabel}
        </Text>
      </View>
      <Text style={styles.bodyText}>{view.summary}</Text>
      {view.draft ? (
        <View style={styles.profileExtractionDraft}>
          <View>
            <Text style={styles.profileExtractionName}>
              {view.draft.displayName}
            </Text>
            {view.draft.metaLine ? (
              <Text style={styles.profileExtractionMeta}>
                {view.draft.metaLine}
              </Text>
            ) : null}
            {view.draft.contactLine ? (
              <Text style={styles.profileExtractionMeta}>
                {view.draft.contactLine}
              </Text>
            ) : null}
          </View>
          {view.draft.relationshipGoal ? (
            <Text style={styles.bodyText}>{view.draft.relationshipGoal}</Text>
          ) : null}
          {view.draft.suggestedFields.length > 0 ? (
            <View style={styles.profileExtractionList}>
              {view.draft.suggestedFields.map((field) => (
                <View key={field.label} style={styles.profileExtractionRow}>
                  <Text style={styles.profileExtractionLabel}>
                    {field.label}
                  </Text>
                  <Text style={styles.profileExtractionValue}>
                    {field.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {view.draft.evidence.length > 0 ? (
            <View style={styles.profileExtractionEvidence}>
              {view.draft.evidence.map((item) => (
                <Text
                  key={`${item.label}-${item.excerpt}`}
                  style={styles.evidenceText}
                >
                  {item.label}: {item.excerpt}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.evidenceText}>{view.nextAction}</Text>
      {view.draft && canApply ? (
        <Pressable
          accessibilityLabel={locale.t("profile.applyExtraction")}
          accessibilityRole="button"
          onPress={onApply}
          style={({ pressed }) => [
            styles.profileExtractionApplyButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="create-outline" size={16} />
          <Text style={styles.profileExtractionApplyButtonText}>
            {locale.t("profile.applyExtraction")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfileManualEditCard({
  actionError,
  actionMessage,
  acceptedPatch,
  appliedProfileExtraction,
  onSave,
  data,
  isScopeCurrent,
  canEdit,
  onDraftChanged,
  saving
}: {
  actionError: string | null;
  actionMessage: string | null;
  acceptedPatch: AcceptedProfileSuggestion | null;
  appliedProfileExtraction: ProfileExtraction | null;
  onSave: SaveProfile;
  data: ProfileDetail;
  isScopeCurrent: () => boolean;
  canEdit: boolean;
  onDraftChanged: DraftChanged;
  saving: boolean;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const profileFingerprint = JSON.stringify(data.profile);
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraftFromDetail(data));
  const draftBase = useRef(data);
  const dirtyDraft = useRef(false);
  const draftRevision = useRef(0);
  const latestDraft = useRef(draft); latestDraft.current = draft;
  const editable = useRef(canEdit); editable.current = canEdit;
  const acceptedPatchBaseView = acceptedPatch ? profileAcceptedPatchToView(acceptedPatch) : null;
  const acceptedPatchView = acceptedPatch && acceptedPatchBaseView
    ? { ...acceptedPatchBaseView,
      nextAction: profileBusinessText(acceptedPatch.nextAction, locale.language) || locale.t("profile.reviewBeforeSave"),
      summary: locale.t("profile.saveRequired"),
      title: locale.t("profile.pendingChanges"),
      fields: acceptedPatchBaseView.fields.map((field, index) => {
        const value = acceptedPatch.profilePatch[acceptedPatch.appliedFields[index]!];
        return { ...field, label: profileFieldLabel(acceptedPatch.appliedFields[index] ?? "", locale.t), value: Array.isArray(value) ? value.join("、") : value ?? "" };
      }) }
    : null;

  useEffect(() => {
    if (!dirtyDraft.current) { draftBase.current = data; setDraft(profileDraftFromDetail(data)); }
  }, [profileFingerprint]);

  useEffect(() => {
    if (acceptedPatch) {
      dirtyDraft.current = true; draftRevision.current++;
      const patch = acceptedPatch.profilePatch;
      for (const field of acceptedPatch.appliedFields) onDraftChanged(suggestionDraftFields[field], true);
      setDraft(current => ({ ...current,
        ...(patch.headline !== undefined && { headline: patch.headline }),
        ...(patch.homeMarket !== undefined && { timezone: patch.homeMarket }),
        ...(patch.relationshipGoal !== undefined && { relationshipGoal: patch.relationshipGoal }),
        ...(patch.targetRelationshipTypes !== undefined && { targetRelationshipTypesText: patch.targetRelationshipTypes.join("\n") }),
        ...(patch.preferredFollowUpWindow !== undefined && { preferredFollowUpWindow: patch.preferredFollowUpWindow }),
        ...(patch.preferredIntroChannels !== undefined && { preferredIntroChannelsText: patch.preferredIntroChannels.join("\n") })
      }));
    }
  }, [acceptedPatch]);

  useEffect(() => {
    const extracted = appliedProfileExtraction?.state === "success" ? appliedProfileExtraction.draft : null;
    if (extracted) {
      dirtyDraft.current = true; draftRevision.current++;
      const fields = extracted.suggestedProfileFields;
      for (const field of ["displayName", "organization", "role"] as const) if (extracted[field]) onDraftChanged(field, true);
      for (const field of Object.keys(suggestionDraftFields) as Array<keyof typeof suggestionDraftFields>) {
        const value = fields[field] ?? extracted[field];
        if (value?.length) onDraftChanged(suggestionDraftFields[field], true);
      }
      setDraft(current => ({ ...current,
        ...(extracted.displayName && { displayName: extracted.displayName }),
        ...(extracted.organization && { organization: extracted.organization }),
        ...(extracted.role && { role: extracted.role }),
        ...((fields.headline || extracted.headline) && { headline: fields.headline || extracted.headline }),
        ...((fields.homeMarket || extracted.homeMarket) && { timezone: fields.homeMarket || extracted.homeMarket }),
        ...((fields.relationshipGoal || extracted.relationshipGoal) && { relationshipGoal: fields.relationshipGoal || extracted.relationshipGoal }),
        ...((fields.targetRelationshipTypes ?? extracted.targetRelationshipTypes).length > 0 && { targetRelationshipTypesText: (fields.targetRelationshipTypes ?? extracted.targetRelationshipTypes).join("\n") }),
        ...((fields.preferredFollowUpWindow || extracted.preferredFollowUpWindow) && { preferredFollowUpWindow: fields.preferredFollowUpWindow || extracted.preferredFollowUpWindow }),
        ...((fields.preferredIntroChannels ?? extracted.preferredIntroChannels).length > 0 && { preferredIntroChannelsText: (fields.preferredIntroChannels ?? extracted.preferredIntroChannels).join("\n") })
      }));
    }
  }, [appliedProfileExtraction]);

  function updateDraft(field: keyof ProfileDraft, value: string) {
    if (!isScopeCurrent()) return;
    dirtyDraft.current = true; draftRevision.current++;
    onDraftChanged(field);
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveDraft() {
    if (!isScopeCurrent() || !editable.current || !dirtyDraft.current) return;
    const revision = draftRevision.current;
    const isDraftCurrent = () => isScopeCurrent() && draftRevision.current === revision;
    const receipt = await onSave(latestDraft.current, draftBase.current, isDraftCurrent);
    if (receipt && isScopeCurrent()) {
      draftBase.current = receipt;
      if (isDraftCurrent()) dirtyDraft.current = false;
      setDraft(current => ({ ...current }));
    }
  }
  const industryChanged = draft.primaryIndustryId !== data.profile?.primaryIndustryId || draft.secondaryIndustryId !== data.profile?.secondaryIndustryId;
  const industryIncomplete = industryChanged && Boolean(draft.primaryIndustryId) && !draft.secondaryIndustryId;
  const saveDisabled = saving || !canEdit || !dirtyDraft.current || industryIncomplete || !validateIndustrySelection(draft).valid;

  function updateIndustry(selection: IndustrySelectionContract) {
    if (!isScopeCurrent() || !editable.current || saving) return;
    dirtyDraft.current = true; draftRevision.current++;
    onDraftChanged("primaryIndustryId");
    onDraftChanged("secondaryIndustryId");
    setDraft(current => ({ ...current, ...selection }));
  }

  return (
    <DataCard detail={locale.t("profile.editDetail")} title={locale.t("profile.editTitle")} variant="inset">
      <View style={styles.manualEditStack}>
        {acceptedPatchView ? (
          <ProfileAcceptedPatchNotice view={acceptedPatchView} />
        ) : null}
        <ProfileTextInput
          label={locale.t("profile.name")}
          onChangeText={(value) => updateDraft("displayName", value)}
          value={draft.displayName}
        />
        <ProfileTextInput
          label={locale.t("profile.headline")}
          onChangeText={(value) => updateDraft("headline", value)}
          value={draft.headline}
        />
        <ProfileTextInput
          label={locale.t("profile.organization")}
          onChangeText={(value) => updateDraft("organization", value)}
          value={draft.organization}
        />
        <ProfileTextInput
          label={locale.t("profile.role")}
          onChangeText={(value) => updateDraft("role", value)}
          value={draft.role}
        />
        <ProfileTextInput label={locale.t("profile.birthDatePrivate")} placeholder={locale.t("profile.birthDatePlaceholder")} onChangeText={value => updateDraft("birthDate", value)} value={draft.birthDate} />
        <ProfileIndustryPicker label={locale.t("profile.primaryIndustry")} selected={draft.primaryIndustryId ?? null} options={INDUSTRY_CATALOG.map(item => ({ id: item.id, label: item.labels[locale.language] }))} disabled={saving || !canEdit} onSelect={primaryIndustryId => updateIndustry({ primaryIndustryId, secondaryIndustryId: null })} />
        <ProfileIndustryPicker label={locale.t("profile.secondaryIndustry")} selected={draft.secondaryIndustryId ?? null} options={draft.primaryIndustryId ? listSecondaryIndustries(draft.primaryIndustryId).map(item => ({ id: item.id, label: item.labels[locale.language] })) : []} disabled={saving || !canEdit || !draft.primaryIndustryId} onSelect={secondaryIndustryId => updateIndustry({ secondaryIndustryId })} />
        {industryIncomplete ? <Text style={styles.evidenceText}>{locale.t("profile.chooseSecondaryIndustry")}</Text> : null}
        <ProfileTextInput
          label={locale.t("profile.bio")}
          multiline
          onChangeText={(value) => updateDraft("bio", value)}
          value={draft.bio}
        />
        <ProfileTextInput
          label={locale.t("profile.offering")}
          multiline
          onChangeText={(value) => updateDraft("offeringText", value)}
          placeholder={locale.t("profile.resourcePlaceholder")}
          value={draft.offeringText}
        />
        <ProfileTextInput
          label={locale.t("profile.wantToMeet")}
          multiline
          onChangeText={(value) => updateDraft("seekingText", value)}
          placeholder={locale.t("profile.seekingPlaceholder")}
          value={draft.seekingText}
        />
        <ProfileTextInput
          label={locale.t("profile.topics")}
          multiline
          onChangeText={(value) => updateDraft("topicsText", value)}
          placeholder={locale.t("profile.topicPlaceholder")}
          value={draft.topicsText}
        />
        <ProfileTextInput
          label={locale.t("profile.relationshipGoal")}
          multiline
          onChangeText={(value) => updateDraft("relationshipGoal", value)}
          value={draft.relationshipGoal}
        />
        <ProfileTextInput label={locale.t("profile.targetRelationshipTypes")} multiline onChangeText={value => updateDraft("targetRelationshipTypesText", value)} value={draft.targetRelationshipTypesText} placeholder={locale.t("profile.relationshipTypePlaceholder")} />
        <ProfileTextInput label={locale.t("profile.followUpWindow")} onChangeText={value => updateDraft("preferredFollowUpWindow", value)} value={draft.preferredFollowUpWindow} />
        <ProfileTextInput label={locale.t("profile.introChannels")} multiline onChangeText={value => updateDraft("preferredIntroChannelsText", value)} value={draft.preferredIntroChannelsText} placeholder={locale.t("profile.channelPlaceholder")} />
        {actionMessage ? (
          <Text style={styles.profileActionMessage}>{actionMessage}</Text>
        ) : null}
        {actionError ? (
          <Text style={styles.profileActionError}>{actionError}</Text>
        ) : null}
        {dirtyDraft.current && draftBase.current.profile?.updatedAt !== data.profile?.updatedAt ? (
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.discardDraft")} disabled={saving || !canEdit} onPress={() => {
            if (!isScopeCurrent() || !editable.current || saving) return;
            draftRevision.current++; dirtyDraft.current = false; draftBase.current = data;
            setDraft(profileDraftFromDetail(data));
            onDraftChanged("displayName");
          }} style={styles.profileExtractionButton}>
            <Text style={styles.profileExtractionButtonText}>{locale.t("profile.discardDraft")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={locale.t("profile.save")}
          accessibilityRole="button"
          disabled={saveDisabled}
          onPress={() => { void saveDraft(); }}
          style={({ pressed }) => [
            styles.profileSaveButton,
            saveDisabled ? styles.profileSaveButtonDisabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons
            color={colors.onAccent}
            name={saving ? "time-outline" : "save-outline"}
            size={16}
          />
          <Text style={styles.profileSaveButtonText}>
            {saving ? locale.t("profile.saving") : locale.t("profile.save")}
          </Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

function ProfileIndustryPicker<TId extends string>({ label, selected, options, disabled, onSelect }: {
  label: string;
  selected: TId | null;
  options: readonly { id: TId; label: string }[];
  disabled: boolean;
  onSelect: (id: TId | null) => void;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const [expanded, setExpanded] = useState(false);
  return <View>
    <Text style={styles.evidenceText}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.chooseNamed", { name: label })} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => setExpanded(value => !value)} style={styles.profileExtractionButton}>
      <Text style={styles.bodyText}>{options.find(item => item.id === selected)?.label ?? locale.t("profile.notFilled")}</Text>
    </Pressable>
    {expanded && !disabled ? <View style={styles.profileExtractionStack}>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.clearNamed", { name: label })} onPress={() => { onSelect(null); setExpanded(false); }} style={styles.profileExtractionButton}><Text style={styles.bodyText}>{locale.t("profile.notFilled")}</Text></Pressable>
      {options.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${label}：${item.label}`} accessibilityState={{ selected: item.id === selected }} onPress={() => { onSelect(item.id); setExpanded(false); }} style={styles.profileExtractionButton}><Text style={styles.bodyText}>{item.label}</Text></Pressable>)}
    </View> : null}
  </View>;
}

function ProfileAcceptedPatchNotice({
  view
}: {
  view: ProfileAcceptedPatchView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.acceptedPatchNotice}>
      <View style={styles.acceptedPatchHeader}>
        <Text style={styles.acceptedPatchTitle}>{view.title}</Text>
        <Text style={styles.acceptedPatchSummary}>{view.summary}</Text>
      </View>
      {view.fields.map((field) => (
        <View key={field.label} style={styles.acceptedPatchRow}>
          <Text style={styles.acceptedPatchLabel}>{field.label}</Text>
          <Text style={styles.acceptedPatchValue}>{field.value}</Text>
        </View>
      ))}
      <Text style={styles.evidenceText}>{view.nextAction}</Text>
    </View>
  );
}

function ProfileTextInput({
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.profileInputGroup}>
      <Text style={styles.profileInputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text4}
        style={[styles.profileInput, multiline ? styles.profileInputMultiline : null]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
  );
}

function BusinessCardTagRow({
  group,
  label
}: {
  group: ProfileBusinessCardTagGroup;
  label: string;
}) {
  const { styles } = useStyles();
  if (group.values.length === 0) {
    return null;
  }

  return (
    <View style={styles.businessCardTagRow}>
      <Text style={styles.businessCardTagLabel}>{label}</Text>
      <View style={styles.businessCardTags}>
        {group.values.map((value) => (
          <Text
            key={value}
            style={styles.businessCardTag}
          >
            {value}
          </Text>
        ))}
        {group.overflow > 0 ? (
          <Text style={styles.businessCardOverflow}>+{group.overflow}</Text>
        ) : null}
      </View>
    </View>
  );
}

function OrbitBusinessCard({ profile, onEdit }: { profile: ProfileSummary; onEdit: () => void }) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const card = profileBusinessCard(profile);
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 360 || fontScale > 1.2;

  return (
    <View style={[styles.profileIdentity, narrow && styles.profileIdentityNarrow]}>
      <View style={styles.profileIdentityMain}>
        <View testID="profile-avatar" style={styles.profileAvatar}>
          <Text style={styles.profileInitial}>{card.initial}</Text>
        </View>
        <View style={styles.profileIdentityText}>
          <Text style={styles.profileName}>{card.name}</Text>
          {profile.role || profile.organization ? <Text style={styles.profileMeta}>{[profile.role, profile.organization].filter(Boolean).join(" · ")}</Text> : card.headline ? <Text style={styles.profileMeta}>{card.headline}</Text> : null}
          {profile.timezone ? <Text style={styles.profileLocation}>{profile.timezone}</Text> : null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.edit")} onPress={onEdit} style={({ pressed }) => [styles.profileEditLink, pressed && styles.pressed]}>
        <Text style={styles.profileEditText}>{locale.t("profile.edit")}</Text><Ionicons name="chevron-forward" size={14} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function ProfileStatistics({ scopeKey, isScopeCurrent }: { scopeKey: string; isScopeCurrent: () => boolean }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 360 || fontScale > 1.2;
  return <View style={[styles.statistics, narrow && styles.statisticsNarrow]}>
    <ProfileStatistic label={locale.t("profile.contacts")} path={ORBIT_API_ENDPOINTS.contacts} href="/contacts" count={profileContactsCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} first narrow={narrow} />
    <ProfileStatistic label={locale.t("profile.todayTasks")} path={ORBIT_API_ENDPOINTS.tasks + "?status=open"} href="/tasks" count={profileTodayTasksCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} narrow={narrow} />
    <ProfileStatistic label={locale.t("profile.upcomingSchedule")} path={ORBIT_API_ENDPOINTS.scheduleItems} href="/schedule" count={profileUpcomingScheduleCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} narrow={narrow} />
  </View>;
}

function ProfileStatistic({ label, path, href, count, scopeKey, isScopeCurrent, first = false, narrow }: {
  label: string; path: string; href: Href; count: (data: unknown) => number | null; scopeKey: string; isScopeCurrent: () => boolean; first?: boolean; narrow: boolean;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const state = useApiResource<unknown>(path, () => false, { scopeKey: JSON.stringify([scopeKey, path, attempt]) });
  const value = state.kind === "success" || state.kind === "empty" ? count(state.data) : null;
  const cellStyles = [styles.statistic, narrow && styles.statisticNarrow, !first && !narrow && styles.statisticNext, !first && narrow && styles.statisticNextNarrow];
  if (value !== null) return <Pressable accessibilityRole="button" accessibilityLabel={label + " " + value} onPress={() => { if (isScopeCurrent()) router.push(href); }} style={({ pressed }) => [...cellStyles, pressed && styles.pressed]}>
    <Text style={styles.statisticValue}>{value}</Text><Text style={styles.statisticLabel}>{label}</Text>
  </Pressable>;
  return <View style={cellStyles}>
    <Text accessibilityRole={state.kind === "loading" ? "text" : "alert"} accessibilityLiveRegion="polite" style={styles.statisticState}>{state.kind === "loading" ? locale.t("profile.reading") : locale.t("profile.unavailable")}</Text>
    <Text style={styles.statisticLabel}>{label}</Text>
    {state.kind !== "loading" ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("profile.retryNamed", { name: label })} onPress={() => { if (isScopeCurrent()) setAttempt(value => value + 1); }} style={styles.statisticRetry}><Text style={styles.profileEditText}>{locale.t("common.retry")}</Text></Pressable> : null}
  </View>;
}

function ProfileUpdateSuggestionsCard({
  canEdit,
  isScopeCurrent,
  acceptingSuggestionId,
  actionError,
  actionMessage,
  onAcceptSuggestion,
  state
}: {
  canEdit: boolean;
  isScopeCurrent: () => boolean;
  acceptingSuggestionId: string | null;
  actionError: string | null;
  actionMessage: string | null;
  onAcceptSuggestion: (id: string) => void;
  state: ApiResourceState<ProfileSuggestions>;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const notice = state.kind === "loading" ? locale.t("profile.suggestionsReading") : !data ? locale.t("profile.suggestionsUnavailable")
    : data.state === "pending" ? locale.t("profile.suggestionsPending") : data.state === "empty" || data.suggestions.length === 0 ? locale.t("profile.suggestionsEmpty") : null;
  if (notice) {
    return <DataCard title={locale.t("profile.suggestionsTitle")}>
      <Text accessibilityRole={!data && state.kind !== "loading" ? "alert" : "text"} style={styles.bodyText}>{notice}</Text>
      {actionError ? <Text accessibilityRole="alert" style={styles.suggestionActionError}>{actionError}</Text> : null}
      {actionMessage ? <Text style={styles.suggestionActionMessage}>{actionMessage}</Text> : null}
      {state.kind !== "loading" ? <ProfileExtractionButton disabled={!isScopeCurrent()} icon="refresh-outline" label={locale.t("profile.retrySuggestions")} onPress={() => { if (isScopeCurrent()) state.refresh(); }} /> : null}
    </DataCard>;
  }
  if (!data) return null;
  const baseView = profileUpdateSuggestionsToView(data);
  const view = { ...baseView,
    nextAction: profileBusinessText(data.nextAction, locale.language),
    stateLabel: profileSuggestionStateLabel(data.state, data.suggestions.length, locale.t),
    suggestions: baseView.suggestions.map((view, index) => {
    const item = data.suggestions[index]!;
    return { ...view, canAccept: canEdit && view.canAccept, currentValue: Array.isArray(item.currentValue) ? item.currentValue.join("、") : item.currentValue,
      suggestedValue: Array.isArray(item.suggestedValue) ? item.suggestedValue.join("、") : item.suggestedValue,
      confidenceLabel: profileConfidenceLabel(item.confidence, locale.t),
      fieldLabel: profileFieldLabel(item.targetProfileField, locale.t),
      sourceLabel: profileBusinessText(item.sourceLabel, locale.language) || profileSignalSourceLabel(item.sourceKind, locale.t),
      statusLabel: profileSuggestionStatusLabel(item.status, locale.t),
      rationale: profileBusinessText(item.rationale, locale.language),
      evidenceExcerpt: item.evidence.map(evidence => profileBusinessText(evidence.excerpt, locale.language)).join("\n") };
  }) };

  return (
    <DataCard detail={`${view.stateLabel} · ${view.nextAction}`} title={locale.t("profile.suggestionsTitle")}>
      <View style={styles.suggestionsStack}>
        {actionMessage ? (
          <Text style={styles.suggestionActionMessage}>{actionMessage}</Text>
        ) : null}
        {actionError ? (
          <Text style={styles.suggestionActionError}>{actionError}</Text>
        ) : null}
        {view.suggestions.map((suggestion) => {
          const isAccepting = acceptingSuggestionId === suggestion.id;
          const actionDisabled = acceptingSuggestionId !== null;

          return (
            <View key={suggestion.id} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionSource}>
                  {suggestion.sourceLabel}
                </Text>
                <Text style={styles.suggestionStatus}>
                  {suggestion.statusLabel} · {suggestion.confidenceLabel}
                </Text>
              </View>
              <Text style={styles.suggestionField}>{suggestion.fieldLabel}</Text>
              <View style={styles.suggestionDiff}>
                <Text style={styles.suggestionLabel}>{locale.t("profile.currentValue")}</Text>
                <Text style={styles.suggestionValue}>
                  {suggestion.currentValue}
                </Text>
                <Text style={styles.suggestionLabel}>{locale.t("profile.suggestedValue")}</Text>
                <Text style={styles.suggestionValueStrong}>
                  {suggestion.suggestedValue}
                </Text>
              </View>
              <Text style={styles.bodyText}>{suggestion.rationale}</Text>
              <Text style={styles.evidenceText}>
                {suggestion.evidenceExcerpt}
              </Text>
              {suggestion.canAccept ? (
                <Pressable
                  accessibilityLabel={locale.t("profile.confirmNamedSuggestion", { field: suggestion.fieldLabel })}
                  accessibilityRole="button"
                  disabled={actionDisabled}
                  onPress={() => onAcceptSuggestion(suggestion.id)}
                  style={({ pressed }) => [
                    styles.suggestionActionButton,
                    actionDisabled ? styles.suggestionActionButtonDisabled : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Ionicons
                    color={colors.onAccent}
                    name={isAccepting ? "time-outline" : "checkmark-outline"}
                    size={16}
                  />
                  <Text style={styles.suggestionActionButtonText}>
                    {isAccepting ? locale.t("profile.confirming") : locale.t("profile.confirmSuggestion")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </DataCard>
  );
}

function ProfileTagSection({
  items,
  title
}: {
  items: string[];
  title: string;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  if (items.length === 0) {
    return null;
  }

  return (
    <View>
      <SectionHeader detail={locale.t("profile.itemsCount", { count: items.length })} title={title} />
      <View style={styles.tagsWrap}>
        {items.map((item) => (
          <Text key={item} style={styles.tagText}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pageContent: { alignSelf: "center", width: "100%", maxWidth: 820, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  pageTitle: { color: colors.ink, fontSize: 30, lineHeight: 38, fontWeight: "900", letterSpacing: -0.6, flexShrink: 1 },
  settingsButton: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  profileIdentity: { marginTop: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  profileIdentityNarrow: { flexDirection: "column", alignItems: "stretch" },
  profileIdentityMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 16 },
  profileIdentityText: { flex: 1, minWidth: 0 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, flexShrink: 0, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  profileInitial: { color: colors.onAccent, fontSize: 26, lineHeight: 32, fontWeight: "800" },
  profileName: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: "900", letterSpacing: -0.48 },
  profileMeta: { color: colors.text3, fontSize: 13, lineHeight: 19, marginTop: 2 },
  profileLocation: { color: colors.text4, fontSize: 12, lineHeight: 18, marginTop: 2 },
  profileEditLink: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexShrink: 0 },
  profileEditText: { color: colors.accent, fontSize: 13, lineHeight: 19, fontWeight: "700", flexShrink: 1 },
  statistics: { marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row" },
  statisticsNarrow: { flexDirection: "column" },
  statistic: { width: "33.333333%", minWidth: 0, minHeight: 76, paddingVertical: 14, paddingHorizontal: 0, justifyContent: "center" },
  statisticNarrow: { width: "100%" },
  statisticNext: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingHorizontal: 16 },
  statisticNextNarrow: { borderTopWidth: 1, borderTopColor: colors.border },
  statisticValue: { color: colors.ink, fontSize: 26, lineHeight: 26, fontWeight: "800", letterSpacing: -0.78 },
  statisticLabel: { color: colors.text3, fontSize: 11, lineHeight: 16, marginTop: 6 },
  statisticState: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  statisticRetry: { minHeight: 44, minWidth: 44, alignItems: "flex-start", justifyContent: "center" },
  basicSection: { marginTop: 20 },
  sectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  basicRows: { marginTop: 4 },
  basicRow: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  basicLabel: { color: colors.text4, fontSize: 14, lineHeight: 20, width: 72, flexShrink: 0 },
  basicValue: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "500", flex: 1, minWidth: 0 },
  bioRow: { borderBottomWidth: 0 },
  bioValue: { lineHeight: 22, fontWeight: "400" },
  previewTags: { marginTop: 14 },
  previewTagGroups: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewTagGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8, maxWidth: "100%", minWidth: 0 },
  previewTag: { color: colors.ink, fontSize: 12, lineHeight: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, maxWidth: "100%", overflow: "hidden" },
  offeringTag: { backgroundColor: colors.ink, borderColor: colors.ink, color: colors.onAccent, fontWeight: "600" },
  accountRow: { marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 14, minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accountTitle: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "600", flexShrink: 1 },
  extraSection: { marginTop: 20, gap: 8 },
  pageNotice: { marginTop: 20, color: colors.text3, fontSize: 14, lineHeight: 22, gap: 12 },
  editorSections: { marginTop: 20, gap: 20 },
  previewBack: { marginTop: 16, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  hidden: { display: "none" },
  bodyText: {
    ...textStyles.body,
    color: colors.text,
  },
  acceptedPatchHeader: {
    gap: 3
  },
  acceptedPatchLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16,
    width: 72
  },
  acceptedPatchNotice: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  acceptedPatchRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  acceptedPatchSummary: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  acceptedPatchTitle: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 19
  },
  acceptedPatchValue: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  businessCard: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
    paddingVertical: spacing.lg
  },
  businessCardAvatar: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    minHeight: 44,
    justifyContent: "center",
    minWidth: 44,
    padding: spacing.sm
  },
  businessCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  businessCardHeadline: {
    ...textStyles.body,
    color: colors.text
  },
  businessCardIdentity: {
    gap: spacing.xs
  },
  businessCardInitial: {
    ...textStyles.listTitle,
    color: colors.accent
  },
  businessCardMark: {
    ...textStyles.caption,
    color: colors.text3
  },
  businessCardMeta: {
    ...textStyles.small,
    color: colors.text3
  },
  businessCardName: {
    ...textStyles.title,
    color: colors.text
  },
  businessCardOverflow: {
    ...textStyles.caption,
    color: colors.text3
  },
  businessCardTag: {
    ...textStyles.small,
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    color: colors.text2,
    flexShrink: 1,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  businessCardTagLabel: {
    ...textStyles.small,
    color: colors.text3
  },
  businessCardTagRow: {
    alignItems: "flex-start",
    gap: spacing.sm,
    minWidth: 0
  },
  businessCardTags: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    minWidth: 0
  },
  businessCardTagStack: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  evidenceText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  manualEditStack: {
    gap: spacing.md
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  profileActionError: {
    color: colors.rose,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  profileActionMessage: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  profileExtractionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  profileExtractionApplyButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  profileExtractionApplyButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  profileExtractionButton: {
    ...createControlStyles(colors).secondaryButton,
    backgroundColor: colors.surface,
    flexDirection: "row",
    gap: spacing.xs,
    flexGrow: 1,
    maxWidth: "100%",
    minWidth: 116,
  },
  profileExtractionButtonDisabled: {
    opacity: 0.55
  },
  profileExtractionButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  profileExtractionDraft: {
    gap: spacing.sm
  },
  profileExtractionEvidence: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  profileExtractionLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16,
    width: 76
  },
  profileExtractionList: {
    gap: spacing.xs
  },
  profileExtractionMeta: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  profileExtractionName: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  profileExtractionResult: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  profileExtractionResultHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  profileExtractionRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  profileExtractionStack: {
    gap: spacing.md
  },
  profileExtractionStatus: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  profileExtractionTitle: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  profileExtractionValue: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  profileInput: {
    ...createControlStyles(colors).input
  },
  profileInputGroup: {
    gap: spacing.xs
  },
  profileInputLabel: {
    ...textStyles.small,
    color: colors.text3,
    fontWeight: "600"
  },
  profileInputMultiline: {
    minHeight: 92
  },
  profileLoginButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  profileLoginButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  profileSaveButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  profileSaveButtonDisabled: {
    opacity: 0.55
  },
  profileSaveButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  suggestionActionButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  suggestionActionButtonDisabled: {
    opacity: 0.55
  },
  suggestionActionButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  suggestionActionError: {
    color: colors.rose,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionActionMessage: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionCard: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  suggestionDiff: {
    gap: 4
  },
  suggestionField: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  suggestionLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  suggestionSource: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  suggestionsStack: {
    gap: spacing.md
  },
  suggestionStatus: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16
  },
  suggestionValue: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 19
  },
  suggestionValueStrong: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 19
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm
  },
  tagText: {
    backgroundColor: colors.liveSoft,
    borderRadius: 999,
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 7
  }
}));
