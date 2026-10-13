/**
 * R12「人脈を追加」（DESIGN §2.1 Web、§7；D20 / b12 W-R12-01）：「人脈」页上的 5 门弹窗，
 * 手入力抽屉（`?add=manual`，b11 A3 Web）与招待コード弹窗（`?add=invite`，R15）同样压在「人脈」页上。
 * 旧链接：`?job=<v2 id>` → `/app/contacts/new/scan/<id>`；`?method=scan` → `/app/contacts/new/scan`；
 * `?method=csv|contacts|event` 与 `?import=` 暂时仍是旧导入屏（R16 之前的「その他」落点）。
 * 只做鉴权与地址解析；加载页面不触发 OCR、导入、合并或任何写入。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { AddContactScreen } from "../../orbit-2026/add/AddContactScreen";
import AppContactsPage from "../page";
import { resolveAddContactRoute, type AddContactSearchParams } from "./_add/add-route";
import { LegacyNetworkImport } from "./_add/legacy-network-import";

export const dynamic = "force-dynamic";

export default async function AppContactsAddPage({ searchParams }: { searchParams?: Promise<AddContactSearchParams> } = {}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fnew");
  const route = resolveAddContactRoute((await searchParams) ?? {});
  if (route.kind === "redirect") redirect(route.href);
  if (route.kind === "legacy") return <LegacyNetworkImport method={route.method} importId={route.importId} />;
  return (
    <>
      <AppContactsPage />
      <AddContactScreen manualOpen={route.manual} inviteOpen={route.invite} />
    </>
  );
}
