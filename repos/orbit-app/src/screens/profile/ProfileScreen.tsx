import { Ionicons } from "@expo/vector-icons";
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

type ProfileDraft = ProfileManualEditDraft & { targetRelationshipTypesText: string; preferredFollowUpWindow: string; preferredIntroChannelsText: string };
type SaveProfile = (draft: ProfileDraft, isDraftCurrent: () => boolean) => Promise<boolean>;
type DraftChanged = (field: keyof ProfileDraft, quiet?: boolean) => void;
const suggestionDraftFields = { headline: "headline", homeMarket: "timezone", relationshipGoal: "relationshipGoal", targetRelationshipTypes: "targetRelationshipTypesText", preferredFollowUpWindow: "preferredFollowUpWindow", preferredIntroChannels: "preferredIntroChannelsText" } as const;
const suggestionFieldLabels = { headline: "标题", homeMarket: "主要市场", relationshipGoal: "关系目标", targetRelationshipTypes: "目标关系类型", preferredFollowUpWindow: "联系时间", preferredIntroChannels: "介绍渠道" } as const;

function profileBusinessText(value: string): string {
  const text = value.trim();
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

function profileDraftFromDetail(data: ProfileDetail): ProfileDraft {
  return { ...profileSummaryToEditDraft(profileToSummary(data)), targetRelationshipTypesText: data.profile?.targetRelationshipTypes.join("\n") ?? "",
    preferredFollowUpWindow: data.profile?.preferredFollowUpWindow ?? "", preferredIntroChannelsText: data.profile?.preferredIntroChannels.join("\n") ?? "" };
}

function profileDraftToRequest(draft: ProfileDraft, data: ProfileDetail): ProfileSaveRequest | null {
  const request = buildProfileUpdateRequest(draft);
  if (!request) return null;
  const result: ProfileSaveRequest = { ...request,
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

export function ProfileScreen({ scopeKey = "profile", isScopeCurrent = () => true }: { scopeKey?: string; isScopeCurrent?: () => boolean } = {}) {
  const { colors, styles } = useStyles();
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
        setSuggestionActionError("这条建议尚未确认，请重试。");
        return;
      }

      if ((fieldRevisions.current[field] ?? 0) === revision) {
        setAcceptedProfilePatch(receipt.data);
        setSuggestionActionMessage("建议已放进编辑表单。检查后保存资料。");
      } else {
        setSuggestionActionMessage(`${suggestionFieldLabels[suggestion.targetProfileField]}已有新的编辑，建议未覆盖这项改动。`);
      }
      suggestionsState.refresh();
    } catch {
      if (suggestionOperation.owns(controller)) setSuggestionActionError("这条建议尚未确认，请重试。");
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
      setProfileExtractionError("先粘贴需要提取的原文。");
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
        setProfileExtractionError("提取结果尚未确认，请重试。");
        return;
      }

      setProfileExtractionResult(receipt.data);
    } catch {
      if (extractionOperation.owns(controller)) setProfileExtractionError("提取结果尚未确认，请重试。");
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
    setProfileActionMessage("提取结果已放进编辑表单。检查后保存资料。");
  }

  async function onSaveProfile(draft: ProfileDraft, isDraftCurrent: () => boolean): Promise<boolean> {
    if (!canAct() || !data) return false;
    const request = profileDraftToRequest(draft, data);

    if (!request) {
      setProfileActionError("先写名字。");
      setProfileActionMessage(null);
      return false;
    }
    const controller = saveOperation.start();
    if (!controller) return false;

    setSavingProfile(true);
    setProfileActionError(null);
    setProfileActionMessage(null);

    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, {
        body: request, signal: controller.signal
      });
      if (!saveOperation.owns(controller)) return false;
      const receipt = result.success && result.status >= 200 && result.status < 300 ? profileSaveReceiptSchema(data.profile?.id ?? null, request).safeParse(result.data) : null;
      if (!receipt?.success) {
        setProfileActionError("资料尚未确认保存，请重试。");
        return false;
      }

      setSavedData({ scope: readScope, data: receipt.data });
      if (isDraftCurrent()) setProfileActionMessage("资料已保存。");
      setAcceptedProfilePatch(null);
      setAppliedProfileExtraction(null);
      return true;
    } catch {
      if (saveOperation.owns(controller)) setProfileActionError("资料尚未确认保存，请重试。");
      return false;
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
        <Text accessibilityRole="header" style={styles.pageTitle}>我的</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={() => { if (current()) router.push("/settings" as Href); }} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
          <Ionicons name="sunny-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>
      {!auth.ready ? <LoadingState /> : null}
      {auth.ready && !auth.signedIn ? (
        <DataCard
          detail="当前设备没有已验证身份，Orbit 不会展示任何人的资料。"
          title="登录后查看个人资料"
        >
          <Text style={styles.bodyText}>
            使用邮箱或 Google 登录，完成后会回到这里。
          </Text>
          <Pressable
            accessibilityLabel="登录查看个人资料"
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
            <Text style={styles.profileLoginButtonText}>登录查看个人资料</Text>
          </Pressable>
        </DataCard>
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.pageNotice}>正在读取个人资料</Text> : null}
      {auth.signedIn && loadedData?.state === "pending" ? <Text accessibilityLiveRegion="polite" style={styles.pageNotice}>个人资料正在等待复核，暂时不能保存。</Text> : null}
      {auth.signedIn && (state.kind === "offline" || state.kind === "failure") ? (
        <View style={styles.pageNotice}>
          <Text accessibilityRole="alert" style={styles.profileActionError}>个人资料未能读取</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="重试个人资料" onPress={() => { if (current()) setRefreshKey(value => value + 1); }} style={styles.profileExtractionButton}>
            <Text style={styles.profileExtractionButtonText}>重试个人资料</Text>
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
  suggestionsState
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
}) {
  const { styles } = useStyles();
  const [editing, setEditing] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const storedProfile = profileToSummary(data);
  const displayProfile = storedProfile;

  return (
    <>
      {!editing ? <>
        <OrbitBusinessCard profile={displayProfile} onEdit={() => { if (isScopeCurrent()) { setEditorMounted(true); setEditing(true); } }} />
        <ProfileStatistics scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} />
        {!storedProfile.displayName ? <Text style={styles.pageNotice}>尚未填写个人资料</Text> : null}
        <View style={styles.basicSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>基本资料</Text>
          <View style={styles.basicRows}>
            {[["行业", displayProfile.secondaryIndustryId ? secondaryIndustryLabel(displayProfile.secondaryIndustryId, "zh") : displayProfile.primaryIndustryId ? `${industryLabel(displayProfile.primaryIndustryId, "zh")} · 二级未填写` : displayProfile.industry], ["公司", displayProfile.organization], ["职位", displayProfile.role], ["简介", displayProfile.bio]].map(([label, value], index) => (
              <View key={label} style={[styles.basicRow, index === 3 && styles.bioRow]}>
                <Text style={styles.basicLabel}>{label}</Text>
                <Text style={[styles.basicValue, index === 3 && styles.bioValue]}>{value || "未填写"}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.previewTags}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>我能提供 · 我想寻找 · 想聊的话题</Text>
          <View style={styles.previewTagGroups}>
            {[["我能提供", displayProfile.offering], ["我想寻找", displayProfile.seeking], ["想聊的话题", displayProfile.topics]].map(([label, values], index) => (
              <View key={label as string} accessibilityLabel={label as string} style={styles.previewTagGroup}>
                {(values as string[]).map((item, itemIndex) => <Text key={itemIndex} style={[styles.previewTag, index === 0 && styles.offeringTag]}>{item}</Text>)}
              </View>
            ))}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="账号与工作区" onPress={onOpenAccount} style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}>
          <Text style={styles.accountTitle}>账号与工作区</Text>
          <Ionicons name="chevron-forward" size={16} color={styles.basicLabel.color} />
        </Pressable>
        {displayProfile.relationshipGoal ? <View style={styles.extraSection}><Text style={styles.sectionTitle}>关系目标</Text><Text style={styles.bodyText}>{displayProfile.relationshipGoal}</Text></View> : null}
      </> : <Pressable accessibilityRole="button" accessibilityLabel="返回资料预览" onPress={() => { if (isScopeCurrent()) setEditing(false); }} style={styles.previewBack}>
        <Text style={styles.profileExtractionButtonText}>返回资料预览</Text>
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
  const [sourceText, setSourceText] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerPending, setPickerPending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ kind: ProfileDocumentExtractionKind; fileName: string; mimeType: string } | null>(null);
  const editable = useRef(canEdit); editable.current = canEdit;
  const source = useRef(sourceText); source.current = sourceText;
  const picker = useProfileOperation(scopeKey, isScopeCurrent);
  const baseView = result ? profileDocumentExtractionToView(result) : null;
  const fieldLabels: Record<string, string> = { displayName: "姓名", headline: "标题", homeMarket: "主要市场", relationshipGoal: "关系目标", targetRelationshipTypes: "目标关系", preferredFollowUpWindow: "联系时间", preferredIntroChannels: "介绍渠道", organization: "公司", role: "角色", email: "邮箱", phone: "电话", website: "网站" };
  const view = baseView && result ? { ...baseView, summary: profileBusinessText(result.confidenceSummary), nextAction: profileBusinessText(result.nextAction),
    stateLabel: result.state === "pending" ? "处理中" : baseView.stateLabel,
    draft: baseView.draft && result.draft ? { ...baseView.draft,
      displayName: result.draft.displayName || "未识别姓名", metaLine: [result.draft.role, result.draft.organization].filter(Boolean).join(" · "),
      relationshipGoal: result.draft.relationshipGoal,
      suggestedFields: Object.entries(result.draft.suggestedProfileFields).map(([field, value]) => ({ label: fieldLabels[field] ?? "资料字段", value: Array.isArray(value) ? value.join("、") : value ?? "" })).filter(field => field.value),
      evidence: result.draft.evidence.map(item => ({ label: Object.prototype.hasOwnProperty.call(fieldLabels, item.field) ? fieldLabels[item.field]! : "资料字段", excerpt: item.excerpt }))
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
        setPickerError("没有选到可读取的图片。");
        return;
      }

      const file = { kind, fileName: asset.fileName || (kind === "business-card" ? "business-card.jpg" : "resume.jpg"), mimeType: asset.mimeType || "image/jpeg" };
      setSelectedFile(file);
      if (source.current.trim() && editable.current) onExtract(kind, { fileName: file.fileName, mimeType: file.mimeType, text: source.current });
    } catch {
      if (picker.owns(controller)) setPickerError("这张图片暂时读取不了，请重试。");
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
        setPickerError("没有选到可读取的文件。");
        return;
      }

      const file = { kind: "resume" as const, fileName: asset.name || "resume.pdf", mimeType: asset.mimeType || "application/pdf" };
      setSelectedFile(file);
      if (source.current.trim() && editable.current) onExtract("resume", { fileName: file.fileName, mimeType: file.mimeType, text: source.current });
    } catch {
      if (picker.owns(controller)) setPickerError("这份文件暂时读取不了，请重试。");
    } finally {
      if (picker.owns(controller)) setPickerPending(false);
      picker.finish(controller);
    }
  }

  return (
    <DataCard detail="提取结果只用于复核，不会直接修改个人资料" title="补全资料" variant="inset">
      <View style={styles.profileExtractionStack}>
        <Text style={styles.evidenceText}>此处提取粘贴的文本，不读取图片或 PDF 的内容。</Text>
        {selectedFile ? <Text style={styles.bodyText}>{sourceText.trim() ? `已选择 ${selectedFile.fileName}。提取时仅使用下方原文。` : `已选择 ${selectedFile.fileName}。此处只能提取粘贴的文本，请补充原文。`}</Text> : null}
        <ProfileTextInput
          label="名片文本或简历摘要"
          multiline
          onChangeText={value => { if (picker.isCurrent()) setSourceText(value); }}
          placeholder="姓名、公司、角色、联系方式、关系目标"
          value={sourceText}
        />
        {actionError ? (
          <Text style={styles.profileActionError}>{actionError}</Text>
        ) : null}
        <View style={styles.profileExtractionActions}>
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="id-card-outline"
            label={extractingKind === "business-card" ? "提取中" : "提取名片"}
            onPress={() => { if (picker.isCurrent() && !actionsBusy.current) onExtract("business-card", { text: sourceText, ...(selectedFile?.kind === "business-card" ? { fileName: selectedFile.fileName, mimeType: selectedFile.mimeType } : {}) }); }}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="document-text-outline"
            label={extractingKind === "resume" ? "提取中" : "提取简历"}
            onPress={() => { if (picker.isCurrent() && !actionsBusy.current) onExtract("resume", { text: sourceText, ...(selectedFile?.kind === "resume" ? { fileName: selectedFile.fileName, mimeType: selectedFile.mimeType } : {}) }); }}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="image-outline"
            label="选择名片图片"
            onPress={() => pickProfileDocumentImage("business-card")}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="images-outline"
            label="选择简历图片"
            onPress={() => pickProfileDocumentImage("resume")}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="document-attach-outline"
            label="选择简历文件"
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
          accessibilityLabel="应用到编辑表单"
          accessibilityRole="button"
          onPress={onApply}
          style={({ pressed }) => [
            styles.profileExtractionApplyButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="create-outline" size={16} />
          <Text style={styles.profileExtractionApplyButtonText}>
            应用到编辑表单
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
  const profileFingerprint = JSON.stringify(data.profile);
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraftFromDetail(data));
  const dirtyDraft = useRef(false);
  const draftRevision = useRef(0);
  const latestDraft = useRef(draft); latestDraft.current = draft;
  const editable = useRef(canEdit); editable.current = canEdit;
  const acceptedPatchView = acceptedPatch
    ? { ...profileAcceptedPatchToView(acceptedPatch), nextAction: profileBusinessText(acceptedPatch.nextAction),
      fields: profileAcceptedPatchToView(acceptedPatch).fields.map((field, index) => {
        const value = acceptedPatch.profilePatch[acceptedPatch.appliedFields[index]!];
        return { ...field, value: Array.isArray(value) ? value.join("、") : value ?? "" };
      }) }
    : null;

  useEffect(() => {
    if (!dirtyDraft.current) setDraft(profileDraftFromDetail(data));
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
    if (await onSave(latestDraft.current, isDraftCurrent) && isDraftCurrent()) {
      dirtyDraft.current = false;
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
    <DataCard detail="保存后同步到 web 个人资料" title="编辑对外资料" variant="inset">
      <View style={styles.manualEditStack}>
        {acceptedPatchView ? (
          <ProfileAcceptedPatchNotice view={acceptedPatchView} />
        ) : null}
        <ProfileTextInput
          label="名字"
          onChangeText={(value) => updateDraft("displayName", value)}
          value={draft.displayName}
        />
        <ProfileTextInput
          label="标题"
          onChangeText={(value) => updateDraft("headline", value)}
          value={draft.headline}
        />
        <ProfileIndustryPicker label="主要行业" selected={draft.primaryIndustryId ?? null} options={INDUSTRY_CATALOG.map(item => ({ id: item.id, label: item.labels.zh }))} disabled={saving || !canEdit} onSelect={primaryIndustryId => updateIndustry({ primaryIndustryId, secondaryIndustryId: null })} />
        <ProfileIndustryPicker label="二级行业" selected={draft.secondaryIndustryId ?? null} options={draft.primaryIndustryId ? listSecondaryIndustries(draft.primaryIndustryId).map(item => ({ id: item.id, label: item.labels.zh })) : []} disabled={saving || !canEdit || !draft.primaryIndustryId} onSelect={secondaryIndustryId => updateIndustry({ secondaryIndustryId })} />
        {industryIncomplete ? <Text style={styles.evidenceText}>请选择二级行业。</Text> : null}
        <ProfileTextInput
          label="简介"
          multiline
          onChangeText={(value) => updateDraft("bio", value)}
          value={draft.bio}
        />
        <ProfileTextInput
          label="我能提供"
          multiline
          onChangeText={(value) => updateDraft("offeringText", value)}
          placeholder="一行一个资源"
          value={draft.offeringText}
        />
        <ProfileTextInput
          label="我想认识"
          multiline
          onChangeText={(value) => updateDraft("seekingText", value)}
          placeholder="一行一个需求"
          value={draft.seekingText}
        />
        <ProfileTextInput
          label="关系目标"
          multiline
          onChangeText={(value) => updateDraft("relationshipGoal", value)}
          value={draft.relationshipGoal}
        />
        <ProfileTextInput label="目标关系类型" multiline onChangeText={value => updateDraft("targetRelationshipTypesText", value)} value={draft.targetRelationshipTypesText} placeholder="一行一种关系" />
        <ProfileTextInput label="联系时间" onChangeText={value => updateDraft("preferredFollowUpWindow", value)} value={draft.preferredFollowUpWindow} />
        <ProfileTextInput label="介绍渠道" multiline onChangeText={value => updateDraft("preferredIntroChannelsText", value)} value={draft.preferredIntroChannelsText} placeholder="一行一种渠道" />
        {actionMessage ? (
          <Text style={styles.profileActionMessage}>{actionMessage}</Text>
        ) : null}
        {actionError ? (
          <Text style={styles.profileActionError}>{actionError}</Text>
        ) : null}
        <Pressable
          accessibilityLabel="保存资料"
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
            {saving ? "保存中" : "保存资料"}
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
  const [expanded, setExpanded] = useState(false);
  return <View>
    <Text style={styles.evidenceText}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`选择${label}`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => setExpanded(value => !value)} style={styles.profileExtractionButton}>
      <Text style={styles.bodyText}>{options.find(item => item.id === selected)?.label ?? "未填写"}</Text>
    </Pressable>
    {expanded && !disabled ? <View style={styles.profileExtractionStack}>
      <Pressable accessibilityRole="button" accessibilityLabel={`清空${label}`} onPress={() => { onSelect(null); setExpanded(false); }} style={styles.profileExtractionButton}><Text style={styles.bodyText}>未填写</Text></Pressable>
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
      <Pressable accessibilityRole="button" accessibilityLabel="编辑资料" onPress={onEdit} style={({ pressed }) => [styles.profileEditLink, pressed && styles.pressed]}>
        <Text style={styles.profileEditText}>编辑资料</Text><Ionicons name="chevron-forward" size={14} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function ProfileStatistics({ scopeKey, isScopeCurrent }: { scopeKey: string; isScopeCurrent: () => boolean }) {
  const { styles } = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 360 || fontScale > 1.2;
  return <View style={[styles.statistics, narrow && styles.statisticsNarrow]}>
    <ProfileStatistic label="人脉" path={ORBIT_API_ENDPOINTS.contacts} href="/contacts" count={profileContactsCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} first narrow={narrow} />
    <ProfileStatistic label="今日待办" path={ORBIT_API_ENDPOINTS.tasks + "?status=open"} href="/tasks" count={profileTodayTasksCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} narrow={narrow} />
    <ProfileStatistic label="近期日程" path={ORBIT_API_ENDPOINTS.scheduleItems} href="/schedule" count={profileUpcomingScheduleCount} scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} narrow={narrow} />
  </View>;
}

function ProfileStatistic({ label, path, href, count, scopeKey, isScopeCurrent, first = false, narrow }: {
  label: string; path: string; href: Href; count: (data: unknown) => number | null; scopeKey: string; isScopeCurrent: () => boolean; first?: boolean; narrow: boolean;
}) {
  const { styles } = useStyles();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const state = useApiResource<unknown>(path, () => false, { scopeKey: JSON.stringify([scopeKey, path, attempt]) });
  const value = state.kind === "success" || state.kind === "empty" ? count(state.data) : null;
  const cellStyles = [styles.statistic, narrow && styles.statisticNarrow, !first && !narrow && styles.statisticNext, !first && narrow && styles.statisticNextNarrow];
  if (value !== null) return <Pressable accessibilityRole="button" accessibilityLabel={label + " " + value} onPress={() => { if (isScopeCurrent()) router.push(href); }} style={({ pressed }) => [...cellStyles, pressed && styles.pressed]}>
    <Text style={styles.statisticValue}>{value}</Text><Text style={styles.statisticLabel}>{label}</Text>
  </Pressable>;
  return <View style={cellStyles}>
    <Text accessibilityRole={state.kind === "loading" ? "text" : "alert"} accessibilityLiveRegion="polite" style={styles.statisticState}>{state.kind === "loading" ? "读取中" : "未读到"}</Text>
    <Text style={styles.statisticLabel}>{label}</Text>
    {state.kind !== "loading" ? <Pressable accessibilityRole="button" accessibilityLabel={"重试" + label} onPress={() => { if (isScopeCurrent()) setAttempt(value => value + 1); }} style={styles.statisticRetry}><Text style={styles.profileEditText}>重试</Text></Pressable> : null}
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
  const data = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const notice = state.kind === "loading" ? "正在读取资料建议" : !data ? "资料建议未能读取"
    : data.state === "pending" ? "资料建议正在准备" : data.state === "empty" || data.suggestions.length === 0 ? "暂无资料建议" : null;
  if (notice) {
    return <DataCard title="资料更新建议">
      <Text accessibilityRole={!data && state.kind !== "loading" ? "alert" : "text"} style={styles.bodyText}>{notice}</Text>
      {actionError ? <Text accessibilityRole="alert" style={styles.suggestionActionError}>{actionError}</Text> : null}
      {actionMessage ? <Text style={styles.suggestionActionMessage}>{actionMessage}</Text> : null}
      {state.kind !== "loading" ? <ProfileExtractionButton disabled={!isScopeCurrent()} icon="refresh-outline" label="重试资料建议" onPress={() => { if (isScopeCurrent()) state.refresh(); }} /> : null}
    </DataCard>;
  }
  if (!data) return null;
  const baseView = profileUpdateSuggestionsToView(data);
  const view = { ...baseView, nextAction: profileBusinessText(data.nextAction), suggestions: baseView.suggestions.map((view, index) => {
    const item = data.suggestions[index]!;
    return { ...view, canAccept: canEdit && view.canAccept, currentValue: Array.isArray(item.currentValue) ? item.currentValue.join("、") : item.currentValue,
      suggestedValue: Array.isArray(item.suggestedValue) ? item.suggestedValue.join("、") : item.suggestedValue,
      sourceLabel: profileBusinessText(item.sourceLabel), rationale: profileBusinessText(item.rationale), evidenceExcerpt: item.evidence.map(evidence => profileBusinessText(evidence.excerpt)).join("\n") };
  }) };

  return (
    <DataCard detail={`${view.stateLabel} · ${view.nextAction}`} title="资料更新建议">
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
                <Text style={styles.suggestionLabel}>当前</Text>
                <Text style={styles.suggestionValue}>
                  {suggestion.currentValue}
                </Text>
                <Text style={styles.suggestionLabel}>建议</Text>
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
                  accessibilityLabel={`确认${suggestion.fieldLabel}建议`}
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
                    {isAccepting ? "确认中" : "确认建议"}
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
  if (items.length === 0) {
    return null;
  }

  return (
    <View>
      <SectionHeader detail={`${items.length} 项`} title={title} />
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
