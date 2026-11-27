import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Skeleton, UiText, presentConfirm } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountIorbitContent } from "./AccountIorbitContent";
import { readAccountSemantic, writeAccountSemantic } from "./semantic-preference";
import { memoryEntryOf, type AccountMemoryList, type MemorySaveInput } from "./settings-api";
import type { AgentMemoryEntryContract } from "../../api/contract/agent-v1";

/** AG14 (board 7, App offline): the last list read per account API, shown read-only while offline. */
const lastMemoryList = new WeakMap<object, AccountMemoryList>();
import { useAccountEditor } from "./useAccountEditor";
import { useAccountSettingsApi } from "./useAccountSettingsApi";
import { useAccountDesign } from "./useAccountDesign";
import { AccountCopyNotice } from "./AccountCopyNotice";

export function AccountIorbitScreen() {
  const state = useAccountEditor(true); const api = useAccountSettingsApi(); const { t, language } = useOrbitLocale(); const router = useRouter();
  const design = useAccountDesign(); const designMode = state.path.includes("?design=");
  const [memories, setMemories] = useState<AccountMemoryList | null>(null);
  // D5: 「修改 ›」 of an answer's memory chip opens this screen with `?memory=<id>`.
  const params = useLocalSearchParams<{ memory?: string }>(); const openMemoryId = typeof params?.memory === "string" ? params.memory : null; const [goal, setGoal] = useState<Awaited<ReturnType<typeof api.goal>>>();
  const [semanticAvailable, setSemanticAvailable] = useState(false); const [semanticOn, setSemanticOn] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [monthlyLimit, setMonthlyLimit] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const controller = useRef<AbortController | null>(null); const current = useRef(api); current.current = api;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const active = () => !abort.signal.aborted && current.current === api;
    setMemories(null); setGoal(undefined); setSemanticAvailable(false); setBusy(false); setError(false);
    void readAccountSemantic(AsyncStorage).then(value => { if (active()) setSemanticOn(value); }).catch(() => { if (active()) setError(true); });
    if (designMode) {
      if (design) { setMemories({ memories: design.fixtures.memories.map(value => memoryEntryOf(value as Parameters<typeof memoryEntryOf>[0])), settings: { allowConversationLearning: true, enabled: true, updatedAt: "" } }); setGoal(design.variant === "empty" ? null : design.fixtures.goal); setSemanticAvailable(true); }
      return () => abort.abort();
    }
    void api.memories(abort.signal).then(values => {
      if (!active()) return;
      if (values) { lastMemoryList.set(api, values); setMemories(values); return; }
      // Offline: the list read last time, read-only (board 7); otherwise the read failed and says so.
      const last = lastMemoryList.get(api);
      if (last && state.offline) setMemories(last); else setError(true);
    });
    void api.goal(abort.signal).then(value => { if (active()) setGoal(value); });
    void api.semanticAvailable(abort.signal).then(value => { if (active()) setSemanticAvailable(value); });
    return () => abort.abort();
  }, [api, designMode, design?.fixtures, design?.variant, readVersion]);
  async function generate() {
    if (design) { state.patch({ bio: design.fixtures.bio }); return; }
    if (busy || state.offline || language === "ja") return; setBusy(true); setError(false); setMonthlyLimit(false);
    const bio = await api.introDraft(language, controller.current?.signal);
    if (current.current === api && !controller.current?.signal.aborted) { if (typeof bio === "string") state.patch({ bio }); else if (bio) setMonthlyLimit(true); else setError(true); setBusy(false); }
  }
  // AG14: the user's own changes on this screen — no card, saved at once; the list is read again after each.
  async function reread() { const values = await api.memories(controller.current?.signal); if (values && current.current === api && !controller.current?.signal.aborted) { lastMemoryList.set(api, values); setMemories(values); } }
  async function memorySwitch(key: "enabled" | "allowConversationLearning", on: boolean) {
    if (busy || state.offline || !memories) return;
    if (designMode) { setMemories({ ...memories, settings: { ...memories.settings, [key]: on } }); return; }
    setBusy(true);
    const ok = await api.memorySettings({ [key]: on }, controller.current?.signal);
    if (current.current === api && !controller.current?.signal.aborted) { if (ok) setMemories(values => values ? { ...values, settings: { ...values.settings, [key]: on } } : values); else setError(true); setBusy(false); }
  }
  async function memorySave(input: MemorySaveInput, memoryId: string | null): Promise<boolean> {
    if (busy || state.offline) return false;
    if (designMode) return false;
    setBusy(true);
    const ok = await api.saveMemory(input, memoryId, controller.current?.signal);
    if (ok) await reread();
    setBusy(false);
    return ok;
  }
  async function memoryRemove(entry: AgentMemoryEntryContract): Promise<boolean> {
    if (busy || state.offline || !await presentConfirm({ title: t("me.deleteMemory"), confirmLabel: t("me.delete"), cancelLabel: t("common.cancel"), destructive: true })) return false;
    if (current.current !== api || controller.current?.signal.aborted) return false;
    if (designMode) { setMemories(values => values ? { ...values, memories: values.memories.filter(value => value.memoryId !== entry.memoryId) } : values); return true; }
    setBusy(true);
    const ok = await api.removeMemory(entry.memoryId, controller.current?.signal, entry.revision);
    if (ok) await reread();
    setBusy(false);
    return ok;
  }
  async function semantic(value: boolean) { try { await writeAccountSemantic(AsyncStorage, value); setSemanticOn(value); } catch { setError(true); } }
  return <AppScreen inset="kit" title={t("me.iorbit")}><AccountCopyNotice copy={state.copy} language={language} t={t} />
    {state.resource.kind === "loading" ? <Skeleton onRetry={state.refresh} /> : null}
    {!state.session && state.resource.kind !== "loading" ? <Card><UiText>{t(state.resource.kind === "offline" ? "sync.notOnDevice" : "me.loadError")}</UiText>
      <Button label={t("me.retry")} onPress={state.refresh} /></Card> : null}
    {error ? <Card><UiText accessibilityRole="alert">{t("me.failed")}</UiText>
      <Button label={t("me.retry")} disabled={busy || state.saving} onPress={() => setReadVersion(value => value + 1)} /></Card> : null}
    {monthlyLimit ? <Card><UiText accessibilityRole="alert">{t("me.aiMonthlyLimit")}</UiText></Card> : null}
    {state.feedback ? <UiText accessibilityRole="alert">{state.feedback}</UiText> : null}
    {state.session ?
      <AccountIorbitContent t={t} goal={goal?.goal ?? (goal === null ? null : undefined)} bio={state.session.draft.bio} memories={memories} semanticAvailable={semanticAvailable} semanticOn={semanticOn} busy={busy || state.saving} offline={state.offline} canSave={state.canSave} aiAvailable={(designMode || language !== "ja") && !state.offline}
      onGoal={() => router.push((goal ? `/task?seg=plan&plan=${encodeURIComponent(goal.planId)}` : "/task?seg=plan") as Href)} onBio={bio => state.patch({ bio })} onGenerate={() => void generate()} onSave={() => void state.save()} onSemantic={value => void semantic(value)} language={language} openMemoryId={openMemoryId} onMemorySwitch={(key, on) => void memorySwitch(key, on)} onMemorySave={memorySave} onMemoryRemove={memoryRemove} /> : null}
  </AppScreen>;
}
