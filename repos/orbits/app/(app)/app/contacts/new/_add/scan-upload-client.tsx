/** R12 `/app/contacts/new/scan` 的客户端适配层：建批次（start-scan-batch）与「进行中批次」提示。 */
"use client";

import { useEffect, useState } from "react";

import { ScanUploadScreen } from "../../../orbit-2026/add/ScanUploadScreen";
import { useSharedReadAccount } from "../../../orbit-shared-read-account";
import { listActiveBatches } from "../../card-batch-0918/card-batch-store";
import { INGEST_V2_MAX_ITEMS, INGEST_V2_MAX_RAW_BYTES } from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import type { WebGuideReturnTo } from "../../../../../../features/guide/return-to";
import { startScanBatch } from "./start-scan-batch";

export function ScanUploadClient({ available, returnTo }: { available: boolean; returnTo?: WebGuideReturnTo | null }) {
  // 全站 CardBatchHost 在这一页让位：本机还有进行中的批次时，给一个回到那一批的入口（续传在批次页继续）。
  const { account, ready } = useSharedReadAccount();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    setActive(listActiveBatches().at(-1) ?? null);
  }, [account, ready]);
  return <ScanUploadScreen available={available} maxPhotos={INGEST_V2_MAX_ITEMS} maxBytes={INGEST_V2_MAX_RAW_BYTES} onStart={(cards) => startScanBatch(cards)} activeBatchId={active} returnTo={returnTo} />;
}
