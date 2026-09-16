import { getLocales } from "expo-localization";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";

import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import type { OrbitLanguagePreferenceContract } from "../api/contract/account-language-preference";
import type { OrbitLanguage } from "../api/contract/language";
import {
  acceptLanguagePreferenceReceipt,
  createLanguagePreferenceSaveAttempt,
  parseLanguagePreference,
  type LanguagePreferenceSaveAttempt,
  type LanguagePreferenceScope,
} from "../api/language-preference";
import { useOrbitApiClient } from "../hooks/useOrbitApiClient";
import {
  languageFromDeviceLocales,
  resolveEffectiveLanguage,
} from "./locale-core";
import {
  OrbitLocaleContext,
  type OrbitLanguageChoice,
  type OrbitLocaleContextValue,
  type OrbitLocaleSyncState,
} from "./OrbitLocaleContext";
import { createTranslator } from "./messages";

export {
  useOrbitLocale,
  type OrbitLanguageChoice,
  type OrbitLocaleContextValue,
  type OrbitLocaleSyncState,
} from "./OrbitLocaleContext";

const systemPreference: OrbitLanguagePreferenceContract = {
  mode: "system",
  language: null,
  updatedAt: null,
};

function readDeviceLanguage(previous: OrbitLanguage = "zh"): {
  error: string | null;
  language: OrbitLanguage;
} {
  try {
    return { error: null, language: languageFromDeviceLocales(getLocales()) };
  } catch {
    return {
      error: "DEVICE_LANGUAGE_UNAVAILABLE",
      language: previous,
    };
  }
}

function choiceMatchesPreference(
  choice: OrbitLanguageChoice,
  preference: OrbitLanguagePreferenceContract,
): boolean {
  return choice === "system"
    ? preference.mode === "system"
    : preference.mode === "manual" && preference.language === choice;
}

export function OrbitLocaleProvider({ children }: { children: ReactNode }) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const initialDevice = useMemo(
    () => Platform.OS === "web"
      ? { error: null, language: "zh" as const }
      : readDeviceLanguage(),
    [],
  );
  const [deviceLanguage, setDeviceLanguage] = useState(initialDevice.language);
  const [deviceError, setDeviceError] = useState(initialDevice.error);
  const [preference, setPreference] = useState<OrbitLanguagePreferenceContract>(systemPreference);
  const [displayChoice, setDisplayChoice] = useState<OrbitLanguageChoice>("system");
  const [syncState, setSyncState] = useState<OrbitLocaleSyncState>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const scopeRevision = useRef(0);
  const desiredRevision = useRef(0);
  const desiredChoice = useRef<OrbitLanguageChoice>("system");
  const baseline = useRef<OrbitLanguagePreferenceContract>(systemPreference);
  const lastAttempt = useRef<LanguagePreferenceSaveAttempt | null>(null);
  const scope: LanguagePreferenceScope | null = auth.ready
    && server.ready
    && auth.signedIn
    && auth.user
    && auth.actorId
    ? {
        actorId: auth.actorId,
        baseUrl: server.baseUrl,
        cookieHeader: auth.cookieHeader,
      }
    : null;
  const scopeKey = scope
    ? JSON.stringify([scope.baseUrl, scope.actorId, scope.cookieHeader])
    : "signed-out";
  const currentScope = useRef<{ key: string; value: LanguagePreferenceScope | null }>({
    key: scopeKey,
    value: scope,
  });
  currentScope.current = { key: scopeKey, value: scope };

  const publishPreference = useCallback((next: OrbitLanguagePreferenceContract) => {
    baseline.current = next;
    setPreference(next);
    const choice: OrbitLanguageChoice = next.mode === "manual" ? next.language : "system";
    desiredChoice.current = choice;
    setDisplayChoice(choice);
  }, []);

  const readPreference = useCallback(async (
    requestScope: LanguagePreferenceScope,
    revision: number,
  ): Promise<OrbitLanguagePreferenceContract | null> => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const result = await client.get<unknown>("/api/account/language-preference", {
      signal: controller.signal,
    });
    if (
      controller.signal.aborted
      || scopeRevision.current !== revision
      || currentScope.current.key !== JSON.stringify([
        requestScope.baseUrl,
        requestScope.actorId,
        requestScope.cookieHeader,
      ])
    ) return null;
    if (!result.success || result.status >= 400) return null;
    return parseLanguagePreference(result.data);
  }, [client]);

  const saveChoice = useCallback(async (
    choice: OrbitLanguageChoice,
    choiceRevision: number,
    requestScope: LanguagePreferenceScope,
    requestScopeRevision: number,
    previousAttempt: LanguagePreferenceSaveAttempt | null,
  ): Promise<void> => {
    const requestInput = choice === "system"
      ? { mode: "system" as const, language: null, expectedUpdatedAt: baseline.current.updatedAt }
      : { mode: "manual" as const, language: choice, expectedUpdatedAt: baseline.current.updatedAt };
    const attempt = createLanguagePreferenceSaveAttempt(
      { ...requestScope, input: requestInput },
      previousAttempt,
      () => `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
    lastAttempt.current = attempt;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const result = await client.put<unknown>("/api/account/language-preference", {
      body: attempt.body,
      signal: controller.signal,
    });
    if (
      controller.signal.aborted
      || scopeRevision.current !== requestScopeRevision
      || currentScope.current.key !== JSON.stringify([
        requestScope.baseUrl,
        requestScope.actorId,
        requestScope.cookieHeader,
      ])
    ) return;

    if (result.success && result.status < 400) {
      const accepted = acceptLanguagePreferenceReceipt(attempt, result.data, requestScope);
      if (!accepted.ok) {
        setSyncState("error");
        setSyncError("LANGUAGE_PREFERENCE_RECEIPT_INVALID");
        return;
      }
      baseline.current = accepted.preference;
      setPreference(accepted.preference);
      lastAttempt.current = null;
      if (desiredRevision.current === choiceRevision && desiredChoice.current === choice) {
        setDisplayChoice(choice);
        setSyncState("idle");
        setSyncError(null);
      } else {
        const nextRevision = desiredRevision.current;
        void saveChoice(desiredChoice.current, nextRevision, requestScope, requestScopeRevision, null);
      }
      return;
    }

    if (!result.success && result.status === 409) {
      setSyncState("conflict");
      const latest = await readPreference(requestScope, requestScopeRevision);
      if (!latest) {
        setSyncState("error");
        setSyncError("LANGUAGE_PREFERENCE_CONFLICT_REFRESH_FAILED");
        return;
      }
      baseline.current = latest;
      setPreference(latest);
      if (choiceMatchesPreference(desiredChoice.current, latest)) {
        setDisplayChoice(desiredChoice.current);
        setSyncState("idle");
        setSyncError(null);
        lastAttempt.current = null;
      } else {
        void saveChoice(desiredChoice.current, desiredRevision.current, requestScope, requestScopeRevision, null);
      }
      return;
    }

    setSyncState("error");
    setSyncError(result.success ? "LANGUAGE_PREFERENCE_HTTP_FAILURE" : result.error.code);
  }, [client, readPreference]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const nextDevice = readDeviceLanguage();
    setDeviceLanguage(nextDevice.language);
    setDeviceError(nextDevice.error);
  }, []);

  useEffect(() => {
    const revision = scopeRevision.current + 1;
    scopeRevision.current = revision;
    requestRef.current?.abort();
    lastAttempt.current = null;
    desiredRevision.current = 0;
    desiredChoice.current = "system";
    baseline.current = systemPreference;
    setPreference(systemPreference);
    setDisplayChoice("system");
    setSyncError(null);

    if (!scope) {
      setSyncState(auth.ready && server.ready ? "idle" : "loading");
      return () => requestRef.current?.abort();
    }

    setSyncState("loading");
    void readPreference(scope, revision).then((next) => {
      if (scopeRevision.current !== revision || currentScope.current.key !== scopeKey) return;
      if (!next) {
        setSyncState("error");
        setSyncError("LANGUAGE_PREFERENCE_READ_FAILED");
        return;
      }
      publishPreference(next);
      setSyncState("idle");
    });
    return () => requestRef.current?.abort();
  }, [auth.ready, publishPreference, readPreference, scopeKey, server.ready]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const nextDevice = readDeviceLanguage(deviceLanguage);
      setDeviceLanguage(nextDevice.language);
      setDeviceError(nextDevice.error);
      const requestScope = currentScope.current.value;
      if (!requestScope) return;
      const revision = scopeRevision.current;
      setSyncState("loading");
      void readPreference(requestScope, revision).then((next) => {
        if (!next || scopeRevision.current !== revision) {
          if (scopeRevision.current === revision) setSyncState("error");
          return;
        }
        publishPreference(next);
        setSyncState("idle");
      });
    });
    return () => subscription.remove();
  }, [deviceLanguage, publishPreference, readPreference]);

  const setLanguage = useCallback(async (choice: OrbitLanguageChoice) => {
    desiredChoice.current = choice;
    const revision = desiredRevision.current + 1;
    desiredRevision.current = revision;
    setDisplayChoice(choice);
    const requestScope = currentScope.current.value;
    if (!requestScope) {
      setSyncState("idle");
      setSyncError(null);
      return;
    }
    setSyncState("saving");
    setSyncError(null);
    await saveChoice(choice, revision, requestScope, scopeRevision.current, null);
  }, [saveChoice]);

  const retryLanguageSave = useCallback(async () => {
    const requestScope = currentScope.current.value;
    if (!requestScope) return;
    setSyncState("saving");
    setSyncError(null);
    await saveChoice(
      desiredChoice.current,
      desiredRevision.current,
      requestScope,
      scopeRevision.current,
      lastAttempt.current,
    );
  }, [saveChoice]);

  const effective = displayChoice === "system"
    ? { language: deviceLanguage, source: "device" as const }
    : syncState === "idle" && preference.mode === "manual" && preference.language === displayChoice
      ? { language: displayChoice, source: "account" as const }
      : { language: displayChoice, source: "session-unsynced" as const };
  const value = useMemo<OrbitLocaleContextValue>(() => ({
    choice: displayChoice,
    deviceLanguage,
    error: syncError ?? deviceError,
    language: effective.language,
    preference,
    retryLanguageSave,
    setLanguage,
    source: effective.source,
    syncState,
    t: createTranslator(effective.language),
  }), [
    deviceError,
    deviceLanguage,
    displayChoice,
    effective.language,
    effective.source,
    preference,
    retryLanguageSave,
    setLanguage,
    syncError,
    syncState,
  ]);

  return <OrbitLocaleContext.Provider value={value}>{children}</OrbitLocaleContext.Provider>;
}
