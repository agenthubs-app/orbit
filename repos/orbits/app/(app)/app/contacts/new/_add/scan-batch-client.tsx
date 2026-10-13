/**
 * R12 `/app/contacts/new/scan/[batchId]` 的客户端适配层：挂上共用名片状态机 `useCardBatch`（上传续传、识别轮询、
 * 读完按共享规则自动进人脈——`isAutoImportEligible / isAutoMergeEligible` → `shared/compute/card-auto-import`，
 * W0015 有活动归属候选的卡留给用户），把状态映射成新画面的视图，动作全部走现有 v2 接口（确认 / 手入力 / 跳过 /
 * 重新识别 / 替换照片）。全站 `CardBatchHost` 在 `/app/contacts/new/scan` 前缀让位，同一批次只有这里一个状态机。
 */
"use client";

import { useEffect, useMemo, useRef } from "react";

import { ScanBatchScreen } from "../../../orbit-2026/add/ScanBatchScreen";
import { startScanBatch } from "./start-scan-batch";
import type { ScanBatchActions } from "../../../orbit-2026/add/scan-types";
import { useOrbitLanguage } from "../../../orbit-language-context";
import { useCardBatch } from "../../card-batch-0918/use-card-batch";
import { replaceItemContent } from "../../ingest-v2/ingest-v2-client";
import { buildScanBatchView } from "./scan-batch-view";

export function ScanBatchClient({ batchId }: { batchId: string }) {
  const { t } = useOrbitLanguage();
  const batch = useCardBatch(batchId, t);
  const view = buildScanBatchView(batch);
  const { autoRunning, markNotified, notified, reviewing } = batch;

  // 打开批次页就算已经提醒过（与旧导入页 `viewingImport` 同一口径），全站不再弹「解析完成」。
  useEffect(() => {
    if (reviewing && !autoRunning && !notified) markNotified();
  }, [autoRunning, markNotified, notified, reviewing]);

  // 动作在调用时读最新状态；动作对象本身保持稳定。
  const latest = useRef(batch);
  latest.current = batch;
  const actions = useMemo<ScanBatchActions>(() => ({
    setDraft: (cardId, draft) => latest.current.setDrafts((current) => ({ ...current, [cardId]: draft })),
    settle: (cardId, kind) => latest.current.settleCard(cardId, kind),
    refresh: () => latest.current.refresh(),
    retryRecognition: async (cardId) => {
      const card = latest.current.cards.find((entry) => entry.cardId === cardId);
      if (card) await latest.current.retryRecognition(card);
    },
    replace: async (cardId, file) => {
      const card = latest.current.cards.find((entry) => entry.cardId === cardId);
      const item = card?.items.find((entry) => entry.status === "terminal_failed") ?? card?.front ?? null;
      if (!card || !item) return false;
      const result = await replaceItemContent({ batchId, expectedVersion: item.version, file, itemId: item.id });
      await latest.current.refresh();
      return result.ok;
    },
    chooseEvent: (eventId) => {
      for (const [cardId, candidate] of Object.entries(latest.current.attribution.cards)) {
        if (candidate) latest.current.setAttributionDecision(cardId, candidate === eventId);
      }
    },
    retryUpload: () => void latest.current.pumpUploads(),
    reattach: (files) => void latest.current.reattach(files),
  }), [batchId]);

  return <ScanBatchScreen view={view} actions={actions} onStart={startScanBatch} />;
}
