import { Redirect, useLocalSearchParams, usePathname, type Href } from "expo-router";
import type { ComponentType } from "react";

import { legacyTaskRedirect } from "../view-models/app-navigation";

// R05: the old Task-area addresses (/schedule, /today, /tasks, /followups, /notes)
// open the Task page on the matching segment. The route files stay so links,
// bookmarks and notifications already on devices keep working; a variant that
// is still its own page (notes for one contact) renders `fallback`.
export function LegacyTaskRedirect({ fallback: Fallback }: { fallback?: ComponentType }) {
  const pathname = usePathname();
  const params = useLocalSearchParams<Record<string, string>>();
  const first = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const target = legacyTaskRedirect(pathname, first);
  if (target) return <Redirect href={target as Href} />;
  return Fallback ? <Fallback /> : null;
}
