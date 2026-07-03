"use client";

// Homepage shell for the iOrbit starfield journey. The desktop and mobile
// references are two structurally different fixed designs (no media queries in
// either), so each is migrated as its own faithful tree:
//   - orbit-starfield-desktop.tsx  <- docs/designs/iOrbit 星空旅程.html
//   - orbit-starfield-mobile.tsx   <- docs/designs/iOrbit Starfield (Mobile).html
// SSR renders both trees and a CSS breakpoint (767px) displays exactly one, so
// the first paint is correct without hydration mismatch. After mount,
// matchMedia unmounts the inactive tree and starts the active tree's runtime
// (canvas rAF, scroll stop machine, gesture handlers).

import { useEffect, useState } from "react";
import { OrbitStarfieldDesktop } from "./orbit-starfield-desktop";
import { OrbitStarfieldMobile } from "./orbit-starfield-mobile";

const MOBILE_QUERY = "(max-width: 767px)";

type Variant = "ssr" | "desktop" | "mobile";

export function OrbitStarfieldHome() {
  const [variant, setVariant] = useState<Variant>("ssr");

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setVariant(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <main data-orbit-real-page="starfield-home">
      {variant !== "mobile" && (
        <OrbitStarfieldDesktop active={variant === "desktop"} />
      )}
      {variant !== "desktop" && (
        <OrbitStarfieldMobile active={variant === "mobile"} />
      )}
    </main>
  );
}
