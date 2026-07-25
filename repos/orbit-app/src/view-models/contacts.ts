import { ORBIT_API_ENDPOINTS } from "../api/endpoints";

export interface ContactSummary {
  id: string;
  imageUrl?: string;
  name: string;
  nextAction: string;
  organization: string;
  relationship: string;
  role: string;
  status: string;
  valueLabels: string[];
  valueScore: number | null;
}

export type ContactAvatarTone =
  | "amber"
  | "emerald"
  | "rose"
  | "sky"
  | "violet";

export interface ContactAvatarView {
  imageUrl?: string;
  initial: string;
  tone: ContactAvatarTone;
}

export type ContactDetailStatusUpdate = "active" | "archived" | "needs_follow_up";

export type ContactListStatusFilter =
  | "active"
  | "archived"
  | "needs_follow_up"
  | "nurture";

export interface ContactStatusFilterOption {
  count: number;
  label: string;
  selected: boolean;
  value: ContactListStatusFilter | null;
}

export interface ContactsSearchRequestInput {
  query: string;
  sourceFilters?: readonly string[] | null;
  status?: ContactListStatusFilter | null;
  tagFilters?: readonly string[] | null;
  valueFilters?: readonly string[] | null;
}

export type ContactsSearchRequestResult =
  | {
      request: {
        body: {
          query?: string;
          sourceFilters?: string[];
          statusFilters?: ContactListStatusFilter[];
          tagFilters?: string[];
          valueFilters?: string[];
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export type ContactSearchFilterKind = "source" | "tag" | "value";

export interface ContactSearchFilterOptionView {
  count: number;
  label: string;
  selected: boolean;
  value: string;
}

export interface ContactSearchFilterSectionView {
  key: ContactSearchFilterKind;
  options: ContactSearchFilterOptionView[];
  title: string;
}

export interface ContactSearchFilterSelection {
  sourceFilters?: readonly string[] | null;
  tagFilters?: readonly string[] | null;
  valueFilters?: readonly string[] | null;
}

export interface ContactSearchResultView {
  detail: string;
  id: string;
  imageUrl?: string;
  name: string;
  nextAction: string;
  relationship: string;
  valueLabels: string[];
  valueScore: number | null;
}

export interface ContactsSearchView {
  emptyText: string;
  filtersLabel: string;
  nextAction: string;
  results: ContactSearchResultView[];
  summary: string;
  title: string;
}

export interface ContactDetailStatusActionView {
  label: string;
  nextStatus: ContactDetailStatusUpdate;
  pendingLabel: string;
  successMessage: string;
}

export type ContactDetailNoteRequestResult =
  | {
      request: {
        body: {
          note: {
            authorLabel: string;
            body: string;
          };
        };
      };
      success: true;
      successMessage: string;
    }
  | {
      error: string;
      success: false;
    };

export interface ContactDetailMetadataDraft {
  channel: string;
  occurredAt: string;
  summary: string;
  tagsText: string;
}

export type ContactDetailMetadataRequestResult =
  | {
      request: {
        body: {
          lastInteraction?: {
            channel?: string;
            occurredAt?: string;
            summary?: string;
          };
          tags?: string[];
        };
      };
      success: true;
      successMessage: string;
    }
  | {
      error: string;
      success: false;
    };

const CONTACT_STATUS_FILTER_ORDER: readonly ContactListStatusFilter[] = [
  "needs_follow_up",
  "active",
  "nurture",
  "archived"
];

const CONTACT_STATUS_FILTER_LABELS: Record<ContactListStatusFilter, string> = {
  active: "在推进",
  archived: "已归档",
  needs_follow_up: "待联系",
  nurture: "培养中"
};

export interface ContactDetailSummary extends ContactSummary {
  archiveAction: ContactDetailStatusActionView | null;
  detailTags: string[];
  evidenceExcerpts: string[];
  lastInteractionAt: string;
  location: string;
  noteSummaries: string[];
  publicBio: string;
  publicOffering: string[];
  publicPrompts: string[];
  publicSeeking: string[];
  publicTopics: string[];
  role: string;
  sourceLabel: string;
  statusAction: ContactDetailStatusActionView | null;
}

export interface ContactDetailHeroView {
  avatar: ContactAvatarView;
  detailLine: string;
  name: string;
  relationship: string;
  status: string;
  valueScoreLabel: string | null;
}

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

function numberField(
  record: Record<string, unknown>,
  fieldName: string
): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelFromToken(value: string, fallback: string): string {
  const normalized = value.replace(/[_-]+/gu, " ").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
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
  return /\b(current-user|relationship record|source evidence|before agent use|review evidence|mock|provider|fixture|source:|evidence:)\b/i.test(
    value
  );
}

function valueScore(contact: Record<string, unknown>): number | null {
  const value = contact.value;
  return isRecord(value) ? numberField(value, "score") : null;
}

function valueLabels(contact: Record<string, unknown>): string[] {
  const value = contact.value;
  const valueTypes = isRecord(value) && Array.isArray(value.valueTypes)
    ? value.valueTypes
    : [];
  const labels: Record<string, string> = {
    business_opportunity: "商业机会",
    commercial_opportunity: "商业机会",
    community_context: "社群资源",
    community_resource: "社群资源",
    intro_path: "引荐路径",
    knowledge_exchange: "知识交流",
    referral_path: "引荐路径",
    strategic_fit: "战略契合"
  };

  return valueTypes
    .filter((valueType): valueType is string => typeof valueType === "string")
    .map((valueType) => labels[valueType] ?? labelFromToken(valueType, valueType))
    .filter(Boolean);
}

function stringListField(
  record: Record<string, unknown>,
  fieldName: string
): string[] {
  const value = record[fieldName];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function statusLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    active: "在推进",
    archived: "已归档",
    dormant: "待唤醒",
    needs_follow_up: "待联系",
    nurture: "培养中",
    weak: "弱关系"
  };

  return labels[normalized] ?? labelFromToken(value, "在推进");
}

export function contactAvatarFor(
  contact: Pick<ContactSummary, "id" | "name">
): ContactAvatarView {
  const name = contact.name.trim();
  const firstCharacter = Array.from(name || "人")[0] ?? "人";
  const seed = `${contact.id}${name}`;
  const tones: readonly ContactAvatarTone[] = [
    "sky",
    "emerald",
    "amber",
    "violet",
    "rose"
  ];
  const hash = Array.from(seed).reduce(
    (total, character, index) =>
      total + (character.codePointAt(0) ?? 0) * (index + 1),
    0
  );

  return {
    initial: /[a-z]/iu.test(firstCharacter)
      ? firstCharacter.toUpperCase()
      : firstCharacter,
    tone: tones[hash % tones.length] ?? "violet"
  };
}

export function contactDetailHeroToView(
  contact: ContactDetailSummary
): ContactDetailHeroView {
  const avatar = contactAvatarFor(contact);

  return {
    avatar: contact.imageUrl ? { ...avatar, imageUrl: contact.imageUrl } : avatar,
    detailLine: [contact.organization, contact.role].filter(Boolean).join(" · "),
    name: contact.name,
    relationship: contact.relationship,
    status: contact.status,
    valueScoreLabel:
      contact.valueScore === null ? null : `价值分 ${contact.valueScore}`
  };
}

function statusFilterCounts(data: unknown): Map<ContactListStatusFilter, number> {
  const counts = new Map<ContactListStatusFilter, number>();

  if (!isRecord(data) || !isRecord(data.availableFilters)) {
    return counts;
  }

  const statuses = data.availableFilters.statuses;

  if (!Array.isArray(statuses)) {
    return counts;
  }

  statuses.filter(isRecord).forEach((option) => {
    const value = stringField(option, "value");
    const count = numberField(option, "count");

    if (
      CONTACT_STATUS_FILTER_ORDER.includes(value as ContactListStatusFilter) &&
      count !== null
    ) {
      counts.set(value as ContactListStatusFilter, count);
    }
  });

  return counts;
}

export function contactStatusFilterOptions(
  data: unknown,
  selectedStatus: ContactListStatusFilter | null = null
): ContactStatusFilterOption[] {
  const counts = statusFilterCounts(data);
  const allCount = counts.size > 0
    ? CONTACT_STATUS_FILTER_ORDER.reduce(
        (total, status) => total + (counts.get(status) ?? 0),
        0
      )
    : listFromPayload(data, "contacts").length;

  return [
    {
      count: allCount,
      label: "全部",
      selected: selectedStatus === null,
      value: null
    },
    ...CONTACT_STATUS_FILTER_ORDER.map((status) => ({
      count: counts.get(status) ?? 0,
      label: CONTACT_STATUS_FILTER_LABELS[status],
      selected: selectedStatus === status,
      value: status
    }))
  ];
}

export function buildContactsSearchRequest(
  input: ContactsSearchRequestInput
): ContactsSearchRequestResult {
  const query = input.query.trim();
  const sourceFilters = normalizedFilterValues(input.sourceFilters);
  const tagFilters = normalizedFilterValues(input.tagFilters);
  const valueFilters = normalizedFilterValues(input.valueFilters);
  const hasFilters =
    sourceFilters.length > 0 ||
    !!input.status ||
    tagFilters.length > 0 ||
    valueFilters.length > 0;

  if (!query && !hasFilters) {
    return {
      error: "先输入要找的人、公司或资源。",
      success: false
    };
  }

  const body: {
    query?: string;
    sourceFilters?: string[];
    statusFilters?: ContactListStatusFilter[];
    tagFilters?: string[];
    valueFilters?: string[];
  } = {};

  if (query) {
    body.query = query;
  }

  if (sourceFilters.length > 0) {
    body.sourceFilters = sourceFilters;
  }

  if (input.status) {
    body.statusFilters = [input.status];
  }

  if (tagFilters.length > 0) {
    body.tagFilters = tagFilters;
  }

  if (valueFilters.length > 0) {
    body.valueFilters = valueFilters;
  }

  return {
    request: {
      body,
      endpoint: ORBIT_API_ENDPOINTS.contactsSearch
    },
    success: true
  };
}

function normalizedFilterValues(values?: readonly string[] | null): string[] {
  return uniqueStrings([...(values ?? [])]);
}

function availableFilterOptions(
  data: unknown,
  fieldName: "sources" | "tags" | "values"
): Record<string, unknown>[] {
  if (!isRecord(data) || !isRecord(data.availableFilters)) {
    return [];
  }

  const value = data.availableFilters[fieldName];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function optionSelected(
  option: Record<string, unknown>,
  selectedValues: ReadonlySet<string>,
  value: string
): boolean {
  return selectedValues.has(value) || option.selected === true;
}

function sourceFilterLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    business_card_ocr: "名片识别",
    calendar_signal: "日程线索",
    email_signal: "邮件线索",
    event_import: "活动导入",
    external_contacts: "通讯录导入",
    manual: "手动记录",
    "manual note": "手动记录",
    qr: "QR 扫码",
    qr_scan: "QR 扫码",
    referral: "引荐",
    registration: "报名记录"
  };

  return labels[normalized] ?? preferredChineseSegment(value);
}

function tagFilterLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "event:climate-founders-dinner": "气候创始人晚宴",
    "priority:nurture": "长期培养",
    "priority:warm-follow-up": "温线索跟进",
    "source:event-import": "活动导入",
    "source:external-import": "外部联系人",
    "topic:community": "社群资源",
    "topic:storage-pilots": "储能试点",
    "topic:venture-ecosystem": "创投生态"
  };

  return labels[normalized] ?? value.replace(/^[a-z]+:/iu, "").trim();
}

function valueFilterLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    business_opportunity: "商业机会",
    commercial_opportunity: "商业机会",
    community_context: "社群资源",
    community_resource: "社群资源",
    intro_path: "引荐路径",
    knowledge_exchange: "知识交流",
    referral_path: "引荐路径",
    strategic_fit: "战略契合"
  };

  return labels[normalized] ?? labelFromToken(value, value);
}

function contactSearchFilterOption(
  option: Record<string, unknown>,
  selectedValues: ReadonlySet<string>,
  labelForValue: (value: string) => string
): ContactSearchFilterOptionView | null {
  const value = stringField(option, "value");
  const count = numberField(option, "count") ?? 0;
  const selected = optionSelected(option, selectedValues, value);

  if (!value || (count === 0 && !selected)) {
    return null;
  }

  return {
    count,
    label: labelForValue(value),
    selected,
    value
  };
}

function contactSearchFilterSection(
  data: unknown,
  key: ContactSearchFilterKind,
  title: string,
  fieldName: "sources" | "tags" | "values",
  selectedValues: readonly string[],
  labelForValue: (value: string) => string
): ContactSearchFilterSectionView | null {
  const selectedSet = new Set(selectedValues);
  const options = availableFilterOptions(data, fieldName)
    .map((option) =>
      contactSearchFilterOption(option, selectedSet, labelForValue)
    )
    .filter((option): option is ContactSearchFilterOptionView => !!option);

  if (options.length === 0) {
    return null;
  }

  return {
    key,
    options,
    title
  };
}

export function contactSearchFilterSections(
  data: unknown,
  selection: ContactSearchFilterSelection = {}
): ContactSearchFilterSectionView[] {
  return [
    contactSearchFilterSection(
      data,
      "source",
      "来源",
      "sources",
      normalizedFilterValues(selection.sourceFilters),
      sourceFilterLabel
    ),
    contactSearchFilterSection(
      data,
      "tag",
      "标签",
      "tags",
      normalizedFilterValues(selection.tagFilters),
      tagFilterLabel
    ),
    contactSearchFilterSection(
      data,
      "value",
      "价值",
      "values",
      normalizedFilterValues(selection.valueFilters),
      valueFilterLabel
    )
  ].filter(
    (section): section is ContactSearchFilterSectionView => section !== null
  );
}

export function toggleContactSearchFilter(
  values: readonly string[],
  value: string
): string[] {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return normalizedFilterValues(values);
  }

  return values.includes(normalizedValue)
    ? values.filter((item) => item !== normalizedValue)
    : [...values, normalizedValue];
}

export function buildContactDetailNoteRequest(
  noteBody: string
): ContactDetailNoteRequestResult {
  const body = noteBody.trim();

  if (!body) {
    return {
      error: "先写一条备注。",
      success: false
    };
  }

  return {
    request: {
      body: {
        note: {
          authorLabel: "小雨",
          body
        }
      }
    },
    success: true,
    successMessage: "已保存这条记录。"
  };
}

function tagsFromText(value: string): string[] {
  return uniqueStrings(value.split(/[,\n]+/u));
}

export function buildContactDetailMetadataRequest(
  draft: ContactDetailMetadataDraft
): ContactDetailMetadataRequestResult {
  const tags = tagsFromText(draft.tagsText);
  const channel = draft.channel.trim();
  const occurredAt = draft.occurredAt.trim();
  const summary = draft.summary.trim();
  const body: {
    lastInteraction?: {
      channel?: string;
      occurredAt?: string;
      summary?: string;
    };
    tags?: string[];
  } = {};

  if (tags.length > 0) {
    body.tags = tags;
  }

  if (channel || occurredAt || summary) {
    body.lastInteraction = {};

    if (channel) {
      body.lastInteraction.channel = channel;
    }

    if (occurredAt) {
      body.lastInteraction.occurredAt = occurredAt;
    }

    if (summary) {
      body.lastInteraction.summary = summary;
    }
  }

  if (!body.tags && !body.lastInteraction) {
    return {
      error: "至少填写一个标签或最近互动。",
      success: false
    };
  }

  return {
    request: {
      body
    },
    success: true,
    successMessage: "已更新标签和最近互动。"
  };
}

function searchAppliedFilters(data: unknown): Record<string, unknown> {
  if (isRecord(data) && isRecord(data.appliedFilters)) {
    return data.appliedFilters;
  }

  return {};
}

function filterValues(
  filters: Record<string, unknown>,
  fieldName: string
): string[] {
  return stringListField(filters, fieldName)
    .map((value) => value.trim())
    .filter(Boolean);
}

function contactsSearchFiltersLabel(data: unknown): string {
  const filters = searchAppliedFilters(data);
  const labels: string[] = [];
  const query =
    stringField(filters, "query") ||
    (isRecord(data) ? stringField(data, "query") : "");
  const sourceFilters = filterValues(filters, "sourceFilters");
  const statusFilters = filterValues(filters, "statusFilters");
  const tagFilters = filterValues(filters, "tagFilters");
  const valueFilters = filterValues(filters, "valueFilters");

  if (query) {
    labels.push(`关键词：${query}`);
  }

  if (sourceFilters.length > 0) {
    labels.push(`来源：${sourceFilters.map(sourceFilterLabel).join("、")}`);
  }

  if (statusFilters.length > 0) {
    labels.push(`状态：${statusFilters.map(statusLabel).join("、")}`);
  }

  if (tagFilters.length > 0) {
    labels.push(`标签：${tagFilters.map(tagFilterLabel).join("、")}`);
  }

  if (valueFilters.length > 0) {
    labels.push(`价值：${valueFilters.map(valueFilterLabel).join("、")}`);
  }

  return labels.length > 0 ? labels.join(" · ") : "未设置筛选";
}

function contactSearchResultDetail(contact: ContactSummary): string {
  return [contact.organization, contact.role, contact.status]
    .filter(Boolean)
    .join(" · ");
}

function contactsSearchNextAction(data: unknown, count: number): string {
  if (count === 0) {
    return "这次没有找到合适的人。";
  }

  if (isRecord(data)) {
    const rawNextAction = stringField(data, "nextAction");
    const chinese = preferredChineseSegment(rawNextAction);

    if (segmentLooksChinese(chinese) && !containsImplementationLabel(chinese)) {
      return chinese;
    }
  }

  return "先看匹配到的人和来源证据，再决定要不要跟进。";
}

export function contactsSearchToView(data: unknown): ContactsSearchView {
  const contacts = contactsToSummaries(data).slice(0, 3);

  return {
    emptyText: contacts.length === 0 ? "换个关键词，或先清空筛选。" : "",
    filtersLabel: contactsSearchFiltersLabel(data),
    nextAction: contactsSearchNextAction(data, contacts.length),
    results: contacts.map((contact) => ({
      detail: contactSearchResultDetail(contact),
      id: contact.id,
      ...(contact.imageUrl ? { imageUrl: contact.imageUrl } : {}),
      name: contact.name,
      nextAction: contact.nextAction,
      relationship: contact.relationship,
      valueLabels: contact.valueLabels,
      valueScore: contact.valueScore
    })),
    summary: contacts.length === 0 ? "暂无匹配" : `${contacts.length} 位匹配`,
    title: "深度搜索"
  };
}

function statusAction(
  rawStatus: string,
  name: string
): ContactDetailStatusActionView | null {
  const normalized = rawStatus.trim().toLowerCase();

  if (normalized === "needs_follow_up") {
    return {
      label: "标记为在推进",
      nextStatus: "active",
      pendingLabel: "更新中",
      successMessage: `已把 ${name} 标记为在推进。`
    };
  }

  if (normalized === "active" || normalized === "nurture") {
    return {
      label: "放回待联系",
      nextStatus: "needs_follow_up",
      pendingLabel: "更新中",
      successMessage: `已把 ${name} 放回待联系。`
    };
  }

  return null;
}

function archiveAction(
  rawStatus: string,
  name: string
): ContactDetailStatusActionView | null {
  const normalized = rawStatus.trim().toLowerCase();

  if (normalized === "archived") {
    return null;
  }

  return {
    label: "归档联系人",
    nextStatus: "archived",
    pendingLabel: "归档中",
    successMessage: `已归档 ${name}。`
  };
}

function relationshipText(contact: Record<string, unknown>): string {
  const snippet = stringField(contact, "profileSnippet");
  const relationship = stringField(contact, "relationshipContext");
  const publicBio = publicProfileBio(contact);

  if (snippet) {
    const localizedSnippet = localizedRelationshipText(contact, snippet);
    return localizedSnippet || publicBio || "关系背景待补充。";
  }

  if (relationship && !containsImplementationLabel(relationship)) {
    const localizedRelationship = localizedRelationshipText(contact, relationship);
    return localizedRelationship || publicBio || "关系背景待补充。";
  }

  return publicBio || stringField(contact, "role", "关系信息待补充");
}

function nextActionText(contact: Record<string, unknown>, name: string): string {
  const value = stringField(contact, "nextAction");

  if (
    !value ||
    /\b(review|agent|source evidence|before agent use)\b/i.test(value)
  ) {
    return `查看来源证据后再跟进 ${name}。`;
  }

  return localizedNextActionText(value, name);
}

function roleLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "community organizer": "社群组织者",
    founder: "创始人",
    "founder ceo": "创始人兼 CEO",
    "community lead": "社群负责人",
    "dx consultant": "DX 顾问",
    "head of partnerships": "合作负责人",
    "investor partner": "投资合伙人",
    "marketing lead": "市场负责人",
    partner: "合伙人",
    "platform partner": "平台合作负责人",
    "product manager": "产品经理",
    "sales director": "销售总监",
    "store owner": "门店经营者",
    "代表取締役": "代表董事",
    "代表取締役社長": "代表董事兼社长",
    "取締役": "董事",
    "社長": "社长"
  };

  return labels[normalized] ?? value.trim();
}

function organizationLabel(value: string): string {
  const trimmed = value.trim();
  const labels: Record<string, string> = {
    "株式会社アイ・エム・エス": "IMS 股份公司"
  };

  if (labels[trimmed]) {
    return labels[trimmed];
  }

  const kabushikiMatch = /^株式会社(.+)$/u.exec(trimmed);
  if (kabushikiMatch?.[1]?.trim()) {
    return `${kabushikiMatch[1].trim()} 股份公司`;
  }

  return trimmed;
}

function locationLabel(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  if (!trimmed || normalized === "unknown location" || normalized === "unknown") {
    return "地区待补充";
  }

  return trimmed;
}

function organizationFromBusinessCardText(value: string): string {
  const match = /\bwith\s+(.+?)[.。]?$/iu.exec(value.trim());
  return match?.[1]?.trim() ? organizationLabel(match[1].trim()) : "";
}

function businessCardRelationshipText(
  value: string,
  organization = ""
): string {
  const sourceOrganization = organization || organizationFromBusinessCardText(value);

  return sourceOrganization
    ? `通过名片交换认识，来源公司为 ${sourceOrganization}。`
    : "通过名片交换认识。";
}

function localizedRelationshipText(
  contact: Record<string, unknown>,
  value: string
): string {
  const chinese = preferredChineseSegment(value);

  if (segmentLooksChinese(chinese)) {
    return chinese;
  }

  const lower = value.toLowerCase();
  const organization = organizationLabel(stringField(contact, "organization"));
  const role = roleLabel(stringField(contact, "role"));
  const identity = organization
    ? `${organization} 的${role || "联系人"}`
    : role
      ? `这位${role}`
      : "这位联系人";

  if (lower.includes("business card exchange")) {
    return businessCardRelationshipText(value, organization);
  }

  if (lower.includes("storage pilot")) {
    return `${identity}，正在推进储能试点合作。`;
  }

  if (lower.includes("community") || lower.includes("founder roundtable")) {
    return `${identity}，能连接社群资源和行业信息。`;
  }

  if (lower.includes("venture ecosystem")) {
    return `${identity}，可以介绍创投生态资源。`;
  }

  if (lower.includes("partnership") || lower.includes("distribution")) {
    return `${identity}，正在推进合作渠道。`;
  }

  return "";
}

function localizedNoteText(value: string): string {
  const chinese = preferredChineseSegment(value);

  if (segmentLooksChinese(chinese)) {
    return chinese;
  }

  const lower = value.toLowerCase();

  if (lower.includes("business card exchange")) {
    return businessCardRelationshipText(value);
  }

  if (lower.includes("founder dinner") && lower.includes("intro")) {
    return "在创始人晚宴上聊过，对方希望介绍合作伙伴。";
  }

  if (lower.includes("intro")) {
    return "对方希望先补一条引荐。";
  }

  return "";
}

function localizedNextActionText(value: string, name: string): string {
  if (segmentLooksChinese(value)) {
    return value;
  }

  const lower = value.toLowerCase();

  if (lower.includes("intro")) {
    return `给 ${name} 补一条引荐跟进。`;
  }

  if (lower.includes("roundtable")) {
    return `问 ${name} 是否愿意继续聊这次合作。`;
  }

  if (lower.includes("pilot review") || lower.includes("review call")) {
    return `邀请 ${name} 加入下一次合作评估。`;
  }

  if (lower.includes("brief")) {
    return `把合作背景整理好后再跟进 ${name}。`;
  }

  return `跟进 ${name} 的关系进展。`;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

function contactImageUrl(contact: Record<string, unknown>): string {
  const avatar = nestedRecord(contact, "avatar");
  return (
    stringField(contact, "avatarAssetUrl") ||
    stringField(contact, "avatarUrl") ||
    stringField(contact, "photoUrl") ||
    stringField(contact, "imageUrl") ||
    stringField(contact, "profileImageUrl") ||
    stringField(contact, "portraitUrl") ||
    stringField(contact, "headshotUrl") ||
    stringField(avatar, "src") ||
    stringField(avatar, "url") ||
    stringField(avatar, "imageUrl")
  );
}

export function contactsToSummaries(data: unknown): ContactSummary[] {
  return listFromPayload(data, "contacts")
    .filter(isRecord)
    .map((contact) => {
      const imageUrl = contactImageUrl(contact);

      return {
        ...(imageUrl ? { imageUrl } : {}),
        id: stringField(contact, "id", "contact"),
        name: stringField(
          contact,
          "displayName",
          stringField(contact, "name", "Contact")
        ),
        nextAction: stringField(
          contact,
          "nextAction"
        ),
        organization: organizationLabel(
          stringField(contact, "organization", "Independent")
        ),
        relationship: relationshipText(contact),
        role: roleLabel(stringField(contact, "role")),
        status: statusLabel(stringField(contact, "status")),
        valueLabels: valueLabels(contact),
        valueScore: valueScore(contact)
      };
    })
    .map((contact) => ({
      ...contact,
      nextAction: nextActionText(
        listFromPayload(data, "contacts")
          .filter(isRecord)
          .find((rawContact) => stringField(rawContact, "id", "contact") === contact.id) ??
          {},
        contact.name
      )
    }));
}

function contactRecordFromPayload(data: unknown): Record<string, unknown> | null {
  if (isRecord(data) && isRecord(data.contact)) {
    return data.contact;
  }

  return isRecord(data) ? data : null;
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function sourceLabel(contact: Record<string, unknown>): string {
  const source = nestedRecord(contact, "source");
  const publicProfile = nestedRecord(contact, "publicProfile");
  const publicSource = nestedRecord(publicProfile, "source");
  const label = stringField(source, "label") || stringField(publicSource, "label");
  const normalized = label.trim().toLowerCase();
  const qrMatch = /^QR scan for (.+)$/iu.exec(label);
  const labels: Record<string, string> = {
    "manual note": "手动记录"
  };

  if (qrMatch?.[1]?.trim()) {
    return `QR 扫码：${qrMatch[1].trim()}`;
  }

  if (labels[normalized]) {
    return labels[normalized];
  }

  const chinese = preferredChineseSegment(label);
  return segmentLooksChinese(chinese) ? chinese : "";
}

function publicProfileBio(contact: Record<string, unknown>): string {
  const publicProfile = nestedRecord(contact, "publicProfile");
  const rawBio =
    stringField(publicProfile, "bio") ||
    stringField(publicProfile, "selfIntroduction");
  const localizedBio = localizedRelationshipText(contact, rawBio);
  const chineseBio = preferredChineseSegment(rawBio);

  if (localizedBio) {
    return localizedBio;
  }

  return segmentLooksChinese(chineseBio) ? chineseBio : "";
}

function localizedPublicProfileItem(value: string): string {
  const chinese = preferredChineseSegment(value);

  if (segmentLooksChinese(chinese)) {
    return chinese;
  }

  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "climate infrastructure": "气候基础设施",
    "commercial pilot partners": "商业试点伙伴",
    "community context": "社群资源",
    "founder diligence context": "创始人尽调背景",
    "operator introductions": "运营方引荐",
    "operator partnerships": "运营方合作",
    "review evidence before follow-up": "查看证据后跟进",
    "storage pilot operator access": "储能试点运营方资源",
    "storage pilots": "储能试点"
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (
    normalized.includes("operator profile") &&
    normalized.includes("storage pilot")
  ) {
    return "怎样的运营方背景能让储能试点更可信？";
  }

  if (
    normalized.includes("climate founders") &&
    normalized.includes("lose momentum")
  ) {
    return "气候创业者在活动后通常会在哪一步失去推进节奏？";
  }

  return "";
}

function publicProfileList(
  contact: Record<string, unknown>,
  fieldName: string
): string[] {
  const publicProfile = nestedRecord(contact, "publicProfile");
  const organization = stringField(contact, "organization").toLowerCase();
  const role = stringField(contact, "role").toLowerCase();

  return uniqueStrings(
    stringListField(publicProfile, fieldName)
      .map((item) => {
        const normalized = item.trim().toLowerCase();

        if (normalized === organization || normalized === role) {
          return "";
        }

        return localizedPublicProfileItem(item);
      })
      .filter((item) => item && !containsImplementationLabel(item))
  );
}

function localizedEvidenceText(value: string): string {
  const chinese = preferredChineseSegment(value);

  if (segmentLooksChinese(chinese)) {
    return chinese;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes("manual note") &&
    normalized.includes("storage pilot operator intro")
  ) {
    return "Kenji 在气候创业者晚宴后，希望引荐储能试点运营方。";
  }

  if (
    normalized.includes("status is needs_follow_up") &&
    normalized.includes("operator introduction")
  ) {
    return "运营方引荐还没有发出，所以这条关系仍在待联系。";
  }

  if (normalized.includes("follow-up note keeps the source context")) {
    return "跟进记录会保留这次来源背景。";
  }

  return "";
}

function evidenceExcerpts(contact: Record<string, unknown>): string[] {
  return uniqueStrings(
    listFromPayload(contact, "evidence")
      .filter(isRecord)
      .map((evidence) => localizedEvidenceText(stringField(evidence, "excerpt")))
      .filter((excerpt) => excerpt && !containsImplementationLabel(excerpt))
  ).slice(0, 3);
}

function detailTags(contact: Record<string, unknown>): string[] {
  return uniqueStrings(stringListField(contact, "tags").map(tagFilterLabel));
}

function noteSummaries(contact: Record<string, unknown>): string[] {
  return uniqueStrings(
    listFromPayload(contact, "notes")
      .filter(isRecord)
      .map((note) => localizedNoteText(stringField(note, "body")))
      .filter((note) => note && !containsImplementationLabel(note))
  ).slice(0, 2);
}

export function contactDetailToSummary(data: unknown): ContactDetailSummary {
  const contact = contactRecordFromPayload(data);

  if (!contact) {
    return {
      archiveAction: null,
      detailTags: [],
      evidenceExcerpts: [],
      id: "contact",
      lastInteractionAt: "暂无记录",
      location: "",
      name: "Contact",
      nextAction: "查看来源证据后再跟进 Contact。",
      noteSummaries: [],
      organization: "Independent",
      publicBio: "",
      publicOffering: [],
      publicPrompts: [],
      publicSeeking: [],
      publicTopics: [],
      relationship: "Relationship context pending",
      role: "",
      sourceLabel: "",
      status: "在推进",
      statusAction: null,
      valueLabels: [],
      valueScore: null
    };
  }

  const name = stringField(
    contact,
    "displayName",
    stringField(contact, "name", "Contact")
  );
  const imageUrl = contactImageUrl(contact);

  return {
    archiveAction: archiveAction(stringField(contact, "status"), name),
    detailTags: detailTags(contact),
    evidenceExcerpts: evidenceExcerpts(contact),
    id: stringField(contact, "id", "contact"),
    ...(imageUrl ? { imageUrl } : {}),
    lastInteractionAt: stringField(
      contact,
      "lastInteractionAt",
      "暂无记录"
    ),
    location: locationLabel(stringField(contact, "location")),
    name,
    nextAction: nextActionText(contact, name),
    noteSummaries: noteSummaries(contact),
    organization: organizationLabel(
      stringField(contact, "organization", "Independent")
    ),
    publicBio: publicProfileBio(contact),
    publicOffering: publicProfileList(contact, "offering"),
    publicPrompts: publicProfileList(contact, "conversationPrompts"),
    publicSeeking: publicProfileList(contact, "seeking"),
    publicTopics: publicProfileList(contact, "topics"),
    relationship: relationshipText(contact),
    role: roleLabel(stringField(contact, "role")),
    sourceLabel: sourceLabel(contact),
    status: statusLabel(stringField(contact, "status")),
    statusAction: statusAction(stringField(contact, "status"), name),
    valueLabels: valueLabels(contact),
    valueScore: valueScore(contact)
  };
}
