"use client";

// R28：从引导开始的名片批次记住返回目标，全站胶囊打开它时仍用引导的外框；
// 引导完成后忘掉。放在 card-batch-0918 之外，新界面（引导页）也能用。
import { webGuideReturnTo, type WebGuideReturnTo } from "../../../../features/guide/return-to";
import { getSharedReadAccount } from "../orbit-shared-read";

const RETURN_KEY = "orbit.cardBatches.returnTo.v1";

function returnKey(batchId: string): string {
  const account = getSharedReadAccount();
  return `${RETURN_KEY}:${account ?? ""}:${batchId}`;
}

export function rememberBatchReturnTo(batchId: string, returnTo: WebGuideReturnTo | null): void {
  try {
    if (returnTo) window.localStorage.setItem(returnKey(batchId), returnTo);
  } catch {
    // 只影响胶囊打开时用哪种外框。
  }
}

/** 引导完成后不再把它的批次带回引导外框。 */
export function forgetBatchReturnTo(returnTo: WebGuideReturnTo): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
    for (const key of keys) {
      if (key?.startsWith(`${RETURN_KEY}:`) && window.localStorage.getItem(key) === returnTo) window.localStorage.removeItem(key);
    }
  } catch {
    // 同上。
  }
}

export function batchReturnTo(batchId: string): WebGuideReturnTo | null {
  try {
    return webGuideReturnTo(window.localStorage.getItem(returnKey(batchId)));
  } catch {
    return null;
  }
}
