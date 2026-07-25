import type {
  AgentLedgerEntryContract,
  AgentLedgerEntryStatusContract,
  AgentLedgerListPayloadContract,
  AgentLedgerTransitionContract
} from "../api/agent-ledger-contract";

export type AgentLedgerSurfaceMode = "all" | "today";
export type AgentLedgerTransitionTone = "primary" | "secondary";

export interface AgentLedgerTransitionView {
  label: string;
  tone: AgentLedgerTransitionTone;
  transition: AgentLedgerTransitionContract;
}

export interface AgentLedgerOperationView {
  effectSummary: string;
  id: string;
  idempotencyKey: string;
  selectedByDefault: boolean;
  statusLabel: string;
  title: string;
}

export interface AgentLedgerEntryView {
  contactLine: string;
  evidenceLabels: readonly string[];
  id: string;
  operations: readonly AgentLedgerOperationView[];
  preview: string;
  riskLabel: string;
  runLabel: string;
  sourceLabel: string;
  status: AgentLedgerEntryStatusContract;
  statusLabel: string;
  title: string;
  transitions: readonly AgentLedgerTransitionView[];
  updatedLabel: string;
  whyNow: string;
  workflowLabel: string;
}

export interface AgentLedgerSectionView {
  entries: readonly AgentLedgerEntryView[];
  id: "all" | "decide" | "prepared" | "recent";
  title: string;
}

export interface AgentLedgerSurfaceView {
  emptyMessage: string;
  emptyTitle: string;
  metrics: readonly string[];
  nextAction: string;
  sections: readonly AgentLedgerSectionView[];
  summary: string;
  title: string;
}

const STATUS_LABELS: Record<AgentLedgerEntryStatusContract, string> = {
  approved: "已确认",
  awaiting_confirmation: "等待确认",
  canceled: "已取消",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  rejected: "已忽略",
  undone: "已撤销"
};

const OPERATION_STATUS_LABELS: Record<
  AgentLedgerOperationContractStatus,
  string
> = {
  failed: "失败",
  pending: "待处理",
  skipped: "已跳过",
  succeeded: "成功",
  undone: "已撤销"
};

type AgentLedgerOperationContractStatus =
  AgentLedgerEntryContract["operations"][number]["status"];

const RISK_LABELS: Record<
  NonNullable<AgentLedgerEntryContract["riskLevel"]>,
  string
> = {
  draft: "草稿",
  external: "外部写入",
  read: "只读",
  write: "系统内写入"
};

const TRANSITION_VIEWS: Record<
  AgentLedgerTransitionContract,
  AgentLedgerTransitionView
> = {
  cancel: { label: "取消执行", tone: "secondary", transition: "cancel" },
  confirm: { label: "确认执行", tone: "primary", transition: "confirm" },
  defer: { label: "稍后处理", tone: "secondary", transition: "defer" },
  reject: { label: "忽略", tone: "secondary", transition: "reject" },
  retry: { label: "重试失败项", tone: "primary", transition: "retry" },
  undo: { label: "撤销", tone: "secondary", transition: "undo" }
};

function allowedTransitions(
  entry: AgentLedgerEntryContract
): readonly AgentLedgerTransitionView[] {
  switch (entry.status) {
    case "awaiting_confirmation":
      return [
        TRANSITION_VIEWS.confirm,
        TRANSITION_VIEWS.defer,
        TRANSITION_VIEWS.reject
      ];
    case "deferred":
      return [TRANSITION_VIEWS.confirm, TRANSITION_VIEWS.reject];
    case "approved":
      return [TRANSITION_VIEWS.cancel];
    case "completed":
      return entry.undoable ? [TRANSITION_VIEWS.undo] : [];
    case "partially_failed":
      return entry.undoable
        ? [TRANSITION_VIEWS.retry, TRANSITION_VIEWS.undo]
        : [TRANSITION_VIEWS.retry];
    case "failed":
      return [TRANSITION_VIEWS.retry];
    case "canceled":
    case "executing":
    case "rejected":
    case "undone":
      return [];
  }
}

function updatedLabel(value: string): string {
  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function contactLine(entry: AgentLedgerEntryContract): string {
  return [entry.contactName, entry.organization].filter(Boolean).join(" · ");
}

function entryToView(
  entry: AgentLedgerEntryContract
): AgentLedgerEntryView {
  return {
    contactLine: contactLine(entry),
    evidenceLabels: entry.evidenceChips.map(
      (evidence) => `${evidence.label} · ${evidence.evidenceId}`
    ),
    id: entry.entryId,
    operations: entry.operations.map((operation) => ({
      effectSummary: operation.effectSummary,
      id: operation.operationId,
      idempotencyKey: operation.idempotencyKey,
      selectedByDefault:
        operation.selectedByDefault && operation.status === "pending",
      statusLabel: OPERATION_STATUS_LABELS[operation.status],
      title: operation.title
    })),
    preview: entry.preview ?? "",
    riskLabel: entry.riskLevel ? RISK_LABELS[entry.riskLevel] : "系统内写入",
    runLabel: entry.runId ?? "—",
    sourceLabel:
      entry.sourceRefs.map((source) => source.label).join("、") || "Orbit",
    status: entry.status,
    statusLabel: STATUS_LABELS[entry.status],
    title: entry.title,
    transitions: allowedTransitions(entry),
    updatedLabel: updatedLabel(entry.updatedAt),
    whyNow: entry.whyNow,
    workflowLabel: entry.workflowKey ?? "—"
  };
}

function todaySection(
  status: AgentLedgerEntryStatusContract
): "decide" | "prepared" | "recent" | null {
  switch (status) {
    case "awaiting_confirmation":
      return "decide";
    case "approved":
    case "executing":
      return "prepared";
    case "deferred":
      return null;
    case "canceled":
    case "completed":
    case "failed":
    case "partially_failed":
    case "rejected":
    case "undone":
      return "recent";
  }
}

function todaySections(
  entries: readonly AgentLedgerEntryView[]
): readonly AgentLedgerSectionView[] {
  const definitions = [
    { id: "decide", title: "需要你决定" },
    { id: "prepared", title: "Orbit 已准备" },
    { id: "recent", title: "最近完成" }
  ] as const;

  return definitions.flatMap((definition) => {
    const matching = entries.filter(
      (entry) => todaySection(entry.status) === definition.id
    );

    return matching.length > 0
      ? [{ ...definition, entries: matching }]
      : [];
  });
}

export function agentLedgerToSurfaceView(
  payload: AgentLedgerListPayloadContract,
  mode: AgentLedgerSurfaceMode
): AgentLedgerSurfaceView {
  const entries = payload.entries.map(entryToView);
  const decideCount = entries.filter(
    (entry) => entry.status === "awaiting_confirmation"
  ).length;
  const completedCount = entries.filter(
    (entry) => entry.status === "completed"
  ).length;
  const failedCount = entries.filter(
    (entry) =>
      entry.status === "failed" || entry.status === "partially_failed"
  ).length;
  const sections =
    mode === "today"
      ? todaySections(entries)
      : entries.length > 0
        ? [{ entries, id: "all" as const, title: "全部操作" }]
        : [];

  return {
    emptyMessage:
      mode === "today"
        ? "Orbit 会在出现新的跟进窗口时，把需要决定的操作放到这里。"
        : "Agent 执行或准备的每一次操作都会记录在这里。",
    emptyTitle:
      mode === "today" ? "今天没有需要处理的操作" : "操作账本还是空的",
    metrics: [
      `${entries.length} 条操作`,
      `${decideCount} 条等待确认`,
      `${completedCount} 条已完成`,
      failedCount > 0 ? `${failedCount} 条需处理` : "当前无失败"
    ],
    nextAction: payload.nextAction,
    sections,
    summary:
      mode === "today"
        ? `${decideCount} 件事需要你决定；状态与 All Actions 实时一致。`
        : payload.summary,
    title: mode === "today" ? "Today" : "All Actions"
  };
}
