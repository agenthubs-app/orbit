export interface RelationshipChatMetricView {
  label: string;
  value: string;
}

export interface RelationshipChatConversationView {
  contactId: string;
  detail: string;
  id: string;
  lastAt: string;
  name: string;
  nextAction: string;
  preview: string;
  sourceLabel: string;
  title: string;
  unreadLabel: string;
}

export interface RelationshipChatListView {
  conversations: RelationshipChatConversationView[];
  metrics: RelationshipChatMetricView[];
  summary: string;
  title: string;
}

export interface RelationshipChatMessageView {
  body: string;
  deliveryLabel: string;
  fromMe: boolean;
  id: string;
  sender: string;
  time: string;
}

export interface RelationshipChatThreadView {
  contactId: string;
  context: string;
  messages: RelationshipChatMessageView[];
  participant: string;
  sendBoundary: string;
  title: string;
}

type UnknownRecord = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  needs_followup: "待跟进",
  paused: "已暂停"
};

const SOURCE_LABELS: Record<string, string> = {
  calendar_signal: "日程线索",
  chat_summary: "对话摘要",
  email_signal: "邮件线索",
  event_import: "活动记录",
  manual: "手动记录",
  referral: "朋友介绍",
  system: "系统记录"
};

const TITLE_LABELS: Record<string, string> = {
  "Case study request": "案例资料跟进",
  "Pilot timing follow-up": "试点时间跟进"
};

const DELIVERY_LABELS: Record<string, string> = {
  mock_received: "收到",
  mock_recorded_locally: "本地草稿",
  not_sent: "未发送"
};

const TOPIC_LABELS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "日本中小制造业 AI 工作流 PoC 买方",
    pattern: /AI workflow PoC buyer in Japanese SMB manufacturing/iu
  },
  {
    label: "能触达华人商务社群的活动赞助方",
    pattern: /event sponsor with Chinese business-community reach/iu
  },
  {
    label: "日本落地可信赖的税务与设立顾问",
    pattern: /trusted tax and incorporation advisor for Japan entry/iu
  },
  {
    label: "中日双语社群营销渠道",
    pattern: /Mandarin Japanese community marketing channel/iu
  }
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(
  record: UnknownRecord,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function listField(record: UnknownRecord, fieldName: string): UnknownRecord[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? "进行中";
}

function sourceLabel(source: UnknownRecord): string {
  const type = stringField(source, "type");
  const label = stringField(source, "label");

  if (SOURCE_LABELS[type]) {
    return SOURCE_LABELS[type];
  }

  if (/pilot timing/iu.test(label)) {
    return "对话摘要";
  }

  if (/roundtable|event|roster/iu.test(label)) {
    return "活动记录";
  }

  return "关系证据";
}

function titleText(value: string): string {
  const conversationMatch = /^(.+?)\s+conversation$/iu.exec(value);

  if (conversationMatch?.[1]?.trim()) {
    return `${conversationMatch[1].trim()} 的关系对话`;
  }

  return TITLE_LABELS[value] ?? (value || "关系对话");
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function topicText(value: string): string {
  const topic = TOPIC_LABELS.find((item) => item.pattern.test(value));

  if (topic) {
    return topic.label;
  }

  return containsCjk(value) ? value : "这段关系";
}

function contextText(value: string): string {
  const matchThrough = /\bmatches\b.+\bthrough\b\s+(.+?)\.?$/iu.exec(value);
  if (matchThrough?.[1]?.trim()) {
    return `这段对话和${topicText(matchThrough[1])}有关。`;
  }

  if (/pilot timing comparison|operator questions|breakfast/iu.test(value)) {
    return "对方在等一版具体回复。";
  }

  if (/case study|planning meeting/iu.test(value)) {
    return "对方在等一份案例资料。";
  }

  if (/intro|introduction/iu.test(value)) {
    return "这段对话和引荐背景有关。";
  }

  return containsCjk(value) ? value : "先看上下文，再决定是否回复。";
}

function nextActionText(value: string): string {
  if (TOPIC_LABELS.some((item) => item.pattern.test(value))) {
    return `先围绕「${topicText(value)}」写一版草稿。`;
  }

  if (/open the first chat thread|local preview|review/iu.test(value)) {
    return "先打开对话，检查需要回复的内容。";
  }

  if (/send|share|reply/iu.test(value)) {
    return "先写一版草稿，确认后再发。";
  }

  return containsCjk(value) ? value : "先打开对话，检查需要回复的内容。";
}

function messageBodyText(value: string): string {
  const followupMatch =
    /^Follow up about (.+?) with a concrete next step\.?$/iu.exec(value);
  if (followupMatch?.[1]?.trim()) {
    return `围绕「${topicText(followupMatch[1])}」准备一版具体跟进。`;
  }

  if (/breakfast discussion.+pilot timing comparison/iu.test(value)) {
    return "对方询问试点时间对比，希望拿到一版具体回复。";
  }

  if (/compare the two pilot timing windows/iu.test(value)) {
    return "我会准备两个时间窗口的对比，并围绕对方的问题整理。";
  }

  if (/case study/iu.test(value)) {
    return "对方希望先拿到一份案例资料。";
  }

  return containsCjk(value) ? value : "这条消息需要先看来源再处理。";
}

function conversationsFromPayload(data: unknown): UnknownRecord[] {
  if (!isRecord(data)) {
    return [];
  }

  return listField(data, "conversations");
}

function unreadLabel(count: number): string {
  return count > 0 ? `${count} 条未读` : "已读";
}

function conversationToView(
  conversation: UnknownRecord
): RelationshipChatConversationView {
  const context = nestedRecord(conversation, "oneToOneContext");
  const unreadCount = numberField(conversation, "unreadCount");
  const stage = stringField(conversation, "status");

  return {
    contactId:
      stringField(conversation, "participantContactId") ||
      stringField(context, "contactId"),
    detail: [
      stringField(conversation, "organization"),
      statusLabel(stage)
    ].filter(Boolean).join(" · "),
    id: stringField(conversation, "conversationId", "conversation"),
    lastAt: formatDateTime(stringField(conversation, "lastMessageAt")),
    name: stringField(conversation, "participantName", "联系人"),
    nextAction: nextActionText(stringField(context, "recommendedFollowup")),
    preview: contextText(
      stringField(context, "latestContext") ||
        stringField(conversation, "lastMessagePreview")
    ),
    sourceLabel: sourceLabel(nestedRecord(conversation, "source")),
    title: titleText(stringField(conversation, "title")),
    unreadLabel: unreadLabel(unreadCount)
  };
}

export function relationshipChatListToView(
  data: unknown
): RelationshipChatListView {
  const conversations = conversationsFromPayload(data).map(conversationToView);
  const followupCount = conversations.filter((conversation) =>
    conversation.detail.includes("待跟进")
  ).length;
  const unreadCount = conversations.reduce((sum, conversation) => {
    const match = /^(\d+)/u.exec(conversation.unreadLabel);
    return sum + (match?.[1] ? Number.parseInt(match[1], 10) : 0);
  }, 0);

  return {
    conversations,
    metrics: [
      { label: "对话", value: String(conversations.length) },
      { label: "待跟进", value: String(followupCount) },
      { label: "未读", value: String(unreadCount) }
    ],
    summary:
      conversations.length > 0
        ? `${conversations.length} 段关系对话，先看需要跟进的人。`
        : "还没有关系对话。",
    title: "关系对话"
  };
}

function sendBoundaryText(sendState: UnknownRecord): string {
  const status = stringField(sendState, "status");

  if (status === "ready") {
    return "可以写草稿；真正发出前还要确认。";
  }

  if (status === "pending_confirmation") {
    return "还在等确认，暂时不要发出。";
  }

  return "这段对话暂时只能查看。";
}

function messageToView(message: UnknownRecord): RelationshipChatMessageView {
  const fromMe = stringField(message, "senderRole") === "orbit_user";

  return {
    body: messageBodyText(stringField(message, "body")),
    deliveryLabel:
      DELIVERY_LABELS[stringField(message, "deliveryState")] ?? "未发送",
    fromMe,
    id: stringField(message, "messageId", "message"),
    sender: fromMe ? "我" : stringField(message, "senderName", "联系人"),
    time: formatDateTime(stringField(message, "createdAt"))
  };
}

export function relationshipChatThreadToView(
  data: unknown
): RelationshipChatThreadView {
  const record = isRecord(data) ? data : {};
  const conversation = nestedRecord(record, "conversation");
  const context = nestedRecord(record, "oneToOneContext");
  const participantName = stringField(conversation, "participantName", "联系人");
  const organization = stringField(conversation, "organization");

  return {
    contactId:
      stringField(conversation, "participantContactId") ||
      stringField(context, "contactId"),
    context: contextText(
      stringField(context, "latestContext") ||
        stringField(context, "recommendedFollowup")
    ),
    messages: listField(record, "messages").map(messageToView),
    participant: [participantName, organization].filter(Boolean).join(" · "),
    sendBoundary: sendBoundaryText(nestedRecord(record, "sendMessageState")),
    title: titleText(stringField(conversation, "title"))
  };
}
