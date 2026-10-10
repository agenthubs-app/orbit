"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { INBOX_PAGE_COMPOSE_EVENT, RELATIONSHIP_INBOX_COMPOSE_EVENT, RELATIONSHIP_INBOX_OPEN_EVENT, stashInboxComposeSeed } from "../../inbox/relationship-inbox-panel";

// R07: the inbox is a page now (/app/inbox). Pages that used to open the drawer
// (「メールを下書き」 in iOrbit cards, the 「下書きに移しました」 receipt) still fire the
// same window events; the shell sends them to the page, with the compose seed.
export function InboxEventBridge() {
  const router = useRouter();
  const current = usePathname() ?? "";
  const pathname = useRef(current);
  pathname.current = current;
  useEffect(() => {
    const onOpen = () => router.push("/app/inbox");
    const onCompose = (event: Event) => {
      const seed = (event as CustomEvent).detail ?? {};
      // Already on the inbox page: a push to the same URL would not remount it, so hand the seed over directly.
      if (pathname.current.startsWith("/app/inbox")) {
        window.dispatchEvent(new CustomEvent(INBOX_PAGE_COMPOSE_EVENT, { detail: seed }));
        return;
      }
      stashInboxComposeSeed(seed);
      router.push("/app/inbox");
    };
    window.addEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen);
    window.addEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
    return () => { window.removeEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen); window.removeEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose); };
  }, [router]);
  return null;
}
