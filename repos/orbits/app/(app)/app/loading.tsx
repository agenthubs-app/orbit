/**
 * Shown the moment an `/app` page is asked for, while its server work (session, actor, page data)
 * is still running: the shell stays (with a left-rail page's fixed header and rail, shellFrameFor),
 * and the content area shows the design system's loading state (01-system ⑧ Skeleton) — for a
 * left-rail page in that page's own columns and cards — instead of the previous page sitting still
 * until the whole answer arrives. Pages without the shell (the landing under the sign-in dialogs, the
 * public event pages) show their own first frame instead (public-route-loading).
 */
import { getOrbitServerLanguage } from "./orbit-language-server";
import { Orbit2026Scope } from "./orbit-2026/ui";
import { RouteSkeleton } from "./orbit-2026/shell/RouteSkeleton";
import { enabledOAuthProviders } from "../../../features/auth/oauth-providers";
import styles from "./loading.module.css";

export default async function AppLoading() {
  const language = await getOrbitServerLanguage();
  return (
    <Orbit2026Scope language={language}>
      <RouteSkeleton plainClassName={styles.loading} googleEnabled={enabledOAuthProviders().includes("google")} />
    </Orbit2026Scope>
  );
}
