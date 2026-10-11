// R24 记录弹层 (b4 A1 ① ③, UI-SPEC 记录弹层): two tabs.
//   人脈から — the people picked on the type page (or found by search) → one
//              「話した」 award each (POST …/awards, basis talked);
//   オフライン — a name is optional: with a name the server first answers
//              「この人ですか？」 (pick one, or 新しく登録); without one it is an
//              anonymous self-report, which counts only up to the target.
// The line 「プランに反映：<type> +X」 previews the next award (server `next`).
// R24 review: several people are recorded one by one; when one fails midway the
// sheet stays open with what happened (「N人を記録しました · M人は記録できませんでした」)
// and only the people not yet recorded stay ticked, so 記録する retries just them —
// a toast would vanish with the names of who still needs recording. The match rows
// are disabled while a request runs. 新しく登録 failing (CONTACT_CREATE_FAILED) asks
// before recording without a name; nothing is recorded until the user says so.
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanAwardResult, PlanPersonTypeDetail } from "../../api/contract/plan-v2";
import { BottomSheet, Button, Checkbox, SearchField, Segmented, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi } from "./plan-api";
import { newIdempotencyKey, type ContactCandidate } from "./plan-model";
import { ChoiceChip, InlineProblem, useFailureText } from "./plan-ui";

const SEARCH_DEBOUNCE_MS = 300;

export type RecordPerson = { contactId: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  planId: string;
  detail: PlanPersonTypeDetail;
  /** People already ticked on the type page (すでに話した / N 人を記録). */
  preselected: readonly RecordPerson[];
  onRecorded: (results: PlanAwardResult[], who: string) => void;
};

export function PlanRecordSheet({ visible, onClose, planId, detail, preselected, onRecorded }: Props) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const failureText = useFailureText();
  const api = usePlanApi();
  const [tab, setTab] = useState<"network" | "offline">("network");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactCandidate[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [picked, setPicked] = useState<RecordPerson[]>([]);
  const [name, setName] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [matches, setMatches] = useState<{ contactId: string; name: string; company: string | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [createFailed, setCreateFailed] = useState(false);
  const sequence = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setTab("network");
    setPicked([...preselected]);
    setQuery("");
    setName("");
    setDay("today");
    setMatches(null);
    setProblem(null);
    setCreateFailed(false);
  }, [preselected, visible]);

  useEffect(() => {
    if (!visible || tab !== "network" || preselected.length > 0 || query.trim() === "") { setResults(null); return; }
    const run = (sequence.current += 1);
    const timer = setTimeout(() => {
      void api.searchContacts(query.trim()).then((result) => {
        if (run !== sequence.current) return;
        setSearchFailed(!result.ok);
        setResults(result.ok ? result.data : []);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, preselected.length, query, tab, visible]);

  const at = () => {
    const date = new Date();
    if (day === "yesterday") date.setDate(date.getDate() - 1);
    return date.toISOString();
  };
  const finish = (awards: PlanAwardResult[], who: string) => {
    inFlight.current = false;
    setBusy(false);
    onClose();
    onRecorded(awards, who);
  };
  const begin = () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    return true;
  };
  const stop = () => { inFlight.current = false; setBusy(false); };

  const recordPeople = async () => {
    if (picked.length === 0 || !begin()) return;
    const awards: PlanAwardResult[] = [];
    for (const [index, person] of picked.entries()) {
      const result = await api.award(planId, detail.itemId, person.contactId, newIdempotencyKey("award"));
      if (!result.ok) {
        stop();
        if (awards.length === 0) { setProblem(failureText(result.failure)); return; }
        // Partial: keep the sheet, report both counts, leave only the unrecorded people ticked.
        const left = picked.slice(index);
        setPicked(left);
        setProblem(t("plan.record.partial", { failed: left.length, recorded: awards.length }));
        onRecorded(awards, awards.length === 1 ? picked[0]!.name : whoOf(awards.length));
        return;
      }
      awards.push(result.data);
    }
    finish(awards, picked.length === 1 ? picked[0]!.name : whoOf(picked.length));
  };
  const whoOf = (count: number) => t("plan.award.people", { count });

  const recordOffline = async (body: { contactId?: string; name?: string; createContact?: boolean; anonymous?: true }, who: string) => {
    if (!begin()) return;
    setCreateFailed(false);
    const result = await api.talkedOffline(planId, detail.itemId, { ...body, at: at(), idempotencyKey: newIdempotencyKey("offline") });
    if (!result.ok) {
      stop();
      if (body.createContact && result.failure.kind === "other" && result.failure.reason === "CONTACT_CREATE_FAILED") { setCreateFailed(true); return; }
      setProblem(failureText(result.failure));
      return;
    }
    if (result.data.matches && result.data.matches.length > 0) { stop(); setMatches([...result.data.matches]); return; }
    if (result.data.award) finish([result.data.award], who);
    else stop();
  };
  const submitOffline = () => {
    const trimmed = name.trim();
    if (trimmed) void recordOffline({ name: trimmed }, trimmed);
    else void recordOffline({ anonymous: true }, t("plan.type.anonymous"));
  };

  const preview = detail.next.part === "none"
    ? t("plan.record.previewNone", { label: detail.shortLabel })
    : t(detail.next.part === "overflow" ? "plan.record.previewHalf" : "plan.record.preview", { label: detail.shortLabel, points: detail.next.points });
  const pool: RecordPerson[] = preselected.length > 0 ? [...preselected] : (results ?? []).map((item) => ({ contactId: item.id, name: item.name }));
  const toggle = (person: RecordPerson) => setPicked((list) => (list.some((item) => item.contactId === person.contactId) ? list.filter((item) => item.contactId !== person.contactId) : [...list, person]));

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("plan.record.title")}>
      <View style={styles.body} testID="record-sheet">
        <UiText accessibilityRole="header" style={styles.title}>{t("plan.record.title")}</UiText>
        <UiText style={styles.note}>{`${detail.emoji} ${detail.shortLabel}`}</UiText>
        <Segmented accessibilityLabel={t("plan.record.title")} value={tab} onChange={(key) => { setTab(key); setMatches(null); setProblem(null); setCreateFailed(false); }} segments={[{ key: "network", label: t("plan.record.tabNetwork") }, { key: "offline", label: t("plan.record.tabOffline") }]} />
        {tab === "network" ? (
          <View style={styles.block}>
            {preselected.length === 0 ? <SearchField value={query} onChangeText={setQuery} placeholder={t("plan.record.searchPlaceholder")} accessibilityLabel={t("plan.record.searchLabel")} /> : <UiText style={styles.note}>{t("plan.record.people", { count: picked.length })}</UiText>}
            {searchFailed ? <InlineProblem text={t("plan.record.searchFailed")} /> : null}
            {results && results.length === 0 && !searchFailed ? <UiText style={styles.note}>{t("plan.record.noResults")}</UiText> : null}
            {pool.map((person) => {
              const checked = picked.some((item) => item.contactId === person.contactId);
              return (
                <View key={person.contactId} style={styles.person}>
                  <Checkbox checked={checked} onChange={() => toggle(person)} accessibilityLabel={t("plan.type.select", { name: person.name })} />
                  <UiText style={styles.name}>{person.name}</UiText>
                </View>
              );
            })}
          </View>
        ) : matches ? (
          <View style={styles.block}>
            <UiText style={styles.subtitle}>{t("plan.record.matchTitle")}</UiText>
            {matches.map((match) => (
              <UiPressable key={match.contactId} accessibilityRole="button" accessibilityLabel={match.company ? `${match.name} · ${match.company}` : match.name} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void recordOffline({ contactId: match.contactId }, match.name)} style={[styles.match, busy && styles.disabled]}>
                <UiText style={styles.name}>{match.name}</UiText>
                {match.company ? <UiText style={styles.note}>{match.company}</UiText> : null}
              </UiPressable>
            ))}
            {createFailed ? (
              <View accessibilityRole="alert" style={styles.ask} testID="create-failed">
                <UiText style={styles.askText}>{t("plan.record.createFailed")}</UiText>
                <Button label={t("plan.record.recordAnonymous")} onPress={() => void recordOffline({ anonymous: true }, t("plan.type.anonymous"))} variant="secondary" loading={busy} disabled={busy} />
              </View>
            ) : <Button label={t("plan.record.newContact")} icon="user-plus" onPress={() => void recordOffline({ createContact: true, name: name.trim() }, name.trim())} variant="secondary" disabled={busy} />}
          </View>
        ) : (
          <View style={styles.block}>
            <TextField label={t("plan.record.nameLabel")} placeholder={t("plan.record.namePlaceholder")} value={name} onChangeText={setName} />
            <UiText style={styles.note}>{name.trim() ? t("plan.record.nameNote") : t("plan.record.anonymousNote", { target: detail.targetCount })}</UiText>
            <UiText style={styles.label}>{t("plan.record.when")}</UiText>
            <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.record.when")} style={styles.chips}>
              <ChoiceChip label={t("plan.record.today")} selected={day === "today"} onPress={() => setDay("today")} />
              <ChoiceChip label={t("plan.record.yesterday")} selected={day === "yesterday"} onPress={() => setDay("yesterday")} />
            </View>
          </View>
        )}
        <UiText style={styles.note}>{t("plan.record.rule")}</UiText>
        <View style={styles.preview}><UiText style={styles.previewText}>{preview}</UiText></View>
        {problem ? <InlineProblem text={problem} /> : null}
        {tab === "network" ? (
          <Button block label={t("plan.record.submit")} onPress={() => void recordPeople()} variant="primary" loading={busy} disabled={picked.length === 0} />
        ) : matches ? null : (
          <Button block label={t("plan.record.submit")} onPress={submitOffline} variant="primary" loading={busy} />
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  subtitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  label: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  note: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  block: { gap: 10 },
  person: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  match: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12, gap: 2 },
  chips: { flexDirection: "row", gap: 8 },
  preview: { backgroundColor: colors.macLav, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  previewText: { color: colors.macLavText, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  ask: { backgroundColor: colors.macApricot, borderRadius: radius.md, padding: 12, gap: 8 },
  askText: { color: colors.macApricotText, fontSize: 13, lineHeight: 20, fontWeight: "600" },
}));
