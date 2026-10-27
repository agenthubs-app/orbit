import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Accordion, ActionSheet, Avatar, AvatarStack, BottomSheet, Button, Card, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog,
  CountUp, DegradedCard, EmptyState, FilterOption, GlassSurface, IconButton, ListRow, MacTile, OfflineBar, ProgressBar, QuotaChip, Radio,
  ReducedMotionOverride, RetryCard, RingChart, SampleBar, SampleTag, SearchField, Segmented, Skeleton, SwipeRow, TextField, Toggle, UiPressable, UiText, WhyDisclosure, useToast,
} from "../../components/ui";
import { COMPONENT_SECTIONS } from "./component-sections";
import { getAppearanceChoice, setAppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { AddContactSheet } from "../add/AddContactSheet";
import { CompletionQuestionCard } from "../add/CompletionQuestionCard";
import { COMPLETION_OPTION_LABELS } from "../../api/compute/completion-question-rules";
import type { ContactCompletionQuestion } from "../../api/contract/contact-completion";
import type { InviteApi } from "../add/invite/invite-api";
import { InviteShareSheet, InviteUnlinkSheet } from "../add/invite/InviteConnectionSheets";
import { HostEventsRow } from "../host/HostEventsRow";

// R04 / RD-15 / RD-16: every component and state of src/components/ui, for side-by-
// side checks with the design kit. R31a: first the 01-system spec cells in 01-system order
// (one section per cell, each also its own route /showcase/components/<id> for the pixel
// gate, views/app-R31a-components.json), then the interactive demos and business sheets
// that have no spec cell. Switches: light / dark (restored on leaving),
// Reduce Motion. Text size follows the system setting, like every iOS screen —
// check 2× with Settings › Accessibility › Larger Text or `simctl ui content_size`. Developer surface:
// section names are identifiers; sample text is standard copy.
export function ComponentShowcaseScreen({ onOpenSection }: { onOpenSection?: (id: string) => void } = {}) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  const toast = useToast();
  const [reduced, setReduced] = useState(false);
  // The light / dark buttons preview a theme; leaving the page puts the user's own
  // Settings choice back (R04 review m5).
  useEffect(() => {
    const saved = getAppearanceChoice();
    return () => { if (getAppearanceChoice() !== saved) void setAppearanceChoice(saved); };
  }, []);
  const [toggle, setToggle] = useState(true);
  const [segment, setSegment] = useState<"calendar" | "todo" | "plan" | "notes">("todo");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [done, setDone] = useState(true);
  const [addSheet, setAddSheet] = useState(false);
  const [inviteSheet, setInviteSheet] = useState<"share" | "shareSuggested" | "unlink" | null>(null);
  return (
    <ReducedMotionOverride.Provider value={reduced ? true : null}>
      <SafeAreaView edges={["top"]} style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <UiText style={styles.title}>Components</UiText>
          <View style={styles.row}>
            <Button label="light" size="sm" onPress={() => void setAppearanceChoice("light")} />
            <Button label="dark" size="sm" onPress={() => void setAppearanceChoice("dark")} />
            <Button label="system" size="sm" onPress={() => void setAppearanceChoice("system")} />
            <UiText style={styles.caption}>reduce motion</UiText>
            <Toggle value={reduced} onValueChange={setReduced} accessibilityLabel="reduce motion" />
          </View>

          <UiText style={styles.group}>01-system spec cells (R31a)</UiText>
          {COMPONENT_SECTIONS.filter((section) => !section.id.startsWith("b2-")).map((section) => (
            <View key={section.id} style={styles.section}>
              <UiPressable accessibilityRole="link" accessibilityLabel={section.id} onPress={() => onOpenSection?.(section.id)}>
                <UiText style={styles.sectionName}>{`${section.id} · ${section.title} ›`}</UiText>
              </UiPressable>
              {section.placement === "inline" ? <View style={{ width: section.width }}>{section.render()}</View> : null}
            </View>
          ))}

          <UiText style={styles.group}>b2-events-flow components (R31a)</UiText>
          {COMPONENT_SECTIONS.filter((section) => section.id.startsWith("b2-")).map((section) => (
            <View key={section.id} style={styles.section}>
              <UiPressable accessibilityRole="link" accessibilityLabel={section.id} onPress={() => onOpenSection?.(section.id)}>
                <UiText style={styles.sectionName}>{`${section.id} · ${section.title} ›`}</UiText>
              </UiPressable>
              {section.placement === "inline" ? <View style={{ width: section.width }}>{section.render()}</View> : null}
            </View>
          ))}

          <UiText style={styles.group}>no spec cell · interactive demos · business sheets</UiText>
          <Section name="button">
            <View style={styles.row}>
              {(["primary", "accent", "secondary", "ghost", "danger", "dangerGhost", "dangerSoft"] as const).map((variant) => <Button key={variant} label={variant === "danger" || variant.startsWith("danger") ? copy.action.delete : copy.action.save} variant={variant} onPress={() => undefined} />)}
              <Button label={copy.action.add} size="sm" onPress={() => undefined} />
              <Button label={copy.action.retry} loading onPress={() => undefined} />
              <IconButton accessibilityLabel={copy.nav.inbox} icon="bell" dot onPress={() => undefined} />
              <IconButton accessibilityLabel={copy.action.close} icon="x" size={34} onPress={() => undefined} />
            </View>
          </Section>

          <Section name="chip / avatar / tile">
            <View style={styles.row}>
              <Chip label={copy.chip.overdue} tone="coral" /><Chip label={copy.chip.today} tone="apricot" /><Chip label={copy.chip.inReview} tone="lav" />
              <Chip label={copy.chip.completed} tone="ok" /><Chip label={copy.chip.going} tone="blue" /><Chip label={copy.chip.followUp} tone="pink" /><Chip label={copy.chip.declineSuggested} />
              <SampleTag /><QuotaChip left={2} /><QuotaChip left={0} />
            </View>
            <View style={styles.row}><Avatar name="Aya Yamamoto" size="lg" /><Avatar name="Ken Sato" /><Avatar name="Alex Kim" size="sm" /><AvatarStack names={["Aya", "Ken", "Alex", "Mio"]} /><MacTile emoji="📇" /><MacTile emoji="🎟️" tone="teal" size="sm" /></View>
          </Section>

          <Section name="card / list / swipe">
            <Card><ListRow title="Aya Yamamoto" subtitle={copy.chip.going} leading={<Avatar name="Aya Yamamoto" />} trailing={<Chip label={copy.chip.today} tone="apricot" />} onPress={() => undefined} /></Card>
            <Card variant="flat"><UiText style={styles.caption}>flat</UiText></Card>
            <Card variant="line"><UiText style={styles.caption}>line</UiText></Card>
            <SwipeRow actions={[{ key: "tomorrow", label: copy.action.tomorrow, icon: "clock", tone: "lav", onPress: () => toast.success(copy.toast.movedToTomorrow) }, { key: "done", label: copy.chip.completed, icon: "check", tone: "ok", onPress: () => toast.success(copy.toast.completed) }, { key: "delete", label: copy.action.delete, icon: "trash", tone: "coral", onPress: () => setDialog(true) }]}>
              <ListRow title="Aya Yamamoto" subtitle={copy.toast.addedToTasks} />
            </SwipeRow>
          </Section>

          <Section name="field">
            <SearchField value={query} onChangeText={setQuery} placeholder={copy.nav.askIorbit} />
            <TextField label={copy.nav.network} value="" onChangeText={() => undefined} error={copy.error.needsNetworkBody} />
            <Accordion title={copy.aiCard.showWhy}><WhyDisclosure reason={copy.toast.addedToTasks} /></Accordion>
          </Section>

          <Section name="feedback">
            <View style={styles.row}>
              <Button label="toast" onPress={() => toast.success(copy.toast.completed, { undo: () => undefined })} />
              <Button label="toast error" onPress={() => toast.error(copy.toast.saveFailed, { action: { label: copy.action.retry, onPress: () => undefined } })} />
              <Button label="undo bar" onPress={() => toast.info(copy.toast.savedOffline, { keep: true, sub: copy.toast.syncLater })} />
              <Button label="confirm" onPress={() => setDialog(true)} />
              <Button label="sheet" onPress={() => setSheet(true)} />
              <Button label="action sheet" onPress={() => setActionSheet(true)} />
            </View>
            <ConfirmDialog visible={dialog} destructive title={fillCopy(copy.confirm.deleteTitle, { item: copy.nav.task })} message={copy.confirm.irreversible} confirmLabel={copy.confirm.delete} onConfirm={() => { setDialog(false); toast.success(copy.toast.deleted); }} onCancel={() => setDialog(false)} />
            <BottomSheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel="sheet"><TextField label={copy.taskSegments.notes} value="" onChangeText={() => undefined} /></BottomSheet>
            <ActionSheet visible={actionSheet} title={copy.action.withdraw} effects={[{ icon: "bell", text: copy.push.openedFromPush }]} options={[{ key: "withdraw", label: copy.action.withdraw, destructive: true }, { key: "cancel", label: copy.action.cancel }]} onSelect={() => setActionSheet(false)} onClose={() => setActionSheet(false)} />
          </Section>

          {/* R12: the 人脈を追加 sheet R11 opens from 人脈 「＋」 (doors only; choosing one closes it). */}
          <Section name="add contact sheet">
            <Button label="add contact sheet" onPress={() => setAddSheet(true)} />
            <AddContactSheet visible={addSheet} draftCount={2} onClose={() => setAddSheet(false)} onOpen={() => undefined} />
          </Section>

          {/* R16: 今日の 1問 (b9 A7) — the card R20 / R11 / R10 mount; sample questions, answers are no-ops. */}
          <Section name="completion question card">
            {SHOWCASE_QUESTIONS.map((question) => <CompletionQuestionCard key={question.id} question={question} onAnswer={() => undefined} onSkip={() => undefined} />)}
          </Section>

          {/* R15: the two sheets R11 mounts on an invite-connected contact's detail (「⋯ › 共有する項目」 / 「⋯ › つながりを解除」). Sample answers, nothing is written. */}
          <Section name="invite share sheet">
            <Button label="invite share sheet" onPress={() => setInviteSheet("share")} />
            <InviteShareSheet visible={inviteSheet === "share"} contactId="showcase-contact" name="Aya Yamamoto" api={SHOWCASE_INVITE_API} onClose={() => setInviteSheet(null)} />
          </Section>

          {/* R15 复核 S1: the same sheet when the connection may be someone already in the network (「同じ人かも」 · 統合する / 別の人). */}
          <Section name="invite share sheet · maybe same person">
            <Button label="invite share sheet · maybe same person" onPress={() => setInviteSheet("shareSuggested")} />
            <InviteShareSheet visible={inviteSheet === "shareSuggested"} contactId="showcase-contact" name="Aya Yamamoto" api={SHOWCASE_INVITE_API_SUGGESTED} onClose={() => setInviteSheet(null)} />
          </Section>

          <Section name="invite unlink sheet">
            <Button label="invite unlink sheet" onPress={() => setInviteSheet("unlink")} />
            <InviteUnlinkSheet visible={inviteSheet === "unlink"} contactId="showcase-contact" name="Aya Yamamoto" api={SHOWCASE_INVITE_API} onClose={() => setInviteSheet(null)} />
          </Section>

          {/* R17 → R18: マイページ「主催したイベント」行（HostEventsRow，读 GET /api/events/center?summary=1）；这里传示例摘要，不请求接口。 */}
          <Section name="host events row">
            <HostEventsRow summary={{ activeCount: 1, appliedThisMonth: 24, eventCount: 2 }} onPress={() => undefined} />
            <HostEventsRow summary={null} onPress={() => undefined} />
          </Section>

          <Section name="ai">
            <ConfirmCard state="pending" title={copy.toast.addedToTasks} actions={[{ label: copy.aiCard.add, primary: true, onPress: () => undefined }, { label: copy.aiCard.decline, onPress: () => undefined }]} />
            <ConfirmCard state="success" title={copy.aiCard.added} actions={[{ label: copy.action.undo, onPress: () => undefined }]} />
            <ConfirmCard state="failure" title={fillCopy(copy.aiCard.addFailed, { target: copy.taskSegments.calendar })} detail={copy.aiCard.nothingWritten} actions={[{ label: copy.aiCard.reconnect, primary: true, onPress: () => undefined }, { label: copy.action.later, onPress: () => undefined }]} />
          </Section>

          <Section name="controls">
            <View style={styles.row}>
              <Toggle value={toggle} onValueChange={setToggle} accessibilityLabel="toggle" />
              <CheckCircle checked={done} onChange={setDone} accessibilityLabel={copy.chip.completed} />
              <Checkbox checked onChange={() => undefined} accessibilityLabel="checkbox" />
              <Radio selected onSelect={() => undefined} accessibilityLabel="radio" />
            </View>
            <Segmented variant="tseg" segments={[{ key: "calendar", label: copy.taskSegments.calendar }, { key: "todo", label: copy.taskSegments.todo }, { key: "plan", label: copy.taskSegments.plan }, { key: "notes", label: copy.taskSegments.notes }]} value={segment} onChange={setSegment} accessibilityLabel={copy.nav.task} />
            <View style={styles.row}><FilterOption label={copy.chip.going} selected count={12} onToggle={() => undefined} /><FilterOption label={copy.chip.inReview} selected={false} onToggle={() => undefined} /><Button label={copy.filter.clear} variant="ghost" size="sm" onPress={() => undefined} /></View>
            <CategoryTabs options={[{ key: "all", label: copy.nav.inbox, count: 28 }, { key: "push", label: copy.push.openTarget }]} value="all" onChange={() => undefined} accessibilityLabel="category" />
            <ProgressBar value={0.62} accessibilityLabel="progress" />
            <ProgressBar value={0.3} thin tone="coral" accessibilityLabel="progress thin" />
            <View style={styles.row}><RingChart segments={[{ value: 5, color: colors.plum700 }, { value: 3, color: colors.plum300 }]} center="46" accessibilityLabel="ring" /><CountUp value={1280} style={styles.number} /></View>
          </Section>

          <Section name="states">
            <EmptyState title={copy.loading.slow} message={copy.toast.syncLater} steps={[{ label: copy.action.add, state: "done" }, { label: copy.action.edit, state: "now" }, { label: copy.action.save, state: "later" }]} ghostRows={2} action={{ label: copy.action.add, onPress: () => undefined }} />
            <Skeleton lines={3} onRetry={() => undefined} />
            <OfflineBar offline pending={2} />
            <RetryCard title={fillCopy(copy.error.loadFailed, { item: copy.nav.task })} onRetry={() => undefined} onViewCached={() => undefined} />
            <DegradedCard onRetry={() => undefined} />
            <SampleBar />
            <GlassSurface style={styles.glass}><UiText style={styles.caption}>glass</UiText></GlassSurface>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ReducedMotionOverride.Provider>
  );
}

/** Sample answers for the invite sheets (the showcase never calls the server). */
const SHOWCASE_CONNECTION = { connectedAt: "2026-10-08T10:00:00+09:00", contactId: "showcase-contact", pausedFields: ["seeking" as const], sharedByMe: ["organization" as const, "offering" as const], sharedByPeer: ["organization" as const], via: { code: "K7QX-2M9P" } };
const showcaseNotUsed = async () => ({ code: null, ok: false as const, reason: null, status: 404 });
const SHOWCASE_INVITE_API: InviteApi = {
  connection: async () => ({ data: SHOWCASE_CONNECTION, ok: true }),
  create: showcaseNotUsed,
  current: showcaseNotUsed,
  history: showcaseNotUsed,
  preview: showcaseNotUsed,
  profile: async () => ({ data: { profile: { displayName: "Ken Sato", handles: { email: "ken@example.com" }, offering: ["Hiring advice"], organization: "Minato Link", role: "CEO", seeking: ["Investor intros"] } }, ok: true }),
  redeem: showcaseNotUsed,
  revoke: showcaseNotUsed,
  updateCurrentShare: showcaseNotUsed,
  saveShortProfile: showcaseNotUsed,
  unlink: async () => ({ data: { outcome: "unlinked" }, ok: true }),
  updateShare: async (_contactId, input) => ({ data: { ...SHOWCASE_CONNECTION, sharedByMe: input.sharedKeys }, ok: true }),
  merge: async () => ({ data: { ...SHOWCASE_CONNECTION, contactId: "showcase-contact-card" }, ok: true }),
  dismissMerge: async () => ({ data: SHOWCASE_CONNECTION, ok: true }),
};
const SHOWCASE_INVITE_API_SUGGESTED: InviteApi = {
  ...SHOWCASE_INVITE_API,
  connection: async () => ({ data: { ...SHOWCASE_CONNECTION, mergeSuggestion: { contactId: "showcase-contact-card", displayName: "Aya Yamamoto (card)", matchedOn: ["email" as const] } }, ok: true }),
};

function Section({ name, children }: { name: string; children: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.section}><UiText style={styles.sectionName}>{name}</UiText>{children}</View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 18, paddingBottom: 80 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  group: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  section: { gap: 10 },
  sectionName: { color: colors.ink2, fontSize: 13, fontWeight: "700" },
  caption: { color: colors.ink2, fontSize: 14 },
  number: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  glass: { padding: 16 },
}));

// R16 showcase samples (dev surface): どこで？ that lifts to ●●○, and 会社は？ with 自分で入力.
const SHOWCASE_QUESTIONS: ContactCompletionQuestion[] = [
  { id: "showcase-q1", contactId: "showcase-contact", question: "", contactName: "Kyohei Mori", contactSubtitle: "Shinonome Capital · Principal", sourceChip: "linkedin", kind: "met_where",
    options: [COMPLETION_OPTION_LABELS.formerColleague, "Japan Startup Night (2024/3)", COMPLETION_OPTION_LABELS.intro, COMPLETION_OPTION_LABELS.forgot], askedOn: "2026-10-07", skipCount: 0, sample: true, densityIfAnswered: 2 },
  { id: "showcase-q2", contactId: "showcase-contact-2", question: "", contactName: "Naoko Ito", sourceChip: "phone", kind: "organization",
    options: ["Harmonia Inc.", COMPLETION_OPTION_LABELS.typeIn, COMPLETION_OPTION_LABELS.forgot], askedOn: "2026-10-07", skipCount: 0, sample: true, densityIfAnswered: 1 },
];
