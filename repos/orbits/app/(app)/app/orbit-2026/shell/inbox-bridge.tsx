"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { RELATIONSHIP_INBOX_COMPOSE_EVENT, RELATIONSHIP_INBOX_OPEN_EVENT, stashInboxComposeSeed } from "../../inbox/relationship-inbox-panel";

// R07: the inbox is a page now (/app/inbox). Pages that used to open the drawer
// (「メールを下書き」 in iOrbit cards, the 「下書きに移しました」 receipt) still fire the
// same window events; the shell sends them to the page, with the compose seed.
export function InboxEventBridge() {
  const router = useRouter();
  useEffect(() => {
    const onOpen = () => router.push("/app/inbox");
    const onCompose = (event: Event) => {
      stashInboxComposeSeed((event as CustomEvent).detail ?? {});
      router.push("/app/inbox");
    };
    window.addEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen);
    window.addEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose);
    return () => { window.removeEventListener(RELATIONSHIP_INBOX_OPEN_EVENT, onOpen); window.removeEventListener(RELATIONSHIP_INBOX_COMPOSE_EVENT, onCompose); };
  }, [router]);
  return null;
}
