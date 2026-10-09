import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Accordion, ActionSheet, Avatar, AvatarStack, BottomSheet, Button, Card, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog,
  CountUp, DegradedCard, EmptyState, FilterOption, GlassSurface, IconButton, ListRow, MacTile, OfflineBar, ProgressBar, QuotaChip, Radio,
  ReducedMotionOverride, RetryCard, RingChart, SampleBar, SampleTag, SearchField, Segmented, Skeleton, SwipeRow, TextField, Toggle, UiText, WhyDisclosure, useToast,
} from "../../components/ui";
import { setAppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";

// R04 / RD-15 / RD-16: every component and state of src/components/ui, for side-by-
// side checks with the design kit. Switches: light / dark, Reduce Motion. Text size
// follows the system setting (set it in Settings to check 2×). Developer surface:
// section names are identifiers; sample text is standard copy.
export function ComponentShowcaseScreen() {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  const toast = useToast();
  const [reduced, setReduced] = useState(false);
  const [toggle, setToggle] = useState(true);
  const [segment, setSegment] = useState<"calendar" | "todo" | "plan" | "notes">("todo");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [done, setDone] = useState(true);
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
              <Chip label={copy.chip.completed} tone="teal" /><Chip label={copy.chip.going} tone="blue" /><Chip label={copy.chip.followUp} tone="pink" /><Chip label={copy.chip.declineSuggested} />
              <SampleTag /><QuotaChip left={2} /><QuotaChip left={0} />
            </View>
            <View style={styles.row}><Avatar name="Aya Yamamoto" size="lg" /><Avatar name="Ken Sato" /><Avatar name="Alex Kim" size="sm" /><AvatarStack names={["Aya", "Ken", "Alex", "Mio"]} /><MacTile emoji="📇" /><MacTile emoji="🎟️" tone="teal" size="sm" /></View>
          </Section>

          <Section name="card / list / swipe">
            <Card><ListRow title="Aya Yamamoto" subtitle={copy.chip.going} leading={<Avatar name="Aya Yamamoto" />} trailing={<Chip label={copy.chip.today} tone="apricot" />} onPress={() => undefined} /></Card>
            <Card variant="flat"><UiText style={styles.caption}>flat</UiText></Card>
            <Card variant="line"><UiText style={styles.caption}>line</UiText></Card>
            <SwipeRow actions={[{ key: "tomorrow", label: copy.action.tomorrow, icon: "clock", tone: "lav", onPress: () => toast.success(copy.toast.movedToTomorrow) }, { key: "done", label: copy.chip.completed, icon: "check", tone: "teal", onPress: () => toast.success(copy.toast.completed) }, { key: "delete", label: copy.action.delete, icon: "trash", tone: "coral", onPress: () => setDialog(true) }]}>
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
              <Button label="toast error" onPress={() => toast.error(copy.toast.saveFailed)} />
              <Button label="undo bar" onPress={() => toast.info(copy.toast.savedOffline, { keep: true, sub: copy.toast.syncLater })} />
              <Button label="confirm" onPress={() => setDialog(true)} />
              <Button label="sheet" onPress={() => setSheet(true)} />
              <Button label="action sheet" onPress={() => setActionSheet(true)} />
            </View>
            <ConfirmDialog visible={dialog} destructive title={fillCopy(copy.confirm.deleteTitle, { item: copy.nav.task })} message={copy.confirm.irreversible} confirmLabel={copy.confirm.delete} onConfirm={() => { setDialog(false); toast.success(copy.toast.deleted); }} onCancel={() => setDialog(false)} />
            <BottomSheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel="sheet"><TextField label={copy.taskSegments.notes} value="" onChangeText={() => undefined} /></BottomSheet>
            <ActionSheet visible={actionSheet} title={copy.action.withdraw} effects={[{ icon: "bell", text: copy.push.openedFromPush }]} options={[{ key: "withdraw", label: copy.action.withdraw, destructive: true }, { key: "cancel", label: copy.action.cancel }]} onSelect={() => setActionSheet(false)} onClose={() => setActionSheet(false)} />
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
            <Segmented segments={[{ key: "calendar", label: copy.taskSegments.calendar }, { key: "todo", label: copy.taskSegments.todo }, { key: "plan", label: copy.taskSegments.plan }, { key: "notes", label: copy.taskSegments.notes }]} value={segment} onChange={setSegment} accessibilityLabel={copy.nav.task} />
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

function Section({ name, children }: { name: string; children: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.section}><UiText style={styles.sectionName}>{name}</UiText>{children}</View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 18, paddingBottom: 80 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  section: { gap: 10 },
  sectionName: { color: colors.ink2, fontSize: 11.5, fontWeight: "700" },
  caption: { color: colors.ink2, fontSize: 12 },
  number: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  glass: { padding: 16 },
}));
