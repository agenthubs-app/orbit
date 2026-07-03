"use client";

import { useEffect } from "react";

const BREAKPOINT_QUERY = "(max-width: 640px)";

/**
 * Product pages render desktop and mobile variants as sibling DOM trees and
 * toggle them with `.orbit-desktop-only` / `.orbit-mobile-only` CSS. Screen
 * readers and the tab order don't follow `display: none` set by media queries
 * alone when content later becomes visible again, and — worse — both variants
 * are announced twice if a page overrides the display rule. This runtime keeps
 * the inactive variant out of the accessibility tree (`aria-hidden` + `inert`)
 * in lockstep with the same 640px breakpoint the CSS uses.
 */
export function OrbitResponsiveA11y() {
  useEffect(() => {
    const media = window.matchMedia(BREAKPOINT_QUERY);

    function apply() {
      const mobile = media.matches;
      document.querySelectorAll<HTMLElement>(".orbit-desktop-only").forEach((node) => {
        node.toggleAttribute("inert", mobile);
        if (mobile) node.setAttribute("aria-hidden", "true");
        else node.removeAttribute("aria-hidden");
      });
      document.querySelectorAll<HTMLElement>(".orbit-mobile-only").forEach((node) => {
        node.toggleAttribute("inert", !mobile);
        if (!mobile) node.setAttribute("aria-hidden", "true");
        else node.removeAttribute("aria-hidden");
      });
    }

    apply();
    media.addEventListener("change", apply);

    // Variants mount/unmount as users navigate client-side or open overlays.
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) apply();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      media.removeEventListener("change", apply);
      observer.disconnect();
    };
  }, []);

  return null;
}
