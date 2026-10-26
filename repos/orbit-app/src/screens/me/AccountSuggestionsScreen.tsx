import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, OfflineBar, Skeleton, TextField, UiText, presentActionSheet } from "../../components/ui";
import { encodeDirectScanImage } from "../../api/batch-images";
import { scanOwnBusinessCard } from "../../api/profile-onboarding";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useToast } from "../../components/ui/Toast";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountSuggestionsContent } from "./AccountSuggestionsContent";
import { createAccountSuggestionsApi } from "./suggestions-api";
import { accountExtractionSuggestion, accountLiveSuggestions, type AccountSuggestionCard, type AccountSuggestionSource } from "./suggestions-model";
import { useAccountDesign } from "./useAccountDesign";
import { useAccountEditor } from "./useAccountEditor";

export function AccountSuggestionsScreen() {
  const state = useAccountEditor(); const { colors } = useOrbitTheme(); const toast = useToast(); const { t, language } = useOrbitLocale(); const router = useRouter(); const design = useAccountDesign(); const designMode = state.path.includes("?design=");
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([state.scope, state.path]) });
  const api = useMemo(() => createAccountSuggestionsApi(client, state.path), [client, state.path]);
  const [cards, setCards] = useState<AccountSuggestionCard[]>([]); const [selected, setSelected] = useState<Set<string>>(new Set()); const [filter, setFilter] = useState<AccountSuggestionSource | "all">("all");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [inputKind, setInputKind] = useState<"business-card" | "resume" | null>(null); const [text, setText] = useState("");
  const abort = useRef<AbortController | null>(null); const current = useRef(api); current.current = api;
  const ids = useRef(new Map<string, string>());
  const mutation = (key: string) => { let id = ids.current.get(key); if (!id) { id = Crypto.randomUUID(); ids.current.set(key, id); } return id; };
  const reload = useCallback(async () => {
    setLoading(true); setReadFailed(false); setError(null);
    if (designMode) {
      if (!design) return;
      const values = design.variant === "empty" ? [] : design.variant === "few" ? design.fixtures.suggestions.slice(0, 2) : design.fixtures.suggestions;
      setCards(values.map(card => ({ ...card, fields: card.fields.map((field, index) => ({ ...field, id: `${card.id}:${index}`, value: ["offering", "seeking"].includes(field.key) ? field.proposed.split(" · ") : field.proposed })) }))); setLoading(false); return;
    }
    const signal = abort.current?.signal; const values = await api.list(language, signal);
    if (current.current !== api || signal?.aborted) return;
    if (values) setCards(accountLiveSuggestions(values, state.baseProfile?.displayName ?? t("settings.account"))); else { setReadFailed(true); setError(t("me.failed")); } setLoading(false);
  }, [api, language, designMode, design?.fixtures, design?.variant, state.baseProfile?.displayName, t]);
  useEffect(() => { const controller = new AbortController(); abort.current = controller; setCards([]); setSelected(new Set()); setFilter("all"); setBusy(false); setInputKind(null); setText(""); ids.current.clear(); void reload(); return () => controller.abort(); }, [reload]);
  const active = () => current.current === api && !abort.current?.signal.aborted;
  function select(id: string) { setSelected(values => { const next = new Set(values); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function removeFields(idsToRemove: ReadonlySet<string>) { setCards(values => values.map(card => ({ ...card, fields: card.fields.filter(field => !idsToRemove.has(field.id)) })).filter(card => card.fields.length)); setSelected(values => new Set([...values].filter(id => !idsToRemove.has(id)))); }
  async function dismiss(id: string) {
    if (busy || state.offline) return; const field = cards.flatMap(card => card.fields).find(item => item.id === id); if (!field) return;
    if (!field.live || designMode) { removeFields(new Set([id])); return; }
    setBusy(true);
    const confirmed = await api.dismiss(field.live, mutation(`dismiss:${id}`), language, abort.current?.signal);
    if (active()) { if (confirmed) removeFields(new Set([id])); else setError(t("me.failed")); setBusy(false); }
  }
  async function apply() {
    if (busy || state.offline || !state.baseProfile) return; setBusy(true); setError(null);
    const localContactIds = new Set(cards.filter(card => card.target === "contact" && card.sample && designMode).flatMap(card => card.fields).filter(field => selected.has(field.id)).map(field => field.id));
    try {
      const intent = JSON.stringify([state.baseProfile.updatedAt, [...selected].sort()]); let sequence = 0;
      const result = await api.apply(cards, selected, state.baseProfile, () => mutation(`${intent}:${sequence++}`), language, abort.current?.signal);
      if (!active()) return;
      if (result.receipt) { const failures = new Set(result.decisionFailures); removeFields(new Set([...selected].filter(id => !failures.has(id)))); state.refresh(); if (failures.size) setError(t("me.partial")); else toast.success(t("me.saved")); }
      else if (localContactIds.size) removeFields(localContactIds);
      else setError(t("me.saveError"));
    } catch { if (active()) setError(t("me.saveError")); }
    finally { if (active()) setBusy(false); }
  }
  async function extract(kind: "business-card" | "resume", sourceText: string) {
    if (!state.baseProfile || busy || !sourceText.trim()) return; setBusy(true); setError(null);
    try {
      const result = await api.extract(kind, sourceText, abort.current?.signal);
      if (!active()) return;
      const card = result ? accountExtractionSuggestion(result, state.baseProfile) : null;
      if (card) { setCards(values => [card, ...values.filter(value => value.id !== card.id)]); setInputKind(null); setText(""); }
      else setError(t("profile.extractionNextEmpty"));
    } catch { if (active()) setError(t("me.failed")); }
    finally { if (active()) setBusy(false); }
  }
  async function entry(kind: "business-card" | "resume" | "chat") {
    if (kind === "chat") { router.push("/ai" as Href); return; }
    if (busy || state.offline) return;
    setInputKind(kind); setError(null);
    if (designMode) return;
    try {
      if (kind === "resume") {
        // The current extraction service accepts text, not PDF/DOCX bytes. Offer only a supported file type.
        const result = await DocumentPicker.getDocumentAsync({ type: "text/plain", multiple: false, copyToCacheDirectory: true });
        if (!active() || result.canceled || !result.assets[0]) return;
        const source = await new File(result.assets[0].uri).text(); if (active()) { setText(source); await extract("resume", source); }
        return;
      }
      const choice = await presentActionSheet({ title: t("me.scanCard"), options: [{ key: "camera", label: t("onboarding.scanCamera") }, { key: "library", label: t("onboarding.scanLibrary") }] });
      if (!choice || !active()) return;
      // The iOS photo picker needs no library access (QA-D: it asked for full access).
      const permission = choice === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : Platform.OS === "ios" ? { granted: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!active()) return;
      if (!permission.granted) { setError(t("onboarding.cameraDenied")); return; }
      const options = { quality: 0.8, mediaTypes: ["images"] as ImagePicker.MediaType[] };
      const image = choice === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = !image.canceled ? image.assets[0] : null;
      if (!asset || !active()) return;
      const card = await encodeDirectScanImage({ ...asset, fileName: asset.fileName ?? "card.jpg" });
      if (!active()) return;
      const scanned = await scanOwnBusinessCard(client, card, abort.current?.signal);
      if (!active()) return;
      if (!scanned.ok) { setError(t("me.failed")); return; }
      await extract("business-card", `Name: ${scanned.name}\nCompany: ${scanned.company}\nRole: ${scanned.title}`);
    } catch { if (active()) setError(t("me.failed")); }
  }
  return <AppScreen inset="kit" title={t("me.suggestions")}>
    <OfflineBar offline={state.offline} pending={0} />
    {loading ? <Skeleton onRetry={() => void reload()} /> : null}
    {error ? <Card><UiText accessibilityRole="alert" style={{ color: colors.coralText }}>{error}</UiText>
      <Button label={t("me.retry")} onPress={() => void reload()} /></Card> : null}
    {inputKind ? <Card>
      <TextField multiline label={t("me.sourceText")} value={text} onChangeText={setText} />
      <Button label={t("me.extract")} disabled={busy || state.offline || !text.trim()} onPress={() => void extract(inputKind, text)} />
      <Button label={t("common.cancel")} variant="ghost" onPress={() => setInputKind(null)} /></Card> : null}
    {!loading && !readFailed ?
      <AccountSuggestionsContent cards={cards} t={t} selected={selected} filter={filter} busy={busy || state.offline} onFilter={setFilter} onSelect={select} onDismiss={id => void dismiss(id)} onAll={cardId => setSelected(values => new Set([...values, ...cards.filter(card => card.id === cardId).flatMap(card => card.fields.map(field => field.id))]))} onApply={() => void apply()} onEntry={kind => void entry(kind)} /> : null}
  </AppScreen>;
}
