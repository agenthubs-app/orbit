import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { PendingPage } from "../../orbit-2026/account-rights/PendingPage";

export const dynamic = "force-dynamic";
// 2026-11-24：未登录打开时在服务器上直接去登录页（原来先画出「削除申請を受け付けました」，等接口 401 才在浏览器里跳走）。
export default async function AccountPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=/app/account/pending");
  return <PendingPage />;
}
