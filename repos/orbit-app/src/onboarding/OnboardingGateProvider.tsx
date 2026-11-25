import { usePathname } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { readOnboardingProfile } from "../api/profile-onboarding";
import { readProfileOnboardingProgress } from "../api/profile-onboarding-progress";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import { profileOnboardingStorage, type OnboardingVerdict } from "../storage/profile-onboarding-storage";
import { onboardingRequired } from "../view-models/profile-onboarding";
import { resolveOnboardingGate, type OnboardingGateStatus } from "./onboarding-gate";

interface OnboardingGate {
  status: OnboardingGateStatus;
  /** Onboarding's own answer: it opened for this account (`required`) or is done (`clear`). */
  settle: (verdict: OnboardingVerdict) => Promise<void>;
}

const Context = createContext<OnboardingGate>({ status: "off", settle: async () => undefined });
export const useOnboardingGate = (): OnboardingGate => useContext(Context);

export function OnboardingGateProvider({ children }: PropsWithChildren) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const actorId = auth.ready && server.ready && auth.signedIn && !auth.deletionPending ? auth.actorId : null;
  const scopeKey = actorId ? `${server.baseUrl}\u0000${actorId}` : null;
  const [resolved, setResolved] = useState<{ scopeKey: string; status: Exclude<OnboardingGateStatus, "off" | "unknown"> } | null>(null);
  const status: OnboardingGateStatus = scopeKey === null ? "off" : resolved?.scopeKey === scopeKey ? resolved.status : "unknown";
  const current = useRef(scopeKey);
  current.current = scopeKey;

  const settle = useCallback(async (verdict: OnboardingVerdict) => {
    if (!actorId || !scopeKey) return;
    setResolved({ scopeKey, status: verdict });
    await profileOnboardingStorage.writeVerdict({ actorId, baseUrl: server.baseUrl }, verdict);
  }, [actorId, scopeKey, server.baseUrl]);

  const check = useCallback(async () => {
    if (!actorId || !scopeKey) return;
    const scope = { actorId, baseUrl: server.baseUrl };
    const next = await resolveOnboardingGate({
      stored: () => profileOnboardingStorage.readVerdict(scope),
      required: async () => {
        const [profile, progress] = await Promise.all([readOnboardingProfile(client), readProfileOnboardingProgress(client)]);
        return profile.ok && progress.ok ? onboardingRequired(profile.detail, progress.progress) : null;
      },
      remember: verdict => profileOnboardingStorage.writeVerdict(scope, verdict),
    });
    // Onboarding may have settled it meanwhile; its answer wins.
    if (current.current === scopeKey) setResolved(value => (value?.scopeKey === scopeKey && value.status !== "open" ? value : { scopeKey, status: next }));
  }, [actorId, client, scopeKey, server.baseUrl]);

  // On sign-in the next page is onboarding, which reads the same two answers and settles this itself.
  const pathname = usePathname();
  const answersItself = pathname.startsWith("/profile/onboarding") || pathname.startsWith("/account");
  const waiting = status === "unknown" && !answersItself;
  useEffect(() => { if (waiting) void check(); }, [check, waiting]);
  useEffect(() => {
    if (status !== "open") return;
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void check(); });
    return () => subscription.remove();
  }, [check, status]);

  const value = useMemo(() => ({ status, settle }), [settle, status]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
