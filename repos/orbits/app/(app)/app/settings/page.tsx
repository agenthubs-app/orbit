import { AccountProfilePage } from "../orbit-2026/account/AccountProfilePage";

export const dynamic = "force-dynamic";

// On desktop settings opens the profile; on a phone the shared layout shows the section list.
export default function AppSettingsPage() {
  return <AccountProfilePage active="home" />;
}
