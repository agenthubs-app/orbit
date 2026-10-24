import { useEffect, useState, type ReactNode } from "react";

import type { AppVersionGateDecision } from "../view-models/app-version-policy";

type BlockedDecision = Exclude<AppVersionGateDecision, { kind: "allow" }>;

/**
 * Keep the navigator mounted for Expo Router; hide it only while a force-update or
 * maintenance decision stands.
 *
 * UX-4 (user 2026-10-25): the check runs in the background. The app is usable while it
 * runs (a phone app should feel local, not show "checking the server" on every screen),
 * the last decision stays in force while a new scope is re-checked, and a failed check
 * allows. Callers re-check by changing `scopeKey` (account, server, return to foreground).
 */
export function RootVersionGate({ scopeKey, check, blocked, children }: {
  scopeKey: string;
  check: () => Promise<AppVersionGateDecision>;
  blocked: (decision: BlockedDecision, retry: () => void) => ReactNode;
  children: (allowed: boolean) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState<AppVersionGateDecision | null>(null);

  useEffect(() => {
    let current = true;
    void check().catch(() => ({ kind: "allow", diagnostic: "policy-unavailable" } as const)).then(next => {
      if (current) setDecision(next);
    });
    return () => { current = false; };
  }, [scopeKey, check, attempt]);

  const blocking = decision && decision.kind !== "allow" ? decision : null;
  return <>
    {children(!blocking)}
    {blocking ? blocked(blocking, () => setAttempt(value => value + 1)) : null}
  </>;
}
