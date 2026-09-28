/**
 * 全站名片解析提醒（挂在 /app layout）：盯住本机「进行中批次」登记表里最新的一批——
 * 从 IndexedDB 续传照片、轮询识别进度、识别后自动导入可靠的名片，并在任意页面显示
 * 「正在解析」胶囊 / 解析完成弹窗 / 待确认胶囊；「去确认」进入人脉 → 导入人脉的该批次。
 * 新用户引导页、引导页 /app/start（W0006）与人脉导入页自己挂着同一个状态机，这里在这些页面
 * 让位，避免同一批次被两个状态机同时上传 / 自动导入。
 * iOrbit 首页 /app/agent（W0011）不让位：状态机照常只在这里运行一份，只是不显示右下角的
 * 「N 张名片待你确认」胶囊——待确认已作为今日要事出现；解析进度胶囊与解析完成弹窗照常。
 * 兜底：只有今日要事的读取器正在读或已读好时才隐藏；读取失败或读取器没挂（如对话视图）时照常显示。
 */
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { useSharedReadAccount } from "../../orbit-shared-read";
import { CardBatchReminders } from "./card-batch-ui";
import {
  dispatchCardBatchChange,
  getPendingCardsReaderState,
  listActiveBatches,
  subscribePendingCardsReaderState,
  type CardBatchChangeDetail,
  type PendingCardsReaderState,
} from "./card-batch-store";
import { useCardBatch } from "./use-card-batch";

export const CARD_BATCH_HOST_YIELD_PREFIXES = ["/app/profile/onboarding", "/app/start", "/app/contacts/new", "/app/account"] as const;

/** 这条路径上全站宿主是否让位（未登录、非 /app 页面、或页面自己挂着状态机）。 */
export function cardBatchHostYields(input: { authenticated: boolean; pathname: string }): boolean {
  const { pathname } = input;
  return (
    !input.authenticated ||
    !pathname.startsWith("/app") ||
    CARD_BATCH_HOST_YIELD_PREFIXES.some(prefix => pathname.startsWith(prefix))
  );
}

/** 只隐藏「待确认」胶囊、状态机照常运行的路径（与让位名单不同：这里宿主不让位）。 */
export const CARD_BATCH_HOST_HIDE_PENDING_PILL_PATHS = ["/app/agent"] as const;

/**
 * 这条路径上是否隐藏待确认胶囊：只按精确路径匹配（/app/agent 的子页面照旧显示），并且今日要事的
 * 读取器必须正在读或已读好——读取失败（unavailable）或没挂（absent）时胶囊照常，待确认不会没人提醒。
 */
export function cardBatchHostHidesPendingPill(pathname: string, reader: PendingCardsReaderState): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (CARD_BATCH_HOST_HIDE_PENDING_PILL_PATHS as readonly string[]).includes(normalized)
    && (reader === "pending" || reader === "ready");
}

export function CardBatchHost() {
  const { t, preserveHref } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const { status } = useSession();
  // W0021：登记表与浏览器端读取按账号隔离，读登记表之前先同步账号。
  useSharedReadAccount();
  const [batchId, setBatchId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setBatchId(listActiveBatches().at(-1) ?? null);
    sync();
    window.addEventListener("orbit-card-batches", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("orbit-card-batches", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const reader = useSyncExternalStore(subscribePendingCardsReaderState, getPendingCardsReaderState, () => "absent" as const);

  const yielded = cardBatchHostYields({ authenticated: status === "authenticated", pathname });
  const batch = useCardBatch(yielded ? null : batchId, t);
  // 批次状态、自动导入或待确认数变化时广播一次，让只读的今日要事（use-pending-cards）重新读取。
  // 自己也监听这个事件，但重读的是同一个批次 id，不会触发重渲染。
  // W0021：事件带上宿主看到的状态与计数（`CardBatchChangeDetail`）；今日要事已经读到同样的值时不再重读。
  const confirmedCount = batch.cards.filter(card => card.allConfirmed).length;
  const signature = yielded || !batchId || !batch.status
    ? ""
    : `${batchId}|${batch.status}|${batch.autoRunning}|${batch.pending.length}|${confirmedCount}`;
  const changeDetail = useRef<CardBatchChangeDetail | null>(null);
  changeDetail.current = batchId && batch.status ? { batchId, confirmed: confirmedCount, pending: batch.pending.length, status: batch.status } : null;
  useEffect(() => {
    if (signature) dispatchCardBatchChange(changeDetail.current);
  }, [signature]);
  if (yielded || !batchId) return null;
  return (
    <CardBatchReminders
      batch={batch}
      hidePendingPill={cardBatchHostHidesPendingPill(pathname, reader)}
      onOpen={() => window.location.assign(preserveHref(`/app/contacts/new?job=${encodeURIComponent(batchId)}`))}
      t={t}
      viewingImport={false}
    />
  );
}
