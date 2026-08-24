export type EventOperationsGenerationStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed"
  | "published"
  | "superseded";

export interface EventOperationsMetricView {
  label: string;
  value: string;
}

export interface EventOperationsGateView {
  atLabel: string;
  key: string;
  label: string;
  stateLabel: string;
  tone: "active" | "neutral";
}

export interface EventOperationsGenerationView {
  action: "publish" | "retry" | null;
  actionLabel: string | null;
  errorLabel: string | null;
  generationId: string;
  progress: number;
  progressLabel: string;
  snapshotLabel: string;
  status: EventOperationsGenerationStatus;
  statusLabel: string;
  title: string;
}

export interface EventOperationsTableView {
  detail: string;
  title: string;
}

export interface EventOperationsRoundView {
  key: "roundOne" | "roundTwo";
  tables: EventOperationsTableView[];
  title: string;
}

export interface EventOperationsView {
  configurationSummary: string;
  contractValid: boolean;
  eventId: string;
  gates: EventOperationsGateView[];
  generations: EventOperationsGenerationView[];
  hasActiveGeneration: boolean;
  metrics: EventOperationsMetricView[];
  publishedLabel: string | null;
  rounds: EventOperationsRoundView[];
}

const statuses = ["queued", "running", "failed", "completed", "published", "superseded"] as const;
const statusLabels: Record<EventOperationsGenerationStatus, string> = {
  completed: "等待发布",
  failed: "生成失败",
  published: "已发布",
  queued: "排队中",
  running: "生成中",
  superseded: "已被取代"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isCount(value) && value > 0;
}

function isStatus(value: unknown): value is EventOperationsGenerationStatus {
  return typeof value === "string" && (statuses as readonly string[]).includes(value);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

interface ParsedConfiguration {
  checkInOpensAt: string;
  eventEndsAt: string;
  eventStartsAt: string;
  maxAttemptsPerTask: number;
  profileEditDeadlineAt: string;
  recommendationCount: number;
  registrationCutoffAt: string;
  resultsAvailableAt: string;
  roundOneStartsAt: string;
  roundTwoStartsAt: string;
  shardSize: number;
  tableSize: number;
}

function parseConfiguration(value: unknown): ParsedConfiguration | null {
  if (!isRecord(value)) return null;
  const times = ["checkInOpensAt", "eventEndsAt", "eventStartsAt", "profileEditDeadlineAt", "registrationCutoffAt", "resultsAvailableAt", "roundOneStartsAt", "roundTwoStartsAt"] as const;
  const numbers = ["maxAttemptsPerTask", "recommendationCount", "shardSize", "tableSize"] as const;
  if (!times.every((key) => isString(value[key])) || !numbers.every((key) => isPositiveInteger(value[key]))) return null;
  return value as unknown as ParsedConfiguration;
}

interface ParsedGeneration {
  eventId: string;
  errorCode: string | null;
  errorMessage: string | null;
  generationId: string;
  participantCount: number;
  snapshotHash: string;
  status: EventOperationsGenerationStatus;
}

function parseGeneration(value: unknown): ParsedGeneration | null {
  if (
    !isRecord(value) ||
    !isString(value.eventId) ||
    !isString(value.generationId) ||
    !isStatus(value.status) ||
    !(value.errorCode === null || typeof value.errorCode === "string") ||
    !(value.errorMessage === null || typeof value.errorMessage === "string") ||
    !isRecord(value.snapshot) ||
    !isString(value.snapshot.hash) ||
    !Array.isArray(value.snapshot.participants)
  ) return null;
  return {
    eventId: value.eventId,
    errorCode: value.errorCode,
    errorMessage: value.errorMessage,
    generationId: value.generationId,
    participantCount: value.snapshot.participants.length,
    snapshotHash: value.snapshot.hash,
    status: value.status
  };
}

function generationToView(value: unknown): EventOperationsGenerationView | null {
  if (!isRecord(value) || !isRecord(value.progress)) return null;
  const generation = parseGeneration(value.generation);
  const { completedTasks, failedTasks, percent, totalTasks } = value.progress;
  if (!generation || !isCount(completedTasks) || !isCount(failedTasks) || !isCount(percent) || percent > 100 || !isCount(totalTasks)) return null;
  const action = generation.status === "failed" ? "retry" : generation.status === "completed" ? "publish" : null;
  const shortId = generation.generationId.split(":").at(-1) ?? generation.generationId;
  return {
    action,
    actionLabel: action === "retry" ? "重试失败分片" : action === "publish" ? "确认发布" : null,
    errorLabel: generation.errorMessage ? `${generation.errorCode ?? "生成失败"} · ${generation.errorMessage}` : null,
    generationId: generation.generationId,
    progress: percent,
    progressLabel: `${completedTasks}/${totalTasks} 已完成 · ${failedTasks} 失败`,
    snapshotLabel: `快照 ${generation.snapshotHash.slice(0, 12)} · ${generation.participantCount} 位参会者`,
    status: generation.status,
    statusLabel: statusLabels[generation.status],
    title: `生成 #${shortId.slice(0, 8)}`
  };
}

function tableToView(value: unknown): EventOperationsTableView | null {
  if (!isRecord(value) || !isPositiveInteger(value.tableNumber) || !isString(value.theme) || typeof value.rationale !== "string" || !Array.isArray(value.members)) return null;
  const membersValid = value.members.every((member) => isRecord(member) && isString(member.participantId) && isString(member.seat));
  if (!membersValid) return null;
  return {
    detail: `${value.members.length} 席${value.rationale.trim() ? ` · ${value.rationale.trim()}` : ""}`,
    title: `${value.tableNumber} 号桌 · ${value.theme.trim()}`
  };
}

function parseRounds(value: unknown): { contractValid: boolean; rounds: EventOperationsRoundView[] } {
  if (!isRecord(value) || !isRecord(value.grouping) || !Array.isArray(value.grouping.roundOne) || !Array.isArray(value.grouping.roundTwo)) return { contractValid: false, rounds: [] };
  const sources = [
    { key: "roundOne" as const, source: value.grouping.roundOne, title: "第一轮 · 互补分桌" },
    { key: "roundTwo" as const, source: value.grouping.roundTwo, title: "第二轮 · 话题桌" }
  ];
  let contractValid = true;
  const rounds = sources.map(({ key, source, title }) => {
    const tables = source.map(tableToView);
    if (tables.some((table) => table === null)) contractValid = false;
    return { key, tables: tables.filter((table): table is EventOperationsTableView => table !== null), title };
  });
  return { contractValid, rounds };
}

function gateState(nowMs: number, start: string, end?: string): { label: string; tone: "active" | "neutral" } {
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : Number.NaN;
  if (Number.isFinite(endMs) && nowMs >= startMs && nowMs <= endMs) return { label: "进行中", tone: "active" };
  if (nowMs < startMs) return { label: "未开始", tone: "neutral" };
  return { label: "已到达", tone: "active" };
}

function configurationToGates(configuration: ParsedConfiguration, now: Date): EventOperationsGateView[] {
  const definitions = [
    { at: configuration.profileEditDeadlineAt, key: "profile", label: "画像编辑截止" },
    { at: configuration.registrationCutoffAt, key: "registration", label: "报名截止" },
    { at: configuration.checkInOpensAt, end: configuration.eventEndsAt, key: "checkIn", label: "签到窗口" },
    { at: configuration.resultsAvailableAt, key: "results", label: "结果开放" },
    { at: configuration.eventStartsAt, end: configuration.eventEndsAt, key: "event", label: "活动时间" },
    { at: configuration.roundOneStartsAt, key: "roundOne", label: "第一轮开始" },
    { at: configuration.roundTwoStartsAt, key: "roundTwo", label: "第二轮开始" }
  ];
  return definitions.map((gate) => {
    const state = gateState(now.getTime(), gate.at, gate.end);
    return { atLabel: gate.end ? `${formatTime(gate.at)} - ${formatTime(gate.end)}` : formatTime(gate.at), key: gate.key, label: gate.label, stateLabel: state.label, tone: state.tone };
  });
}

export function eventOperationsToView(payload: unknown, now = new Date()): EventOperationsView {
  const empty: EventOperationsView = { configurationSummary: "运营规则待读取", contractValid: false, eventId: "", gates: [], generations: [], hasActiveGeneration: false, metrics: [], publishedLabel: null, rounds: [] };
  if (!isRecord(payload) || !isString(payload.eventId) || !isRecord(payload.metrics)) return empty;
  const metricValues = [payload.metrics.participantCount, payload.metrics.checkedIn, payload.metrics.contactRequests, payload.metrics.acceptedContactRequests];
  const configuration = parseConfiguration(payload.configuration);
  if (!metricValues.every(isCount) || !configuration || !Array.isArray(payload.generations)) return empty;
  const generations = payload.generations.map(generationToView);
  let contractValid = generations.every((generation) => generation !== null);
  let rounds: EventOperationsRoundView[] = [];
  let publishedLabel: string | null = null;
  if (payload.publishedResult !== null) {
    const parsed = parseRounds(payload.publishedResult);
    contractValid = contractValid && parsed.contractValid;
    rounds = parsed.rounds;
    if (isRecord(payload.publishedResult) && isString(payload.publishedResult.generationId)) publishedLabel = `已发布 ${payload.publishedResult.generationId.split(":").at(-1)}`;
    else contractValid = false;
  }
  const validGenerations = generations.filter((generation): generation is EventOperationsGenerationView => generation !== null);
  return {
    configurationSummary: `每人 ${configuration.recommendationCount} 个推荐 · 每桌 ${configuration.tableSize} 人 · 分片 ${configuration.shardSize}`,
    contractValid,
    eventId: payload.eventId,
    gates: configurationToGates(configuration, now),
    generations: validGenerations,
    hasActiveGeneration: validGenerations.some((generation) => generation.status === "queued" || generation.status === "running"),
    metrics: ["已报名", "已签到", "名片申请", "已同意"].map((label, index) => ({ label, value: String(metricValues[index]) })),
    publishedLabel,
    rounds
  };
}

export function eventOperationsGenerationMutationMatches(payload: unknown, expected: { eventId: string; generationId?: string; statuses: readonly EventOperationsGenerationStatus[] }): boolean {
  const generation = parseGeneration(payload);
  return Boolean(generation && generation.eventId === expected.eventId && (expected.generationId === undefined || generation.generationId === expected.generationId) && expected.statuses.includes(generation.status));
}

export function eventOperationsPublishedResultMatches(payload: unknown, eventId: string, generationId: string): boolean {
  if (!isRecord(payload) || payload.eventId !== eventId || payload.generationId !== generationId) return false;
  return parseRounds(payload).contractValid;
}
