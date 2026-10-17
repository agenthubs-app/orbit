import * as Crypto from "expo-crypto";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, IconButton, OfflineBar, Skeleton, UiText } from "../../components/ui";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { HostEventsRow } from "../host/HostEventsRow";
import { accountDestination, createAccountApi } from "./account-api";
import { MyPageContent, type AccountProfileData } from "./MyPageContent";
import { useAccountProfile } from "./useAccountProfile";

export function MyPageScreen({ scopeKey, isScopeCurrent, completionNext }: { scopeKey: string; isScopeCurrent: () => boolean; completionNext?: string | null }) {
  const router = useRouter();
  const { t, language } = useOrbitLocale();
  const state = useAccountProfile(scopeKey);
  const client = useOrbitApiClient({ scopeKey: state.scopeKey });
  const api = useMemo(() => createAccountApi(client, state.path), [client, state.path]);
  const [summaries, setSummaries] = useState<Awaited<ReturnType<typeof api.summaries>>>({ unread: null, going: null, host: null });
  const [candidates, setCandidates] = useState<string[]>([]);
  const [saved, setSaved] = useState<AccountProfileData | null>(null);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const data = saved ?? state.data;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    void api.summaries(abort.signal).then(value => { if (!abort.signal.aborted && isScopeCurrent()) setSummaries(value); });
    return () => abort.abort();
  }, [api, isScopeCurrent]);
  useEffect(() => { setSaved(null); }, [state.data]);
  const profileId = data?.profile?.id;
  const needsCandidates = Boolean(data?.profile?.offering?.length && !data.profile.seeking?.length);
  useEffect(() => {
    if (!profileId || !needsCandidates || state.offline) { setCandidates([]); return; }
    const abort = new AbortController();
    void api.seekCandidates(language, abort.signal).then(values => { if (!abort.signal.aborted && isScopeCurrent()) setCandidates(values); });
    return () => abort.abort();
  }, [api, profileId, needsCandidates, language, state.offline, isScopeCurrent]);
  function open(path: string) { router.push(accountDestination(path, state.path) as Href); }
  async function candidate(value: string, accept: boolean) {
    if (!accept) { setCandidates(values => values.filter(item => item !== value)); return; }
    if (state.offline || !data?.profile || saving.current || !isScopeCurrent()) return;
    saving.current = true; setError(false);
    try {
      const receipt = await api.acceptCandidate(data.profile, value, Crypto.randomUUID(), controller.current?.signal);
      if (!isScopeCurrent()) return;
      if (receipt) { setSaved(receipt); setCandidates(values => values.filter(item => item !== value)); state.resource.refresh(); }
      else setError(true);
    } finally { saving.current = false; }
  }
  return <AppScreen title={t("me.title")} headerActions={<IconButton icon="settings" accessibilityLabel={t("me.settings")} onPress={() => open("/settings")} />}>
    <OfflineBar offline={state.offline} pending={0} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.resource.refresh} /> : null}
    {!data && state.resource.kind !== "loading" ? <Card><UiText>{t("me.loadError")}</UiText><Button label={t("me.retry")} onPress={state.resource.refresh} /></Card> : null}
    {error ? <UiText accessibilityRole="alert">{t("me.saveError")}</UiText> : null}
    {data ? <MyPageContent data={data} t={t} candidates={state.offline ? [] : candidates} unread={summaries.unread} going={summaries.going}
      hostEntry={summaries.host ? <HostEventsRow summary={summaries.host} /> : null} onOpen={open} onCandidate={(value, accept) => void candidate(value, accept)} /> : null}
    {completionNext && data?.completeness.status === "ready" ? <Button label={t("profile.done")} onPress={() => router.replace(completionNext as Href)} /> : null}
  </AppScreen>;
}
