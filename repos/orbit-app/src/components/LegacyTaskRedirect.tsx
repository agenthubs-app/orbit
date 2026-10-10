import { Redirect, useLocalSearchParams, usePathname, useRouter, type Href } from "expo-router";
import { useEffect, type ComponentType } from "react";

import { legacyTaskRedirect } from "../view-models/app-navigation";
import { openMainTab } from "./shell-navigation";

// R05: the old Task-area addresses (/schedule, /today, /tasks, /followups, /notes)
// open the Task page on the matching segment. The route files stay so links,
// bookmarks and notifications already on devices keep working; a variant that
// is still its own page (notes for one contact) renders `fallback`.
export function LegacyTaskRedirect({ fallback: Fallback }: { fallback?: ComponentType }) {
  const pathname = usePathname();
  const params = useLocalSearchParams<Record<string, string>>();
  const first = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const target = legacyTaskRedirect(pathname, first);
  const router = useRouter();
  // Pushed from an old screen: Task is a tab page, so it goes to the bottom of the
  // stack instead of on top (R05 review M1). Opened directly: a plain redirect.
  const stacked = Boolean(target) && router.canGoBack();
  useEffect(() => { if (target && stacked) openMainTab(router, target); }, [router, stacked, target]);
  if (target) return stacked ? null : <Redirect href={target as Href} />;
  return Fallback ? <Fallback /> : null;
}
