/**
 * R07: /app/home is the home page again (no longer a redirect to /app/agent). The
 * widget home is R10; the skeleton shows a placeholder, the 編集 button (says it
 * is coming soon, like the App — RD-21) and the default right rail. The old hub
 * component and its route view model stay where they are (`/app/home/events` and
 * the agent page still use them).
 */
import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { HomePlaceholder } from "../orbit-2026/home/HomePlaceholder";

export const dynamic = "force-dynamic";

export default async function AppPersonalHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fhome");
  return <HomePlaceholder />;
}
