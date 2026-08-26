import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../../orbit-visual-freeze-runtime";
import { BusinessCardBatchView } from "./business-card-batch-view";

export const dynamic = "force-dynamic";

/**
 * 批次进度/确认页只观察持久批任务状态；识别由后台 worker 驱动，
 * 页面关闭或换设备后凭 URL 恢复。
 */
export default async function BusinessCardBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch/${id}`)}`);
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <main className="orbit-page" data-orbit-real-page="contacts">
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <AccountTopNav active="cards" />
          <div
            className="scroll"
            data-appscroll
            style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 20px 60px" }}
          >
            <div style={{ margin: "0 auto", maxWidth: 980 }}>
              <a
                href="/app/contacts/new"
                style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}
              >
                ← 导入中心
              </a>
              <div style={{ marginTop: 14 }}>
                <BusinessCardBatchView batchId={id} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
