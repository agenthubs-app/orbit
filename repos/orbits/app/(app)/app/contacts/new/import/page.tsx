import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { appendWebGuideReturnTo, webGuideReturnTo } from "../../../../../../features/guide/return-to";
import { ImportStartScreen } from "../../../orbit-2026/add/import/ImportScreens";
import type { ImportMethod } from "../../../orbit-2026/add/import/ImportViews";

export const dynamic = "force-dynamic";

const METHODS: readonly ImportMethod[] = ["linkedin", "contacts", "csv", "event"];

// R16 人脈を追加 › その他（W-R16-10 选门；`?method=linkedin|contacts|csv|event` 各自的第一步）。只做鉴权与地址解析，加载不写库。
export default async function AppContactsImportPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const params = (await searchParams) ?? {};
  const returnTo = webGuideReturnTo(params.returnTo);
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: appendWebGuideReturnTo("/app/contacts/new/import", returnTo) })}`);
  const raw = typeof params.method === "string" ? params.method : "";
  const method = METHODS.find((entry) => entry === raw) ?? null;
  return <ImportStartScreen method={method} returnTo={returnTo} />;
}
