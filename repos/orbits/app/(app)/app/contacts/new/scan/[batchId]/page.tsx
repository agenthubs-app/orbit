import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { ScanBatchClient } from "../../_add/scan-batch-client";

export const dynamic = "force-dynamic";

// R12 名刺 · 読み取り / まとめて確認 / 完成（DESIGN §2.2 第 4–7 步 Web）。批次数据由客户端按需拉取（useCardBatch）。
export default async function AppContactsScanBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/contacts/new/scan/${encodeURIComponent(batchId)}` })}`);
  return <ScanBatchClient batchId={batchId} />;
}
