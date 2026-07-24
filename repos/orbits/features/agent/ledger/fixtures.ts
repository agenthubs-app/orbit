/**
 * Agent action ledger fixture。
 *
 * 6 条条目对应设计稿 All actions 列表：跟进 Alex Chen（等待确认，3 项子操作）、
 * 回复徐薇的引荐请求（等待确认）、生成明早会议简报（正在执行）、
 * 昨晚 6 位联系人归档（已完成，可撤销）、同步 3 场活动到日历（部分失败，可重试）、
 * 自动跟进「山田千寻」提醒（已撤销）。
 */
import type {
  AgentLedgerEntry,
  AgentLedgerProvenance,
} from "./contract";
import type { AgentActionSourceReference } from "../contract";

export const AGENT_LEDGER_FIXTURE_SOURCE =
  "fixture:features/agent/ledger/fixtures.ts" as const;

const fixtureCollectedAt = "2026-07-23T21:30:00.000+09:00";

function ledgerSource(input: {
  type: AgentActionSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): AgentActionSourceReference {
  return {
    ...input,
    generatedBy: "mock-agent-action-rules",
  };
}

export const mockAgentLedgerProvenance: AgentLedgerProvenance = {
  source: AGENT_LEDGER_FIXTURE_SOURCE,
  sourceLabel: "Mock agent action ledger fixture",
  evidenceIds: [
    "evidence:ledger:event-material:ai-founder-dinner",
    "evidence:ledger:chat-summary:xuwei-intro-request",
    "evidence:ledger:calendar:demo-day",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-agent-ledger-only",
  generationMethod: "fixture",
  autonomousExecutionStarted: false,
  externalSideEffectExecuted: false,
  externalNetworkRequested: false,
  messageAutoSendExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
};

const sharedEntryFlags = {
  autonomousExecutionStarted: false,
  externalSideEffectExecuted: false,
  messageAutoSendExecuted: false,
} as const;

export const agentLedgerEntryFixtures: readonly AgentLedgerEntry[] = [
  {
    entryId: "ledger-followup-alex-chen",
    title: "跟进 Alex Chen — 3 项操作",
    contactName: "Alex Chen",
    organization: "Meridian AI",
    status: "awaiting_confirmation",
    whyNow: "活动结束 18 小时，是跟进的黄金窗口。你们当晚讨论了日本市场合作。",
    evidenceChips: [
      {
        kind: "event_material",
        label: "活动资料",
        evidenceId: "evidence:ledger:event-material:ai-founder-dinner",
      },
    ],
    operations: [
      {
        operationId: "op-alex-save-note",
        operationType: "save_meeting_note",
        title: "保存会面笔记",
        effectSummary: "把 AI Founder Dinner 的讨论要点写入 Alex Chen 的名片。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:save-note:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-alex-reminder",
        operationType: "create_followup_reminder",
        title: "创建「7 天后跟进」提醒",
        effectSummary: "在 7 天后生成一条跟进提醒。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:reminder-7d:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-alex-draft",
        operationType: "save_message_draft",
        title: "保存消息草稿",
        effectSummary: "消息只保存为草稿，不会自动发送。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "alex-chen:draft:2026-07-23",
        draftPreview:
          "Alex，很高兴昨天聊到日本市场。下周我把产品演示整理给你，方便的话约个时间细聊。",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T09:00:00.000+09:00",
    updatedAt: "2026-07-24T09:00:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "event_import",
        id: "source:event:ai-founder-dinner",
        label: "AI Founder Dinner",
        providerRecordId: "event-ai-founder-dinner",
      }),
    ],
    evidenceIds: ["evidence:ledger:event-material:ai-founder-dinner"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-reply-xuwei-intro",
    title: "回复徐薇的引荐请求",
    contactName: "徐薇 Xu Wei",
    organization: "Bamboo Ventures",
    status: "awaiting_confirmation",
    whyNow: "徐薇希望认识你在餐饮 SaaS 的联系人；需双方同意后才会起草引荐消息。",
    evidenceChips: [
      {
        kind: "chat_summary",
        label: "会话摘要",
        evidenceId: "evidence:ledger:chat-summary:xuwei-intro-request",
      },
    ],
    operations: [
      {
        operationId: "op-xuwei-intro-draft",
        operationType: "save_message_draft",
        title: "同意并生成引荐草稿",
        effectSummary: "起草一条引荐消息（仅存草稿），双方同意前不透露任何联系方式。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "xuwei:intro-draft:2026-07-24",
        draftPreview: "徐薇你好，我把你和餐饮 SaaS 方向的朋友对接一下，细节见后续消息。",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T08:48:00.000+09:00",
    updatedAt: "2026-07-24T08:48:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "chat_summary",
        id: "source:chat:xuwei-intro-request",
        label: "徐薇的引荐请求",
        providerRecordId: "chat-xuwei-intro-request",
      }),
    ],
    evidenceIds: ["evidence:ledger:chat-summary:xuwei-intro-request"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-brief-tomorrow-meeting",
    title: "生成明早会议简报",
    organization: "Demo Day",
    status: "executing",
    whyNow: "明早会议有 3 位与会者、2 个议题，Orbit 正在准备简报。",
    evidenceChips: [
      {
        kind: "calendar_signal",
        label: "日历",
        evidenceId: "evidence:ledger:calendar:demo-day",
      },
    ],
    operations: [
      {
        operationId: "op-brief-generate",
        operationType: "generate_meeting_brief",
        title: "生成会议简报",
        effectSummary: "汇总与会者背景与议题，生成会前简报。",
        selectedByDefault: true,
        status: "pending",
        idempotencyKey: "demo-day:brief:2026-07-24",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-24T08:30:00.000+09:00",
    updatedAt: "2026-07-24T08:31:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "calendar_signal",
        id: "source:calendar:demo-day",
        label: "Demo Day",
        providerRecordId: "calendar-demo-day",
      }),
    ],
    evidenceIds: ["evidence:ledger:calendar:demo-day"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-archive-six-contacts",
    title: "昨晚 6 位联系人归档",
    status: "completed",
    whyNow: "昨晚活动识别出 6 位联系人，已写入名片夹，待你复核。",
    evidenceChips: [
      {
        kind: "event_material",
        label: "活动资料",
        evidenceId: "evidence:ledger:event-material:ai-founder-dinner",
      },
    ],
    operations: [
      {
        operationId: "op-archive-contacts",
        operationType: "archive_contacts",
        title: "写入名片夹",
        effectSummary: "把 6 位联系人的名片草稿写入名片夹。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "ai-founder-dinner:archive:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: true,
    createdAt: "2026-07-24T08:12:00.000+09:00",
    updatedAt: "2026-07-24T08:12:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "event_import",
        id: "source:event:ai-founder-dinner",
        label: "AI Founder Dinner",
        providerRecordId: "event-ai-founder-dinner",
      }),
    ],
    evidenceIds: ["evidence:ledger:event-material:ai-founder-dinner"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-sync-three-events",
    title: "同步 3 场活动到日历",
    status: "partially_failed",
    whyNow: "2 场成功，1 场失败。成功项不会重复执行。",
    evidenceChips: [
      {
        kind: "calendar_signal",
        label: "日历",
        evidenceId: "evidence:ledger:calendar:demo-day",
      },
    ],
    operations: [
      {
        operationId: "op-sync-event-1",
        operationType: "sync_event_to_calendar",
        title: "同步 Demo Day",
        effectSummary: "把 Demo Day 写入日历。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "sync:demo-day:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-sync-event-2",
        operationType: "sync_event_to_calendar",
        title: "同步 AI Founder Dinner 复盘",
        effectSummary: "把复盘会写入日历。",
        selectedByDefault: true,
        status: "succeeded",
        idempotencyKey: "sync:dinner-review:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
      {
        operationId: "op-sync-event-3",
        operationType: "sync_event_to_calendar",
        title: "同步关西跨境商务对接会",
        effectSummary: "把对接会写入日历。",
        selectedByDefault: true,
        status: "failed",
        idempotencyKey: "sync:kansai-matchup:2026-07-23",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: true,
    createdAt: "2026-07-23T22:00:00.000+09:00",
    updatedAt: "2026-07-23T22:01:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "calendar_signal",
        id: "source:calendar:sync-batch",
        label: "日历同步",
        providerRecordId: "calendar-sync-batch",
      }),
    ],
    evidenceIds: ["evidence:ledger:calendar:demo-day"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
  {
    entryId: "ledger-auto-followup-yamada",
    title: "自动跟进「山田千寻」提醒",
    contactName: "山田千寻",
    status: "undone",
    whyNow: "被你撤销。",
    evidenceChips: [
      {
        kind: "contact_note",
        label: "联系人笔记",
        evidenceId: "evidence:ledger:contact-note:yamada",
      },
    ],
    operations: [
      {
        operationId: "op-yamada-reminder",
        operationType: "create_followup_reminder",
        title: "自动跟进提醒",
        effectSummary: "创建山田千寻的跟进提醒。",
        selectedByDefault: true,
        status: "undone",
        idempotencyKey: "yamada:reminder:2026-07-22",
        mockOutcome: "succeed",
        autoSendCapable: false,
      },
    ],
    undoable: false,
    createdAt: "2026-07-23T09:00:00.000+09:00",
    updatedAt: "2026-07-23T09:30:00.000+09:00",
    sourceRefs: [
      ledgerSource({
        type: "manual",
        id: "source:contact:yamada",
        label: "山田千寻",
        providerRecordId: "contact-yamada",
      }),
    ],
    evidenceIds: ["evidence:ledger:contact-note:yamada"],
    provenance: mockAgentLedgerProvenance,
    ...sharedEntryFlags,
  },
];
