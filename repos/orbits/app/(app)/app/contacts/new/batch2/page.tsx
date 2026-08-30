import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { AccountTopNav } from "../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import { BusinessCardIngestV2Start } from "./business-card-ingest-v2-start";

export const dynamic = "force-dynamic";

/** V2 批量导入起点：拍摄引导 + 选片；manifest 先建、文件在批次页逐张上传。 */
export default async function BusinessCardIngestV2StartPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent("/app/contacts/new/batch2")}`);
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
                <BusinessCardIngestV2Start />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
