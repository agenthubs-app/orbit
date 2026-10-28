/**
 * Shown the moment an `/app` page is asked for, while its server work (session, actor, page data)
 * is still running: the shell stays, the content area shows the design system's loading state
 * (01-system ⑧ Skeleton) instead of the previous page sitting still until the whole answer arrives.
 */
import { getOrbitServerLanguage } from "./orbit-language-server";
import { Orbit2026Scope, Skeleton } from "./orbit-2026/ui";
import styles from "./loading.module.css";

export default async function AppLoading() {
  const language = await getOrbitServerLanguage();
  return (
    <Orbit2026Scope language={language} className={styles.loading}>
      <Skeleton lines={5} />
    </Orbit2026Scope>
  );
}
