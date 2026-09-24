/**
 * 导入人脉页 route adapter（Orbit_0918 Network v2 导入屏）。
 *
 * 只做鉴权 + 配置可用性判定；名片 V2 的批次列表/详情在客户端按需拉取。
 * 加载页面绝不触发 OCR、二维码、参会者导入、通讯录导入、引荐、合并或信号服务。
 * URL：?method=scan（默认）；?job=<batchId> 打开某批次记录。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { NetworkImport, type NetworkImportMethod } from "../network-0918/network-import";

export const dynamic = "force-dynamic";

const METHODS: readonly NetworkImportMethod[] = ["csv", "contacts", "scan", "event"];

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export default async function AppContactScanPage({
  searchParams,
}: {
  searchParams?: Promise<{ method?: string | string[]; job?: string | string[] }>;
} = {}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fnew");
  }

  const params = await searchParams;
  const method = readParam(params?.method);
  const jobId = readParam(params?.job);
  const availability = resolveBusinessCardCaptureAvailability();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="network" data-orbit-route="app-contacts-new-route">
        <AccountTopNav active="cards" />
        <NetworkImport
          availability={{ available: availability.available, reason: availability.reason }}
          initialMethod={METHODS.find((m) => m === method) ?? "scan"}
          jobId={jobId}
        />
      </div>
    </>
  );
}
