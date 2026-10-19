import { useRouter } from "expo-router";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { NotFoundContent } from "./NotFoundContent";

export function NotFoundScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { t } = useOrbitLocale();
  return <AppScreen inset="kit" title="" showBack={false} header={<></>}>
    <NotFoundContent
      t={t}
      onHome={() => router.replace(auth.user?.id ? "/home" : "/")}
      onHelp={() => router.push("/help")}
    />
  </AppScreen>;
}
