import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { appendWebGuideReturnTo, webGuideReturnTo } from "../../../../../../../features/guide/return-to";
import { ScanBatchClient } from "../../_add/scan-batch-client";
import { isScanDesignFixture, scanDesignFixturesEnabled } from "../../_add/scan-design-fixture-gate";
import { ScanDesignFixtureClient } from "../../_add/scan-design-fixtures";

export const dynamic = "force-dynamic";

// R12 名刺 · 読み取り / まとめて確認 / 完成（DESIGN §2.2 第 4–7 步 Web）。批次数据由客户端按需拉取（useCardBatch）。
export default async function AppContactsScanBatchPage({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams?: Promise<{ returnTo?: string | string[] }> }) {
  const { batchId: rawBatchId } = await params;
  // 路由参数保留了编码（`bcb2%3A…`）；照片暂存与轮询都按原样的 `bcb2:…` 记，不解码会全部对不上、卡在上传。
  let batchId = rawBatchId;
  try { batchId = decodeURIComponent(rawBatchId); } catch { /* keep the raw id */ }
  const returnTo = webGuideReturnTo((await searchParams)?.returnTo);
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: appendWebGuideReturnTo(`/app/contacts/new/scan/${encodeURIComponent(batchId)}`, returnTo) })}`);
  // 本机像素门禁的只读演示（scan-design-fixtures）；生产环境永远走真实批次。
  if (scanDesignFixturesEnabled() && isScanDesignFixture(batchId)) return <ScanDesignFixtureClient name={batchId} />;
  return <ScanBatchClient batchId={batchId} returnTo={returnTo} />;
}
