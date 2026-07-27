import { redirect } from "next/navigation";

/**
 * Legacy dashboard URL for the on-site Party workspace.
 *
 * Party now has one canonical live-capable route. Keeping this alias as a
 * redirect prevents the old dashboard URL from rendering a second, static
 * event reality that can contradict `/app/party`.
 */
export default function AppPartyDashboardAlias() {
  redirect("/app/party");
}
