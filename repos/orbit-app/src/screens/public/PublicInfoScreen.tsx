import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { supportEmail } from "../../config/support";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { PublicInfoContent, type PublicInfoKind } from "./PublicInfoContent";

export function PublicInfoScreen({ kind }: { kind: PublicInfoKind }) {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { t } = useOrbitLocale();
  const [query, setQuery] = useState("");
  const title = t(kind === "help" ? "publicInfo.helpNav" : kind === "terms" ? "publicInfo.termsTitle" : "publicInfo.privacyTitle");
  const safeBack = () => router.canGoBack() ? router.back() : router.replace(auth.user?.id ? "/settings" : "/");
  const backLabel = router.canGoBack() ? t("common.back") : auth.user?.id ? t("me.settings") : t("publicInfo.home");

  return <AppScreen inset="kit" showBack title={title} onBack={safeBack} backAccessibilityLabel={backLabel}>
    <PublicInfoContent
      kind={kind}
      t={t}
      query={query}
      onQueryChange={setQuery}
      onOpen={(path) => path === "/" ? router.replace("/") : router.push(path as Href)}
      contactEmail={supportEmail}
      onOpenEmail={() => { if (supportEmail) void Linking.openURL(`mailto:${supportEmail}`); }}
    />
  </AppScreen>;
}
