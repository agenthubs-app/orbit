import type { SyncRecord } from "../../api/contract/sync";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";

const MAX_PARALLEL_UPLOADS = 4;
const MAX_ATTEMPTS_PER_ROW_PER_ROUND = 5;
const MAX_ROUND_MS = 30_000;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 60_000;
const RETRY_AFTER_CAP_MS = 5 * 60_000;

export interface OutboxUploadResponse {
  status: number;
  record?: SyncRecord;
  snapshot?: unknown;
  retryAfterMs?: number | null;
}

export interface OutboxUploadRepository {
  listQueuedMutations(query: { workspaceId: string }): Promise<LocalSyncQueuedMutation[]>;
  beginOutboxMutationAttempt(input: { mutationId: string; attemptedAt: string }): Promise<LocalSyncQueuedMutation | null>;
  acknowledgeOutboxMutation(input: { mutationId: string; record: SyncRecord; localId?: string; acknowledgedAt: string }): Promise<void>;
  markOutboxMutationFailure(input: {
    mutationId: string;
    state: "queued" | "conflict" | "failed";
    nextRetryAt: string | null;
    errorCode: string;
    serverSnapshot?: unknown;
  }): Promise<void>;
}

export interface OutboxUploadResult {
  status: "complete" | "offline" | "unauthorized" | "time_budget" | "cancelled";
  sent: number;
  acknowledged: number;
  conflicts: number;
  failed: number;
  retrying: number;
}

export function createOutboxUploader(input: {
  repository: OutboxUploadRepository;
  workspaceId: string;
  confirmOnline: () => Promise<boolean>;
  uploadOne: (mutation: LocalSyncQueuedMutation, signal: AbortSignal) => Promise<OutboxUploadResponse>;
  pull: () => Promise<void>;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  const now = input.now ?? Date.now;
  const random = input.random ?? Math.random;
  const sleep = input.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  let active: Promise<OutboxUploadResult> | null = null;
  let activeController: AbortController | null = null;

  function run(): Promise<OutboxUploadResult> {
    if (active) return active;
    activeController = new AbortController();
    active = runRound(activeController).finally(() => { active = null; activeController = null; });
    return active;
  }

  async function runRound(controller: AbortController): Promise<OutboxUploadResult> {
    const result: OutboxUploadResult = { status: "complete", sent: 0, acknowledged: 0, conflicts: 0, failed: 0, retrying: 0 };
    const deadline = now() + MAX_ROUND_MS;
    let wallDeadlineReached = false;
    const timer = setTimeout(() => { wallDeadlineReached = true; controller.abort(); }, MAX_ROUND_MS);
    let unauthorized = false;
    const pausedDomains = new Set<string>();
    const succeeded = new Set<string>();
    const terminal = new Set<string>();
    const permanentFailures = new Set<string>();

    try {
    if (!(await input.confirmOnline())) return { ...result, status: "offline" };
    while (!unauthorized && !controller.signal.aborted && now() < deadline) {
      const rows = await input.repository.listQueuedMutations({ workspaceId: input.workspaceId });
      if (rows.length === 0) break;
      const ready = rows.filter(row => {
        if (row.state !== "queued" || pausedDomains.has(row.domainId) || terminal.has(row.mutationId)) return false;
        if (row.nextRetryAt && Date.parse(row.nextRetryAt) > now()) return false;
        if (row.dependsOn && !succeeded.has(row.dependsOn)) return false;
        const earlierSameRecord = rows.some(other => other.mutationId !== row.mutationId &&
          other.workspaceId === row.workspaceId && other.domainId === row.domainId && other.id === row.id &&
          compareQueueOrder(other, row) < 0);
        return !earlierSameRecord;
      });

      // A permanent parent failure must not leave dependent edits eligible forever.
      for (const row of rows) {
        if (row.dependsOn && permanentFailures.has(row.dependsOn) && row.state === "queued") {
          await input.repository.markOutboxMutationFailure({ mutationId: row.mutationId, state: "failed", nextRetryAt: null, errorCode: "DEPENDENCY_FAILED" });
          terminal.add(row.mutationId);
          result.failed += 1;
        }
      }
      if (ready.length === 0) break;
      const wave = ready.slice(0, MAX_PARALLEL_UPLOADS);
      await Promise.all(wave.map(async queued => {
        const outcome = await uploadRow(queued, deadline, controller.signal);
        result.sent += outcome.sent;
        result.acknowledged += outcome.acknowledged;
        result.conflicts += outcome.conflicts;
        result.failed += outcome.failed;
        result.retrying += outcome.retrying;
        if (outcome.success) succeeded.add(queued.mutationId);
        if (outcome.terminal) terminal.add(queued.mutationId);
        if (outcome.permanentFailure) permanentFailures.add(queued.mutationId);
        if (outcome.pauseDomain) pausedDomains.add(queued.domainId);
        if (outcome.unauthorized) {
          unauthorized = true;
          controller.abort();
        }
      }));
      if (controller.signal.aborted || now() >= deadline) break;
    }

    if (unauthorized) return { ...result, status: "unauthorized" };
    if (wallDeadlineReached || now() >= deadline) return { ...result, status: "time_budget" };
    if (controller.signal.aborted) return { ...result, status: "cancelled" };
    await input.pull();
    return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function uploadRow(row: LocalSyncQueuedMutation, deadline: number, signal: AbortSignal) {
    const counts = { sent: 0, acknowledged: 0, conflicts: 0, failed: 0, retrying: 0 };
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ROW_PER_ROUND && !signal.aborted && now() < deadline; attempt += 1) {
      const mutation = await input.repository.beginOutboxMutationAttempt({ mutationId: row.mutationId, attemptedAt: new Date(now()).toISOString() });
      if (!mutation) return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: false, unauthorized: false };
      let response: OutboxUploadResponse;
      try {
        counts.sent += 1;
        response = await input.uploadOne(mutation, signal);
      } catch {
        if (signal.aborted) {
          await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "queued", nextRetryAt: null, errorCode: "UPLOAD_ABORTED" });
          return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: false, unauthorized: false };
        }
        response = { status: 0 };
      }
      if (response.status >= 200 && response.status < 300) {
        if (!response.record) {
          response = { status: 0 };
        } else {
          await input.repository.acknowledgeOutboxMutation({
            mutationId: mutation.mutationId,
            record: response.record,
            ...(mutation.id.startsWith("local:") ? { localId: mutation.id } : {}),
            acknowledgedAt: new Date(now()).toISOString(),
          });
          counts.acknowledged += 1;
          return { ...counts, success: true, terminal: true, permanentFailure: false, pauseDomain: false, unauthorized: false };
        }
      }
      if (response.status === 401) {
        await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "queued", nextRetryAt: null, errorCode: "AUTH_REQUIRED" });
        return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: false, unauthorized: true };
      }
      if (response.status === 403) {
        await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "queued", nextRetryAt: null, errorCode: "DOMAIN_FORBIDDEN" });
        return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: true, unauthorized: false };
      }
      if (response.status === 409 || response.status === 404) {
        await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "conflict", nextRetryAt: null, errorCode: response.status === 409 ? "CONFLICT" : "TARGET_NOT_FOUND", serverSnapshot: response.snapshot });
        counts.conflicts += 1;
        return { ...counts, success: false, terminal: true, permanentFailure: false, pauseDomain: false, unauthorized: false };
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "failed", nextRetryAt: null, errorCode: response.status === 400 || response.status === 422 ? "INVALID_REQUEST" : `HTTP_${response.status}` });
        counts.failed += 1;
        return { ...counts, success: false, terminal: true, permanentFailure: true, pauseDomain: false, unauthorized: false };
      }

      const retryAtMs = retryDelayMs(mutation.attemptCount, response.retryAfterMs, random);
      const nextRetryAt = new Date(now() + retryAtMs).toISOString();
      await input.repository.markOutboxMutationFailure({ mutationId: mutation.mutationId, state: "queued", nextRetryAt, errorCode: response.status === 0 ? "NETWORK_ERROR" : response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}` });
      counts.retrying += 1;
      if (attempt + 1 >= MAX_ATTEMPTS_PER_ROW_PER_ROUND || now() + retryAtMs >= deadline) {
        return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: false, unauthorized: false };
      }
      await sleep(retryAtMs);
    }
    return { ...counts, success: false, terminal: false, permanentFailure: false, pauseDomain: false, unauthorized: false };
  }

  return {
    run,
    cancel() { activeController?.abort(); },
  };
}

function retryDelayMs(attemptCount: number, retryAfterMs: number | null | undefined, random: () => number): number {
  if (retryAfterMs !== null && retryAfterMs !== undefined) return Math.min(RETRY_AFTER_CAP_MS, Math.max(0, retryAfterMs));
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * (2 ** Math.max(0, attemptCount)));
  return Math.floor(Math.max(0, Math.min(1, random())) * ceiling);
}

function compareQueueOrder(left: LocalSyncQueuedMutation, right: LocalSyncQueuedMutation): number {
  return left.createdAt.localeCompare(right.createdAt) || left.mutationId.localeCompare(right.mutationId);
}
