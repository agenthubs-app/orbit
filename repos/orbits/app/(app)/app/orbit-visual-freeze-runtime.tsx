"use client";

import { useEffect } from "react";

export function OrbitVisualFreezeRuntime() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("orbitVisualSeed")) return;
    if (document.querySelector("style[data-orbit-visual-freeze]")) return;

    const style = document.createElement("style");
    style.dataset.orbitVisualFreeze = "true";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  return null;
}
