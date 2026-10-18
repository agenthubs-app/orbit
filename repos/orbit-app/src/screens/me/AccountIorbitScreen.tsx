import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Skeleton, UiText, presentConfirm } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountIorbitContent } from "./AccountIorbitContent";
import { readAccountSemantic, writeAccountSemantic } from "./semantic-preference";
import type { AccountMemory } from "./settings-api";
import { useAccountEditor } from "./useAccountEditor";
import { useAccountSettingsApi } from "./useAccountSettingsApi";
import { useAccountDesign } from "./useAccountDesign";
import { AccountCopyNotice } from "./AccountCopyNotice";

export function AccountIorbitScreen() {
  const state = useAccountEditor(true); const api = useAccountSettingsApi(); const { t, language } = useOrbitLocale(); const router = useRouter();
  const design = useAccountDesign(); const designMode = state.path.includes("?design=");
  const [memories, setMemories] = useState<AccountMemory[] | null>(null); const [goal, setGoal] = useState<Awaited<ReturnType<typeof api.goal>>>();
  const [semanticAvailable, setSemanticAvailable] = useState(false); const [semanticOn, setSemanticOn] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const controller = useRef<AbortController | null>(null); const current = useRef(api); current.current = api;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const active = () => !abort.signal.aborted && current.current === api;
    setMemories(null); setGoal(undefined); setSemanticAvailable(false); setBusy(false); setError(false);
    void readAccountSemantic(AsyncStorage).then(value => { if (active()) setSemanticOn(value); }).catch(() => { if (active()) setError(true); });
    if (designMode) {
      if (design) { setMemories(design.fixtures.memories.map(value => ({ ...value }))); setGoal(design.variant === "empty" ? null : design.fixtures.goal); setSemanticAvailable(true); }
      return () => abort.abort();
    }
    void api.memories(abort.signal).then(values => { if (active()) { if (values) setMemories(values); else setError(true); } });
    void api.goal(abort.signal).then(value => { if (active()) setGoal(value); });
    void api.semanticAvailable(abort.signal).then(value => { if (active()) setSemanticAvailable(value); });
    return () => abort.abort();
  }, [api, designMode, design?.fixtures, design?.variant, readVersion]);
  async function generate() {
    if (design) { state.patch({ bio: design.fixtures.bio }); return; }
    if (busy || state.offline || language === "ja") return; setBusy(true); setError(false);
    const bio = await api.introDraft(language, controller.current?.signal);
    if (current.current === api && !controller.current?.signal.aborted) { if (bio !== null) state.patch({ bio }); else setError(true); setBusy(false); }
  }
  async function remove(id: string) {
    if (busy || state.offline || !await presentConfirm({ title: t("me.deleteMemory"), confirmLabel: t("me.delete"), cancelLabel: t("common.cancel"), destructive: true })) return;
    if (current.current !== api || controller.current?.signal.aborted) return; setBusy(true);
    if (designMode) { setMemories(values => values?.filter(value => value.memoryId !== id) ?? null); setBusy(false); return; }
    const success = await api.removeMemory(id, controller.current?.signal);
    if (current.current === api && !controller.current?.signal.aborted) { if (success) setMemories(values => values?.filter(value => value.memoryId !== id) ?? null); else setError(true); setBusy(false); }
  }
  async function semantic(value: boolean) { try { await writeAccountSemantic(AsyncStorage, value); setSemanticOn(value); } catch { setError(true); } }
  return <AppScreen inset="kit" title={t("me.iorbit")}><AccountCopyNotice copy={state.copy} language={language} t={t} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : null}
    {!state.session && state.resource.kind !== "loading" ? <Card><UiText>{t(state.resource.kind === "offline" ? "sync.notOnDevice" : "me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></Card> : null}
    {error ? <Card><UiText accessibilityRole="alert">{t("me.failed")}</UiText>
      <Button label={t("me.retry")} disabled={busy || state.saving} onPress={() => setReadVersion(value => value + 1)} /></Card> : null}
    {state.feedback ? <UiText accessibilityRole="alert">{state.feedback}</UiText> : null}
    {state.session ?
      <AccountIorbitContent t={t} goal={goal?.goal ?? (goal === null ? null : undefined)} bio={state.session.draft.bio} memories={memories} semanticAvailable={semanticAvailable} semanticOn={semanticOn} busy={busy || state.saving} offline={state.offline} canSave={state.canSave} aiAvailable={(designMode || language !== "ja") && !state.offline}
      onGoal={() => router.push((goal ? `/task?seg=plan&plan=${encodeURIComponent(goal.planId)}` : "/task?seg=plan") as Href)} onBio={bio => state.patch({ bio })} onGenerate={() => void generate()} onSave={() => void state.save()} onDelete={id => void remove(id)} onSemantic={value => void semantic(value)} /> : null}
  </AppScreen>;
}
