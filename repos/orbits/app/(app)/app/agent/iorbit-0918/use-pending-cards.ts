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
 * 读取状态（pending / ready / unavailable）同时登记到 card-batch-store，全站宿主据此决定
 * 在 /app/agent 是否隐藏待确认胶囊。
 */
"use client";

import { useEffect, useState } from "react";

import { cardReviewQueue, parseStage, type CardBatchLedger } from "../../contacts/card-batch-0918/card-batch-model";
import {
  listActiveBatches,
  publishPendingCardsReaderState,
  readCardBatchLedger,
} from "../../contacts/card-batch-0918/card-batch-store";
import { INGEST_V2_API_BASE, type IngestBatchDetail } from "../../contacts/ingest-v2/ingest-v2-client";
import { groupIngestItemsByCardId } from "../../contacts/ingest-v2/ingest-v2-route-view-model";

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

/**
 * 一批里还要人看的卡数，与全站胶囊「N 张名片待你确认」同一口径（`cardReviewQueue`）：
 * 排除已确认、已跳过、这次自动导入的，以及本机账本里「稍后处理」的卡。
 * 识别中与已取消 / 过期的批次记 0——那时宿主显示的是解析进度。
 */
export function countPendingCards(detail: IngestBatchDetail, ledger: CardBatchLedger): number {
  const status = detail.batch.status;
  if (parseStage(status) !== "review" || status === "cancelled" || status === "expired") return 0;
  return cardReviewQueue(groupIngestItemsByCardId(detail.items), ledger).pending.length;
}

type BatchRead = { kind: "gone" } | { kind: "failed" } | { kind: "ok"; detail: IngestBatchDetail };

// 只发 GET。与 fetchBatchDetail 同一个接口，但要区分「批次已不存在」（404，宿主随后会把它移出
// 登记表）和「暂时读不到」（其余错误），后者不能被当成没有待确认。
async function readBatch(batchId: string): Promise<BatchRead> {
  try {
    const response = await fetch(`${INGEST_V2_API_BASE}/${batchId}`);
    if (response.status === 404) return { kind: "gone" };
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as { data?: IngestBatchDetail };
    return body.data?.batch && Array.isArray(body.data.items) ? { detail: body.data, kind: "ok" } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** 按批次读取待确认数，最新的批次在前。 */
export async function readPendingCardBatches(): Promise<PendingCardsState> {
  const ids = [...listActiveBatches()].reverse();
  const reads = await Promise.all(ids.map(async (batchId) => ({ batchId, read: await readBatch(batchId) })));
  const batches: PendingCardBatch[] = [];
  let failed = false;
  for (const { batchId, read } of reads) {
    if (read.kind === "failed") failed = true;
    if (read.kind !== "ok") continue;
    const pending = countPendingCards(read.detail, readCardBatchLedger(batchId));
    if (pending > 0) batches.push({ batchId, createdAt: read.detail.batch.createdAt, pending });
  }
  return { batches, status: failed ? "unavailable" : "ready" };
}

const DISABLED: PendingCardsState = { batches: [], status: "ready" };
const LOADING: PendingCardsState = { batches: [], status: "pending" };

/**
 * `enabled` 为 false（示例模式）时不读 localStorage、不发请求，恒为「已就绪、没有待确认」。
 * 启用时把读取状态登记给全站宿主（card-batch-store）：读取失败或卸载后，宿主在 /app/agent
 * 照常显示待确认胶囊作为兜底。
 */
export function usePendingCards(enabled: boolean): PendingCardsState {
  const [state, setState] = useState<PendingCardsState>(enabled ? LOADING : DISABLED);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setState(DISABLED);
      return;
    }
    let active = true;
    // 连续事件时只采用最后一次读取的结果，避免慢响应把已经消失的项又写回来。
    // 重读期间保留上一次结果，不回到 pending（避免导语闪回「正在整理」）。
    let generation = 0;
    setState(LOADING);
    publishPendingCardsReaderState("pending");
    const sync = () => {
      const mine = ++generation;
      void readPendingCardBatches().then((next) => {
        if (!active || mine !== generation) return;
        setState(next);
        publishPendingCardsReaderState(next.status);
      });
    };
    sync();
    window.addEventListener("orbit-card-batches", sync);
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("orbit-card-batches", sync);
      window.removeEventListener("storage", sync);
      publishPendingCardsReaderState("absent");
    };
  }, [enabled]);

  return state;
}
