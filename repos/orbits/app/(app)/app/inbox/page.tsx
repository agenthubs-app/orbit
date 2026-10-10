import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { RelationshipInboxPage } from "./relationship-inbox-panel";
import { InboxShellTitle } from "./inbox-shell-title";

export const dynamic = "force-dynamic";

// R07: the inbox is a page (left rail 受信箱). Same reads as the drawer it replaces:
// the summary and the open tab, refreshed every 15 seconds while visible.
export default async function AppInboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Finbox");
  return <><InboxShellTitle /><RelationshipInboxPage /></>;
}
