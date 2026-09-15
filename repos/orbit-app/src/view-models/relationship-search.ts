import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import type { IndustrySelectionContract, SecondaryIndustryIdCode } from "../api/contract/industries";
import type { OrbitLanguage } from "../api/contract/language";
import {
  industryLabel as primaryIndustryLabel,
  isIndustryIdCode,
  SECONDARY_INDUSTRY_CATALOG,
  secondaryIndustryLabel,
  validateIndustrySelection
} from "../api/domain/industries";
import { createTranslator, type MessageKey } from "../i18n/messages";

type UnknownRecord = Record<string, unknown>;

export interface RelationshipSearchRequestBody {
  businessIntent?: string;
  followUpStatusFilters?: string[];
  industryFilters?: string[];
  primaryIndustryIds?: string[];
  query?: string;
  secondaryIndustryIds?: string[];
  sourceFilters?: string[];
  valueTypeFilters?: string[];
}

export type RelationshipSearchRequestResult =
  | {
      request: {
        body: RelationshipSearchRequestBody;
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface RelationshipSearchSuggestionView {
  detail: string;
  evidenceHint: string;
  id: string;
  query: string;
  request: {
    body: RelationshipSearchRequestBody;
    endpoint: string;
  };
}

export interface RelationshipSearchSuggestionsView {
  emptyText: string;
  nextAction: string;
  suggestions: RelationshipSearchSuggestionView[];
  summary: string;
  title: string;
}

export interface RelationshipSearchResultView extends IndustrySelectionContract {
  contactId: string;
  detail: string;
  evidence: string;
  id: string;
  imageUrl?: string;
  name: string;
  nextAction: string;
  relationship: string;
  score: string;
  scoreLabel: string;
  valueLabels: string[];
}

export interface RelationshipSearchView {
  emptyText: string;
  filtersLabel: string;
  nextAction: string;
  queryLabel: string;
  results: RelationshipSearchResultView[];
  summary: string;
  title: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function stringListField(record: UnknownRecord, fieldName: string): string[] {
  return listField(record, fieldName)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function imageUrlFields(record: UnknownRecord): { imageUrl?: string } {
  const avatar = isRecord(record.avatar) ? record.avatar : {};
  const imageUrl =
    stringField(record, "avatarAssetUrl") ||
    stringField(record, "avatarUrl") ||
    stringField(record, "photoUrl") ||
    stringField(record, "imageUrl") ||
    stringField(record, "profileImageUrl") ||
    stringField(record, "portraitUrl") ||
    stringField(record, "headshotUrl") ||
    stringField(avatar, "src") ||
    stringField(avatar, "url") ||
    stringField(avatar, "imageUrl");

  return imageUrl ? { imageUrl } : {};
}

function numberField(record: UnknownRecord, fieldName: string): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function queryText(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value.trim() || createTranslator(language)("contacts.relationshipSearch");
  switch (value) {
    case "Find customer reference opportunities from live contacts":
      return "找客户参考机会";
    case "Find fintech partners with referral value":
      return "找有引荐价值的金融科技伙伴";
    case "Find warm introduction paths in my live relationship graph":
      return "找暖介绍路径";
    case "Which investors need an event follow-up this week?":
      return "本周该联系哪些投资人";
    case "Who can introduce me to climate pilot operators?":
      return "谁能介绍气候试点运营方";
    case "Who needs a follow-up from my live relationship graph?":
      return "找需要联系的人";
    default:
      return value.trim() || "搜索关系资源";
  }
}

function businessIntentLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      explore_partnership: "contacts.intentPartnership",
      find_warm_intro: "contacts.intentWarmIntro",
      recover_event_follow_up: "contacts.intentEventFollowUp",
      source_customer_reference: "contacts.intentCustomerReference"
    };
    return createTranslator(language)(keys[value] ?? "contacts.relationshipSearch");
  }
  switch (value) {
    case "explore_partnership":
      return "找合作机会";
    case "find_warm_intro":
      return "找暖介绍";
    case "recover_event_follow_up":
      return "找会后联系";
    case "source_customer_reference":
      return "找客户参考";
    default:
      return "关系搜索";
  }
}

function industryLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      climate: "contacts.industryClimate",
      enterprise_saas: "contacts.industryEnterpriseSaas",
      fintech: "contacts.industryFintech",
      healthcare: "contacts.industryHealthcare",
      mobility: "contacts.industryMobility"
    };
    return keys[value] ? createTranslator(language)(keys[value]) : value;
  }
  switch (value) {
    case "climate":
      return "气候";
    case "enterprise_saas":
      return "企业 SaaS";
    case "fintech":
      return "金融科技";
    case "healthcare":
      return "医疗健康";
    case "mobility":
      return "出行";
    default:
      return value;
  }
}

function valueTypeLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      commercial_opportunity: "contacts.valueBusinessOpportunity",
      community_context: "contacts.valueCommunityResource",
      knowledge_exchange: "contacts.valueKnowledgeExchange",
      referral_path: "contacts.valueIntroPath",
      strategic_intro: "contacts.valueIntroPath"
    };
    return keys[value] ? createTranslator(language)(keys[value]) : value;
  }
  switch (value) {
    case "commercial_opportunity":
      return "商业机会";
    case "community_context":
      return "社群上下文";
    case "knowledge_exchange":
      return "知识交换";
    case "referral_path":
      return "引荐路径";
    case "strategic_intro":
      return "战略引荐";
    default:
      return value;
  }
}

function followUpStatusLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      active: "contacts.statusActive",
      dormant: "contacts.statusDormant",
      needs_follow_up: "contacts.statusNeedsFollowUp",
      nurture: "contacts.statusNurture",
      waiting_on_them: "contacts.statusWaiting"
    };
    return keys[value] ? createTranslator(language)(keys[value]) : value;
  }
  switch (value) {
    case "active":
      return "推进中";
    case "dormant":
      return "沉睡关系";
    case "needs_follow_up":
      return "待联系";
    case "waiting_on_them":
      return "等对方";
    case "nurture":
      return "沉睡关系";
    default:
      return value;
  }
}

function sourceTypeLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      calendar_signal: "contacts.channelCalendar",
      email_signal: "contacts.channelEmail",
      event_import: "contacts.channelEventNote",
      external_contacts: "contacts.library",
      manual: "contacts.channelManualNote",
      referral: "contacts.channelReferral"
    };
    return keys[value] ? createTranslator(language)(keys[value]) : value;
  }
  switch (value) {
    case "calendar_signal":
      return "日程线索";
    case "email_signal":
      return "邮件线索";
    case "event_import":
      return "活动导入";
    case "external_contacts":
      return "外部联系人";
    case "manual":
      return "手动记录";
    case "referral":
      return "引荐记录";
    default:
      return value;
  }
}

function roleLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value;
  switch (value) {
    case "Community Lead":
      return "社群负责人";
    case "Founder":
      return "创始人";
    case "Partnerships Director":
      return "合作负责人";
    case "Platform Partner":
      return "平台合伙人";
    default:
      return value;
  }
}

function locationLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value;
  switch (value) {
    case "San Francisco":
      return "旧金山";
    case "Singapore":
      return "新加坡";
    case "Tokyo":
      return "东京";
    default:
      return value;
  }
}

function scoreBandLabel(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") {
    const keys: Readonly<Record<string, MessageKey>> = {
      high: "contacts.scoreHigh",
      medium: "contacts.scoreMedium",
      low: "contacts.scoreLow"
    };
    return createTranslator(language)(keys[value] ?? "contacts.scoreMatched");
  }
  switch (value) {
    case "high":
      return "高匹配";
    case "medium":
      return "中匹配";
    case "low":
      return "弱匹配";
    default:
      return "已匹配";
  }
}

function evidenceHintText(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value.trim() || createTranslator(language)("contacts.sourceEvidenceExists");
  if (/manual dinner notes/i.test(value)) {
    return "来自饭局记录和活动名单。";
  }

  if (/event-import/i.test(value)) {
    return "来自活动记录和关系进展。";
  }

  if (/email signal/i.test(value)) {
    return "来自邮件线索和关系价值标签。";
  }

  return "来自已记录的关系证据。";
}

function relationshipContextText(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value.trim() || createTranslator(language)("contacts.relationshipPending");
  switch (value) {
    case "Email signal says Omar offered fintech and venture ecosystem referrals.":
      return "邮件线索显示，他愿意介绍金融科技和投资生态资源。";
    case "Event roster says Mina handles climate storage distribution partnerships.":
      return "活动名单显示，Mina 负责气候储能分销合作。";
    case "Imported as a community contact connected to climate founder roundtables.":
      return "导入记录显示，Hana 关联气候创业者圆桌社群。";
    case "Met at the climate founders dinner and discussed storage pilot operators.":
      return "在气候创业者晚餐认识，聊过储能试点运营方。";
    default:
      return value.trim() || "已有关系记录，适合确认后再联系。";
  }
}

function evidenceText(value: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value.trim() || createTranslator(language)("contacts.sourceEvidenceExists");
  switch (value) {
    case "Email signal says Omar can broker fintech investor and partner referrals after a short context brief.":
      return "邮件线索：Omar 可在收到简短背景后介绍金融科技投资人与合作方。";
    case "Event roster fixture marks Mina as a climate storage distribution partner needing follow-up.":
      return "活动名单：Mina 是气候储能分销合作负责人，需要联系。";
    case "External contacts fixture links Hana to climate community context and founder roundtable planning.":
      return "联系人导入记录：Hana 关联气候社群和创业者圆桌。";
    case "Manual dinner note says Kenji asked for a warm intro to climate pilot operators this week.":
      return "饭局记录：Kenji 本周想找气候试点运营方的暖介绍。";
    default:
      return value.trim() || "已有证据，打开联系人详情后再确认。";
  }
}

function recommendedActionText(value: string, name: string, language: OrbitLanguage = "zh"): string {
  if (language !== "zh") return value.trim() || createTranslator(language)("contacts.reviewEvidenceBeforeContact", { name });
  switch (value) {
    case "Ask Hana whether the guild wants a founder roundtable follow-up.":
      return "问 Hana 是否愿意继续聊创业者圆桌后的合作。";
    case "Send Kenji the climate pilot operator intro with the dinner context attached.":
      return "把气候试点运营方的引荐需求发给 Kenji，并附上晚餐背景。";
    case "Send Mina a post-event storage partnership recap and ask for the customer reference path.":
      return "给 Mina 发会后合作小结，再确认客户参考路径。";
    case "Send Omar a concise fintech partner diligence brief before asking for referrals.":
      return "先给 Omar 一段金融科技合作背景，再请求引荐。";
    default:
      return `打开 ${name} 的详情，确认背景后再联系。`;
  }
}

function appliedFiltersLabel(record: UnknownRecord, language: OrbitLanguage = "zh"): string {
  if (language === "zh") {
    const businessIntent = stringField(record, "businessIntent");
    const parts = [
      businessIntent ? `意图：${businessIntentLabel(businessIntent)}` : "",
      stringListField(record, "primaryIndustryIds").length
        ? `一级行业：${stringListField(record, "primaryIndustryIds").map((id) => isIndustryIdCode(id) ? primaryIndustryLabel(id, "zh") : id).join("、")}` : "",
      stringListField(record, "secondaryIndustryIds").length
        ? `二级行业：${stringListField(record, "secondaryIndustryIds").map((id) => SECONDARY_INDUSTRY_CATALOG.find((entry) => entry.id === id)?.labels.zh ?? id).join("、")}` : "",
      stringListField(record, "industries").length
        ? `行业：${stringListField(record, "industries").map(value => industryLabel(value)).join("、")}` : "",
      stringListField(record, "sources").length
        ? `来源：${stringListField(record, "sources").map(value => sourceTypeLabel(value)).join("、")}` : "",
      stringListField(record, "valueTypes").length
        ? `价值：${stringListField(record, "valueTypes").map(value => valueTypeLabel(value)).join("、")}` : "",
      stringListField(record, "followUpStatuses").length
        ? `状态：${stringListField(record, "followUpStatuses").map(value => followUpStatusLabel(value)).join("、")}` : ""
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "未使用筛选";
  }
  const t = createTranslator(language);
  const separator = language === "en" ? ", " : "、";
  const businessIntent = stringField(record, "businessIntent");
  const parts = [
    businessIntent ? `${t("contacts.filterAction")}: ${businessIntentLabel(businessIntent, language)}` : "",
    stringListField(record, "primaryIndustryIds").length
      ? `${t("contacts.primaryIndustry")}: ${stringListField(record, "primaryIndustryIds")
          .map((id) => isIndustryIdCode(id) ? primaryIndustryLabel(id, language) : id).join(separator)}`
      : "",
    stringListField(record, "secondaryIndustryIds").length
      ? `${t("contacts.secondaryIndustry")}: ${stringListField(record, "secondaryIndustryIds")
          .map((id) => SECONDARY_INDUSTRY_CATALOG.find((entry) => entry.id === id)?.labels[language] ?? id).join(separator)}`
      : "",
    stringListField(record, "industries").length
      ? `${t("contacts.filterIndustry")}: ${stringListField(record, "industries").map(value => industryLabel(value, language)).join(separator)}`
      : "",
    stringListField(record, "sources").length
      ? t("contacts.source", { value: stringListField(record, "sources").map(value => sourceTypeLabel(value, language)).join(separator) })
      : "",
    stringListField(record, "valueTypes").length
      ? `${t("contacts.value")}: ${stringListField(record, "valueTypes").map(value => valueTypeLabel(value, language)).join(separator)}`
      : "",
    stringListField(record, "followUpStatuses").length
      ? t("contacts.status", { value: stringListField(record, "followUpStatuses")
          .map(value => followUpStatusLabel(value, language))
          .join(separator) })
      : ""
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : t("contacts.noFilters");
}

function filterPreviewDetail(
  suggestion: UnknownRecord,
  businessIntent: string,
  language: OrbitLanguage = "zh"
): string {
  const preview = isRecord(suggestion.filterPreview)
    ? suggestion.filterPreview
    : {};
  const labels = [
    businessIntentLabel(businessIntent, language),
    ...listField(preview, "industries")
      .filter((value): value is string => typeof value === "string")
      .map(value => industryLabel(value, language)),
    ...listField(preview, "valueTypes")
      .filter((value): value is string => typeof value === "string")
      .map(value => valueTypeLabel(value, language)),
    ...listField(preview, "followUpStatuses")
      .filter((value): value is string => typeof value === "string")
      .map(value => followUpStatusLabel(value, language))
  ].filter(Boolean);

  return labels.join(" · ");
}

function requestBodyFromSuggestion(
  suggestion: UnknownRecord,
  businessIntent: string
): RelationshipSearchRequestBody {
  const preview = isRecord(suggestion.filterPreview)
    ? suggestion.filterPreview
    : {};
  const body: RelationshipSearchRequestBody = {
    businessIntent,
    query: stringField(suggestion, "query")
  };
  const industries = stringListField(preview, "industries");
  const sources = stringListField(preview, "sources");
  const valueTypes = stringListField(preview, "valueTypes");
  const followUpStatuses = stringListField(preview, "followUpStatuses");

  if (industries.length) {
    body.industryFilters = industries;
  }

  if (sources.length) {
    body.sourceFilters = sources;
  }

  if (valueTypes.length) {
    body.valueTypeFilters = valueTypes;
  }

  if (followUpStatuses.length) {
    body.followUpStatusFilters = followUpStatuses;
  }

  return body;
}

function suggestionView(
  suggestion: UnknownRecord,
  index: number,
  language: OrbitLanguage = "zh"
): RelationshipSearchSuggestionView {
  const businessIntent = stringField(suggestion, "businessIntent");

  return {
    detail: filterPreviewDetail(suggestion, businessIntent, language),
    evidenceHint: evidenceHintText(stringField(suggestion, "evidenceHint"), language),
    id: stringField(suggestion, "id", `relationship-search-suggestion-${index + 1}`),
    query: queryText(stringField(suggestion, "query"), language),
    request: {
      body: requestBodyFromSuggestion(suggestion, businessIntent),
      endpoint: ORBIT_API_ENDPOINTS.relationshipSearch
    }
  };
}

function trimRequestList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildRelationshipSearchRequest(
  input: unknown
): RelationshipSearchRequestResult {
  const record = isRecord(input) ? input : {};
  const body: RelationshipSearchRequestBody = {};
  const businessIntent = stringField(record, "businessIntent");
  const query = stringField(record, "query");
  const followUpStatusFilters = trimRequestList(record.followUpStatusFilters);
  const industryFilters = trimRequestList(record.industryFilters);
  const primaryIndustryIds = trimRequestList(record.primaryIndustryIds);
  const secondaryIndustryIds = trimRequestList(record.secondaryIndustryIds);
  const sourceFilters = trimRequestList(record.sourceFilters);
  const valueTypeFilters = trimRequestList(record.valueTypeFilters);

  if (businessIntent) {
    body.businessIntent = businessIntent;
  }

  if (query) {
    body.query = query;
  }

  if (followUpStatusFilters.length) {
    body.followUpStatusFilters = followUpStatusFilters;
  }

  if (industryFilters.length) {
    body.industryFilters = industryFilters;
  }

  if (primaryIndustryIds.length) {
    body.primaryIndustryIds = primaryIndustryIds;
  }

  if (secondaryIndustryIds.length) {
    body.secondaryIndustryIds = secondaryIndustryIds;
  }

  if (sourceFilters.length) {
    body.sourceFilters = sourceFilters;
  }

  if (valueTypeFilters.length) {
    body.valueTypeFilters = valueTypeFilters;
  }

  if (Object.keys(body).length === 0) {
    return {
      error: "先输入想找的人、资源或机会。",
      success: false
    };
  }

  return {
    request: {
      body,
      endpoint: ORBIT_API_ENDPOINTS.relationshipSearch
    },
    success: true
  };
}

function relationshipSearchResultView(
  result: UnknownRecord,
  index: number,
  language: OrbitLanguage = "zh"
): RelationshipSearchResultView {
  const matchScore = isRecord(result.matchScore) ? result.matchScore : {};
  const value = isRecord(result.value) ? result.value : {};
  const evidence = listField(result, "evidence").find(isRecord) ?? {};
  const name = stringField(result, "displayName", `关系结果 ${index + 1}`);
  const score = numberField(matchScore, "value");
  const selection: IndustrySelectionContract = {
    ...(result.primaryIndustryId === null || isIndustryIdCode(result.primaryIndustryId)
      ? { primaryIndustryId: result.primaryIndustryId } : {}),
    ...(result.secondaryIndustryId === null
      ? { secondaryIndustryId: null }
      : typeof result.secondaryIndustryId === "string" && validateIndustrySelection(result).valid
        ? { secondaryIndustryId: result.secondaryIndustryId as SecondaryIndustryIdCode } : {})
  };
  const industry = selection.secondaryIndustryId
    ? secondaryIndustryLabel(selection.secondaryIndustryId, language)
    : selection.primaryIndustryId
      ? `${primaryIndustryLabel(selection.primaryIndustryId, language)} · ${createTranslator(language)("contacts.secondaryIndustryMissing")}`
      : industryLabel(stringField(result, "industry"), language);
  const detail = [
    stringField(result, "organization"),
    roleLabel(stringField(result, "role"), language),
    industry,
    locationLabel(stringField(result, "location"), language)
  ].filter(Boolean);

  return {
    contactId: stringField(result, "contactId", stringField(result, "id")),
    ...selection,
    detail: detail.join(" · "),
    evidence: evidenceText(stringField(evidence, "excerpt"), language),
    id: stringField(result, "id", `relationship-search-result-${index + 1}`),
    ...imageUrlFields(result),
    name,
    nextAction: recommendedActionText(
      stringField(result, "recommendedAction"),
      name,
      language
    ),
    relationship: relationshipContextText(
      stringField(result, "relationshipContext"),
      language
    ),
    score: score === null ? "-" : String(score),
    scoreLabel: scoreBandLabel(stringField(matchScore, "band"), language),
    valueLabels: stringListField(value, "valueTypes").map(valueType => valueTypeLabel(valueType, language))
  };
}

export function relationshipSearchSuggestionsToView(
  data: unknown,
  language: OrbitLanguage = "zh"
): RelationshipSearchSuggestionsView {
  const t = createTranslator(language);
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const suggestions = listField(record, "suggestions")
    .filter(isRecord)
    .map((suggestion, index) => suggestionView(suggestion, index, language));

  return {
    emptyText: suggestions.length === 0 ? t("contacts.suggestionsEmpty") : "",
    nextAction:
      suggestions.length > 0
        ? t("contacts.suggestionsNext")
        : t("contacts.suggestionsUseDirect"),
    suggestions,
    summary: t("contacts.suggestionsCount", { count: suggestions.length }),
    title: t("contacts.suggestedSearches")
  };
}

export function relationshipSearchToView(data: unknown, language: OrbitLanguage = "zh"): RelationshipSearchView {
  const t = createTranslator(language);
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const results = listField(record, "results")
    .filter(isRecord)
    .map((result, index) => relationshipSearchResultView(result, index, language));
  const query = stringField(record, "query");
  const appliedFilters = isRecord(record.appliedFilters)
    ? record.appliedFilters
    : {};

  return {
    emptyText:
      results.length === 0 ? t("contacts.noSuitablePeople") : "",
    filtersLabel: appliedFiltersLabel(appliedFilters, language),
    nextAction:
      results.length > 0
        ? t("contacts.reviewBackground")
        : t("contacts.clearOrRephrase"),
    queryLabel: t("contacts.question", { value: queryText(query, language) }),
    results,
    summary: t("contacts.relatedCount", { count: results.length }),
    title: t("contacts.connectionSearchResults")
  };
}
