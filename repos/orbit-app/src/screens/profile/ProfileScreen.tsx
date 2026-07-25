import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  ORBIT_API_ENDPOINTS,
  profileUpdateSuggestionAcceptPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SectionHeader } from "../../components/SectionHeader";
import { colors, radius, spacing, typography } from "../../design/tokens";
import {
  type ApiResourceState,
  useApiResource
} from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  applyProfileAcceptedPatchToDraft,
  applyProfileDocumentExtractionToDraft,
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

export function ProfileScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const [acceptingSuggestionId, setAcceptingSuggestionId] = useState<
    string | null
  >(null);
  const [suggestionActionError, setSuggestionActionError] = useState<
    string | null
  >(null);
  const [suggestionActionMessage, setSuggestionActionMessage] = useState<
    string | null
  >(null);
  const [acceptedProfilePatch, setAcceptedProfilePatch] = useState<unknown>(null);
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
    useState<unknown>(null);
  const [appliedProfileExtraction, setAppliedProfileExtraction] =
    useState<unknown>(null);
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);
  const suggestionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profileUpdateSuggestions,
    (data) => profileUpdateSuggestionsToView(data).suggestions.length === 0
  );

  async function onAcceptSuggestion(id: string) {
    setAcceptingSuggestionId(id);
    setSuggestionActionError(null);
    setSuggestionActionMessage(null);

    try {
      const result = await client.post<unknown>(
        profileUpdateSuggestionAcceptPath(id)
      );

      if (!result.success) {
        setSuggestionActionError(
          result.error.message || "这条建议暂时确认不了，请刷新后再试。"
        );
        return;
      }

      setAcceptedProfilePatch(result.data);
      setSuggestionActionMessage("建议已放进编辑表单。检查后保存资料。");
      suggestionsState.refresh();
    } catch (error) {
      setSuggestionActionError(
        error instanceof Error
          ? error.message
          : "这条建议暂时确认不了，请刷新后再试。"
      );
    } finally {
      setAcceptingSuggestionId(null);
    }
  }

  async function onExtractProfileDocument(
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) {
    const request = buildProfileDocumentExtractionRequest(kind, input);

    if (!request) {
      setProfileExtractionError("先粘贴一段内容，或选择一张名片/简历图片。");
      setProfileExtractionResult(null);
      return;
    }

    setExtractingProfileDocumentKind(kind);
    setAppliedProfileExtraction(null);
    setProfileExtractionError(null);
    setProfileExtractionResult(null);

    try {
      const result = await client.post<unknown>(request.endpoint, {
        body: request.body
      });

      if (!result.success) {
        setProfileExtractionError(
          result.error.message || "这段资料暂时提取不了，请换一段再试。"
        );
        return;
      }

      setProfileExtractionResult(result.data);
    } catch (error) {
      setProfileExtractionError(
        error instanceof Error
          ? error.message
          : "这段资料暂时提取不了，请换一段再试。"
      );
    } finally {
      setExtractingProfileDocumentKind(null);
    }
  }

  function onApplyProfileExtraction() {
    if (!profileExtractionResult) {
      return;
    }

    setAppliedProfileExtraction(profileExtractionResult);
    setProfileActionError(null);
    setProfileActionMessage("提取结果已放进编辑表单。检查后保存资料。");
  }

  async function onSaveProfile(draft: ProfileManualEditDraft) {
    const request = buildProfileUpdateRequest(draft);

    if (!request) {
      setProfileActionError("先写名字。");
      setProfileActionMessage(null);
      return;
    }

    setSavingProfile(true);
    setProfileActionError(null);
    setProfileActionMessage(null);

    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, {
        body: request
      });

      if (!result.success) {
        setProfileActionError(
          result.error.message || "资料暂时保存不了，请刷新后再试。"
        );
        return;
      }

      setProfileActionMessage("资料已保存。");
      setAcceptedProfilePatch(null);
      setAppliedProfileExtraction(null);
      state.refresh();
    } catch (error) {
      setProfileActionError(
        error instanceof Error
          ? error.message
          : "资料暂时保存不了，请刷新后再试。"
      );
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <AppScreen
      eyebrow="通用档案"
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            setSuggestionActionError(null);
            setSuggestionActionMessage(null);
            setAcceptedProfilePatch(null);
            setAppliedProfileExtraction(null);
            setProfileActionError(null);
            setProfileActionMessage(null);
            setProfileExtractionError(null);
            setProfileExtractionResult(null);
            state.refresh();
            suggestionsState.refresh();
          }}
          refreshing={state.refreshing || suggestionsState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="个人资料"
    >
      {!auth.ready ? <LoadingState /> : null}
      {auth.ready && !auth.signedIn ? (
        <>
          <SignedOutProfilePreview />
          <DataCard
            detail="登录后可以编辑资料、保存提取结果和确认资料建议。"
            title="登录后编辑资料"
          >
            <Text style={styles.bodyText}>
              使用邮箱或 Google 登录，完成后回到这里。
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
        </>
      ) : null}
      {auth.signedIn && state.kind === "loading" ? <LoadingState /> : null}
      {auth.signedIn && state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {auth.signedIn && state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {auth.signedIn &&
      (state.kind === "success" || state.kind === "empty") ? (
        <ProfileCard
          acceptingSuggestionId={acceptingSuggestionId}
          actionError={suggestionActionError}
          actionMessage={suggestionActionMessage}
          acceptedProfilePatch={acceptedProfilePatch}
          appliedProfileExtraction={appliedProfileExtraction}
          data={state.data}
          onAcceptSuggestion={onAcceptSuggestion}
          onApplyExtraction={onApplyProfileExtraction}
          onExtractProfileDocument={onExtractProfileDocument}
          onOpenAccount={() => router.push("/account" as Href)}
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
    </AppScreen>
  );
}

function SignedOutProfilePreview() {
  const profile = profileToSummary(null);

  return (
    <>
      <DataCard detail="别人会先看到这些信息" title="公开资料预览">
        <OrbitBusinessCard profile={profile} />
        {profile.bio ? <Text style={styles.bodyText}>{profile.bio}</Text> : null}
      </DataCard>
      <ProfileTagSection items={profile.offering} title="我能提供" />
      <ProfileTagSection items={profile.seeking} title="我想寻求" />
      <ProfileTagSection items={profile.topics} title="想聊的话题" />
      {profile.relationshipGoal ? (
        <DataCard detail={profile.relationshipGoal} title="关系目标" />
      ) : null}
    </>
  );
}

function ProfileCard({
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
  acceptingSuggestionId: string | null;
  actionError: string | null;
  actionMessage: string | null;
  acceptedProfilePatch: unknown;
  appliedProfileExtraction: unknown;
  data: unknown;
  onAcceptSuggestion: (id: string) => void;
  onApplyExtraction: () => void;
  onExtractProfileDocument: (
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) => void;
  onOpenAccount: () => void;
  onSaveProfile: (draft: ProfileManualEditDraft) => void;
  profileDocumentExtractionKind: ProfileDocumentExtractionKind | null;
  profileExtractionError: string | null;
  profileExtractionResult: unknown;
  profileActionError: string | null;
  profileActionMessage: string | null;
  savingProfile: boolean;
  suggestionsState: ApiResourceState<unknown>;
}) {
  const profile = profileToSummary(data);

  return (
    <>
      <OrbitBusinessCard profile={profile} />
      {profile.bio ? (
        <DataCard detail="别人会先看到这段介绍" title="一句话简介">
          <Text style={styles.bodyText}>{profile.bio}</Text>
        </DataCard>
      ) : null}
      <ProfileDocumentExtractionCard
        actionError={profileExtractionError}
        extractingKind={profileDocumentExtractionKind}
        onApplyExtraction={onApplyExtraction}
        onExtract={onExtractProfileDocument}
        result={profileExtractionResult}
      />
      <ProfileManualEditCard
        actionError={profileActionError}
        actionMessage={profileActionMessage}
        acceptedPatch={acceptedProfilePatch}
        appliedProfileExtraction={appliedProfileExtraction}
        onSave={onSaveProfile}
        profile={profile}
        saving={savingProfile}
      />
      <DataCard
        detail="登录状态、工作区、身份"
        onPress={onOpenAccount}
        title="账号与工作区"
      >
        <Text style={styles.bodyText}>
          确认别人看到的是你本人，以及这个工作区要优先连接哪些资源。
        </Text>
      </DataCard>
      <ProfileUpdateSuggestionsCard
        acceptingSuggestionId={acceptingSuggestionId}
        actionError={actionError}
        actionMessage={actionMessage}
        onAcceptSuggestion={onAcceptSuggestion}
        state={suggestionsState}
      />
      <ProfileTagSection items={profile.offering} title="我能提供" />
      <ProfileTagSection items={profile.seeking} title="我想寻求" />
      <ProfileTagSection items={profile.topics} title="想聊的话题" />
      {profile.relationshipGoal ? (
        <DataCard detail={profile.relationshipGoal} title="关系目标" />
      ) : null}
    </>
  );
}

function ProfileDocumentExtractionCard({
  actionError,
  extractingKind,
  onApplyExtraction,
  onExtract,
  result
}: {
  actionError: string | null;
  extractingKind: ProfileDocumentExtractionKind | null;
  onApplyExtraction: () => void;
  onExtract: (
    kind: ProfileDocumentExtractionKind,
    input: ProfileDocumentExtractionInput
  ) => void;
  result: unknown;
}) {
  const [sourceText, setSourceText] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const view = result ? profileDocumentExtractionToView(result) : null;
  const actionDisabled = extractingKind !== null;
  const resumeDocumentTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ];

  async function pickProfileDocumentImage(kind: ProfileDocumentExtractionKind) {
    if (actionDisabled) {
      return;
    }

    setPickerError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ["images"],
        quality: 0.86
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPickerError("没有选到可读取的图片。");
        return;
      }

      onExtract(kind, {
        fileName:
          asset.fileName ||
          (kind === "business-card" ? "business-card.jpg" : "resume.jpg"),
        mimeType: asset.mimeType || "image/jpeg",
        text: sourceText
      });
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : "这张图片暂时读取不了。"
      );
    }
  }

  async function pickProfileDocumentFile() {
    if (actionDisabled) {
      return;
    }

    setPickerError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: resumeDocumentTypes
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPickerError("没有选到可读取的文件。");
        return;
      }

      onExtract("resume", {
        fileName: asset.name || "resume.pdf",
        mimeType: asset.mimeType || "application/pdf",
        text: sourceText
      });
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : "这份文件暂时读取不了。"
      );
    }
  }

  return (
    <DataCard detail="提取结果只用于复核，不会直接修改个人资料" title="补全资料">
      <View style={styles.profileExtractionStack}>
        <ProfileTextInput
          label="名片文本或简历摘要"
          multiline
          onChangeText={setSourceText}
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
            onPress={() => onExtract("business-card", { text: sourceText })}
          />
          <ProfileExtractionButton
            disabled={actionDisabled}
            icon="document-text-outline"
            label={extractingKind === "resume" ? "提取中" : "提取简历"}
            onPress={() => onExtract("resume", { text: sourceText })}
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
      <Ionicons color={colors.onAccent} name={icon} size={16} />
      <Text style={styles.profileExtractionButtonText}>{label}</Text>
    </Pressable>
  );
}

function ProfileDocumentExtractionResult({
  onApply,
  view
}: {
  onApply: () => void;
  view: ProfileDocumentExtractionView;
}) {
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
      {view.draft ? (
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
  profile,
  saving
}: {
  actionError: string | null;
  actionMessage: string | null;
  acceptedPatch: unknown;
  appliedProfileExtraction: unknown;
  onSave: (draft: ProfileManualEditDraft) => void;
  profile: ProfileSummary;
  saving: boolean;
}) {
  const profileFingerprint = [
    profile.bio,
    profile.displayName,
    profile.headline,
    profile.industry,
    profile.offering.join("\n"),
    profile.organization,
    profile.relationshipGoal,
    profile.role,
    profile.seeking.join("\n"),
    profile.timezone,
    profile.topics.join("\n")
  ].join("\u001f");
  const [draft, setDraft] = useState<ProfileManualEditDraft>(() =>
    profileSummaryToEditDraft(profile)
  );
  const acceptedPatchView = acceptedPatch
    ? profileAcceptedPatchToView(acceptedPatch)
    : null;

  useEffect(() => {
    setDraft(profileSummaryToEditDraft(profile));
  }, [profileFingerprint]);

  useEffect(() => {
    if (acceptedPatch) {
      setDraft((current) =>
        applyProfileAcceptedPatchToDraft(current, acceptedPatch)
      );
    }
  }, [acceptedPatch]);

  useEffect(() => {
    if (appliedProfileExtraction) {
      setDraft((current) =>
        applyProfileDocumentExtractionToDraft(current, appliedProfileExtraction)
      );
    }
  }, [appliedProfileExtraction]);

  function updateDraft(field: keyof ProfileManualEditDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  return (
    <DataCard detail="保存后同步到 web 个人资料" title="编辑对外资料">
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
        {actionMessage ? (
          <Text style={styles.profileActionMessage}>{actionMessage}</Text>
        ) : null}
        {actionError ? (
          <Text style={styles.profileActionError}>{actionError}</Text>
        ) : null}
        <Pressable
          accessibilityLabel="保存资料"
          accessibilityRole="button"
          disabled={saving}
          onPress={() => onSave(draft)}
          style={({ pressed }) => [
            styles.profileSaveButton,
            saving ? styles.profileSaveButtonDisabled : null,
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

function ProfileAcceptedPatchNotice({
  view
}: {
  view: ProfileAcceptedPatchView;
}) {
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
  return (
    <View style={styles.profileInputGroup}>
      <Text style={styles.profileInputLabel}>{label}</Text>
      <TextInput
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
  if (group.values.length === 0) {
    return null;
  }

  return (
    <View style={styles.businessCardTagRow}>
      <Text style={styles.businessCardTagLabel}>{label}</Text>
      <View style={styles.businessCardTags}>
        {group.values.map((value) => (
          <Text
            ellipsizeMode="tail"
            key={value}
            numberOfLines={1}
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

function OrbitBusinessCard({ profile }: { profile: ProfileSummary }) {
  const card = profileBusinessCard(profile);

  return (
    <View style={styles.businessCard}>
      <View style={styles.businessCardHeader}>
        <View style={styles.businessCardAvatar}>
          <Text style={styles.businessCardInitial}>{card.initial}</Text>
        </View>
        <Text style={styles.businessCardMark}>ORBIT</Text>
      </View>
      <View style={styles.businessCardIdentity}>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.businessCardName}
        >
          {card.name}
        </Text>
        {card.headline ? (
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={styles.businessCardHeadline}
          >
            {card.headline}
          </Text>
        ) : null}
        {card.metaLine ? (
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.businessCardMeta}
          >
            {card.metaLine}
          </Text>
        ) : null}
      </View>
      {card.offering.values.length > 0 || card.seeking.values.length > 0 ? (
        <View style={styles.businessCardTagStack}>
          <BusinessCardTagRow group={card.offering} label="提供" />
          <BusinessCardTagRow group={card.seeking} label="寻找" />
        </View>
      ) : null}
    </View>
  );
}

function ProfileUpdateSuggestionsCard({
  acceptingSuggestionId,
  actionError,
  actionMessage,
  onAcceptSuggestion,
  state
}: {
  acceptingSuggestionId: string | null;
  actionError: string | null;
  actionMessage: string | null;
  onAcceptSuggestion: (id: string) => void;
  state: ApiResourceState<unknown>;
}) {
  if (state.kind !== "success" && state.kind !== "empty") {
    return null;
  }

  const view = profileUpdateSuggestionsToView(state.data);

  if (view.suggestions.length === 0) {
    return null;
  }

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

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
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
    borderRadius: radius.md,
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
    backgroundColor: "#17211F",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    overflow: "hidden",
    padding: spacing.xl
  },
  businessCardAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  businessCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  businessCardHeadline: {
    color: "rgba(255,255,255,0.78)",
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22
  },
  businessCardIdentity: {
    gap: spacing.xs
  },
  businessCardInitial: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 21
  },
  businessCardMark: {
    color: "rgba(255,255,255,0.52)",
    fontSize: typography.caption,
    fontWeight: "800",
    letterSpacing: 1.6,
    lineHeight: 16
  },
  businessCardMeta: {
    color: "rgba(255,255,255,0.52)",
    fontSize: typography.caption,
    lineHeight: 17
  },
  businessCardName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29
  },
  businessCardOverflow: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  businessCardTag: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: radius.pill,
    color: "rgba(255,255,255,0.84)",
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    maxWidth: "42%",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  businessCardTagLabel: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    width: 28
  },
  businessCardTagRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0
  },
  businessCardTags: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minWidth: 0
  },
  businessCardTagStack: {
    borderTopColor: "rgba(255,255,255,0.08)",
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
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.accent,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  profileExtractionApplyButtonText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  profileExtractionButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  profileExtractionButtonDisabled: {
    opacity: 0.55
  },
  profileExtractionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
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
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  profileExtractionResultHeader: {
    alignItems: "center",
    flexDirection: "row",
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  profileInputGroup: {
    gap: spacing.xs
  },
  profileInputLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "800",
    lineHeight: 16
  },
  profileInputMultiline: {
    minHeight: 92
  },
  profileLoginButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  profileLoginButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  profileSaveButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  profileSaveButtonDisabled: {
    opacity: 0.55
  },
  profileSaveButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
  },
  suggestionActionButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  suggestionActionButtonDisabled: {
    opacity: 0.55
  },
  suggestionActionButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "800",
    lineHeight: 18
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
    borderRadius: 14,
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
});
