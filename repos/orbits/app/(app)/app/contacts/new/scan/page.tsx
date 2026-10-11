import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../../../features/acquisition/business-card-capture-availability";
import { ScanUploadClient } from "../_add/scan-upload-client";

export const dynamic = "force-dynamic";

// R12 名刺をスキャン（DESIGN §2.2 Web）：拖放 + はじめての方へ。批次建好后进入 /app/contacts/new/scan/[batchId]。
// 同一路径 App 也有（`app/contacts/new/scan.tsx`，DESIGN §7）。只读配置可用性，不触发 OCR。
export default async function AppContactsScanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fnew%2Fscan");
  return <ScanUploadClient available={resolveBusinessCardCaptureAvailability().available} />;
}
