import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { appendWebGuideReturnTo, webGuideReturnTo } from "../../../../../../../features/guide/return-to";
import { ImportBatchClient } from "../../../../orbit-2026/add/import/ImportScreens";
import { importDesignFixturesEnabled, isImportDesignFixture } from "../../_add/import-design-gate";
import { ImportDesignFixtureClient } from "../../_add/import-design-demo";

export const dynamic = "force-dynamic";

// R16 取り込み批次：列の対応（CSV）→ まとめて確認（`?step=review`）→ 完成。批次数据由客户端拉取。
export default async function AppContactsImportBatchPage({ params, searchParams }: { params: Promise<{ importId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { importId } = await params;
  const query = (await searchParams) ?? {};
  const returnTo = webGuideReturnTo(query.returnTo);
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: appendWebGuideReturnTo(`/app/contacts/new/import/${encodeURIComponent(importId)}`, returnTo) })}`);
  // 本机像素门禁的只读演示（import-design-demo）；生产环境永远走真实批次。
  if (importDesignFixturesEnabled() && isImportDesignFixture(importId)) return <ImportDesignFixtureClient name={importId} />;
  return <ImportBatchClient batchId={importId} step={query.step === "review" ? "review" : "mapping"} returnTo={returnTo} />;
}
