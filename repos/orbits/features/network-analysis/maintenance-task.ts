/**
 * W0048a：`network-snapshot` 维护任务（每日 cron 与 600 s 心跳的每一轮都执行）。
 *
 * 1. 领取到期的 `network_analysis_jobs`（每轮最多 10 行）：snapshot 行交给 worker（重新判定 → 后台池预留一次 →
 *    生成 → 结算）；enrichment 行（后台池满顺延的补全）重跑补全，仍不够则只留剩余 id 再顺延到次日 00:00 东京。
 * 2. memo 提取有界补扫（W0046 交接）：没有提取记录、disabled、到期 deferred、认领过期的 memo，每轮至多 10 条，
 *    逐条重跑幂等作业（计入后台池；池满时作业自己记 deferred）。
 * 表还没迁移（42P01）时整轮 skipped，不报警。
 */
import { randomUUID } from "node:crypto";

import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { MemoExtractionJobInput } from "../contacts/memo-extraction/job";
import { nextTokyoMidnight } from "../ai-quota/constants";
import type { NetworkAnalysisRuntime } from "./runtime";
import { runEnrichmentPass, type NewContactLayersDeps } from "./new-contact-layers";
import { SNAPSHOT_JOB_LEASE_MS } from "./service";
import type { SnapshotJob } from "./repository";

export const NETWORK_SNAPSHOT_MAINTENANCE_TASK = "network-snapshot";
export const NETWORK_SNAPSHOT_MAINTENANCE_LIMIT = 10;

export interface NetworkSnapshotMaintenanceDeps {
  runtime: NetworkAnalysisRuntime;
  layers: NewContactLayersDeps;
  /** 补扫候选（只读）；返回空表示无需补扫或未配置 provider。 */
  listMemoCandidates?: (now: Date) => Promise<MemoExtractionJobInput[]>;
  runMemoExtraction?: (job: MemoExtractionJobInput) => Promise<unknown>;
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export async function processEnrichmentJob(deps: NetworkSnapshotMaintenanceDeps, job: SnapshotJob, owner: string, now: Date): Promise<"done" | "deferred"> {
  let deferred: { ids: readonly string[]; notBefore: string } | null = null;
  const result = await runEnrichmentPass(
    { actorId: job.actorId, budget: "background", contactIds: job.contactIds, now, sourceKey: job.sourceKey ?? `deferred:${job.actorId}` },
    {
      ...deps.layers,
      // 仍持有租约：只留剩余 id 并改回 deferred，而不是并入（避免把已处理的人再带回来）。
      deferEnrichment: async (_actorId, contactIds, _sourceKey, notBefore) => {
        deferred = { ids: contactIds, notBefore };
      },
    },
  );
  if (result.enrichment === "deferred" && deferred) {
    const pending = deferred as { ids: readonly string[]; notBefore: string };
    await deps.runtime.repository.rescheduleEnrichment(job.actorId, owner, pending.ids, pending.notBefore || nextTokyoMidnight(now));
    return "deferred";
  }
  await deps.runtime.repository.deleteJob(job.actorId, "enrichment", owner);
  if (result.writtenContacts > 0) await deps.layers.refreshSnapshot(job.actorId);
  return "done";
}

export function createNetworkSnapshotMaintenanceTask(input: {
  resolve: () => NetworkSnapshotMaintenanceDeps | null;
  limit?: number;
}): MaintenanceTask {
  return {
    name: NETWORK_SNAPSHOT_MAINTENANCE_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const owner = `network-snapshot-maintenance:${randomUUID()}`;
      let jobs: SnapshotJob[];
      try {
        jobs = await deps.runtime.repository.claimDueJobs(owner, now(), SNAPSHOT_JOB_LEASE_MS, input.limit ?? NETWORK_SNAPSHOT_MAINTENANCE_LIMIT);
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
      const summary = { deferred: 0, enrichment: 0, failed: 0, memoRescanned: 0, snapshots: 0 };
      for (const job of jobs) {
        try {
          if (job.kind === "snapshot") {
            const outcome = await deps.runtime.service.processClaimedJob(job, owner);
            if (outcome.status === "succeeded") summary.snapshots += 1;
            else if (outcome.status === "deferred") summary.deferred += 1;
            else if (outcome.status === "failed") summary.failed += 1;
          } else {
            const outcome = await processEnrichmentJob(deps, job, owner, now());
            if (outcome === "deferred") summary.deferred += 1;
            else summary.enrichment += 1;
          }
        } catch (error) {
          summary.failed += 1;
          console.error(JSON.stringify({ actorId: job.actorId, error: error instanceof Error ? error.name : "unknown", event: "network_snapshot_job_failed", kind: job.kind }));
        }
      }
      if (deps.listMemoCandidates && deps.runMemoExtraction && Date.now() < deadline) {
        const candidates = await deps.listMemoCandidates(now());
        for (const candidate of candidates) {
          if (Date.now() >= deadline) break;
          await deps.runMemoExtraction(candidate);
          summary.memoRescanned += 1;
        }
      }
      return summary;
    },
  };
}
