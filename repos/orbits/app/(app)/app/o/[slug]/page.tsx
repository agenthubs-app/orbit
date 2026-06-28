import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitOrganizerPublicViewModel } from "../../orbit-organizer-route-view-model";
import { OrbitRealOrganizerPublic } from "../orbit-real-organizer-public";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default async function AppOrganizerPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealOrganizerPublic language={language} viewModel={localizeOrbitTree(getOrbitOrganizerPublicViewModel(slug), language)} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
