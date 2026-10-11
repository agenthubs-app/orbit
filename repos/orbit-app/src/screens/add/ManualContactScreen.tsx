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
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import type { IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type { ManualContactFieldChoice, ManualContactMergeField, ManualContactOrganizationSuggestion } from "../../api/contract/manual-contact";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, FilterOption, ListRow, Radio, TextField, UiText, useToast } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { useAddApi } from "./add-api";
import { Body, Caption, DensityDots, FadeIn, SectionTitle, useAddStyles } from "./add-ui";
import {
  createBody,
  defaultChoices,
  differingFields,
  duplicateCheckBody,
  EMPTY_MANUAL_FORM,
  eventChips,
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
  const { styles } = useAddStyles();
  const [form, setForm] = useState<ManualForm>(EMPTY_MANUAL_FORM);
  const [open, setOpen] = useState<Set<Extra>>(() => new Set());
  const [candidates, setCandidates] = useState<IngestContactCandidateContract[]>([]);
  const [decision, setDecision] = useState<ManualDecision>({ kind: "none" });
  const [organizations, setOrganizations] = useState<ManualContactOrganizationSuggestion[]>([]);
  const [orgFocused, setOrgFocused] = useState(false);
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
        if (mounted.current && !controller.signal.aborted) setOrganizations(result.ok ? result.data.organizations.filter((entry) => entry.name !== orgQuery).slice(0, 5) : []);
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
    // Push (not replace): this page stays underneath, so 元に戻す keeps working on the person's page.
    router.push(`/contacts/${encodeURIComponent(contactId)}` as Href);
    if (answer.outcome === "merged") {
      toast.success(t("add.manual.mergedToast"), { sub: t("add.manual.addedSub", { name: snapshot.displayName.trim() }) });
      return;
    }
    toast.success(t("add.manual.addedToast"), {
      sub: t("add.manual.addedSub", { name: snapshot.displayName.trim() }),
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
      router.dismissTo("/contacts/new/manual" as Href);
    }
    toast.info(t("add.manual.undoneToast"));
  }

  const saveLabel = decision.kind === "merge" ? t("add.manual.saveMerge") : t("add.manual.save");
  const problemKey: MessageKey | null = problem === "name" ? "add.manual.nameMissing" : problem === "review" ? "add.manual.reviewNeeded" : problem === "sample" ? "add.manual.sampleBlocked" : problem === "failed" ? "add.manual.saveFailed" : null;
  return (
    <AppScreen title={t("add.manual.title")} headerActions={<Button size="sm" variant="primary" label={t("add.manual.save")} disabled={!form.displayName.trim() || saving} onPress={() => void save()} />}>
      <FadeIn testID="add-manual">
        <View style={styles.stack}>
          <Caption>{t("add.manual.lead")}</Caption>
          <View style={styles.tightStack}>
            <View style={styles.row}>
              <Chip label={t("add.manual.required")} tone="coral" />
            </View>
            <TextField label={t("add.manual.name")} value={form.displayName} onChangeText={(value) => set("displayName", value)} autoFocus returnKeyType="done" testID="add-manual-name" />
            <Caption>{t("add.manual.nameHint")}</Caption>
          </View>

          {candidate ? (
            <DuplicateCandidate
              candidate={candidate}
              form={form}
              decision={decision}
              differing={differing}
              onMerge={() => setDecision({ choices: defaultChoices(differing), contactId: candidate.contactId, kind: "merge" })}
              onSeparate={() => setDecision({ kind: "separate" })}
              onReset={() => setDecision({ kind: "none" })}
              onChoose={(field, choice) => setDecision((current) => (current.kind === "merge" ? { ...current, choices: { ...current.choices, [field]: choice } } : current))}
            />
          ) : null}

          <SectionTitle>{t("add.manual.optionalTitle")}</SectionTitle>
          <View style={styles.row} testID="add-manual-chips">
            {(["organization", "met", "note", "contact"] as const).filter((extra) => !open.has(extra)).map((extra) => (
              <Button key={extra} size="sm" variant="secondary" icon="plus" label={t(extra === "organization" ? "add.manual.chipOrganization" : extra === "met" ? "add.manual.chipMet" : extra === "note" ? "add.manual.chipNote" : "add.manual.chipContact")} onPress={() => toggle(extra)} />
            ))}
          </View>

          {open.has("organization") ? (
            <Card>
              <View style={styles.stack}>
                <TextField label={t("add.manual.organization")} value={form.organization} onChangeText={(value) => set("organization", value)} onFocus={() => setOrgFocused(true)} onBlur={() => setTimeout(() => { if (mounted.current) setOrgFocused(false); }, 150)} testID="add-manual-organization" />
                {organizations.length ? (
                  <View testID="add-manual-org-suggestions">
                    {organizations.map((entry) => <ListRow key={entry.name} title={t("add.manual.orgSuggestion", { n: entry.contactCount, name: entry.name })} onPress={() => { set("organization", entry.name); setOrganizations([]); }} />)}
                  </View>
                ) : null}
                <TextField label={t("add.manual.role")} value={form.role} onChangeText={(value) => set("role", value)} />
              </View>
            </Card>
          ) : null}

          {open.has("met") ? (
            <Card>
              <View style={styles.stack} testID="add-manual-met">
                <UiText style={styles.strong}>{t("add.manual.met")}</UiText>
                <Caption>{t("add.manual.metHint")}</Caption>
                <View style={styles.row}>
                  {events.map((event) => (
                    <FilterOption key={event.eventId} label={t("add.manual.metEventChip", { date: monthDay(event.startsAt), title: event.title })} selected={form.met?.kind === "event" && form.met.eventId === event.eventId} onToggle={() => set("met", form.met?.eventId === event.eventId ? null : { eventId: event.eventId, kind: "event", label: event.title })} />
                  ))}
                  <FilterOption label={t("add.manual.metIntro")} selected={form.met?.kind === "intro"} onToggle={() => set("met", form.met?.kind === "intro" ? null : { kind: "intro" })} />
                  <FilterOption label={t("add.manual.metOther")} selected={form.met?.kind === "other"} onToggle={() => set("met", form.met?.kind === "other" ? null : { kind: "other" })} />
                </View>
                {form.met?.kind === "intro" || form.met?.kind === "other" ? (
                  <TextField label={t(form.met.kind === "intro" ? "add.manual.metIntroLabel" : "add.manual.metOtherLabel")} value={form.met.label ?? ""} onChangeText={(value) => set("met", { ...form.met!, label: value })} />
                ) : null}
              </View>
            </Card>
          ) : null}

          {open.has("note") ? (
            <TextField label={t("add.manual.note")} placeholder={t("add.manual.notePlaceholder")} value={form.note} multiline onChangeText={(value) => set("note", value)} />
          ) : null}

          {open.has("contact") ? (
            <Card>
              <View style={styles.stack}>
                <TextField label={t("add.manual.email")} value={form.email} keyboardType="email-address" autoCapitalize="none" onChangeText={(value) => set("email", value)} />
                <TextField label={t("add.manual.phone")} value={form.phone} keyboardType="phone-pad" onChangeText={(value) => set("phone", value)} />
              </View>
            </Card>
          ) : null}

          <View style={styles.row} testID={`add-manual-density-${density}`}>
            <DensityDots level={density} />
            <Caption>{t("add.manual.densityPreview", { level: t(DENSITY_KEY[density]) })}</Caption>
          </View>
          <Card variant="flat">
            <Body>{t("add.manual.cardLater")}</Body>
          </Card>
          {problemKey ? <Caption tone="error">{t(problemKey)}</Caption> : null}
          <Button variant="primary" block icon="check" label={saving ? t("add.manual.saving") : saveLabel} loading={saving} disabled={!form.displayName.trim()} onPress={() => void save()} />
        </View>
      </FadeIn>
    </AppScreen>
  );
}

function DuplicateCandidate({ candidate, form, decision, differing, onMerge, onSeparate, onReset, onChoose }: {
  candidate: IngestContactCandidateContract;
  form: ManualForm;
  decision: ManualDecision;
  differing: ManualContactMergeField[];
  onMerge: () => void;
  onSeparate: () => void;
  onReset: () => void;
  onChoose: (field: ManualContactMergeField, choice: ManualContactFieldChoice) => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const incoming = [form.displayName, form.organization].map((value) => value.trim()).filter(Boolean).join(" · ");
  const existing = [candidate.displayName, candidate.organization, candidate.role].filter(Boolean).join(" · ");
  return (
    <Card>
      <View style={styles.stack} testID="add-manual-duplicate">
        <UiText style={styles.strong}>{t("add.manual.dupTitle", { name: candidate.displayName })}</UiText>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Caption>{t("add.manual.dupIncoming")}</Caption>
            <Body>{incoming}</Body>
          </View>
          <View style={styles.grow}>
            <Caption>{t("add.manual.dupExisting")}</Caption>
            <Body>{existing}</Body>
          </View>
        </View>
        {decision.kind === "none" ? (
          <>
            <Caption>{t("add.manual.dupLead")}</Caption>
            <View style={styles.row}>
              <Button size="sm" variant="primary" label={t("add.manual.dupMerge")} onPress={onMerge} />
              <Button size="sm" variant="secondary" label={t("add.manual.dupSeparate")} onPress={onSeparate} />
            </View>
          </>
        ) : null}
        {decision.kind === "separate" ? (
          <View style={styles.row} testID="add-manual-separated">
            <Caption>{t("add.manual.dupSeparated")}</Caption>
            <Button size="sm" variant="ghost" label={t("add.manual.dupUndoSeparate")} onPress={onReset} />
          </View>
        ) : null}
        {decision.kind === "merge" ? (
          <View style={styles.stack} testID="add-manual-merge">
            <UiText style={styles.strong}>{t("add.manual.mergeTitle", { name: candidate.displayName })}</UiText>
            <Caption>{differing.length ? t("add.manual.mergeLead") : t("add.manual.mergeNoDiff")}</Caption>
            {differing.map((field) => (
              <View key={field} style={styles.tightStack} testID={`add-manual-merge-${field}`}>
                <Caption>{t(FIELD_KEY[field])}</Caption>
                <View style={styles.row}>
                  <Radio selected={decision.choices[field] === "existing"} onSelect={() => onChoose(field, "existing")} accessibilityLabel={`${t("add.manual.dupExisting")} ${candidate[field]}`} />
                  <Body>{candidate[field]}</Body>
                </View>
                <View style={styles.row}>
                  <Radio selected={decision.choices[field] !== "existing"} onSelect={() => onChoose(field, "incoming")} accessibilityLabel={`${t("add.manual.dupIncoming")} ${form[field]}`} />
                  <Body>{form[field]}</Body>
                </View>
              </View>
            ))}
            <Button size="sm" variant="ghost" label={t("add.manual.mergeCancel")} onPress={onReset} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
