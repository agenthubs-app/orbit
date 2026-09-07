import { redirect } from "next/navigation";
import { normalizeOrbitLanguage, withOrbitLanguageHref } from "../../orbit-language-core";

export default async function AppContactsGraphPage({
  searchParams,
}: { searchParams?: Promise<{ lang?: string | string[] }> } = {}) {
  const params = await searchParams;
  const language = normalizeOrbitLanguage(typeof params?.lang === "string" ? params.lang : undefined);
  // Compatibility entry; the destination retains the authenticated, actor-scoped boundary.
  redirect(withOrbitLanguageHref("/app/contacts/dashboard?tab=structure", language));
}
