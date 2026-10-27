import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet, Avatar, BottomSheet, Button, Card, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog, DegradedCard, Icon,
  FilterOption, ListRow, MacTile, OfflineBar, QuotaChip, Radio, RetryCard, SampleBar, SampleTag, Skeleton, TextField, Toggle, UiPressable, UiText, WhyDisclosure,
  FullScreenSearch, TabBar, UnderlineTabs,
  type ChipTone, type IconName,
} from "../../components/ui";
import { ToastCapsule } from "../../components/ui/Toast";
import { createToast, type ToastKind } from "../../components/ui/toast-model";
import Svg, { Circle, Defs, RadialGradient, Stop } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import samples from "./component-section-samples.json";

// R31a 逐件对照：01-system 按规格格重排；b2 的四种新组件展示态追加在末尾（`/showcase/components/<id>`）。
// id = `<sec2 id>-<格序号>`，格序号与 compare-redesign.mjs --list-cells 一致（0 起）。
// 小节画面固定画在 SECTION_TOP（设计点）下方、x = 0、宽 = 规格格宽；`placement: "overlay"` 的弹层按自身规则
// 定位（居中 / 贴底），rect 写在 repos/orbits/scripts/visual/views/app-R31a-components.json。
// 示例文字照规格格原文，放在 component-section-samples.json（数据，不是界面文案；本目录 no-hardcoded-copy 必须为 0）。
// SC-03 把规格格里的文档拼装也画在小节里；交互件仍使用真实 App 组件。
export const SECTION_TOP = 120;

export type ComponentSection = {
  id: string;
  /** 01-system 小节标题 + 格标题，展示页上显示 */
  title: string;
  /** 规格格宽（设计点）；inline 小节按这个宽度画 */
  width: number;
  placement: "inline" | "overlay" | "screen";
  render: () => ReactNode;
};

const noop = () => undefined;

function Stack({ gap = 10, children }: { gap?: number; children: ReactNode }) {
  return <View style={{ gap }}>{children}</View>;
}
function Row({ gap = 8, wrap = false, children }: { gap?: number; wrap?: boolean; children: ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap, flexWrap: wrap ? "wrap" : "nowrap" }}>{children}</View>;
}
// kit .lbl; `…` marks a <code> run, which the cells draw in Chrome's default monospace (Courier, CDP-checked).
function Label({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  if (typeof children !== "string" || !children.includes("`")) return <UiText style={styles.label}>{children}</UiText>;
  return <UiText style={styles.label}>{children.split("`").map((part, index) => (index % 2 ? <Text key={index} style={styles.code}>{part}</Text> : part))}</UiText>;
}

const T = samples.titles as Record<string, string>;
const TOASTS = samples.toasts.map((toast) => createToast({
  kind: toast.kind as ToastKind,
  message: toast.message,
  ...("sub" in toast && toast.sub ? { sub: toast.sub } : {}),
  ...("undo" in toast && toast.undo ? { undo: noop } : {}),
  ...("action" in toast && toast.action ? { action: { label: toast.action, onPress: noop, ...("actionIcon" in toast && toast.actionIcon ? { icon: toast.actionIcon } : {}) } } : {}),
  ...("icon" in toast && toast.icon ? { icon: toast.icon } : {}),
  ...("stay" in toast && toast.stay ? { stay: true } : {}),
}, 0));
const CHIP_ROWS = samples.chips as [ChipTone, string[]][];
const EFFECT_ICONS = ["bell", "ticket", "users"] as const;

function ControlsSection() {
  const [on, setOn] = useState(true);
  const c = samples.ctl;
  return (
    <Stack gap={14}>
      <Row gap={14}><Toggle value={false} onValueChange={noop} accessibilityLabel="off" /><Toggle value={on} onValueChange={setOn} accessibilityLabel="on" /><Label>{c.toggle}</Label></Row>
      <Row gap={14}><CheckCircle checked={false} onChange={noop} accessibilityLabel="todo" /><CheckCircle checked onChange={noop} accessibilityLabel="done" /><Label>{c.check}</Label></Row>
      <Row gap={14}><Checkbox checked={false} onChange={noop} accessibilityLabel="off" /><Checkbox checked onChange={noop} accessibilityLabel="on" /><Label>{c.box}</Label></Row>
      <Row gap={14}><Radio selected={false} onSelect={noop} accessibilityLabel="off" /><Radio selected onSelect={noop} accessibilityLabel="on" /><Label>{c.radio}</Label></Row>
      <Row gap={6} wrap>
        <FilterOption label={c.filters[0]!} selected onToggle={noop} /><FilterOption label={c.filters[1]!} selected={false} onToggle={noop} />
        <CategoryTabs options={[{ key: "all", label: c.tabs[0]! }, { key: "push", label: c.tabs[1]! }]} value="all" onChange={noop} accessibilityLabel="category" />
        <Label>{c.filterNote}</Label>
      </Row>
    </Stack>
  );
}

function FilterSheetBody() {
  const f = samples.filterSheet;
  return (
    <Stack gap={12}>
      <Row><UiText style={{ fontSize: 17, fontWeight: "800", flex: 1 }}>{f.title}</UiText><Button label={f.clear} variant="ghost" size="sm" onPress={noop} /></Row>
      {f.groups.map((group) => (
        <Stack key={group.label} gap={6}><Label>{group.label}</Label><Row gap={6} wrap>{group.options.map((option, index) => <FilterOption key={option} label={option} selected={group.on.includes(index)} onToggle={noop} />)}</Row></Stack>
      ))}
      <Row><UiText style={{ flex: 1, fontSize: 15 }}>{f.prefer}</UiText><Toggle value onValueChange={noop} accessibilityLabel={f.prefer} /></Row>
      <Button label={f.show} variant="primary" onPress={noop} />
    </Stack>
  );
}

function AiMatchSection() {
  const { colors, styles } = useStyles();
  return <Card style={styles.aiMatchCard}>
    <Row gap={10}><Avatar name={ai3.name} tone="blue" /><View style={styles.aiMatchMeta}><UiText style={styles.aiMatchName}>{ai3.name}</UiText><Label>{ai3.subtitle}</Label></View>
      <View style={styles.aiMatchActions}><UiPressable accessibilityRole="button" accessibilityLabel={ai3.approve} hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }} onPress={noop} style={[styles.aiMatchAction, { backgroundColor: colors.plum700 }]}><Icon name="check" size={16} color={colors.onAccent} /></UiPressable><UiPressable accessibilityRole="button" accessibilityLabel={ai3.reject} hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }} onPress={noop} style={[styles.aiMatchAction, { backgroundColor: colors.surface2 }]}><Icon name="x" size={16} color={colors.ink2} /></UiPressable></View>
    </Row>
    <View style={styles.aiMatchHint}><Label>{ai3.hint}</Label></View>
    <Row gap={6} wrap>{ai3.suggested.map((label) => <Chip key={label} label={label} suggested onAccept={noop} />)}<Chip label={ai3.chip} tone="lav" presentation="kit" /></Row>
  </Card>;
}

function QuotaDots({ left }: { left: number }) {
  const { colors, styles } = useStyles();
  return <View style={styles.quotaDots}>{[0, 1, 2].map((index) => <View key={index} style={[styles.quotaDot, { backgroundColor: index < 3 - left ? colors.surface3 : colors.plum500 }]} />)}</View>;
}

function PayQuotaSection() {
  const { styles } = useStyles();
  return <Stack gap={18}><Card style={styles.payQuotaCard}>
    <Row><UiText style={styles.payQuotaTitle}>{pay0.title}</UiText><QuotaChip left={2} presentation="kit" /></Row>
    <View style={styles.payDots}><QuotaDots left={2} /></View>
    <View style={styles.payNote}><Label>{pay0.sub}</Label></View>
    <View style={styles.payButton}><Button label={pay0.use} icon="refresh" variant="primary" block onPress={noop} /></View>
  </Card><Row gap={8}><QuotaChip left={0} presentation="kit" /><Label>{pay0.outNote}</Label></Row></Stack>;
}

function PayOutSection() {
  const { styles } = useStyles();
  return <Card style={styles.payOutCard}><Row gap={10}><MacTile emoji={pay1.emoji} tone="apricot" /><View style={styles.payOutHead}><UiText style={styles.payOutTitle}>{pay1.title}</UiText><Label>{pay1.sub}</Label></View></Row>
    <View style={styles.payOutDots}><QuotaDots left={0} /></View>
    <Card variant="flat" style={styles.payOutBody}><UiText style={styles.payOutBodyText}>{pay1.body}</UiText></Card>
    <View style={styles.payOutPrimary}><Button label={pay1.ok} variant="primary" block onPress={noop} /></View>
    <View style={styles.payOutSecondary}><Button label={pay1.plans} variant="ghost" block onPress={noop} /></View>
  </Card>;
}

function LongChipSection() {
  const { styles } = useStyles();
  return <View style={styles.longChipRoot}><View style={styles.longChipBubble}><UiText style={styles.longChipBubbleText}>{text2.chip}</UiText><View style={styles.longChipTail} /></View><Chip label={text2.chip} tone="lav" /></View>;
}

function LoadingStepsSection() {
  const { colors, styles } = useStyles();
  return <Card style={styles.loadingCard}>
    <Row gap={12}><View style={styles.loadingOrb}><Svg width={64} height={64} style={styles.loadingGradient}><Defs><RadialGradient id="r31a-orb" cx="35%" cy="30%" r="100%"><Stop offset="0%" stopColor={colors.surface} /><Stop offset="70%" stopColor={colors.macLav} /><Stop offset="100%" stopColor={colors.macLav} /></RadialGradient></Defs><Circle cx={32} cy={32} r={32} fill="url(#r31a-orb)" /></Svg><UiText style={styles.loadingOrbText}>{load1.emoji}</UiText></View><View style={styles.loadingHeading}><UiText style={styles.loadingTitle}>{load1.title}</UiText><Label>{load1.sub}</Label></View></Row>
    <View style={styles.loadingSteps}>{load1.steps.map((step, index) => <View key={step} style={styles.loadingStep}>
      <View style={[styles.loadingStepMark, index < load1.done && styles.loadingDone]}>{index < load1.done ? <Icon name="check" size={13} strokeWidth={2.4} color={colors.surface} /> : index === load1.done ? <View style={[styles.loadingSpinner, { borderColor: colors.surface3, borderTopColor: colors.plum700 }]} /> : null}</View>
      <UiText style={[styles.loadingStepText, index < load1.done && styles.loadingStepDoneText, index > load1.done && styles.loadingStepWaitingText]}>{step}</UiText>
      {index === load1.done ? <UiText style={styles.loadingCount}>{load1.count}</UiText> : null}
    </View>)}</View>
    <View style={styles.loadingClose}><Button label={load1.close} block onPress={noop} /></View>
  </Card>;
}

function SampleSection() {
  const { styles } = useStyles();
  return <Stack gap={16}><SampleBar presentation="kit" emoji={sample0.emoji} onClose={noop} trailing={<Button label={sample0.resume} size="sm" variant="surface" onPress={noop} />} />
    <Card style={{ paddingHorizontal: 14, paddingVertical: 6 }}>{sample0.rows.map((row, index) => <View key={row.title}>{index ? <View style={styles.sampleDivider} /> : null}<ListRow title={row.title} subtitle={row.subtitle} titleAddon={<SampleTag presentation="kit" />} leading={<Avatar name={row.person} tone={row.tone as "teal" | "blue"} />} /></View>)}</Card>
  </Stack>;
}

function OfflineSection() {
  const { colors, styles } = useStyles();
  return <Stack gap={16}><OfflineBar offline pending={2} presentation="kit" pendingText={err0.pendingCount} />
    <Card style={styles.offlineRowCard}><ListRow title={err0.row} subtitle={err0.rowSub} leading={<Avatar name={err0.person} size="sm" tone="teal" />} trailing={<Row gap={3}><Icon name="clock" size={12} color={colors.macApricotText} /><UiText style={styles.offlinePendingLabel}>{err0.pending}</UiText></Row>} /></Card>
    <OfflineBar offline={false} pending={0} presentation="kit" previewSynced syncedNote={err0.syncedNote} />
  </Stack>;
}

function ConfirmPreviewSection() {
  const { styles } = useStyles();
  return <View style={styles.confirmFrame}><ConfirmDialog visible presentation="static" destructive title={confirm0.title} message={confirm0.message} confirmLabel={confirm0.confirm} onConfirm={noop} onCancel={noop} /></View>;
}

function EventTextSection() {
  const { colors, styles } = useStyles();
  return <Card style={{ padding: 14 }}><Stack gap={4}><UiText numberOfLines={2} style={{ color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 }}>{text1.title}</UiText><UiText numberOfLines={1} style={styles.label}>{text1.sub}</UiText></Stack></Card>;
}

function B2SearchSection() {
  const { colors } = useStyles();
  // The b2 phone starts its content at y=50; the 16e simulator reports a 47pt top safe inset.
  return <FullScreenSearch kind="events" topGap={3} value={b2.search.value} onChangeText={noop} placeholder={b2.search.placeholder} clearLabel={b2.search.clear} cancelLabel={b2.search.cancel} onCancel={noop} showSoftInputOnFocus={false}>
    <Card style={{ paddingHorizontal: 16, paddingVertical: 8 }}><UiText style={{ color: colors.ink, fontSize: 17, fontWeight: "800", marginVertical: 8 }}>{b2.search.heading}</UiText><ListRow title={b2.search.result} subtitle={b2.search.resultSub} /></Card>
  </FullScreenSearch>;
}

const section = (id: string, width: number, placement: ComponentSection["placement"], render: () => ReactNode): ComponentSection => ({ id, title: T[id] ?? id, width, placement, render });
const { confirm0, confirm1, participantSheet: ps, ai0, ai1, ai2, ai3, load1, err0, err1, err2, err3, sample0, sample1, pay0, pay1, text0, text1, text2 } = samples;
const b2 = samples.b2;

export const COMPONENT_SECTIONS: readonly ComponentSection[] = [
  section("c-toast-0", 359, "inline", () => <Stack>{TOASTS.map((toast) => <ToastCapsule key={toast.id} toast={toast} onClose={noop} />)}</Stack>),
  section("c-confirm-0", 322, "inline", () => <ConfirmPreviewSection />),
  section("c-confirm-1", 380, "overlay", () => <ActionSheet visible title={confirm1.title} emoji={confirm1.emoji} subtitle={confirm1.subtitle} effects={confirm1.effects.map((text, index) => ({ icon: EFFECT_ICONS[index] ?? "bell", text }))} options={[{ key: "withdraw", label: confirm1.withdraw, destructive: true }, { key: "keep", label: confirm1.keep }]} defaultFocusKey="keep" onSelect={noop} onClose={noop} />),
  section("c-layer-0", 290, "overlay", () => <BottomSheet visible onClose={noop} accessibilityLabel={samples.filterSheet.title}><FilterSheetBody /></BottomSheet>),
  section("c-layer-1", 290, "overlay", () => (
    <BottomSheet visible onClose={noop} accessibilityLabel={ps.name}>
      <Stack gap={12}>
        <ListRow title={ps.name} subtitle={ps.subtitle} leading={<Avatar name={ps.name} size="lg" />} />
        <Card variant="flat"><Stack gap={8}><UiText style={{ fontSize: 15, fontWeight: "800" }}>{ps.request}</UiText><Row><Button label={ps.approve} variant="primary" size="sm" onPress={noop} /><Button label={ps.ignore} size="sm" onPress={noop} /></Row></Stack></Card>
        <TextField label={ps.memoLabel} placeholder={ps.memoPlaceholder} value="" onChangeText={noop} />
        <Button label={ps.propose} onPress={noop} />
      </Stack>
    </BottomSheet>
  )),
  section("c-ai-0", 280, "inline", () => <ConfirmCard presentation="kit" illustrationEmoji={ai0.emoji} state="pending" title={ai0.title} detail={ai0.detail} actions={[{ label: ai0.add, primary: true, onPress: noop }, { label: ai0.decline, onPress: noop }]} />),
  section("c-ai-1", 280, "inline", () => <ConfirmCard presentation="kit" state="success" title={ai1.title} detail={ai1.detail} actions={[{ label: ai1.undo, onPress: noop }]} link={{ label: ai1.link, onPress: noop }} />),
  section("c-ai-2", 300, "inline", () => <ConfirmCard presentation="kit" state="failure" title={ai2.title} detail={ai2.detail} actions={ai2.actions.map((label, index) => ({ label, primary: index === 0, onPress: noop }))} />),
  section("c-ai-3", 280, "inline", () => <AiMatchSection />),
  section("c-why-0", 359, "inline", () => <><WhyDisclosure presentation="kit-card" illustrationEmoji={samples.why.emoji} title={samples.why.title} summary={samples.why.body} reason={samples.why.reason} /><View style={{ marginTop: 10 }}><WhyDisclosure presentation="kit-card" illustrationEmoji={samples.why.emoji} title={samples.why.title} summary={samples.why.body} reason={samples.why.reason} initialOpen /></View><WhyDisclosure presentation="kit-inline" chip={samples.why.chip} reason={samples.why.inlineReason} /></>),
  section("c-load-0", 280, "inline", () => <Skeleton presentation="kit" />),
  section("c-load-1", 320, "inline", () => <LoadingStepsSection />),
  section("c-err-0", 300, "inline", () => <OfflineSection />),
  section("c-err-1", 290, "inline", () => <RetryCard title={err1.title} message={err1.message} onRetry={noop} onViewCached={noop} presentation="kit" />),
  section("c-err-2", 290, "inline", () => <Stack gap={16}><DegradedCard title={err2.title} message={err2.message} onRetry={noop} presentation="kit" /><DegradedCard title={err2.fallbackTitle} message={err2.fallbackMessage} presentation="kit" /></Stack>),
  section("c-err-3", 270, "inline", () => <Card style={{ padding: 14 }}><TextField presentation="kit" label={err3.label} value={err3.value} onChangeText={noop} error={err3.error} /></Card>),
  section("c-sample-0", 300, "inline", () => <SampleSection />),
  section("c-sample-1", 280, "inline", () => <ConfirmDialog visible presentation="static" width={280} stacked cancelVariant="ghost" icon={{ emoji: sample1.emoji }} title={sample1.title} message={sample1.message} confirmLabel={sample1.confirm} cancelLabel={sample1.cancel} onConfirm={noop} onCancel={noop} />),
  section("c-chip-0", 359, "inline", () => <Stack gap={10}>{CHIP_ROWS.map(([tone, labels]) => <Row key={tone} gap={6} wrap>{labels.map((label) => <Chip key={label} label={label} tone={tone} presentation="kit" />)}</Row>)}</Stack>),
  section("c-pay-0", 300, "inline", () => <PayQuotaSection />),
  section("c-pay-1", 320, "inline", () => <PayOutSection />),
  section("c-text-0", 330, "inline", () => <Card style={{ paddingVertical: 6, paddingHorizontal: 14 }}><ListRow title={text0.name} subtitle={text0.subtitle} leading={<Avatar name={text0.name} tone="blue" />} trailing={<Chip label={text0.chip} tone="blue" presentation="kit" />} /></Card>),
  section("c-text-1", 280, "inline", () => <EventTextSection />),
  section("c-text-2", 300, "inline", () => <LongChipSection />),
  section("c-ctl-0", 359, "inline", () => <ControlsSection />),
  // b2-events-flow: the detail tabs, the two floating navigation variants, and the event search page.
  section("b2-utabs", 354, "inline", () => <UnderlineTabs tabs={b2.detailTabs} value="intro" onChange={noop} />),
  section("b2-tabbar-main", 390, "screen", () => <TabBar items={b2.mainTabs as { key: string; label: string; icon: IconName }[]} value="events" onChange={noop} />),
  section("b2-tabbar-live", 390, "screen", () => <TabBar items={b2.liveTabs as { key: string; label: string; icon: IconName }[]} value="site" variant="live" onChange={noop} />),
  section("b2-search", 390, "screen", () => <B2SearchSection />),
];

export function findComponentSection(id: string | undefined): ComponentSection | null {
  return COMPONENT_SECTIONS.find((section) => section.id === id) ?? null;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  label: { color: colors.ink3Text, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  code: { fontFamily: "Courier", fontSize: 13 },
  confirmFrame: { width: 322, height: 390, paddingHorizontal: 18, paddingVertical: 26, borderRadius: 22, overflow: "hidden", justifyContent: "center", alignItems: "flex-start", backgroundColor: colors.scrim },
  aiMatchCard: { padding: 14 },
  aiMatchMeta: { flex: 1, minWidth: 0 },
  aiMatchName: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  aiMatchActions: { flexDirection: "row", gap: 8 },
  aiMatchAction: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  aiMatchHint: { marginTop: 12, marginBottom: 6 },
  quotaDots: { flexDirection: "row", gap: 5 },
  quotaDot: { width: 26, height: 8, borderRadius: 4 },
  payQuotaCard: { padding: 14 },
  payQuotaTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "800" },
  payDots: { marginTop: 10 },
  payNote: { marginTop: 8 },
  payButton: { marginTop: 12 },
  payOutCard: { padding: 16 },
  payOutHead: { flex: 1, minWidth: 0 },
  payOutTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  payOutDots: { marginTop: 12, marginBottom: 4 },
  payOutBody: { padding: 12, marginTop: 6 },
  payOutBodyText: { color: colors.ink2, fontSize: 15, lineHeight: 26 },
  payOutPrimary: { marginTop: 12 },
  payOutSecondary: { marginTop: 4 },
  longChipRoot: { width: 300, paddingTop: 50 },
  longChipBubble: { position: "absolute", top: 8, left: 0, maxWidth: 280, backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11 },
  longChipBubbleText: { color: colors.bg, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  longChipTail: { position: "absolute", left: 18, top: "100%", borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: colors.ink },
  loadingCard: { padding: 16 },
  loadingOrb: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  loadingGradient: { position: "absolute", top: 0, left: 0 },
  loadingOrbText: { fontSize: 30 },
  loadingHeading: { flex: 1, minWidth: 0 },
  loadingTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  loadingSteps: { marginTop: 10 },
  loadingStep: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  loadingStepMark: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  loadingDone: { backgroundColor: colors.ok },
  loadingSpinner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  loadingStepText: { flex: 1, color: colors.ink, fontSize: 15 },
  loadingStepDoneText: { color: colors.ink2 },
  loadingStepWaitingText: { color: colors.ink3Text },
  loadingCount: { color: colors.ink3Text, fontSize: 13, fontWeight: "700" },
  loadingClose: { marginTop: 8 },
  sampleDivider: { height: 1, marginLeft: 50, backgroundColor: colors.line },
  offlineRowCard: { paddingHorizontal: 14, paddingVertical: 2.5 },
  offlinePendingLabel: { color: colors.macApricotText, fontSize: 12, fontWeight: "700" },
}));
