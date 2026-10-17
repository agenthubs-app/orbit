import { redirect } from "next/navigation";

import { AccountProfilePage } from "../orbit-2026/account/AccountProfilePage";
import { profileLegacyDestination } from "../orbit-2026/account/profile-routes";

type SearchParams = { view?: string | string[]; onboarding?: string | string[]; next?: string | string[]; design?: string | string[]; edit?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export const dynamic = "force-dynamic";

export default async function AppProfilePage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const params = await searchParams;
  const destination = profileLegacyDestination({
    view: first(params?.view), onboarding: first(params?.onboarding), next: first(params?.next),
  });
  if (destination) redirect(destination);

  const designValue = process.env.NODE_ENV === "production" ? undefined : first(params?.design);
  const design = designValue === "25" || designValue === "50" || designValue === "100" ? designValue : undefined;
  const edit = first(params?.edit);
  return <AccountProfilePage {...(design ? { design } : {})} {...(edit ? { edit } : {})} />;
}
