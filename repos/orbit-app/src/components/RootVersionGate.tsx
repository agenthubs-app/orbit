import { useEffect, useState, type ReactNode } from "react";

import type { AppVersionGateDecision } from "../view-models/app-version-policy";

type BlockedDecision = Exclude<AppVersionGateDecision, { kind: "allow" }>;

/** Keep the navigator mounted for Expo Router while hiding it until the route is allowed. */
export function RootVersionGate({ scopeKey, check, checking, blocked, children }: {
  scopeKey: string;
  check: () => Promise<AppVersionGateDecision>;
  checking: ReactNode;
  blocked: (decision: BlockedDecision, retry: () => void) => ReactNode;
  children: (allowed: boolean) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [checked, setChecked] = useState<{ scopeKey: string; check: typeof check; attempt: number; decision: AppVersionGateDecision } | null>(null);

  useEffect(() => {
    let current = true;
    void check().catch(() => ({ kind: "allow", diagnostic: "policy-unavailable" } as const)).then(decision => {
      if (current) setChecked({ scopeKey, check, attempt, decision });
    });
    return () => { current = false; };
  }, [scopeKey, check, attempt]);

  const decision = checked?.scopeKey === scopeKey && checked.check === check && checked.attempt === attempt ? checked.decision : null;
  return <>
    {children(decision?.kind === "allow")}
    {!decision ? checking : decision.kind === "allow" ? null : blocked(decision, () => setAttempt(value => value + 1))}
  </>;
}
