import type { ReactNode } from "react";

import { PublicTopNav } from "./orbit-public-shell";
import type { OrbitNavActive } from "./orbit-public-shell";

/**
 * Page frame for route-state boundaries (empty / pending / failure).
 *
 * UI-audit fix P0-1. Boundary states used to render a bare `<main>` holding
 * nothing but a StateView card — no top nav, no way back into the product
 * except the recovery links inside the card. When a failure boundary is the
 * landing spot for a normal in-app navigation (every contact card in the list
 * routes here while the detail capability only serves demo-contact-1) that
 * leaves the user stranded on what reads as a broken page.
 *
 * Keeping the standard nav means a boundary is a state of the app, not an exit
 * from it. The frame also caps the reading measure — a full-bleed 1440px error
 * paragraph was the widest line length anywhere in the product.
 */
export function OrbitRouteBoundaryFrame({
  children,
  navActive,
  page,
}: {
  children: ReactNode;
  navActive: OrbitNavActive;
  page: string;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-real-page={page}
      style={{ background: "var(--bg)", minHeight: "100dvh" }}
    >
      <PublicTopNav active={navActive} />
      <div
        style={{
          margin: "0 auto",
          maxWidth: 760,
          padding: "40px 24px 72px",
          width: "100%",
        }}
      >
        {children}
      </div>
    </main>
  );
}
