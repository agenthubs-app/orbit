export interface AgentActionCardView {
  actionTypeLabel: string;
  acceptLabel: string;
  confirmationLabel: string;
  contactName: string;
  dismissLabel: string;
  dueLabel: string;
  id: string;
  organization: string;
  priorityLabel: string;
  reason: string;
  recommendedAction: string;
  safetyLabel: string;
  title: string;
}

export interface AgentSettingsView {
  confirmationLabel: string;
  currentLevelLabel: string;
  levelOptions: AgentSettingsLevelOptionView[];
  rules: string[];
  summary: string;
}

export type AgentAutonomyLevel = "high" | "low" | "medium";

export interface AgentSettingsLevelOptionView {
  detail: string;
  label: string;
  level: AgentAutonomyLevel;
  selected: boolean;
}

export interface AgentActionsView {
  actions: AgentActionCardView[];
  emptyMessage: string;
  emptyTitle: string;
  metrics: string[];
  nextAction: string;
  settings: AgentSettingsView;
  summary: string;
  title: string;
}

export interface AgentActionsViewInput {
  actionsPayload?: unknown;
  settingsPayload?: unknown;
}

type UnknownRecord = Record<string, unknown>;

const ACTION_TYPE_LABELS: Record<string, string> = {
  appointment_suggestion: "预约建议",
  dormant_activation: "沉睡关系唤醒",
  event_reminder: "活动准备",
  message_draft_suggestion: "消息草稿",
  post_event_followup: "活动后跟进"
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级"
};

const LEVEL_LABELS: Record<string, string> = {
  high: "高自主",
  low: "低自主",
  medium: "中等自主"
};

const DUE_LABELS: Record<string, string> = {
  "awaiting confirmation": "等你确认",
  "before tomorrow morning": "明早前",
  "next 3 days": "未来 3 天",
  "next week": "下周",
  "this week": "本周",
  today: "今天"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordInput(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanField(
  record: UnknownRecord,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function containsCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|live store|live-store|live storage|live query|database|postgres|external network|command-center|implementation|deterministic|rule-based)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const text = value.trim();

  if (!text || containsImplementationLabel(text) || !containsCjk(text)) {
    return fallback;
  }

  return text;
}

function actionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? "关系动作";
}

function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? "待判断优先级";
}

function levelLabel(level: string): string {
  return LEVEL_LABELS[level] ?? "需要确认";
}

function isAutonomyLevel(value: string): value is AgentAutonomyLevel {
  return value === "low" || value === "medium" || value === "high";
}

function levelDetail(level: AgentAutonomyLevel): string {
  const details: Record<AgentAutonomyLevel, string> = {
    high: "可以准备行动预案；发送、排程和改资料仍会停下来。",
    low: "只整理提醒和依据；是否继续由你判断。",
    medium: "可以排序下一步、起草内容；对外动作仍要你确认。"
  };

  return details[level];
}

function dueLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  return DUE_LABELS[normalized] ?? userFacingText(value, "待定时间");
}

function fallbackActionTitle(record: UnknownRecord): string {
  const contactName = stringField(record, "contactName", "这位联系人");
  return `复核 ${contactName} 的${actionTypeLabel(
    stringField(record, "actionType")
  )}`;
}

function actionCard(record: UnknownRecord, index: number): AgentActionCardView {
  const actionType = stringField(record, "actionType");
  const title = userFacingText(
    stringField(record, "title"),
    fallbackActionTitle(record)
  );
  const confirmationRequired = booleanField(
    record,
    "confirmationRequired",
    true
  );

  return {
    actionTypeLabel: actionTypeLabel(actionType),
    acceptLabel: "确认建议",
    confirmationLabel: confirmationRequired ? "需要你确认" : "仅供查看",
    contactName: stringField(record, "contactName", "联系人"),
    dismissLabel: "暂不处理",
    dueLabel: dueLabel(stringField(record, "dueLabel")),
    id: stringField(record, "actionId", `agent-action-${index + 1}`),
    organization: stringField(record, "organization", "未标注组织"),
    priorityLabel: priorityLabel(stringField(record, "priority")),
    reason: userFacingText(
      stringField(record, "reason"),
      "这条建议来自已有关系和活动记录，需要你先判断是否合适。"
    ),
    recommendedAction: userFacingText(
      stringField(record, "recommendedAction"),
      "先确认联系人、语气和依据，再决定是否继续。"
    ),
    safetyLabel: "不会自动发送、排程或改资料",
    title
  };
}

function settingsView(settingsPayload: unknown): AgentSettingsView {
  const settings = recordInput(settingsPayload);
  const currentLevel = stringField(settings, "currentLevel", "medium");
  const levelRecords = listField(settings, "levels").filter(isRecord);
  const availableLevels = levelRecords
    .map((levelRecord) => stringField(levelRecord, "level"))
    .filter(isAutonomyLevel);
  const levels = availableLevels.length > 0
    ? availableLevels
    : (["low", "medium", "high"] satisfies AgentAutonomyLevel[]);

  return {
    confirmationLabel: "对外动作前必须确认",
    currentLevelLabel: levelLabel(currentLevel),
    levelOptions: levels.map((level) => ({
      detail: levelDetail(level),
      label: levelLabel(level),
      level,
      selected: level === currentLevel
    })),
    rules: [
      "可以整理建议和草稿。",
      "发送消息、写日历、改资料前都要停下来等你确认。",
      "界面只展示可复核内容，不替你执行。"
    ],
    summary: `当前为${levelLabel(currentLevel)}，AI 可以帮你整理下一步，但不会替你对外执行。`
  };
}

export function agentActionsToView({
  actionsPayload,
  settingsPayload
}: AgentActionsViewInput): AgentActionsView {
  const actionsRecord = recordInput(actionsPayload);
  const actions = listField(actionsRecord, "actions")
    .filter(isRecord)
    .map(actionCard);
  const settings = settingsView(settingsPayload);
  const highPriorityCount = actions.filter(
    (action) => action.priorityLabel === "高优先级"
  ).length;

  if (actions.length === 0) {
    return {
      actions,
      emptyMessage: "Orbit AI 暂时没有新的建议动作需要你处理。",
      emptyTitle: "没有待复核动作",
      metrics: ["0 条待确认", settings.currentLevelLabel],
      nextAction: "先处理关系仪表盘和收件箱里已经有依据的下一步。",
      settings,
      summary: "暂时没有需要你复核的动作。",
      title: "Agent 动作中心"
    };
  }

  return {
    actions,
    emptyMessage: "Orbit AI 暂时没有新的建议动作需要你处理。",
    emptyTitle: "没有待复核动作",
    metrics: [
      `${actions.length} 条待确认`,
      `高优先级 ${highPriorityCount}`,
      settings.currentLevelLabel
    ],
    nextAction: "先看高优先级建议；确认联系人、语气和依据后再继续。",
    settings,
    summary: `${actions.length} 条建议需要你复核。当前为${settings.currentLevelLabel}，所有对外动作都需要你确认。`,
    title: "Agent 动作中心"
  };
}
