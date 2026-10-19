// R16 人脈を追加 › その他 (DESIGN §2.7; b9 A2 連絡先 ①–④, A3 LinkedIn ①). 連絡先: explain → iOS
// permission (denied → back to 人脈を追加, never asked again from here) → choose (rule pre-selection
// with its 根拠, filters, live count) → only the chosen people go up as vCard → 取り込み中 → まとめて確認
// (UnifiedReviewApp) → 完成. LinkedIn: the 3 steps, then the CSV (or the ZIP) from ファイル.
// Online-only: the batch lives on the server.
import type * as ContactsModule from "expo-contacts/legacy";
import * as DocumentPicker from "expo-document-picker";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { File } from "expo-file-system";
import { Linking, StyleSheet, View } from "react-native";

import { buildVcards } from "../../../api/compute/vcard-build";
import type { ContactImportBatchView, ContactImportRowView } from "../../../api/contract/contact-import";
import { AppScreen } from "../../../components/AppScreen";
import { ActionSheet, Avatar, FilterOption, Icon, RetryCard, Segmented, Skeleton, UiPressable, UiText } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import previewSamples from "../../../fixtures/redesign-preview-samples.json";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { addDesignMock } from "../add-design-mock";
import { DensityDots, FadeIn } from "../add-ui";
import { KIT_FOOT_SPACE, KitBigNums, KitFoot } from "../scan-kit";
import { UnifiedReviewApp, type AppReviewDuplicateRow } from "../UnifiedReviewApp";
import { newImportKey, useImportApi, utf8, type ImportApi } from "./import-api";
import { BlockButton, GenRow, GhostButton, KitCheck, KitIll, KitOrb, KitStep, XlButton, useImportKitStyles } from "./import-kit";
import { addCount, commitPlan, defaultMergeChoice, serverSkipped, splitImportRows, type ImportIssueGroup } from "./import-model";
import { IMPORT_DESIGN, type ImportDesignName } from "./import-design";
import { prepareLinkedInFile, toDeviceEntry, toPickPerson, type PickPerson } from "./import-device";

export const IMPORT_HREF = "/contacts/new/import";
const LINKEDIN_EXPORT_URL = "https://www.linkedin.com/mypreferences/d/download-my-data";
type Contacts = typeof ContactsModule;

/** A file chosen in ファイル (copied to the cache by the picker), read on the device — not a network request. */
async function readPickedFile(uri: string): Promise<Uint8Array<ArrayBuffer>> {
  return (await new File(uri).bytes()) as Uint8Array<ArrayBuffer>;
}

/**
 * expo-contacts is loaded only when 連絡先 is opened: a dev client / build without the native module
 * (older builds) must not red-screen at launch — Expo Router loads every route. Missing → null → the page
 * says the app needs an update instead of crashing.
 */
let contactsCache: Contacts | null | undefined;
export function loadContactsModule(): Contacts | null {
  if (contactsCache !== undefined) return contactsCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    contactsCache = require("expo-contacts/legacy") as Contacts;
  } catch {
    contactsCache = null;
  }
  return contactsCache;
}

function contactFields(Contacts: Contacts) {
  return [
    Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.MiddleName,
    Contacts.Fields.PhoneticFirstName, Contacts.Fields.PhoneticLastName, Contacts.Fields.Company, Contacts.Fields.JobTitle,
    Contacts.Fields.Department, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers,
  ];
}

type Translate = ReturnType<typeof useOrbitLocale>["t"];
type MessageKey = Parameters<Translate>[0];

function failureText(t: Translate, reason: string | null | undefined, kind?: string): string {
  if (kind === "notImplemented") return t("add.import.errUnavailable");
  if (reason === "too_large") return t("add.import.errTooLarge");
  if (reason === "too_many_rows") return t("add.import.errTooMany");
  if (reason === "empty" || reason === "NOTHING_TO_IMPORT") return t("add.import.errEmpty");
  if (reason === "undecodable") return t("add.import.errUndecodable");
  if (reason === "not_vcard") return t("add.import.errNotVcard");
  return t("add.import.uploadFailed");
}

type ContactsStage =
  | { kind: "checking" }
  | { kind: "intro"; denied: boolean }
  | { kind: "pick"; people: PickPerson[] }
  | { kind: "organizing"; count: number; preview: PickPerson[]; progress?: { matched: number; normalized: number } };

/** `/contacts/new/import?kind=contacts` (b9 A2 ① ② ③). */
export function ContactsImportScreen({ design }: { design?: ImportDesignName }) {
  const { t } = useOrbitLocale();
  const router = useRouter();
  const api = useImportApi();
  const sample = design ? IMPORT_DESIGN : null;
  const [stage, setStage] = useState<ContactsStage>(() => (design === "design-pick" ? { kind: "pick", people: sample!.pick.map((entry, index) => toPickPerson(`d${index}`, entry, t)) }
    : design === "design-organizing" ? { kind: "organizing", count: sample!.organizing.total, preview: sample!.organizing.preview.map((entry, index) => toPickPerson(`p${index}`, entry, t)), progress: { matched: sample!.organizing.matched, normalized: sample!.organizing.normalized } }
      : { kind: "checking" }));
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/contacts/new" as Href));

  useEffect(() => {
    if (design) return;
    let live = true;
    const Contacts = loadContactsModule();
    if (!Contacts) { setError(t("add.import.needsUpdate")); setStage({ kind: "intro", denied: false }); return; }
    void Contacts.getPermissionsAsync().then((permission) => {
      if (!live) return;
      if (permission.status === "granted") void loadPeople();
      else setStage({ kind: "intro", denied: permission.status === "denied" && !permission.canAskAgain });
    }).catch(() => live && setStage({ kind: "intro", denied: false }));
    return () => { live = false; };
  }, [design]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPeople = async () => {
    try {
      const Contacts = loadContactsModule();
      if (!Contacts) { setError(t("add.import.needsUpdate")); setStage({ kind: "intro", denied: false }); return; }
      const { data } = await Contacts.getContactsAsync({ fields: contactFields(Contacts), sort: Contacts.SortTypes.LastName });
      setStage({ kind: "pick", people: data.map((contact, index) => toPickPerson(contact.id ?? `c${index}`, toDeviceEntry(contact), t)) });
    } catch {
      setError(t("add.import.loadFailed"));
      setStage({ kind: "intro", denied: false });
    }
  };
  const allow = async () => {
    if (stage.kind === "intro" && stage.denied) { void Linking.openSettings(); return; }
    const Contacts = loadContactsModule();
    if (!Contacts) { setError(t("add.import.needsUpdate")); return; }
    const permission = await Contacts.requestPermissionsAsync().catch(() => null);
    // Denied: back to 人脈を追加, no second prompt from here (DESIGN §2.7).
    if (permission?.status !== "granted") { back(); return; }
    await loadPeople();
  };
  const pickVcard = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ["text/vcard", "text/x-vcard", "public.vcard"] }).catch(() => null);
    const asset = result && !result.canceled ? result.assets[0] : null;
    if (!asset) return;
    const previous = stage;
    setStage({ kind: "organizing", count: 0, preview: [] });
    try {
      const bytes = await readPickedFile(asset.uri) as Uint8Array<ArrayBuffer>;
      await upload(api, bytes, asset.name || "contacts.vcf", "vcard", 0, previous);
    } catch {
      setError(t("add.import.uploadFailed"));
      setStage(previous);
    }
  };
  /** On failure the page goes back to where it was (the list, or the explanation without access) with the reason. */
  const upload = async (client: ImportApi, body: Uint8Array<ArrayBuffer>, name: string, kind: "csv" | "vcard", excluded: number, back: ContactsStage) => {
    setError(null);
    const result = await client.upload(body, name, kind, newImportKey());
    if (!result.ok) {
      setError(failureText(t, result.failure.kind === "other" ? result.failure.reason : null, result.failure.kind));
      setStage(back);
      return;
    }
    router.replace({ pathname: `${IMPORT_HREF}/[importId]`, params: { importId: result.data.id, excluded: String(excluded) } } as unknown as Href);
  };
  const importPeople = (chosen: readonly PickPerson[], excluded: number) => {
    if (!chosen.length || stage.kind !== "pick") return;
    const previous = stage;
    setStage({ kind: "organizing", count: chosen.length, preview: chosen.slice(0, 2) });
    // Only the chosen people leave the phone (vCard 3.0 text, R16 vcard-build).
    void upload(api, utf8(buildVcards(chosen.map((person) => person.entry))), "contacts.vcf", "vcard", excluded, previous);
  };

  if (stage.kind === "checking") return <AppScreen title="" backIcon="x" onBack={back}><Skeleton lines={4} /></AppScreen>;
  if (stage.kind === "intro") return <PermissionStage denied={stage.denied} error={error} onAllow={() => void allow()} onNotNow={back} onVcard={() => void pickVcard()} onBack={back} />;
  if (stage.kind === "pick") return <PickStage people={stage.people} error={error} onBack={back} onImport={importPeople} {...(design === "design-pick" ? { previewRows: 6 } : {})} />;
  return <OrganizingStage count={stage.count} preview={stage.preview} progress={stage.progress} onClose={() => router.replace("/contacts" as Href)} />;
}

/** b9 A2 ① 権限: 📱, what is read and what is not, Google → vCard, 許可 / 今はしない. */
function PermissionStage({ denied, error, onAllow, onNotNow, onVcard, onBack }: { denied: boolean; error: string | null; onAllow: () => void; onNotNow: () => void; onVcard: () => void; onBack: () => void }) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const rows: [MessageKey, "check" | "users" | "mail" | "settings"][] = [["add.import.perm1", "check"], ["add.import.perm2", "users"], ["add.import.perm3", "mail"], ["add.import.perm4", "settings"]];
  return (
    <View style={styles.fill}>
      <AppScreen inset="kit" title="" backIcon="x" onBack={onBack}>
        <FadeIn testID="add-import-permission">
          <View style={styles.center}>
            <View style={styles.hero}><UiText style={styles.heroEmoji}>📱</UiText></View>
            <UiText accessibilityRole="header" style={[styles.h1, styles.heroTitle]}>{t("add.import.permTitle")}</UiText>
            <UiText style={[styles.sub, styles.heroSub]}>{t(denied ? "add.import.deniedNote" : "add.import.permSub")}</UiText>
          </View>
          <View style={[styles.card, styles.permList]}>
            {rows.map(([key, icon]) => (
              <View key={key} style={styles.permRow}>
                <View style={styles.lbtn}><Icon name={icon} size={16} color={colors.ink2} /></View>
                <UiText style={styles.permText}>{t(key)}</UiText>
              </View>
            ))}
          </View>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("add.import.googleTitle")} onPress={onVcard} style={[styles.card, styles.flat, styles.google]} testID="add-import-vcard">
            <View style={[styles.emoSm, { backgroundColor: colors.macTeal }]}><UiText style={styles.googleG}>G</UiText></View>
            <View style={styles.grow}>
              <UiText style={styles.b13}>{t("add.import.googleTitle")}</UiText>
              <UiText style={styles.lbl}>{t("add.import.googleBody")}</UiText>
            </View>
            <Icon name="right" size={20} color={colors.ink} />
          </UiPressable>
          {error ? <UiText style={styles.error}>{error}</UiText> : null}
          <View style={{ height: KIT_FOOT_SPACE }} />
        </FadeIn>
      </AppScreen>
      <KitFoot>
        <XlButton label={t(denied ? "add.import.openSettings" : "add.import.allow")} onPress={onAllow} testID="add-import-allow" />
        <GhostButton label={t("add.import.notNow")} onPress={onNotNow} />
      </KitFoot>
    </View>
  );
}

type PickFilter = "company" | "workMail";
const IMPORT_PICK_AVATAR_TONES = previewSamples.importPickAvatarTones as Record<string, "apricot" | "lav" | "blue" | "pink" | "teal">;

/** b9 A2 ② 選ぶ: すべて / 選んで取り込む, the ✨ pre-selection with its 根拠, filters, the list, N人を取り込む. */
function PickStage({ people, error, onBack, onImport, previewRows }: { people: PickPerson[]; error: string | null; onBack: () => void; onImport: (chosen: readonly PickPerson[], excluded: number) => void; previewRows?: number }) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const [mode, setMode] = useState<"all" | "pick">("pick");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(people.filter((person) => person.likely).map((person) => person.id)));
  const [why, setWhy] = useState(false);
  const [filter, setFilter] = useState<PickFilter | null>(null);
  const excluded = people.filter((person) => person.excluded).length;
  const likely = people.filter((person) => person.likely).length;
  const shown = people.filter((person) => (filter === "company" ? person.hasCompany : filter === "workMail" ? person.workMail : true));
  const selected = mode === "all" ? people : people.filter((person) => chosen.has(person.id));
  const toggle = (id: string) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <View style={styles.fill}>
      <AppScreen inset="kit" title={t("add.import.pickTitle")} subtitle={t("add.import.pickSub", { n: people.length.toLocaleString() })} onBack={onBack}>
        <FadeIn testID="add-import-pick">
          <Segmented<"all" | "pick"> accessibilityLabel={t("add.import.pickTitle")} value={mode} onChange={setMode} segments={[{ key: "all", label: t("add.import.modeAll") }, { key: "pick", label: t("add.import.modePick") }]} />
          <View style={[styles.card, styles.suggest]}>
            <View style={styles.row10}>
              <View style={[styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoSmText}>✨</UiText></View>
              <View style={styles.grow}>
                <UiText style={styles.b13}>{t("add.import.suggestTitle", { n: likely })}</UiText>
                <UiText style={styles.lbl}>{t("add.import.suggestBody", { n: excluded })}</UiText>
              </View>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("add.import.whyLabel")} accessibilityState={{ expanded: why }} onPress={() => setWhy((value) => !value)} style={styles.why} testID="add-import-why">
                <UiText style={styles.whyText}>?</UiText>
              </UiPressable>
            </View>
            {why ? <UiText style={styles.whyBody}>{t("add.import.why")}</UiText> : null}
          </View>
          <View style={styles.filters}>
            <FilterOption label={t("add.import.filterCompany")} count={people.filter((person) => person.hasCompany).length} selected={filter === "company"} onToggle={() => setFilter((value) => (value === "company" ? null : "company"))} />
            <FilterOption label={t("add.import.filterWorkMail")} count={people.filter((person) => person.workMail).length} selected={filter === "workMail"} onToggle={() => setFilter((value) => (value === "workMail" ? null : "workMail"))} />
          </View>
          <View style={[styles.card, styles.listCard]}>
            {(previewRows === undefined ? shown : shown.slice(0, previewRows)).map((person, index) => {
              const on = mode === "all" || chosen.has(person.id);
              const avatarTone = previewRows === undefined ? undefined : IMPORT_PICK_AVATAR_TONES[person.name];
              return (
                <UiPressable key={person.id} accessibilityRole="checkbox" accessibilityLabel={t("add.import.selectRow", { name: person.name })} accessibilityState={{ checked: on, disabled: mode === "all" }} disabled={mode === "all"}
                  onPress={() => toggle(person.id)} style={[styles.xrow, index > 0 && styles.xrowLine]} testID={`add-import-person-${person.id}`}>
                  <KitCheck on={on} />
                  <Avatar name={person.name} size="sm" {...(avatarTone ? { tone: avatarTone } : {})} />
                  <View style={styles.grow}>
                    <UiText numberOfLines={1} style={styles.b13}>{person.name}</UiText>
                    <UiText numberOfLines={1} style={styles.lbl}>{person.sub || "—"}</UiText>
                  </View>
                </UiPressable>
              );
            })}
          </View>
          {error ? <UiText style={styles.error}>{error}</UiText> : null}
          <View style={{ height: KIT_FOOT_SPACE }} />
        </FadeIn>
      </AppScreen>
      <KitFoot>
        <XlButton label={t("add.import.importN", { n: selected.length.toLocaleString() })} disabled={!selected.length} onPress={() => onImport(selected, mode === "all" ? 0 : excluded)} testID="add-import-go" />
      </KitFoot>
    </View>
  );
}

/** b9 A2 ③ 取り込み中: the orb, the steps, 先にできた分, 閉じて待つ. */
function OrganizingStage({ count, preview, progress, onClose }: { count: number; preview: readonly PickPerson[]; progress?: { matched: number; normalized: number } | undefined; onClose: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const k = useImportKitStyles().styles;
  return (
    <View style={styles.fill}>
      <AppScreen inset="kit" title={t("add.import.orgTitle")} subtitle={t("add.import.orgSub", { n: count })} backIcon="down" onBack={onClose}>
        <FadeIn testID="add-import-organizing">
          <KitOrb />
          <View style={[styles.center, styles.orgHead]}>
            <UiText style={styles.b17}>{t("add.import.orgHead", { n: count })}</UiText>
            <UiText style={k.lbl}>{t("add.import.orgLead")}</UiText>
          </View>
          <View style={[styles.card, styles.genCard]}>
            {/* The server reads, matches and tidies in one go: until it answers, 照合 is the step in progress. */}
            {/* b9 A2 ③ (§25-8): states only, no counts. The server reads, matches and tidies in one request. */}
            <GenRow first label={t("add.import.stepRead")} state="done" />
            <GenRow label={t("add.import.stepMatch")} count={progress ? undefined : t("add.import.stateNow")} state={progress ? "done" : "now"} />
            <GenRow label={t("add.import.stepCompany")} count={t(progress ? "add.import.stateNow" : "add.import.stateWait")} state={progress ? "now" : "wait"} />
            <GenRow label={t("add.import.stepReview")} count={t("add.import.stateWait")} state="wait" />
          </View>
          {preview.length ? (
            <View style={[styles.card, styles.cardGap]}>
              <UiText style={[k.lbl, styles.firstLbl]}>{t("add.import.firstDone")}</UiText>
              {preview.map((person, index) => (
                <View key={person.id} style={[styles.li, index > 0 && styles.xrowLine]}>
                  <Avatar name={person.name} size="sm" />
                  <View style={styles.grow}>
                    <UiText numberOfLines={1} style={styles.b14}>{person.name}</UiText>
                    <UiText numberOfLines={1} style={styles.lbl12}>{person.entry.organization ?? ""}</UiText>
                  </View>
                  <DensityDots level={1} />
                </View>
              ))}
              {/* .shimmer: the next person is still being read. */}
              <View style={[styles.li, styles.xrowLine]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={styles.shimDot} />
                <View style={styles.grow}><View style={styles.shimLine1} /><View style={styles.shimLine2} /></View>
              </View>
            </View>
          ) : null}
          <View style={{ height: KIT_FOOT_SPACE }} />
        </FadeIn>
      </AppScreen>
      <KitFoot>
        <XlButton primary={false} label={t("add.import.closeWait")} onPress={onClose} />
        <UiText style={[k.lbl, styles.centerText]}>{t("add.import.closeNote")}</UiText>
      </KitFoot>
    </View>
  );
}

/** `/contacts/new/import?kind=linkedin` (b9 A3 ① App): the 3 steps, 取り込めるもの, CSV を選ぶ / LinkedIn を開く. */
export function LinkedInImportScreen() {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const api = useImportApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/contacts/new" as Href));
  const pick = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text", "application/zip", "public.zip-archive"] }).catch(() => null);
    const asset = result && !result.canceled ? result.assets[0] : null;
    if (!asset) return;
    setBusy(true);
    try {
      const raw = await readPickedFile(asset.uri);
      const prepared = prepareLinkedInFile(raw, asset.name || "Connections.csv");
      if (prepared.ok === false) { setError(t(prepared.reason)); return; }
      const uploaded = await api.upload(prepared.bytes, prepared.name, "csv", newImportKey());
      if (!uploaded.ok) { setError(failureText(t, uploaded.failure.kind === "other" ? uploaded.failure.reason : null, uploaded.failure.kind)); return; }
      router.replace({ pathname: `${IMPORT_HREF}/[importId]`, params: { importId: uploaded.data.id } } as unknown as Href);
    } catch {
      setError(t("add.import.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };
  const can: MessageKey[] = ["add.import.liCanName", "add.import.liCanCompany", "add.import.liCanRole", "add.import.liCanConnected"];
  return (
    <View style={styles.fill}>
      <AppScreen inset="kit" title={t("add.import.liTitle")} subtitle={t("add.import.liSub")} backIcon="x" onBack={back}>
        <FadeIn testID="add-import-linkedin">
          <View style={[styles.card, styles.flat, styles.liNote]}>
            <UiText style={styles.liNoteText}><UiText style={styles.liNoteLead}>{t("add.import.liNoteLead")}</UiText>{t("add.import.liNote")}</UiText>
          </View>
          <View style={[styles.card, styles.cardGap]}>
            <KitStep first n={1} title={t("add.import.liStep1")}>
              <KitIll items={[{ key: "a", icon: "user", label: t("add.import.liStep1a") }, { key: "b", icon: "settings", label: t("add.import.liStep1b"), hl: true }, { key: "c", icon: "bell", label: t("add.import.liStep1c"), dim: true }]} />
            </KitStep>
            <KitStep n={2} title={t("add.import.liStep2")}>
              <KitIll items={[{ key: "a", check: "off", label: t("add.import.liStep2a") }, { key: "b", check: "on", label: t("add.import.liStep2b"), hl: true }, { key: "c", label: t("add.import.liStep2c"), dim: true }]} />
            </KitStep>
            <KitStep n={3} title={t("add.import.liStep3")}>
              <View style={styles.file}>
                <View style={styles.fi}><UiText style={styles.fiText}>CSV</UiText></View>
                <View style={styles.grow}>
                  <UiText style={styles.fileName}>Connections.csv</UiText>
                  <UiText style={styles.lbl}>{t("add.import.liStep3Note")}</UiText>
                </View>
              </View>
            </KitStep>
            <View style={styles.wait}><Icon name="clock" size={16} color={colors.ink3} /><UiText style={styles.lbl}>{t("add.import.liWait")}</UiText></View>
          </View>
          <View style={[styles.card, styles.canCard]}>
            <UiText style={styles.lbl}>{t("add.import.liCan")}</UiText>
            <View style={styles.chips}>
              {can.map((key) => <View key={key} style={styles.chip}><UiText style={styles.chipText}>{t(key)}</UiText></View>)}
              <View style={[styles.chip, styles.chipDim]}><UiText style={styles.chipText}>{t("add.import.liCanEmail")}</UiText></View>
            </View>
          </View>
          {error ? <UiText style={styles.error} testID="add-import-error">{error}</UiText> : null}
          <View style={{ height: KIT_FOOT_SPACE }} />
        </FadeIn>
      </AppScreen>
      <KitFoot>
        <XlButton icon="share" busy={busy} label={t("add.import.liPick")} onPress={() => void pick()} testID="add-import-pick-csv" />
        <BlockButton icon="out" label={t("add.import.liOpen")} onPress={() => void Linking.openURL(LINKEDIN_EXPORT_URL)} />
      </KitFoot>
    </View>
  );
}

const GROUP_KEY: Record<ImportIssueGroup, MessageKey> = { email: "add.import.groupEmail", truncated: "add.import.groupTruncated", country: "add.import.groupCountry", inFile: "add.import.groupInFile", blocked: "add.import.groupBlocked" };

type BatchState = { phase: "loading" } | { phase: "missing" | "expired" } | { phase: "ready"; batch: ContactImportBatchView; rows: ContactImportRowView[] };

/** `/contacts/new/import/[importId]` (b9 A2 ④ App, 統一): まとめて確認 → N人を人脈に追加 → 完成. */
export function ImportBatchScreen({ batchId, excluded = 0, design }: { batchId: string; excluded?: number; design?: ImportDesignName }) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const api = useImportApi();
  const [state, setState] = useState<BatchState>(() => (design === "design-review" ? { phase: "ready", batch: IMPORT_DESIGN.review.batch, rows: IMPORT_DESIGN.review.rows } : { phase: "loading" }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const intent = useRef(newImportKey());
  const load = async () => {
    const batch = await api.readBatch(batchId);
    if (!batch.ok) { setState({ phase: "missing" }); return; }
    if (batch.data.status === "expired" || batch.data.status === "cancelled") { setState({ phase: "expired" }); return; }
    if (batch.data.status === "completed" || batch.data.status === "committing") { setState({ phase: "ready", batch: batch.data, rows: [] }); return; }
    const rows = await api.readRows(batchId);
    setState(rows.ok ? { phase: "ready", batch: batch.data, rows: rows.data } : { phase: "missing" });
  };
  useEffect(() => { if (!design) void load(); }, [batchId, design]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => router.replace("/contacts" as Href);
  const ready = state.phase === "ready" ? state : null;
  const done = ready ? ready.batch.status === "completed" || ready.batch.status === "committing" : false;
  const split = useMemo(() => splitImportRows(ready?.rows ?? []), [ready?.rows]);
  // The ticks and 取り込まない are the user's changes on top of the defaults (転職 unticked; what the server
  // already skipped stays skipped), so the first frame and a reload both show the right state.
  const [choiceChanges, setChoiceChanges] = useState<Record<number, boolean>>({});
  const choice = useMemo(() => ({ ...defaultMergeChoice(split.duplicates), ...choiceChanges }), [split, choiceChanges]);
  const setChoice = (update: (current: Record<number, boolean>) => Record<number, boolean>) => setChoiceChanges((changes) => ({ ...changes, ...update({ ...defaultMergeChoice(split.duplicates), ...changes }) }));
  const [skipChanges, setSkipChanges] = useState<Record<number, boolean>>({});
  const skipped = useMemo(() => {
    const set = serverSkipped(ready?.rows ?? []);
    for (const [seq, out] of Object.entries(skipChanges)) { if (out) set.add(Number(seq)); else set.delete(Number(seq)); }
    return set;
  }, [ready?.rows, skipChanges]);
  const setSkipped = (update: (current: Set<number>) => Set<number>) => {
    const next = update(new Set(skipped));
    setSkipChanges((changes) => {
      const out = { ...changes };
      for (const seq of new Set([...skipped, ...next])) out[seq] = next.has(seq);
      return out;
    });
  };
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<number | null>(null);
  const source = ready?.batch.format === "linkedin" ? "LinkedIn" : ready?.batch.format === "generic" ? "CSV" : t("add.import.sourceContacts");
  const add = addCount(split, skipped);
  const commit = async () => {
    if (!ready || design) return;
    setBusy(true);
    setProblem(null);
    const plan = commitPlan(ready.rows, choice, skipped);
    const result = await api.commit(batchId, intent.current, plan.decisions, plan.mergeConfirmations);
    setBusy(false);
    // The batch may have been committed by an earlier try (or changed): read it again, then say it failed.
    if (!result.ok) { setProblem(t("add.import.addFailed")); void load(); return; }
    setState({ phase: "ready", batch: result.data, rows: [] });
  };
  const selectedSeqs = split.duplicates.filter((row) => choice[row.seq]).map((row) => row.seq);
  const settleSelected = (merge: boolean) => setChoice((current) => { const next = { ...current }; for (const seq of selectedSeqs) next[seq] = merge; return next; });
  const duplicates: AppReviewDuplicateRow[] = split.duplicates.map((row) => {
    const candidate = row.candidate!;
    const name = row.fields.displayName || t("add.import.noName");
    // b9 A2 ④: the row is the person already in 人脈 (both avatars, the title); 今回 says how this import reads them.
    return {
      id: String(row.seq), name: candidate.displayName || name, existingName: candidate.displayName || name,
      existingLine: t("add.batch.existingLine", { value: [candidate.organization, candidate.role].filter(Boolean).join(" · ") || candidate.displayName }),
      // Same company as the person in 人脈: only the name differs, so only the name is shown (R12 名刺 likewise).
      incomingLine: t("add.batch.incomingLine", { value: !row.fields.organization ? t("add.import.incomingNoCompany", { name }) : row.fields.organization === candidate.organization ? name : `${name} · ${row.fields.organization}` }),
      ...(design === "design-review" && (candidate.displayName === previewSamples.reviewBlueAvatarName || candidate.displayName === previewSamples.reviewApricotAvatarName)
        ? { avatarTone: candidate.displayName === previewSamples.reviewBlueAvatarName ? "blue" as const : "apricot" as const }
        : {}),
      selected: Boolean(choice[row.seq]) && !skipped.has(row.seq), problem: null,
    };
  });
  const tiles = [
    { count: split.autoMerged.length + split.duplicates.length, key: "duplicate" as const, label: t("add.batch.tileDuplicate") },
    { count: split.groups.reduce((sum, entry) => sum + entry.rows.length, 0), key: "review" as const, label: t("add.batch.tileReview") },
    { count: split.asIs.length, key: "asIs" as const, label: t("add.batch.tileAsIs") },
  ];
  const title = done ? "" : t("add.import.reviewTitle");
  const subtitle = ready && !done ? t("add.import.reviewSub", { source, n: ready.batch.rowCount.toLocaleString() }) : undefined;
  const foot = ready && !done ? (
    <KitFoot>
      <XlButton busy={busy} disabled={!add} label={t("add.import.addAll", { n: add.toLocaleString() })} onPress={() => void commit()} testID="add-import-add-all" />
      <UiText style={styles.footNote}>{t("add.import.addNote")}</UiText>
    </KitFoot>
  ) : ready && done ? (
    <KitFoot>
      <XlButton icon="users" label={t("add.import.viewNetwork")} onPress={close} testID="add-import-network" />
    </KitFoot>
  ) : null;
  return (
    <View style={styles.fill}>
      <AppScreen inset="kit" title={title} subtitle={subtitle} onBack={close} showBack={!done}>
        <FadeIn testID={`add-import-batch-${state.phase === "ready" ? (done ? "done" : "review") : state.phase}`}>
          {state.phase === "loading" ? <Skeleton lines={6} /> : null}
          {state.phase === "missing" || state.phase === "expired" ? (
            <RetryCard title={t(state.phase === "expired" ? "add.import.expired" : "add.import.loadBatchFailed")} onRetry={() => router.replace(IMPORT_HREF as Href)} />
          ) : null}
          {ready && !done ? (
            <UnifiedReviewApp
              tiles={tiles}
              active="duplicate"
              duplicateTitle={t("add.batch.duplicateTitle", { n: tiles[0]!.count })}
              exceptionsOnly={t("add.batch.exceptionsOnly")}
              autoMergedLabel={split.autoMerged.length ? t("add.import.autoMerged", { n: split.autoMerged.length }) : null}
              autoMergedNote={t("add.import.autoMergedNote")}
              similarLabel={t("add.batch.similarOnly", { n: split.duplicates.length })}
              duplicates={duplicates}
              onToggle={(id) => setChoice((current) => ({ ...current, [Number(id)]: !current[Number(id)] }))}
              onRowMenu={(id) => setRowMenu(Number(id))}
              toggleLabel={(row) => t("add.batch.selectRow", { name: row.name })}
              mergeLabel={t("add.batch.mergeSelected", { n: selectedSeqs.length })}
              separateLabel={t("add.batch.separate")}
              skipLabel={t("add.import.skipRow")}
              onMergeSelected={() => settleSelected(true)}
              onSeparate={() => settleSelected(false)}
              reviewTitle={t("add.batch.reviewTitleN", { n: tiles[1]!.count })}
              reviewNote={t("add.batch.reviewNote")}
              estimated={t("add.import.estimated")}
              groups={(design ? IMPORT_DESIGN.review.groups : split.groups.map(({ group, rows }) => ({ key: group, label: t(GROUP_KEY[group]), example: rows[0]!.fields.displayName || t("add.import.noName"), tone: group === "blocked" || group === "inFile" ? "lo" as const : "mid" as const, count: rows.length })))
                .map((group) => ({ ...group, open: openGroup === group.key }))}
              onGroup={(key) => setOpenGroup((value) => (value === key ? null : key))}
              groupBody={(key) => split.groups.find((entry) => entry.group === key)?.rows.map((row) => (
                <ImportRowLine key={row.seq} row={row} out={skipped.has(row.seq)} locked={row.inFileDuplicateOf !== null || !row.fields.displayName}
                  onToggle={() => setSkipped((current) => { const next = new Set(current); if (next.has(row.seq)) next.delete(row.seq); else next.add(row.seq); return next; })} />
              ))}
              reviewAttention={false}
              busy={busy}
            >
              {excluded ? (
                <View style={[styles.card, styles.flat, styles.cardGap, styles.row10]} testID="add-import-excluded">
                  <View style={[styles.emoSm, { backgroundColor: colors.macBlue }]}><UiText style={styles.emoSmText}>ℹ️</UiText></View>
                  <UiText style={[styles.infoText, styles.grow]}>{t("add.import.excludedNote", { n: excluded })}</UiText>
                </View>
              ) : null}
              {problem ? <UiText style={styles.error}>{problem}</UiText> : null}
              <View style={{ height: KIT_FOOT_SPACE }} />
            </UnifiedReviewApp>
          ) : null}
          {ready && done ? <ImportDone batch={ready.batch} /> : null}
        </FadeIn>
      </AppScreen>
      {foot}
      <ActionSheet visible={rowMenu !== null} title={split.duplicates.find((row) => row.seq === rowMenu)?.fields.displayName ?? ""} options={[{ key: "skip", label: t("add.import.skipRow") }]}
        onSelect={() => { const seq = rowMenu; setRowMenu(null); if (seq !== null) setSkipped((current) => new Set(current).add(seq)); }} onClose={() => setRowMenu(null)} />
    </View>
  );
}

function ImportRowLine({ row, out, locked, onToggle }: { row: ContactImportRowView; out: boolean; locked: boolean; onToggle: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const name = row.fields.displayName || t("add.import.noName");
  return (
    <View style={[styles.rowLine, out && styles.dim]} testID={`add-import-row-${row.seq}`}>
      <Avatar name={name} size="sm" />
      <View style={styles.grow}>
        <UiText numberOfLines={1} style={styles.b13}>{name}</UiText>
        <UiText numberOfLines={1} style={styles.lbl}>{[row.fields.organization, row.fields.role].filter(Boolean).join(" · ") || "—"}</UiText>
      </View>
      {locked ? null : (
        <UiPressable accessibilityRole="button" accessibilityLabel={t(out ? "add.import.keepRow" : "add.import.skipRow")} onPress={onToggle} style={styles.rowButton}>
          <UiText style={styles.rowButtonText}>{t(out ? "add.import.keepRow" : "add.import.skipRow")}</UiText>
        </UiPressable>
      )}
    </View>
  );
}

/** 完成 (same kit as the 名刺 完成 page): 🎉, N人を人脈に追加しました, three numbers, 1日1問. */
function ImportDone({ batch }: { batch: ContactImportBatchView }) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  const added = batch.counts.created + batch.counts.merged;
  return (
    <View testID="add-import-done">
      <View style={styles.center}>
        <UiText style={styles.doneEmoji}>🎉</UiText>
        <UiText accessibilityRole="header" style={styles.h1}>{t("add.import.doneTitle", { n: added })}</UiText>
      </View>
      <KitBigNums items={[
        { key: "created", value: batch.counts.created, label: t("add.import.doneNew"), accessibilityLabel: `${t("add.import.doneNew")} ${batch.counts.created}` },
        { key: "merged", value: batch.counts.merged, label: t("add.import.doneMerged"), accessibilityLabel: `${t("add.import.doneMerged")} ${batch.counts.merged}` },
        { key: "skipped", value: batch.counts.skipped + batch.counts.failed, label: t("add.import.doneSkipped"), accessibilityLabel: `${t("add.import.doneSkipped")} ${batch.counts.skipped + batch.counts.failed}` },
      ]} />
      <View style={[styles.card, styles.cardGap]}>
        <UiText style={styles.b14}>{t("add.import.doneNextTitle")}</UiText>
        <View style={styles.nextRow}>
          <View style={styles.emoSmLav}><UiText style={styles.emoSmText}>💬</UiText></View>
          <View style={styles.grow}>
            <UiText style={styles.b13}>{t("add.import.doneNextQuestion")}</UiText>
            <UiText style={styles.lbl}>{t("add.import.doneNextQuestionBody")}</UiText>
          </View>
        </View>
      </View>
      <View style={{ height: KIT_FOOT_SPACE }} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: "center" },
  centerText: { textAlign: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  cardGap: { marginTop: 14 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  lbl12: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
  b13: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  b14: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  b17: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25.5 },
  h1: { color: colors.ink, fontSize: 23, fontWeight: "900", lineHeight: 31, letterSpacing: -0.23, textAlign: "center" },
  sub: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75, textAlign: "center" },
  error: { color: colors.coralText, fontSize: 12, lineHeight: 18, marginTop: 12 },
  hero: { width: 96, height: 96, borderRadius: 32, backgroundColor: colors.macBlue, alignItems: "center", justifyContent: "center", marginTop: 10 },
  heroEmoji: { fontSize: 46, lineHeight: 56 },
  heroTitle: { marginTop: 16 },
  heroSub: { marginTop: 6 },
  permList: { marginTop: 20, paddingVertical: 6, paddingHorizontal: 16 },
  permRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  permText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19.5 },
  lbtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  google: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  googleG: { fontSize: 17, lineHeight: 22 },
  emoSm: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emoSmLav: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.macLav },
  emoSmText: { fontSize: 17, lineHeight: 22 },
  row10: { flexDirection: "row", alignItems: "center", gap: 10 },
  suggest: { marginTop: 12, paddingVertical: 14, paddingHorizontal: 16 },
  why: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  whyText: { color: colors.ink3, fontSize: 10.5, fontWeight: "800", lineHeight: 14 },
  whyBody: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2, color: colors.ink2, fontSize: 12, lineHeight: 19.8 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, marginBottom: 6 },
  listCard: { paddingVertical: 4, paddingHorizontal: 16 },
  xrow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  xrowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  li: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  orgHead: { marginTop: 12 },
  shimDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2 },
  shimLine1: { width: "60%", height: 11, borderRadius: 8, backgroundColor: colors.surface2 },
  shimLine2: { width: "40%", height: 9, borderRadius: 8, backgroundColor: colors.surface2, marginTop: 6 },
  genCard: { marginTop: 16, paddingVertical: 6, paddingHorizontal: 16 },
  firstLbl: { marginBottom: 8 },
  liNote: { paddingVertical: 12, paddingHorizontal: 14 },
  liNoteText: { color: colors.ink2, fontSize: 12, lineHeight: 19.2 },
  liNoteLead: { color: colors.ink, fontWeight: "700" },
  file: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface },
  fi: { width: 34, height: 40, borderRadius: 7, backgroundColor: colors.macTeal, alignItems: "center", justifyContent: "center" },
  fiText: { color: colors.macTealInk, fontSize: 9.5, fontWeight: "900" },
  fileName: { color: colors.ink, fontSize: 12.5, fontWeight: "700", lineHeight: 18.75 },
  wait: { flexDirection: "row", alignItems: "center", gap: 0, marginTop: 12 },
  canCard: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.surface2 },
  chipDim: { opacity: 0.55 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
  infoText: { color: colors.ink2, fontSize: 12, lineHeight: 19.2 },
  footNote: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25, textAlign: "center" },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowButton: { paddingHorizontal: 12, height: 30, borderRadius: 999, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  rowButtonText: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  dim: { opacity: 0.55 },
  doneEmoji: { fontSize: 46, lineHeight: 56, marginTop: 10 },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
}));
