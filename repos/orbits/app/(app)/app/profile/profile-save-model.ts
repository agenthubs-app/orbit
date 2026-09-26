import { validateIndustrySelection } from "../../../../shared/domain/industries";
import type { ProfilePayload } from "../../../../features/profile/contract";
import {
  profileEditorHandlesWithVisibleDraft,
  type OrbitProfileEditorView,
  type ProfileEditorField,
  type ProfileEditorSaveScope,
  type ProfileEditorVisibleHandleKey,
} from "./profile-editor-adapter";

// 资料编辑器的纯保存模型：作用域字段、保存前校验、409 冲突判定、
// 保存/刷新后「服务端最新 + 保留本地脏字段」的合并。不含 React 与 fetch，供新 UI 直接消费。

const BASIC_SCOPE_FIELDS: readonly ProfileEditorField[] = [
  "bio", "birthDate", "displayName", "handles", "organization", "primaryIndustryId", "role", "secondaryIndustryId",
];
const MATCHING_SCOPE_FIELDS: readonly ProfileEditorField[] = ["offering", "seeking", "topics"];
const BIO_VISIBLE_LIMIT = 80;

export function profileSaveScopeFields(scope: ProfileEditorSaveScope): Set<ProfileEditorField> {
  return new Set(scope === "basic" ? BASIC_SCOPE_FIELDS : MATCHING_SCOPE_FIELDS);
}

export function visibleCharacterCount(text: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length
    : Array.from(text).length;
}

export type ProfileSaveValidation =
  | { ok: true }
  | { ok: false; message: { en: string; zh: string } };

export function validateProfileSaveDraft(input: {
  profile: OrbitProfileEditorView;
  requireDirectHandle?: boolean;
  scope: ProfileEditorSaveScope;
  scopeDirty: ReadonlySet<ProfileEditorField>;
}): ProfileSaveValidation {
  const { profile, requireDirectHandle = false, scope, scopeDirty } = input;
  if (scope !== "basic") return { ok: true };
  if (!profile.fullName.trim()) {
    return { ok: false, message: { en: "Add your name before saving the profile.", zh: "请填写姓名后再保存档案。" } };
  }
  if (!profile.primaryIndustryId || !profile.secondaryIndustryId || !validateIndustrySelection(profile).valid) {
    return { ok: false, message: { en: "Choose both industry levels before saving the basic profile.", zh: "保存基础资料前，请选择完整的一级和二级行业。" } };
  }
  if (requireDirectHandle && !profile.wechatName.trim() && !profile.lineId.trim()) {
    return { ok: false, message: { en: "Add either WeChat or LINE before saving the basic profile.", zh: "保存基础资料前，请至少填写 WeChat 或 LINE 其中一项。" } };
  }
  if (scopeDirty.has("bio") && visibleCharacterCount(profile.bio.trim()) > BIO_VISIBLE_LIMIT) {
    return { ok: false, message: { en: "Keep About me within 80 visible characters.", zh: "关于我不能超过 80 个可见字符。" } };
  }
  return { ok: true };
}

export function profileSaveFailureKind(status: number, errorCode: string | undefined): "conflict" | "error" {
  return status === 409 || errorCode === "PROFILE_VERSION_CONFLICT" ? "conflict" : "error";
}

export function mergeProfilePreservingDraft(input: {
  current: OrbitProfileEditorView;
  dirtyHandleFields: ReadonlySet<ProfileEditorVisibleHandleKey>;
  latest: OrbitProfileEditorView;
  preserve: ReadonlySet<ProfileEditorField>;
}): OrbitProfileEditorView {
  const { current, dirtyHandleFields, latest, preserve } = input;
  const mergedHandles = preserve.has("handles")
    ? profileEditorHandlesWithVisibleDraft(latest, current, dirtyHandleFields)
    : latest.handles;
  return {
    ...latest,
    bio: preserve.has("bio") ? current.bio : latest.bio,
    birthDate: preserve.has("birthDate") ? current.birthDate : latest.birthDate,
    company: preserve.has("organization") ? current.company : latest.company,
    fullName: preserve.has("displayName") ? current.fullName : latest.fullName,
    handles: mergedHandles,
    offering: preserve.has("offering") ? current.offering : latest.offering,
    primaryIndustryId: preserve.has("primaryIndustryId") ? current.primaryIndustryId : latest.primaryIndustryId,
    secondaryIndustryId: preserve.has("secondaryIndustryId") ? current.secondaryIndustryId : latest.secondaryIndustryId,
    seeking: preserve.has("seeking") ? current.seeking : latest.seeking,
    title: preserve.has("role") ? current.title : latest.title,
    topics: preserve.has("topics") ? current.topics : latest.topics,
    wechatName: preserve.has("handles") ? mergedHandles?.wechatId ?? "" : latest.wechatName,
    lineId: preserve.has("handles") ? mergedHandles?.lineId ?? "" : latest.lineId,
    email: latest.email,
  };
}

export function emptyProfileAfterReload(
  current: OrbitProfileEditorView,
  onboarding: NonNullable<ProfilePayload["onboarding"]>,
): OrbitProfileEditorView {
  return {
    ...current,
    bio: "",
    birthDate: null,
    company: "",
    email: current.email,
    expectedUpdatedAt: null,
    handles: undefined,
    hasPersistedProfile: false,
    headline: "",
    industry: "",
    intro: "",
    lineId: "",
    offering: [],
    onboarding,
    primaryIndustryId: undefined,
    secondaryIndustryId: undefined,
    seeking: [],
    title: "",
    topics: [],
    wechatName: "",
  };
}
