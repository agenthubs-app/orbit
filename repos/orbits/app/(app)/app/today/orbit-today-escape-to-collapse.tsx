"use client";

import { useEffect } from "react";

/**
 * Esc collapses the currently-expanded decision card (design doc §5:
 * "Esc/再点收起"). Collapsing is a real URL navigation to the same href the
 * card's own header link would use (?entry= removed, ?date=/?view=
 * preserved) — this component only adds the keyboard shortcut on top of
 * that, it does not introduce a second source of truth for open/closed
 * state.
 *
 * `window.location.assign` (not `next/navigation`'s `useRouter`) for the
 * same reason orbit-today-time-spine.tsx avoids it: several tests call
 * `renderToStaticMarkup` on these pages directly, outside a Next
 * AppRouterContext, where `useRouter()` throws immediately. Reading
 * `window.location` only inside an event handler means this code never
 * runs during SSR/static-render, so it's safe there.
 */
export function OrbitTodayEscapeToCollapse({
  collapseHref,
}: {
  collapseHref: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      window.location.assign(collapseHref);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapseHref]);

  return null;
}
