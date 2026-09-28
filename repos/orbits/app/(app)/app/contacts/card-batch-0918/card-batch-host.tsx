/**
 * 全站名片解析提醒（挂在 /app layout）：盯住本机「进行中批次」登记表里最新的一批——
 * 从 IndexedDB 续传照片、轮询识别进度、识别后自动导入可靠的名片，并在任意页面显示
 * 「正在解析」胶囊 / 解析完成弹窗 / 待确认胶囊；「去确认」进入人脉 → 导入人脉的该批次。
 * 新用户引导页、引导页 /app/start（W0006）与人脉导入页自己挂着同一个状态机，这里在这些页面
 * 让位，避免同一批次被两个状态机同时上传 / 自动导入。
 */
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { CardBatchReminders } from "./card-batch-ui";
import { listActiveBatches } from "./card-batch-store";
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

export function CardBatchHost() {
  const { t, preserveHref } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const { status } = useSession();
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

  const yielded = cardBatchHostYields({ authenticated: status === "authenticated", pathname });
  const batch = useCardBatch(yielded ? null : batchId, t);
  if (yielded || !batchId) return null;
  return (
    <CardBatchReminders
      batch={batch}
      onOpen={() => window.location.assign(preserveHref(`/app/contacts/new?job=${encodeURIComponent(batchId)}`))}
      t={t}
      viewingImport={false}
    />
  );
}
