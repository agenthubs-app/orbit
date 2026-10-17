import { notFound } from "next/navigation";

import { AccountPreparingPage, accountPreparingSection } from "../../orbit-2026/account/AccountPreparingPage";

export default async function AppSettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const deferred = accountPreparingSection(section);
  if (!deferred) notFound();
  return <AccountPreparingPage section={deferred} />;
}
