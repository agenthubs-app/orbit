export interface ContactSummary {
  id: string;
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
  initial: string;
  tone: ContactAvatarTone;
}

export type ContactDetailStatusUpdate = "active" | "needs_follow_up";

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

export interface ContactDetailStatusActionView {
  label: string;
  nextStatus: ContactDetailStatusUpdate;
  pendingLabel: string;
  successMessage: string;
}

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
  return {
    avatar: contactAvatarFor(contact),
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
    "community lead": "社群负责人",
    "dx consultant": "DX 顾问",
    "head of partnerships": "合作负责人",
    "investor partner": "投资合伙人",
    "marketing lead": "市场负责人",
    partner: "合伙人",
    "platform partner": "平台合作负责人",
    "product manager": "产品经理",
    "sales director": "销售总监",
    "store owner": "门店经营者"
  };

  return labels[normalized] ?? value.trim();
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
  const organization = stringField(contact, "organization");
  const role = roleLabel(stringField(contact, "role"));
  const identity = organization
    ? `${organization} 的${role || "联系人"}`
    : role
      ? `这位${role}`
      : "这位联系人";

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

export function contactsToSummaries(data: unknown): ContactSummary[] {
  return listFromPayload(data, "contacts")
    .filter(isRecord)
    .map((contact) => ({
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
      organization: stringField(contact, "organization", "Independent"),
      relationship: relationshipText(contact),
      role: roleLabel(stringField(contact, "role")),
      status: statusLabel(stringField(contact, "status")),
      valueLabels: valueLabels(contact),
      valueScore: valueScore(contact)
    }))
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

  return {
    evidenceExcerpts: evidenceExcerpts(contact),
    id: stringField(contact, "id", "contact"),
    lastInteractionAt: stringField(
      contact,
      "lastInteractionAt",
      "暂无记录"
    ),
    location: stringField(contact, "location"),
    name,
    nextAction: nextActionText(contact, name),
    noteSummaries: noteSummaries(contact),
    organization: stringField(contact, "organization", "Independent"),
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
