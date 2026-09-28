/**
 * W0011：iOrbit 今日要事「确认 N 张新名片」的只读数据源。
 *
 * 读本机「进行中批次」登记表（`listActiveBatches`，localStorage 里的批次 id），对每一批
 * 只发 GET 批次详情（与 `fetchBatchDetail` 同一接口），按与全站胶囊相同的口径数出还要人看的卡。**不运行 `useCardBatch`**：
 * 名片状态机（上传续传、识别轮询、自动导入）在 /app/agent 上只由全站 `CardBatchHost` 运行一份，
 * 这里若再挂一份就会重复上传 / 自动导入。
 *
 * 刷新时机：`orbit-card-batches` 事件（登记表增删、宿主状态机里批次状态或待确认数变化）
 * 与跨标签页的 `storage` 事件。登记表只在本机：换设备看不到这台浏览器上传中的批次。
 * W0021：只读 `?view=cards`（分组与状态列）；连续事件合并；宿主广播的状态与已读到的一致时不重读。
 * 读取状态（pending / ready / unavailable）同时登记到 card-batch-store，全站宿主据此决定
 * 在 /app/agent 是否隐藏待确认胶囊。
 */
"use client";

import { useEffect, useState } from "react";

import type { IngestBatchCardStates } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { cardReviewQueue, parseStage, type CardBatchLedger } from "../../contacts/card-batch-0918/card-batch-model";
import {
  cardBatchChangeDetail,
  listActiveBatches,
  publishPendingCardsReaderState,
  readCardBatchLedger,
} from "../../contacts/card-batch-0918/card-batch-store";
import { INGEST_V2_API_BASE } from "../../contacts/ingest-v2/ingest-v2-client";
import { groupIngestItemsByCardId } from "../../contacts/ingest-v2/ingest-v2-route-view-model";
import { sharedRead } from "../../orbit-shared-read";
import { useSharedReadAccount } from "../../orbit-shared-read-account";

export interface PendingCardBatch {
  batchId: string;
  /** 批次创建时间（服务端 `batch.createdAt`），今日要事的依据行用它。 */
  createdAt: string;
  pending: number;
}

/**
 * pending：第一次读取还没回来；ready：每一批都读到了（或已不存在）；unavailable：至少一批读不到
 * （5xx / 网络错误 / 响应损坏）——`batches` 里仍有读到的那些，但首页不能据此给出「没有要紧的事」。
 */
export type PendingCardsStatus = "pending" | "ready" | "unavailable";

export interface PendingCardsState {
  batches: readonly PendingCardBatch[];
  status: PendingCardsStatus;
}

/** 批次的分组与状态列（W0021 `?view=cards`；完整详情是它的超集，也可以传进来）。 */
export type PendingCardsBatchRead = Pick<IngestBatchCardStates, "batch" | "items">;

function reviewQueue(detail: PendingCardsBatchRead, ledger: CardBatchLedger) {
  const cards = groupIngestItemsByCardId(detail.items);
  return { cards, queue: cardReviewQueue(cards, ledger) };
}

/**
 * 一批里还要人看的卡数，与全站胶囊「N 张名片待你确认」同一口径（`cardReviewQueue`）：
 * 排除已确认、已跳过、这次自动导入的，以及本机账本里「稍后处理」的卡。
 * 识别中与已取消 / 过期的批次记 0——那时宿主显示的是解析进度。
 */
export function countPendingCards(detail: PendingCardsBatchRead, ledger: CardBatchLedger): number {
  const status = detail.batch.status;
  if (parseStage(status) !== "review" || status === "cancelled" || status === "expired") return 0;
  return reviewQueue(detail, ledger).queue.pending.length;
}

/** 与宿主广播的 `CardBatchChangeDetail` 同一口径的签名（状态 | 待确认数（不按阶段归零）| 全部确认的卡数）。 */
function hostSignature(detail: PendingCardsBatchRead, ledger: CardBatchLedger): string {
  const { cards, queue } = reviewQueue(detail, ledger);
  return `${detail.batch.status}|${queue.pending.length}|${cards.filter((card) => card.allConfirmed).length}`;
}

type BatchRead = { kind: "gone" } | { kind: "failed" } | { kind: "ok"; detail: PendingCardsBatchRead };

// 只发 GET（`?view=cards`，只含分组与状态列）。要区分「批次已不存在」（404，宿主随后会把它移出
// 登记表）和「暂时读不到」（其余错误），后者不能被当成没有待确认。
// W0021：同账号同批次正在进行的读取共享一个请求（`sharedRead`，key 含账号与批次 id）。
function readBatch(batchId: string): Promise<BatchRead> {
  return sharedRead(`ingest-v2/batches/${batchId}?view=cards`, async (signal) => {
    try {
      const response = await fetch(`${INGEST_V2_API_BASE}/${encodeURIComponent(batchId)}?view=cards`, { signal });
      if (response.status === 404) return { kind: "gone" } as const;
      if (!response.ok) return { kind: "failed" } as const;
      const body = (await response.json()) as { data?: PendingCardsBatchRead };
      return body.data?.batch && Array.isArray(body.data.items) ? ({ detail: body.data, kind: "ok" } as const) : ({ kind: "failed" } as const);
    } catch {
      return { kind: "failed" } as const;
    }
  });
}

interface BatchOutcome {
  read: BatchRead;
  /** 读到时与宿主广播同口径的签名；读不到为 null。 */
  signature: string | null;
}

function toState(ids: readonly string[], outcomes: ReadonlyMap<string, BatchOutcome>): PendingCardsState {
  const batches: PendingCardBatch[] = [];
  let failed = false;
  for (const batchId of ids) {
    const read = outcomes.get(batchId)?.read;
    if (!read || read.kind === "failed") failed = true;
    if (!read || read.kind !== "ok") continue;
    const pending = countPendingCards(read.detail, readCardBatchLedger(batchId));
    if (pending > 0) batches.push({ batchId, createdAt: read.detail.batch.createdAt, pending });
  }
  return { batches, status: failed ? "unavailable" : "ready" };
}

async function readOutcome(batchId: string): Promise<BatchOutcome> {
  const read = await readBatch(batchId);
  return { read, signature: read.kind === "ok" ? hostSignature(read.detail, readCardBatchLedger(batchId)) : null };
}

/** 按批次读取待确认数，最新的批次在前（每批一次 GET）。 */
export async function readPendingCardBatches(): Promise<PendingCardsState> {
  const ids = [...listActiveBatches()].reverse();
  const outcomes = new Map(await Promise.all(ids.map(async (batchId) => [batchId, await readOutcome(batchId)] as const)));
  return toState(ids, outcomes);
}

const DISABLED: PendingCardsState = { batches: [], status: "ready" };
const LOADING: PendingCardsState = { batches: [], status: "pending" };
/** 连续的批次事件在这段时间内合并成一次读取。 */
export const PENDING_CARDS_COALESCE_MS = 150;

/**
 * `enabled` 为 false（示例模式）时不读 localStorage、不发请求，恒为「已就绪、没有待确认」。
 * 启用时把读取状态登记给全站宿主（card-batch-store）：读取失败或卸载后，宿主在 /app/agent
 * 照常显示待确认胶囊作为兜底。
 *
 * W0021 读取次数：冷启动每个进行中批次读一次；之后
 * - 宿主广播带状态的事件（`CardBatchChangeDetail`）：只有这一批读到的状态／计数与宿主不同才重读这一批；
 * - 不带状态的事件（登记表增删、跨标签页 `storage`）：重读登记表里的全部批次；
 * - 一段时间内的连续事件合并成一次；读取中收到的事件在这次读取结束后再判断。
 */
export function usePendingCards(enabled: boolean): PendingCardsState {
  // 登记表按账号分 key：会话还在 loading 时不读（保持读取中），会话已定或换账号时重新读（W0021 review P1）。
  const { account, ready: accountReady } = useSharedReadAccount();
  const [state, setState] = useState<PendingCardsState>(enabled ? LOADING : DISABLED);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setState(DISABLED);
      return;
    }
    if (!accountReady) {
      setState(LOADING);
      publishPendingCardsReaderState("pending");
      return;
    }
    let active = true;
    // 连续事件时只采用最后一次读取的结果，避免慢响应把已经消失的项又写回来。
    // 重读期间保留上一次结果，不回到 pending（避免导语闪回「正在整理」）。
    let generation = 0;
    const outcomes = new Map<string, BatchOutcome>();
    let full = true;
    const dirty = new Set<string>();
    const hostSignatures = new Map<string, string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reading = false;
    setState(LOADING);
    publishPendingCardsReaderState("pending");

    const needsRead = (batchId: string) => {
      if (full || !outcomes.has(batchId)) return true;
      if (!dirty.has(batchId)) return false;
      const host = hostSignatures.get(batchId);
      return host === undefined || host !== outcomes.get(batchId)?.signature;
    };

    const run = async () => {
      timer = null;
      if (!active) return;
      if (reading) return;
      const ids = [...listActiveBatches()].reverse();
      const toRead = ids.filter(needsRead);
      full = false;
      dirty.clear();
      const mine = ++generation;
      if (toRead.length > 0) {
        reading = true;
        try {
          const read = await Promise.all(toRead.map(async (batchId) => [batchId, await readOutcome(batchId)] as const));
          for (const [batchId, outcome] of read) outcomes.set(batchId, outcome);
        } finally {
          reading = false;
        }
      }
      for (const batchId of [...outcomes.keys()]) if (!ids.includes(batchId)) outcomes.delete(batchId);
      if (!active || mine !== generation) return;
      const next = toState(ids, outcomes);
      setState(next);
      publishPendingCardsReaderState(next.status);
      // 读取期间又来了事件：这次读完再判断一次（只读仍然不一致的批次）。
      if (full || dirty.size > 0) schedule();
    };

    function schedule() {
      if (timer !== null || reading) return;
      timer = setTimeout(() => void run(), PENDING_CARDS_COALESCE_MS);
    }

    const onChange = (event?: Event) => {
      const detail = cardBatchChangeDetail(event);
      if (detail) {
        hostSignatures.set(detail.batchId, `${detail.status}|${detail.pending}|${detail.confirmed}`);
        dirty.add(detail.batchId);
      } else {
        full = true;
      }
      schedule();
    };
    void run();
    window.addEventListener("orbit-card-batches", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("orbit-card-batches", onChange);
      window.removeEventListener("storage", onChange);
      publishPendingCardsReaderState("absent");
    };
  }, [account, accountReady, enabled]);

  return state;
}
