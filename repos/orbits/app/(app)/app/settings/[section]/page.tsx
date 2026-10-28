import { notFound } from "next/navigation";

import { AccountPreparingPage } from "../../orbit-2026/account/AccountPreparingPage";
import { accountPreparingSection } from "../../orbit-2026/account/account-preparing-sections";

export default async function AppSettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const deferred = accountPreparingSection(section);
  if (!deferred) notFound();
  return <AccountPreparingPage section={deferred} />;
}
