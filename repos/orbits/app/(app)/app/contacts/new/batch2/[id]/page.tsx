import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { AccountTopNav } from "../../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../../orbit-visual-freeze-runtime";
import { BusinessCardIngestV2View } from "./business-card-ingest-v2-view";

export const dynamic = "force-dynamic";

/**
 * V2 批次页：上传 / 识别进度 / 逐张复核三相合一。
 * 状态全部持久于服务端，刷新或换设备后凭 URL 恢复；上传中刷新则按内容
 * digest 重新挂载文件续传。
 */
export default async function BusinessCardIngestV2BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id: rawId } = await params;
  // batch id 含冒号，动态路由参数是 URL 编码形态；统一 decode 后再进客户端
  //（内存文件暂存按原始 id 作键，编码不一致会让续传落空）。
  const id = decodeURIComponent(rawId);

  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch2/${id}`)}`,
    );
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
                <BusinessCardIngestV2View batchId={id} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
