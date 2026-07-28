import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import type { ManualProfileContract } from "../api/contract/profile";

export interface ProfileSummary {
  bio: string;
  displayName: string;
  headline: string;
  industry: string;
  offering: string[];
  organization: string;
  relationshipGoal: string;
  role: string;
  seeking: string[];
  timezone: string;
  topics: string[];
}

export interface ProfileManualEditDraft {
  bio: string;
  displayName: string;
  headline: string;
  industry: string;
  offeringText: string;
  organization: string;
  relationshipGoal: string;
  role: string;
  seekingText: string;
  timezone: string;
  topicsText: string;
}

export interface ProfileUpdateRequest {
  bio: string;
  displayName: string;
  headline: string;
  homeMarket: string;
  industry: string;
  offering: string[];
  organization: string;
  relationshipGoal: string;
  role: string;
  seeking: string[];
  topics: string[];
}

export interface ProfileBusinessCardTagGroup {
  overflow: number;
  values: string[];
}

export interface ProfileBusinessCardView {
  headline: string;
  initial: string;
  metaLine: string;
  name: string;
  offering: ProfileBusinessCardTagGroup;
  seeking: ProfileBusinessCardTagGroup;
}

export interface ProfileUpdateSuggestionView {
  canAccept: boolean;
  confidenceLabel: string;
  currentValue: string;
  evidenceExcerpt: string;
  fieldLabel: string;
  id: string;
  rationale: string;
  sourceLabel: string;
  statusLabel: string;
  suggestedValue: string;
}

export interface ProfileUpdateSuggestionsView {
  nextAction: string;
  stateLabel: string;
  suggestions: ProfileUpdateSuggestionView[];
  title: string;
}

export interface ProfileAcceptedPatchFieldView {
  label: string;
  value: string;
}

export interface ProfileAcceptedPatchView {
  fields: ProfileAcceptedPatchFieldView[];
  nextAction: string;
  summary: string;
  title: string;
}

export type ProfileDocumentExtractionKind = "business-card" | "resume";

export interface ProfileDocumentExtractionInput {
  fileName?: string;
  mimeType?: string;
  scenario?: string | null;
  text?: string;
}

export interface ProfileDocumentExtractionRequest {
  body: {
    fileName?: string;
    mimeType?: string;
    scenario?: string;
    text?: string;
  };
  endpoint: string;
}

export interface ProfileDocumentFieldView {
  label: string;
  value: string;
}

export interface ProfileDocumentEvidenceView {
  excerpt: string;
  label: string;
}

export interface ProfileDocumentExtractionDraftView {
  contactLine: string;
  displayName: string;
  evidence: ProfileDocumentEvidenceView[];
  id: string;
  kindLabel: string;
  metaLine: string;
  relationshipGoal: string;
  suggestedFields: ProfileDocumentFieldView[];
}

export interface ProfileDocumentExtractionView {
  confidenceLabel: string;
  draft: ProfileDocumentExtractionDraftView | null;
  nextAction: string;
  stateLabel: string;
  summary: string;
  title: string;
}

const emptyProfileSummary: ProfileSummary = {
  bio: "",
  displayName: "",
  headline: "",
  industry: "",
  offering: [],
  organization: "",
  relationshipGoal: "",
  role: "",
  seeking: [],
  timezone: "",
  topics: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

// 字段名受跨端契约约束：服务端改名，这里立刻编译报错。
// 契约之外的兼容字段（比如老 payload 的 timezone）继续走 stringField。
function profileField(
  record: Record<string, unknown>,
  fieldName: keyof ManualProfileContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function stringListField(
  record: Record<string, unknown>,
  fieldName: string
): string[] {
  const value = record[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && !!item.trim());
}

function cleanProfileText(value: string): string {
  return value.trim();
}

function splitProfileList(value: string): string[] {
  return value
    .split(/\n|,|，|、/u)
    .map(cleanProfileText)
    .filter(Boolean);
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function listField(record: Record<string, unknown>, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|source-backed|implementation|operator review|sourced profile)\b/i.test(
    value
  );
}

function chineseText(value: string, fallback: string): string {
  const chinese = preferredChineseSegment(value);

  if (
    !chinese ||
    !segmentLooksChinese(chinese) ||
    containsImplementationLabel(chinese)
  ) {
    return fallback;
  }

  return chinese;
}

function profileSignalSourceLabel(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "聊天信号";
  }

  if (normalized === "activity") {
    return "活动信号";
  }

  if (normalized === "contact") {
    return "联系人信号";
  }

  return "资料信号";
}

function profileSignalFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    headline: "标题",
    homeMarket: "主要市场",
    preferredFollowUpWindow: "跟进时间",
    preferredIntroChannels: "介绍渠道",
    relationshipGoal: "关系目标",
    targetRelationshipTypes: "目标关系类型"
  };

  return labels[fieldName] ?? "资料字段";
}

function profileSignalConfidenceLabel(confidence: string): string {
  const normalized = confidence.trim().toLowerCase();

  if (normalized === "high") {
    return "高可信";
  }

  if (normalized === "low") {
    return "低可信";
  }

  return "中可信";
}

function profileSignalStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "accepted") {
    return "已接受";
  }

  if (normalized === "dismissed") {
    return "已忽略";
  }

  return "待确认";
}

function profileSignalCanAccept(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized !== "accepted" && normalized !== "dismissed";
}

function profileSuggestionKnownValue(value: string): string {
  const knownValues: Record<string, string> = {
    "24 hours after hosted events": "活动后 24 小时内",
    "48 hours": "48 小时",
    "Founder building a relationship operating system": "围绕关系系统创业",
    "Founder focused on event-grounded relationship workflows":
      "围绕活动场景做人脉关系工作流的创始人",
    "Tokyo and Singapore": "东京和新加坡"
  };

  return knownValues[value.trim()] ?? value.trim();
}

function profileDocumentKnownValue(value: string): string {
  const knownValues: Record<string, string> = {
    "BD partners": "商务合作伙伴",
    "Follow up after events with clear source evidence and mutual context.":
      "活动后带着明确来源和双方上下文跟进。",
    "Partnerships Lead": "合作负责人",
    "Tokyo": "东京",
    "Turn event context into source-backed follow-up decisions.":
      "把活动上下文变成有来源依据的跟进决策。",
    "community partners": "社群合作伙伴",
    "email": "邮件",
    "event follow-up": "活动后跟进",
    "event hosts": "活动主办方",
    "founders": "创始人",
    "warm intro": "熟人介绍"
  };

  return knownValues[value.trim()] ?? profileSuggestionKnownValue(value);
}

function profileDocumentValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(profileDocumentKnownValue)
      .filter(Boolean)
      .join("、");
  }

  if (typeof value !== "string") {
    return "";
  }

  return profileDocumentKnownValue(value);
}

function profilePatchValue(value: unknown): string {
  return profileDocumentValue(value);
}

function profileSuggestionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(profileSuggestionKnownValue)
      .filter(Boolean)
      .join("、");
  }

  if (typeof value !== "string") {
    return "";
  }

  return chineseText(value, profileSuggestionKnownValue(value));
}

function profileSuggestionFallbackRationale(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "这个建议来自最近的聊天摘要，不会自动修改你的档案。";
  }

  if (normalized === "contact") {
    return "这个建议来自最近新增联系人，不会自动修改你的档案。";
  }

  if (normalized === "activity") {
    return "这个建议来自最近活动记录，不会自动修改你的档案。";
  }

  return "这个建议来自有来源的资料信号，不会自动修改你的档案。";
}

function profileSuggestionFallbackEvidence(sourceKind: string): string {
  const normalized = sourceKind.trim().toLowerCase();

  if (normalized === "chat") {
    return "最近的聊天摘要提到活动场景下的人脉工作流。";
  }

  if (normalized === "activity") {
    return "最近活动记录里出现了可补充到档案的信息。";
  }

  if (normalized === "contact") {
    return "最近联系人提供了可补充到档案的信息。";
  }

  return "这个建议有来源记录，可在应用前先复核。";
}

function profileSignalStateLabel(state: string, count: number): string {
  const normalized = state.trim().toLowerCase();

  if (count === 0 || normalized === "empty") {
    return "暂无建议";
  }

  if (normalized === "pending") {
    return "等待确认";
  }

  return "待复核";
}

function profileSignalNextAction(value: string, count: number): string {
  if (count === 0) {
    return "资料暂时不需要更新。";
  }

  return chineseText(value, "先逐条确认来源，再决定是否应用到个人资料。");
}

export function profileToSummary(data: unknown): ProfileSummary {
  const profile = isRecord(data)
    ? data.profile
    : null;

  if (!isRecord(profile)) {
    return {
      ...emptyProfileSummary,
      offering: [],
      seeking: [],
      topics: []
    };
  }

  return {
    bio: profileField(profile, "bio"),
    displayName: profileField(profile, "displayName"),
    headline: profileField(profile, "headline"),
    industry: profileField(profile, "industry"),
    offering: stringListField(profile, "offering"),
    organization: profileField(profile, "organization"),
    relationshipGoal: stringField(profile, "relationshipGoal"),
    role: profileField(profile, "role"),
    seeking: stringListField(profile, "seeking"),
    timezone:
      stringField(profile, "timezone") ||
      profileField(profile, "homeMarket"),
    topics: stringListField(profile, "topics")
  };
}

function profileDocumentEndpoint(
  kind: ProfileDocumentExtractionKind
): string {
  return kind === "business-card"
    ? ORBIT_API_ENDPOINTS.profileBusinessCardExtraction
    : ORBIT_API_ENDPOINTS.profileResumeExtraction;
}

export function buildProfileDocumentExtractionRequest(
  kind: ProfileDocumentExtractionKind,
  input: ProfileDocumentExtractionInput
): ProfileDocumentExtractionRequest | null {
  const text = cleanProfileText(input.text ?? "");
  const fileName = cleanProfileText(input.fileName ?? "");
  const mimeType = cleanProfileText(input.mimeType ?? "");
  const scenario = cleanProfileText(input.scenario ?? "");
  const body: ProfileDocumentExtractionRequest["body"] = {};

  if (text) {
    body.text = text;
  }

  if (fileName) {
    body.fileName = fileName;
  }

  if (mimeType) {
    body.mimeType = mimeType;
  }

  if (scenario) {
    body.scenario = scenario;
  }

  if (!body.text && !body.fileName && !body.scenario) {
    return null;
  }

  return {
    body,
    endpoint: profileDocumentEndpoint(kind)
  };
}

function profileDocumentKindLabel(kind: string): string {
  return kind.trim().toLowerCase() === "business-card" ? "名片" : "简历";
}

function profileDocumentStateLabel(state: string, hasDraft: boolean): string {
  const normalized = state.trim().toLowerCase();

  if (!hasDraft || normalized === "empty") {
    return "暂无可提取信息";
  }

  if (normalized === "pending") {
    return "处理中";
  }

  return "待复核";
}

function profileDocumentNextAction(
  kind: string,
  state: string,
  value: string
): string {
  const normalized = state.trim().toLowerCase();

  if (normalized === "empty") {
    return "换一段更完整的资料再试。";
  }

  if (normalized === "pending") {
    return "等处理完成后再回来复核。";
  }

  return chineseText(
    value,
    kind.trim().toLowerCase() === "business-card"
      ? "先确认这是不是你的名片，再挑需要写进对外资料的字段。"
      : "先核对履历里的身份和关系目标，再决定补到个人资料。"
  );
}

function profileDocumentSummary(kind: string, confidence: string): string {
  const normalizedKind = kind.trim().toLowerCase();
  const normalizedConfidence = confidence.trim().toLowerCase();

  if (normalizedKind === "business-card" && normalizedConfidence === "medium") {
    return "身份和联系方式比较清楚，但关系目标仍需要你确认。";
  }

  if (normalizedKind === "business-card") {
    return "先核对身份和联系方式，再决定是否补到个人资料。";
  }

  if (normalizedConfidence === "high") {
    return "履历里的身份、角色和关系目标比较完整。";
  }

  return "这份资料能补一部分字段，应用前还需要你确认。";
}

function profileDocumentFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    displayName: "姓名",
    email: "邮箱",
    headline: "标题",
    homeMarket: "主要市场",
    organization: "公司",
    phone: "电话",
    preferredFollowUpWindow: "跟进时间",
    preferredIntroChannels: "介绍渠道",
    relationshipGoal: "关系目标",
    role: "角色",
    targetRelationshipTypes: "目标关系",
    website: "网站"
  };

  return labels[fieldName] ?? "资料字段";
}

function profileDocumentSuggestedFields(
  suggestedProfileFields: unknown
): ProfileDocumentFieldView[] {
  if (!isRecord(suggestedProfileFields)) {
    return [];
  }

  const fieldOrder = [
    "headline",
    "homeMarket",
    "relationshipGoal",
    "targetRelationshipTypes",
    "preferredFollowUpWindow",
    "preferredIntroChannels"
  ];

  return fieldOrder
    .map((fieldName) => ({
      label: profileDocumentFieldLabel(fieldName),
      value: profileDocumentValue(suggestedProfileFields[fieldName])
    }))
    .filter((field) => !!field.value);
}

function profileDocumentEvidence(evidence: unknown): ProfileDocumentEvidenceView[] {
  return (Array.isArray(evidence) ? evidence : [])
    .filter(isRecord)
    .slice(0, 3)
    .map((item) => ({
      excerpt: containsImplementationLabel(stringField(item, "excerpt"))
        ? "这段资料支持该字段。"
        : stringField(item, "excerpt", "这段资料支持该字段。"),
      label: profileDocumentFieldLabel(stringField(item, "field"))
    }));
}

export function profileDocumentExtractionToView(
  data: unknown
): ProfileDocumentExtractionView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const kind = stringField(record, "kind", "resume");
  const state = stringField(record, "state");
  const draft = isRecord(record.draft) ? record.draft : null;
  const kindLabel = profileDocumentKindLabel(kind);
  const confidence = draft ? stringField(draft, "confidence") : "";

  return {
    confidenceLabel: draft
      ? profileSignalConfidenceLabel(confidence)
      : "待确认",
    draft: draft
      ? {
          contactLine: [stringField(draft, "email"), stringField(draft, "phone")]
            .filter(Boolean)
            .join(" · "),
          displayName: stringField(draft, "displayName", "未识别姓名"),
          evidence: profileDocumentEvidence(draft.evidence),
          id: stringField(draft, "id", "profile-document-draft"),
          kindLabel,
          metaLine: [
            stringField(draft, "organization"),
            profileDocumentValue(stringField(draft, "role")),
            profileDocumentValue(stringField(draft, "homeMarket"))
          ]
            .filter(Boolean)
            .join(" · "),
          relationshipGoal: profileDocumentValue(
            stringField(draft, "relationshipGoal")
          ),
          suggestedFields: profileDocumentSuggestedFields(
            draft.suggestedProfileFields
          )
        }
      : null,
    nextAction: profileDocumentNextAction(
      kind,
      state,
      stringField(record, "nextAction")
    ),
    stateLabel: profileDocumentStateLabel(state, !!draft),
    summary: draft ? profileDocumentSummary(kind, confidence) : "没有提取出可复核字段。",
    title: `${kindLabel}提取结果`
  };
}

export function profileSummaryToEditDraft(
  profile: ProfileSummary
): ProfileManualEditDraft {
  return {
    bio: profile.bio,
    displayName: profile.displayName,
    headline: profile.headline,
    industry: profile.industry,
    offeringText: profile.offering.join("\n"),
    organization: profile.organization,
    relationshipGoal: profile.relationshipGoal,
    role: profile.role,
    seekingText: profile.seeking.join("\n"),
    timezone: profile.timezone,
    topicsText: profile.topics.join("\n")
  };
}

export function buildProfileUpdateRequest(
  draft: unknown
): ProfileUpdateRequest | null {
  if (!isRecord(draft)) {
    return null;
  }

  const displayName = cleanProfileText(stringField(draft, "displayName"));

  if (!displayName) {
    return null;
  }

  return {
    bio: cleanProfileText(stringField(draft, "bio")),
    displayName,
    headline: cleanProfileText(stringField(draft, "headline")),
    homeMarket: cleanProfileText(stringField(draft, "timezone")),
    industry: cleanProfileText(stringField(draft, "industry")),
    offering: splitProfileList(stringField(draft, "offeringText")),
    organization: cleanProfileText(stringField(draft, "organization")),
    relationshipGoal: cleanProfileText(stringField(draft, "relationshipGoal")),
    role: cleanProfileText(stringField(draft, "role")),
    seeking: splitProfileList(stringField(draft, "seekingText")),
    topics: splitProfileList(stringField(draft, "topicsText"))
  };
}

function previewGroup(values: string[]): ProfileBusinessCardTagGroup {
  const visibleValues = values
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    overflow: Math.max(0, visibleValues.length - 2),
    values: visibleValues.slice(0, 2)
  };
}

export function profileBusinessCard(
  profile: ProfileSummary
): ProfileBusinessCardView {
  return {
    headline: profile.headline.trim(),
    initial: profile.displayName.trim().slice(0, 1).toUpperCase() || "O",
    metaLine: [profile.organization, profile.role, profile.industry]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" · "),
    name: profile.displayName.trim() || "Orbit 用户",
    offering: previewGroup(profile.offering),
    seeking: previewGroup(profile.seeking)
  };
}

export function profileUpdateSuggestionsToView(
  data: unknown
): ProfileUpdateSuggestionsView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const suggestions = listField(record, "suggestions")
    .filter(isRecord)
    .map((suggestion, index) => {
      const evidence = listField(suggestion, "evidence").find(isRecord);
      const sourceKind = stringField(suggestion, "sourceKind");
      const status = stringField(suggestion, "status");

      return {
        canAccept: profileSignalCanAccept(status),
        confidenceLabel: profileSignalConfidenceLabel(
          stringField(suggestion, "confidence")
        ),
        currentValue: profileSuggestionValue(suggestion.currentValue),
        evidenceExcerpt: chineseText(
          evidence ? stringField(evidence, "excerpt") : "",
          profileSuggestionFallbackEvidence(sourceKind)
        ),
        fieldLabel: profileSignalFieldLabel(
          stringField(suggestion, "targetProfileField")
        ),
        id: stringField(suggestion, "id", `profile-suggestion-${index}`),
        rationale: chineseText(
          stringField(suggestion, "rationale"),
          profileSuggestionFallbackRationale(sourceKind)
        ),
        sourceLabel: profileSignalSourceLabel(sourceKind),
        statusLabel: profileSignalStatusLabel(status),
        suggestedValue: profileSuggestionValue(suggestion.suggestedValue)
      };
    });

  return {
    nextAction: profileSignalNextAction(
      stringField(record, "nextAction"),
      suggestions.length
    ),
    stateLabel: profileSignalStateLabel(
      stringField(record, "state"),
      suggestions.length
    ),
    suggestions,
    title: "资料更新建议"
  };
}

export function profileAcceptedPatchToView(
  data: unknown
): ProfileAcceptedPatchView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const patch = isRecord(record.profilePatch) ? record.profilePatch : {};
  const appliedFields = stringListField(record, "appliedFields");
  const fieldNames = (appliedFields.length > 0 ? appliedFields : Object.keys(patch))
    .filter((fieldName, index, all) => all.indexOf(fieldName) === index)
    .filter((fieldName) => fieldName in patch);
  const fields = fieldNames
    .map((fieldName) => ({
      label: profileSignalFieldLabel(fieldName),
      value: profilePatchValue(patch[fieldName])
    }))
    .filter((field) => !!field.value);

  return {
    fields,
    nextAction: chineseText(
      stringField(record, "nextAction"),
      "检查编辑表单，没问题就保存资料。"
    ),
    summary: "保存资料后才会写进个人资料。",
    title: "待保存改动"
  };
}

export function applyProfileAcceptedPatchToDraft(
  draft: ProfileManualEditDraft,
  data: unknown
): ProfileManualEditDraft {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const patch = isRecord(record.profilePatch) ? record.profilePatch : {};

  return {
    ...draft,
    bio: patch.bio === undefined ? draft.bio : profilePatchValue(patch.bio),
    displayName:
      patch.displayName === undefined
        ? draft.displayName
        : profilePatchValue(patch.displayName),
    headline:
      patch.headline === undefined
        ? draft.headline
        : profilePatchValue(patch.headline),
    industry:
      patch.industry === undefined
        ? draft.industry
        : profilePatchValue(patch.industry),
    offeringText:
      patch.offering === undefined
        ? draft.offeringText
        : profilePatchValue(patch.offering),
    organization:
      patch.organization === undefined
        ? draft.organization
        : profilePatchValue(patch.organization),
    relationshipGoal:
      patch.relationshipGoal === undefined
        ? draft.relationshipGoal
        : profilePatchValue(patch.relationshipGoal),
    role: patch.role === undefined ? draft.role : profilePatchValue(patch.role),
    seekingText:
      patch.seeking === undefined ? draft.seekingText : profilePatchValue(patch.seeking),
    timezone:
      patch.homeMarket === undefined
        ? draft.timezone
        : profilePatchValue(patch.homeMarket),
    topicsText:
      patch.topics === undefined ? draft.topicsText : profilePatchValue(patch.topics)
  };
}

function profileDocumentDraftField(
  draft: Record<string, unknown>,
  suggestedFields: Record<string, unknown>,
  fieldName: string
): string {
  return (
    profilePatchValue(suggestedFields[fieldName]) ||
    profilePatchValue(draft[fieldName])
  );
}

export function applyProfileDocumentExtractionToDraft(
  draft: ProfileManualEditDraft,
  data: unknown
): ProfileManualEditDraft {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const extractedDraft = isRecord(record.draft) ? record.draft : {};
  const suggestedFields = isRecord(extractedDraft.suggestedProfileFields)
    ? extractedDraft.suggestedProfileFields
    : {};
  const displayName = profileDocumentDraftField(
    extractedDraft,
    suggestedFields,
    "displayName"
  );
  const headline = profileDocumentDraftField(
    extractedDraft,
    suggestedFields,
    "headline"
  );
  const relationshipGoal = profileDocumentDraftField(
    extractedDraft,
    suggestedFields,
    "relationshipGoal"
  );
  const seekingText = profileDocumentDraftField(
    extractedDraft,
    suggestedFields,
    "targetRelationshipTypes"
  );

  return {
    ...draft,
    displayName: displayName || draft.displayName,
    headline: headline || draft.headline,
    relationshipGoal: relationshipGoal || draft.relationshipGoal,
    seekingText: seekingText || draft.seekingText
  };
}
