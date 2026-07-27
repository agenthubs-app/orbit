"use client";

import { useEffect } from "react";

/** Makes provenance popovers usable on touch devices and dismissible on outside click. */
export function OrbitCardsInteractions() {
  useEffect(() => {
    const doc = document;
    const closeBasis = (except?: HTMLElement) => {
      doc.querySelectorAll<HTMLElement>(".nc-basis.is-open").forEach((basis) => {
        if (basis === except) return;
        basis.classList.remove("is-open");
        basis.setAttribute("aria-expanded", "false");
      });
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || !target.closest) return;

      const basis = target.closest<HTMLElement>(".nc-basis");
      if (basis) {
        e.preventDefault();
        const open = basis.classList.contains("is-open");
        closeBasis(basis);
        basis.classList.toggle("is-open", !open);
        basis.setAttribute("aria-expanded", String(!open));
        return;
      }

      closeBasis();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      const activeBasis = doc.querySelector<HTMLElement>(".nc-basis.is-open");
      if (activeBasis) {
        closeBasis();
        activeBasis.focus();
      }
    };

    doc.addEventListener("click", onClick);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
