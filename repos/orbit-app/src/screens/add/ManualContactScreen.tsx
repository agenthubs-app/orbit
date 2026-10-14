// R12 `contacts/new/manual` 手入力 (DESIGN §2.3, b11 A3 ①–④, App):
//   名前 (必須) and あるといいもの chips — 会社 (people's companies already in 人脈 as you
//   type), 出会った場所 (参加予定 / recent events, 紹介, その他), メモ (the contact's note),
//   連絡先 (メール / 電話); the density the save would give;
//   duplicates checked as you type, a name alone included (same rule as cards + 同名):
//   いま入力中 / 人脈にいる人 with 統合する（おすすめ） — only the differing fields, one
//   choice each — or 別の人として保存;
//   保存 opens the person's page with 「人脈に追加しました · 手入力 [元に戻す]」 for 5 s
//   (元に戻す = the server's undo: within 10 minutes and untouched only).
// The sample account cannot save (403 SAMPLE_READ_ONLY): the page says so.
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import type { IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type { ManualContactFieldChoice, ManualContactMergeField, ManualContactOrganizationSuggestion } from "../../api/contract/manual-contact";
import { AppScreen } from "../../components/AppScreen";
import { BottomSheet, Button, ConfirmDialog, FilterOption, Icon, MacTile, Radio, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { useAddApi } from "./add-api";
import { addDesignMock } from "./add-design-mock";
import { ManualSavedView, type ManualSaved } from "./ManualSavedView";
import { Caption, DensityDots, FadeIn, KIT_PAGE_INSET, KitHeadAction } from "./add-ui";
import {
  createBody,
  defaultChoices,
  differingFields,
  duplicateCheckBody,
  EMPTY_MANUAL_FORM,
  eventChips,
  densityMarks,
  formDensity,
  formFingerprint,
  monthDay,
  newAddKey,
  type EventChip,
  type ManualDecision,
  type ManualForm,
} from "./manual-model";

const DUPLICATE_DEBOUNCE_MS = 400;
const ORGANIZATION_DEBOUNCE_MS = 250;

type Extra = "organization" | "met" | "note" | "contact";

const FIELD_KEY: Record<ManualContactMergeField, MessageKey> = {
  displayName: "add.manual.name",
  email: "add.manual.email",
  organization: "add.manual.organization",
  phone: "add.manual.phone",
  role: "add.manual.role",
};
const DENSITY_KEY: Record<1 | 2 | 3, MessageKey> = { 1: "add.doors.density1", 2: "add.doors.density2", 3: "add.doors.density3" };

const deviceNow = () => new Date();

export function ManualContactScreen({ now = deviceNow }: { now?: () => Date } = {}) {
  const router = useRouter();
  const api = useAddApi();
  const toast = useToast();
  const { t } = useOrbitLocale();
  const { colors, m } = useManualStyles();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [form, setForm] = useState<ManualForm>(EMPTY_MANUAL_FORM);
  const [open, setOpen] = useState<Set<Extra>>(() => new Set());
  const [candidates, setCandidates] = useState<IngestContactCandidateContract[]>([]);
  const [decision, setDecision] = useState<ManualDecision>({ kind: "none" });
  const [organizations, setOrganizations] = useState<ManualContactOrganizationSuggestion[]>([]);
  const [orgFocused, setOrgFocused] = useState(false);
  // The company the person just chose (a suggestion or 「新しく登録」): the list stays closed until they edit it.
  const [orgChosen, setOrgChosen] = useState<string | null>(null);
  const [saved, setSaved] = useState<ManualSaved | null>(null);
  const [events, setEvents] = useState<EventChip[]>([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<"name" | "review" | "sample" | "failed" | null>(null);
  const key = useRef<{ fingerprint: string; key: string } | null>(null);
  const mounted = useRef(true);
  // Set on every mount: Fast Refresh and StrictMode re-run effects, and a ref left false would drop answers.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    void api.listEvents().then((list) => { if (mounted.current) setEvents(eventChips(list, now())); });
  }, [api, now]);

  // Duplicates as you type (a name alone is checked too): the same rule the cards use, plus 同名.
  const checkBody = duplicateCheckBody(form);
  const checkKey = JSON.stringify(checkBody);
  useEffect(() => {
    if (!checkBody) { setCandidates([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.checkManualDuplicates(checkBody, controller.signal).then((result) => {
        if (!mounted.current || controller.signal.aborted) return;
        setCandidates(result.ok ? [...result.data.candidates] : []);
      });
    }, DUPLICATE_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, checkKey]);

  // The decision belongs to the candidate shown: a different first candidate asks again.
  const candidate = candidates[0] ?? null;
  useEffect(() => {
    setDecision((current) => (current.kind === "merge" && current.contactId !== candidate?.contactId ? { kind: "none" } : current));
  }, [candidate?.contactId]);

  const orgQuery = form.organization.trim();
  useEffect(() => {
    if (!orgQuery || !orgFocused) { setOrganizations([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.suggestOrganizations(orgQuery, controller.signal).then((result) => {
        if (mounted.current && !controller.signal.aborted) setOrganizations(result.ok ? result.data.organizations.slice(0, 5) : []);
      });
    }, ORGANIZATION_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, orgFocused, orgQuery]);

  const set = <K extends keyof ManualForm>(field: K, value: ManualForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setProblem(null);
  };
  const toggle = (extra: Extra) => setOpen((current) => new Set(current).add(extra));
  const differing = useMemo(() => (candidate ? differingFields(candidate, form) : []), [candidate, form]);
  const density = formDensity(form);

  async function save() {
    if (saving) return;
    if (!form.displayName.trim()) { setProblem("name"); return; }
    if (candidate && decision.kind === "none") { setProblem("review"); return; }
    const fingerprint = formFingerprint(form, decision);
    if (key.current?.fingerprint !== fingerprint) key.current = { fingerprint, key: newAddKey("manual") };
    setSaving(true);
    setProblem(null);
    const snapshot = form;
    const result = await api.saveManual(createBody(form, decision, key.current.key));
    if (!mounted.current) return;
    setSaving(false);
    if (!result.ok) {
      setProblem(result.failure.kind === "sample" ? "sample" : "failed");
      return;
    }
    const answer = result.data;
    if (answer.outcome === "duplicate_review" || !answer.contactId) {
      setCandidates([...(answer.candidates ?? [])]);
      setDecision({ kind: "none" });
      setProblem("review");
      return;
    }
    const contactId = answer.contactId;
    setForm(EMPTY_MANUAL_FORM);
    setOpen(new Set());
    setCandidates([]);
    setDecision({ kind: "none" });
    key.current = null;
    if (answer.outcome === "merged") {
      // Push (not replace): this page stays underneath.
      router.push(`/contacts/${encodeURIComponent(contactId)}` as Href);
      toast.success(t("add.manual.mergedToast"), { sub: t("add.manual.addedSub", { name: snapshot.displayName.trim() }) });
      return;
    }
    // b11 #18 保存したあと: this page turns into the saved view (情報を濃くする), the toast keeps 元に戻す.
    const level = formDensity(snapshot);
    setSaved({ contactId, density: level, metLabel: snapshot.met?.label ?? null, name: snapshot.displayName.trim(), organization: snapshot.organization.trim() });
    toast.success(t("add.manual.addedToast"), {
      sub: t("add.manual.addedSubLevel", { dots: densityMarks(level), name: snapshot.displayName.trim() }),
      undo: () => void undoSaved(contactId, snapshot),
    });
  }

  // 元に戻す (simulator walkthrough fix): the server can take a few seconds, so say so at once;
  // the answer is always reported (the toast lives at the root, so it shows even if this page
  // has gone); the form comes back only while this page is still there, and dismissTo returns to
  // it whether the person's page is still on top or the person already went back by themselves.
  async function undoSaved(contactId: string, snapshot: ManualForm) {
    const request = api.undoManual(contactId).catch(() => null);
    // The toast closes itself right after this callback returns; show 元に戻しています… just after that.
    await Promise.resolve();
    toast.info(t("add.manual.undoing"));
    const undone = await request;
    if (!undone?.ok) {
      const expired = undone?.failure.kind === "other" && undone.failure.status === 409;
      toast.error(t(expired ? "add.manual.undoExpired" : "add.manual.undoFailed"));
      return;
    }
    if (mounted.current) {
      setForm(snapshot);
      setSaved(null);
      router.dismissTo("/contacts/new/manual" as Href);
    }
    toast.info(t("add.manual.undoneToast"));
  }

  const problemKey: MessageKey | null = problem === "name" ? "add.manual.nameMissing" : problem === "review" ? "add.manual.reviewNeeded" : problem === "failed" ? "add.manual.saveFailed" : null;
  if (saved) return <ManualSavedView saved={saved} />;
  const anyOpen = open.size > 0;
  const showSuggestions = open.has("organization") && orgFocused && Boolean(orgQuery) && orgChosen !== orgQuery;
  const sheetOpen = Boolean(candidate) && decision.kind === "none" && dismissed !== candidate?.contactId;
  return (
    <AppScreen title={t("add.manual.title")} subtitle={t("add.manual.lead")} backIcon="x"
      headerActions={<KitHeadAction label={t("add.manual.save")} disabled={!form.displayName.trim() || saving} onPress={() => void save()} testID="add-manual-save" />}>
      <FadeIn testID="add-manual" style={KIT_PAGE_INSET}>
        <Field label={t("add.manual.name")} required={t("add.manual.required")} hint={anyOpen ? undefined : t("add.manual.nameHint")} first>
          <FieldInput value={form.displayName} onChangeText={(value) => set("displayName", value)} autoFocus returnKeyType="done" accessibilityLabel={t("add.manual.name")} testID="add-manual-name" />
        </Field>

        {candidate && decision.kind === "none" && dismissed === candidate.contactId ? (
          <UiPressable accessibilityRole="button" onPress={() => setDismissed(null)} style={m.dupLine} testID="add-manual-duplicate">
            <UiText style={m.lbl}>{t("add.manual.dupTitle", { name: candidate.displayName })}</UiText>
          </UiPressable>
        ) : null}
        {candidate && decision.kind === "separate" ? (
          <View style={m.dupLine} testID="add-manual-separated">
            <UiText style={m.lbl}>{t("add.manual.dupSeparated")}</UiText>
            <Button size="sm" variant="ghost" label={t("add.manual.dupUndoSeparate")} onPress={() => setDecision({ kind: "none" })} />
          </View>
        ) : null}
        {candidate && decision.kind === "merge" ? (
          <MergeChoices candidate={candidate} form={form} decision={decision} differing={differing}
            onReset={() => setDecision({ kind: "none" })}
            onChoose={(field, choice) => setDecision((current) => (current.kind === "merge" ? { ...current, choices: { ...current.choices, [field]: choice } } : current))} />
        ) : null}

        {open.has("organization") ? (
          <Field label={t("add.manual.organization")}>
            <FieldInput value={form.organization} onChangeText={(value) => set("organization", value)} accessibilityLabel={t("add.manual.organization")}
              onFocus={() => setOrgFocused(true)} onBlur={() => setTimeout(() => { if (mounted.current) setOrgFocused(false); }, 150)} testID="add-manual-organization" />
            {showSuggestions ? (
              <View style={m.sugg} testID="add-manual-org-suggestions">
                {organizations.map((entry, index) => (
                  <UiPressable key={entry.name} accessibilityRole="button" onPress={() => { set("organization", entry.name); setOrgChosen(entry.name); setOrganizations([]); }} style={[m.suggRow, index === 0 ? m.suggOn : null]}>
                    <View style={[m.suggTile, { backgroundColor: colors.macBlue }]}><UiText style={m.suggEmoji}>🏭</UiText></View>
                    <UiText style={m.suggText}>{entry.name} <UiText style={m.lbl}>{t("add.manual.orgCount", { n: entry.contactCount })}</UiText></UiText>
                  </UiPressable>
                ))}
                {/* 「新しく登録」 only when no company in the network has exactly this name. */}
                {organizations.some((entry) => entry.name === orgQuery) ? null : (
                  <UiPressable accessibilityRole="button" onPress={() => { setOrgChosen(orgQuery); setOrganizations([]); }} style={[m.suggRow, organizations.length ? null : m.suggOn]}>
                    <View style={[m.suggTile, { backgroundColor: colors.surface2 }]}><UiText style={m.suggEmoji}>＋</UiText></View>
                    <UiText style={m.suggText}>{t("add.manual.orgNew", { name: orgQuery })}</UiText>
                  </UiPressable>
                )}
              </View>
            ) : null}
          </Field>
        ) : null}

        {open.has("met") ? (
          <Field label={t("add.manual.met")} hint={t("add.manual.metHint")} testID="add-manual-met">
            <View style={[m.chips, m.metChips]}>
              {events.map((event) => (
                <FilterOption key={event.eventId} label={t("add.manual.metEventChip", { date: monthDay(event.startsAt), title: event.title })} selected={form.met?.kind === "event" && form.met.eventId === event.eventId} onToggle={() => set("met", form.met?.eventId === event.eventId ? null : { eventId: event.eventId, kind: "event", label: event.title })} />
              ))}
              <FilterOption label={t("add.manual.metIntro")} selected={form.met?.kind === "intro"} onToggle={() => set("met", form.met?.kind === "intro" ? null : { kind: "intro" })} />
              <FilterOption label={t("add.manual.metOther")} selected={form.met?.kind === "other"} onToggle={() => set("met", form.met?.kind === "other" ? null : { kind: "other" })} />
            </View>
            {form.met?.kind === "intro" || form.met?.kind === "other" ? (
              <View style={m.gap}><FieldInput value={form.met.label ?? ""} placeholder={t(form.met.kind === "intro" ? "add.manual.metIntroLabel" : "add.manual.metOtherLabel")} accessibilityLabel={t(form.met.kind === "intro" ? "add.manual.metIntroLabel" : "add.manual.metOtherLabel")} onChangeText={(value) => set("met", { ...form.met!, label: value })} /></View>
            ) : null}
          </Field>
        ) : null}

        {open.has("note") ? (
          <Field label={t("add.manual.note")}>
            <FieldInput value={form.note} multiline onChangeText={(value) => set("note", value)} accessibilityLabel={t("add.manual.note")} testID="add-manual-note" />
          </Field>
        ) : null}

        {open.has("contact") ? (
          <>
            <Field label={t("add.manual.email")}><FieldInput value={form.email} keyboardType="email-address" autoCapitalize="none" onChangeText={(value) => set("email", value)} accessibilityLabel={t("add.manual.email")} /></Field>
            <Field label={t("add.manual.phone")}><FieldInput value={form.phone} keyboardType="phone-pad" onChangeText={(value) => set("phone", value)} accessibilityLabel={t("add.manual.phone")} /></Field>
          </>
        ) : null}

        {/* b11 A3 ②: once a field is open the heading and the merge note go; the chips not opened yet stay
            (decision §18: 連絡先 must stay reachable — the board's ② omitted it). */}
        {anyOpen ? null : <UiText style={m.more}>{t("add.manual.optionalTitle")} <UiText style={m.moreNote}>{t("add.manual.optionalNote")}</UiText></UiText>}
        {open.size < 4 ? (
          <View style={[m.chips, anyOpen ? m.chipsAfter : null]} testID="add-manual-chips">
            {(["organization", "met", "note", "contact"] as const).filter((extra) => !open.has(extra)).map((extra) => (
              <UiPressable key={extra} accessibilityRole="button" onPress={() => toggle(extra)} style={[m.addf, extra === "contact" ? m.addfQuiet : null]} testID={`add-manual-chip-${extra}`}>
                <Icon name="plus" size={16} color={extra === "contact" ? colors.ink3 : colors.plum700} />
                <UiText style={[m.addfText, extra === "contact" ? m.addfQuietText : null]}>{t(extra === "organization" ? "add.manual.chipOrganization" : extra === "met" ? "add.manual.chipMet" : extra === "note" ? "add.manual.chipNote" : "add.manual.chipContact")}</UiText>
              </UiPressable>
            ))}
          </View>
        ) : null}
        {anyOpen ? null : (
          <View style={[m.flat, m.mergeNote]}>
            <UiText style={m.mergeEmoji}>📇</UiText>
            <UiText style={m.mergeText}>{t("add.manual.cardLaterBefore")}<UiText style={m.mergeStrong}>{t("add.manual.cardLaterStrong")}</UiText>{t("add.manual.cardLaterAfter")}</UiText>
          </View>
        )}

        <View style={[m.flat, anyOpen ? m.densGapOpen : m.densGap]} testID={`add-manual-density-${density}`}>
          <View style={m.between}>
            <UiText style={m.lbl}>{t(anyOpen ? "add.manual.densitySave" : "add.manual.densityAsIs")}</UiText>
            <DensityDots level={density} />
          </View>
          <UiText style={[m.lbl, m.densLine]}>{t(density === 1 ? "add.manual.densityLine1" : "add.manual.densityLine2", { level: t(DENSITY_KEY[density]) })}</UiText>
        </View>
        {problemKey ? <View style={m.gap}><Caption tone="error">{t(problemKey)}</Caption></View> : null}
        {/* b12 N12 サンプル表示中は保存できません: the dialog (サンプルを見続ける / ガイドを続ける); no step count in the App (§17-12). */}
        <ConfirmDialog visible={problem === "sample"} stacked title={t("add.manual.sampleTitle")} message={`${t("add.manual.sampleBlocked")}${t("add.manual.sampleAsk")}`}
          confirmLabel={t("add.manual.sampleGuide")} cancelLabel={t("add.manual.sampleStay")}
          onConfirm={() => { setProblem(null); router.push("/profile/onboarding" as Href); }} onCancel={() => setProblem(null)} />
      </FadeIn>

      <BottomSheet visible={sheetOpen} onClose={() => setDismissed(candidate?.contactId ?? null)} accessibilityLabel={t("add.manual.dupSheetTitle")}>
        {candidate ? (
          <View testID="add-manual-dup-sheet">
            <View style={m.sheetHead}>
              <MacTile emoji="🔍" tone="apricot" />
              <View style={m.grow}>
                <UiText style={m.sheetTitle}>{t("add.manual.dupSheetTitle")}</UiText>
                <UiText style={m.lbl}>{t(candidate.matchedOn.includes("name") && candidate.matchedOn.length === 1 ? "add.manual.dupSheetLeadName" : "add.manual.dupSheetLead")}</UiText>
              </View>
            </View>
            <View style={m.cmp2}>
              <View style={m.cmpBox}>
                <UiText style={m.lbl}>{t("add.manual.dupIncoming")}</UiText>
                <UiText numberOfLines={1} style={m.cmpName}>{form.displayName.trim()}</UiText>
                {form.organization.trim() ? <UiText numberOfLines={1} style={m.cmpText}>{form.organization.trim()}</UiText> : null}
                <UiText numberOfLines={1} style={m.lbl}>{[t("add.manual.sourceManual"), form.met?.label].filter(Boolean).join(" · ")}</UiText>
              </View>
              <View style={[m.cmpBox, m.cmpExisting]}>
                <UiText style={m.lbl}>{t("add.manual.dupExisting")}</UiText>
                <UiText numberOfLines={1} style={m.cmpName}>{candidate.displayName}</UiText>
                {candidate.organization || candidate.role ? <UiText numberOfLines={1} style={m.cmpText}>{[candidate.organization, candidate.role].filter(Boolean).join(" · ")}</UiText> : null}
              </View>
            </View>
            <UiText style={[m.lbl, m.rule]}>{differing.length ? t("add.manual.dupRule", { fields: differing.map((field) => t(FIELD_KEY[field])).join("・") }) : t("add.manual.dupRuleSame")}</UiText>
            <View style={m.sheetActs}>
              <Button variant="primary" block label={t("add.manual.dupMerge")} onPress={() => setDecision({ choices: defaultChoices(differing), contactId: candidate.contactId, kind: "merge" })} />
              <Button block label={t("add.manual.dupSeparate")} onPress={() => setDecision({ kind: "separate" })} />
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </AppScreen>
  );
}

/** kit .fld: label (12 / 700, 必須 coral 10 / 800), the field, a grey line under it. */
function Field({ label, required, hint, first = false, testID, children }: { label: string; required?: string | undefined; hint?: string | undefined; first?: boolean; testID?: string | undefined; children: ReactNode }) {
  const { m } = useManualStyles();
  return (
    <View style={first ? m.fldFirst : m.fld} testID={testID}>
      <View style={m.label}><UiText style={m.labelText}>{label}</UiText>{required ? <UiText style={m.req}>{required}</UiText> : null}</View>
      {children}
      {hint ? <UiText style={[m.lbl, m.msg]}>{hint}</UiText> : null}
    </View>
  );
}

/** kit .fld .in: 46 high, radius 14, surface, plum-500 border when focused. */
function FieldInput({ multiline = false, onFocus, onBlur, ...input }: TextInputProps) {
  const { colors, m } = useManualStyles();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput {...input} multiline={multiline} placeholderTextColor={colors.ink3Text} showSoftInputOnFocus={!addDesignMock("no-keyboard")}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={[m.in, multiline ? m.inMulti : null, focused ? m.inFocus : null]} />
  );
}

function MergeChoices({ candidate, form, decision, differing, onReset, onChoose }: {
  candidate: IngestContactCandidateContract;
  form: ManualForm;
  decision: Extract<ManualDecision, { kind: "merge" }>;
  differing: ManualContactMergeField[];
  onReset: () => void;
  onChoose: (field: ManualContactMergeField, choice: ManualContactFieldChoice) => void;
}) {
  const { t } = useOrbitLocale();
  const { m } = useManualStyles();
  return (
    <View style={[m.flat, m.mergePanel]} testID="add-manual-merge">
      <UiText style={m.cmpName}>{t("add.manual.mergeTitle", { name: candidate.displayName })}</UiText>
      <UiText style={m.lbl}>{differing.length ? t("add.manual.mergeLead") : t("add.manual.mergeNoDiff")}</UiText>
      {differing.map((field) => (
        <View key={field} style={m.mergeField} testID={`add-manual-merge-${field}`}>
          <UiText style={m.lbl}>{t(FIELD_KEY[field])}</UiText>
          <View style={m.between}>
            <Radio selected={decision.choices[field] === "existing"} onSelect={() => onChoose(field, "existing")} accessibilityLabel={`${t("add.manual.dupExisting")} ${candidate[field]}`} />
            <UiText style={m.grow}>{candidate[field]}</UiText>
          </View>
          <View style={m.between}>
            <Radio selected={decision.choices[field] !== "existing"} onSelect={() => onChoose(field, "incoming")} accessibilityLabel={`${t("add.manual.dupIncoming")} ${form[field]}`} />
            <UiText style={m.grow}>{form[field]}</UiText>
          </View>
        </View>
      ))}
      <Button size="sm" variant="ghost" label={t("add.manual.mergeCancel")} onPress={onReset} />
    </View>
  );
}

const useManualStyles = () => {
  const { colors, styles } = useStyles();
  return { colors, m: styles };
};

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  fldFirst: { marginTop: 4 },
  fld: { marginTop: 12 },
  label: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  labelText: { fontSize: 12, fontWeight: "700", color: colors.ink2, lineHeight: 18 },
  req: { fontSize: 10, fontWeight: "800", color: colors.coral, lineHeight: 15 },
  in: { minHeight: 46, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 14, color: colors.ink, borderWidth: 1.5, borderColor: "transparent" },
  // iOS puts a line's whole extra leading above the glyphs (CSS splits it): top 10 − ~3 lands the text where kit has it.
  inMulti: { minHeight: 64, paddingTop: 7, paddingBottom: 10, fontSize: 13, lineHeight: 20.8, textAlignVertical: "top" },
  inFocus: { borderColor: colors.plum500 },
  msg: { marginTop: 6 },
  lbl: { fontSize: 11.5, fontWeight: "500", color: colors.ink3, lineHeight: 17.25 },
  more: { marginTop: 18, marginBottom: 8, marginHorizontal: 4, fontSize: 11.5, fontWeight: "800", color: colors.ink2, lineHeight: 17.25 },
  moreNote: { fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metChips: { gap: 6 },
  chipsAfter: { marginTop: 12 },
  addf: { flexDirection: "row", alignItems: "center", gap: 4, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300 },
  addfQuiet: { borderColor: colors.surface3 },
  addfText: { fontSize: 12, fontWeight: "800", color: colors.plum700 },
  addfQuietText: { color: colors.ink3 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  mergeNote: { marginTop: 16, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  // iOS 的 Apple Color Emoji 字宽比 Chrome 大约 3pt：盒子固定成 kit 里的字宽，后面的文字才对齐。
  mergeEmoji: { fontSize: 18, width: 21 },
  mergeText: { flex: 1, fontSize: 11.5, fontWeight: "500", color: colors.ink2, lineHeight: 18.4 },
  mergeStrong: { fontWeight: "700", color: colors.ink },
  densGap: { marginTop: 10 },
  densGapOpen: { marginTop: 12 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  densLine: { marginTop: 4 },
  gap: { marginTop: 8 },
  dupLine: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  sugg: { marginTop: 6, borderRadius: 14, backgroundColor: colors.surface, padding: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  suggOn: { backgroundColor: colors.surface2 },
  suggTile: { width: 26, height: 26, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  suggEmoji: { fontSize: 13 },
  suggText: { flex: 1, fontSize: 12.5, color: colors.ink },
  grow: { flex: 1, minWidth: 0 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, lineHeight: 24 },
  cmp2: { marginTop: 14, flexDirection: "row", gap: 8 },
  cmpBox: { flex: 1, minWidth: 0, backgroundColor: colors.surface2, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  cmpExisting: { borderWidth: 1.5, borderColor: colors.plum300 },
  cmpName: { fontSize: 13, fontWeight: "700", color: colors.ink, lineHeight: 18.4 },
  cmpText: { fontSize: 11.5, color: colors.ink, lineHeight: 18.4 },
  rule: { marginTop: 10, lineHeight: 18.4 },
  sheetActs: { marginTop: 14, gap: 8 },
  mergePanel: { marginTop: 8, gap: 8 },
  mergeField: { gap: 4 },
}));
