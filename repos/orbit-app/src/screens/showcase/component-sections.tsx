import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet, Avatar, BottomSheet, Button, Card, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog, DegradedCard,
  FilterOption, ListRow, MacTile, OfflineBar, QuotaChip, Radio, RetryCard, SampleBar, SampleTag, Skeleton, TextField, Toggle, UiText, WhyDisclosure,
  type ChipTone,
} from "../../components/ui";
import { ToastCapsule } from "../../components/ui/Toast";
import { createToast, type ToastKind } from "../../components/ui/toast-model";
import { createThemedStyles } from "../../design/theme";
import samples from "./component-section-samples.json";

// R31a 逐件对照：展示页按 01-system 规格格重排，一个规格格一个小节（`/showcase/components/<id>`）。
// id = `<sec2 id>-<格序号>`，格序号与 compare-redesign.mjs --list-cells 一致（0 起）。
// 小节画面固定画在 SECTION_TOP（设计点）下方、x = 0、宽 = 规格格宽；`placement: "overlay"` 的弹层按自身规则
// 定位（居中 / 贴底），rect 写在 repos/orbits/scripts/visual/views/app-R31a-components.json。
// 示例文字照规格格原文，放在 component-section-samples.json（数据，不是界面文案；本目录 no-hardcoded-copy 必须为 0）。
// 本轮（工具里程碑）只重排、不修组件：组件与规格格的差异由第一次逐件对照列出（PLANNER 执行顺序 3）。
export const SECTION_TOP = 120;

export type ComponentSection = {
  id: string;
  /** 01-system 小节标题 + 格标题，展示页上显示 */
  title: string;
  /** 规格格宽（设计点）；inline 小节按这个宽度画 */
  width: number;
  placement: "inline" | "overlay";
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
      <Row><UiText style={{ fontSize: 15, fontWeight: "800", flex: 1 }}>{f.title}</UiText><Button label={f.clear} variant="ghost" size="sm" onPress={noop} /></Row>
      {f.groups.map((group) => (
        <Stack key={group.label} gap={6}><Label>{group.label}</Label><Row gap={6} wrap>{group.options.map((option, index) => <FilterOption key={option} label={option} selected={group.on.includes(index)} onToggle={noop} />)}</Row></Stack>
      ))}
      <Row><UiText style={{ flex: 1, fontSize: 13 }}>{f.prefer}</UiText><Toggle value onValueChange={noop} accessibilityLabel={f.prefer} /></Row>
      <Button label={f.show} variant="primary" onPress={noop} />
    </Stack>
  );
}

function WhyCard({ open }: { open: boolean }) {
  const w = samples.why;
  return <Card><Stack gap={8}><Row><MacTile emoji="🎯" tone="apricot" size="sm" /><UiText style={{ fontSize: 13, fontWeight: "800" }}>{w.title}</UiText></Row><UiText style={{ fontSize: 14, fontWeight: "700" }}>{w.body}</UiText>{open ? <WhyDisclosure reason={w.reason} /> : null}</Stack></Card>;
}

const section = (id: string, width: number, placement: ComponentSection["placement"], render: () => ReactNode): ComponentSection => ({ id, title: T[id] ?? id, width, placement, render });
const { confirm0, confirm1, participantSheet: ps, ai0, ai1, ai2, ai3, load1, err0, err1, err2, err3, sample0, sample1, pay0, pay1, text0, text1, text2 } = samples;

export const COMPONENT_SECTIONS: readonly ComponentSection[] = [
  section("c-toast-0", 359, "inline", () => <Stack>{TOASTS.map((toast) => <ToastCapsule key={toast.id} toast={toast} onClose={noop} />)}</Stack>),
  section("c-confirm-0", 322, "overlay", () => <ConfirmDialog visible destructive title={confirm0.title} message={confirm0.message} confirmLabel={confirm0.confirm} onConfirm={noop} onCancel={noop} />),
  section("c-confirm-1", 380, "overlay", () => <ActionSheet visible title={confirm1.title} emoji={confirm1.emoji} subtitle={confirm1.subtitle} effects={confirm1.effects.map((text, index) => ({ icon: EFFECT_ICONS[index] ?? "bell", text }))} options={[{ key: "withdraw", label: confirm1.withdraw, destructive: true }, { key: "keep", label: confirm1.keep }]} defaultFocusKey="keep" onSelect={noop} onClose={noop} />),
  section("c-layer-0", 290, "overlay", () => <BottomSheet visible onClose={noop} accessibilityLabel={samples.filterSheet.title}><FilterSheetBody /></BottomSheet>),
  section("c-layer-1", 290, "overlay", () => (
    <BottomSheet visible onClose={noop} accessibilityLabel={ps.name}>
      <Stack gap={12}>
        <ListRow title={ps.name} subtitle={ps.subtitle} leading={<Avatar name={ps.name} size="lg" />} />
        <Card variant="flat"><Stack gap={8}><UiText style={{ fontSize: 13, fontWeight: "800" }}>{ps.request}</UiText><Row><Button label={ps.approve} variant="primary" size="sm" onPress={noop} /><Button label={ps.ignore} size="sm" onPress={noop} /></Row></Stack></Card>
        <TextField label={ps.memoLabel} placeholder={ps.memoPlaceholder} value="" onChangeText={noop} />
        <Button label={ps.propose} onPress={noop} />
      </Stack>
    </BottomSheet>
  )),
  section("c-ai-0", 280, "inline", () => <ConfirmCard state="pending" title={ai0.title} detail={ai0.detail} actions={[{ label: ai0.add, primary: true, onPress: noop }, { label: ai0.decline, onPress: noop }]} />),
  section("c-ai-1", 280, "inline", () => <ConfirmCard state="success" title={ai1.title} detail={ai1.detail} actions={[{ label: ai1.undo, onPress: noop }]} />),
  section("c-ai-2", 300, "inline", () => <ConfirmCard state="failure" title={ai2.title} detail={ai2.detail} actions={ai2.actions.map((label, index) => ({ label, primary: index === 0, onPress: noop }))} />),
  section("c-ai-3", 280, "inline", () => <Card><Stack><ListRow title={ai3.name} subtitle={ai3.subtitle} leading={<Avatar name={ai3.name} />} /><Label>{ai3.hint}</Label><Row gap={6} wrap>{ai3.suggested.map((label) => <Chip key={label} label={label} />)}<Chip label={ai3.chip} tone="lav" /></Row></Stack></Card>),
  section("c-why-0", 359, "inline", () => <Stack><WhyCard open={false} /><WhyCard open /><Row><Chip label={samples.why.chip} tone="lav" /></Row></Stack>),
  section("c-load-0", 280, "inline", () => <Skeleton lines={3} />),
  section("c-load-1", 320, "inline", () => <Card><Stack><UiText style={{ fontSize: 15, fontWeight: "800" }}>{load1.title}</UiText><Label>{load1.sub}</Label>{load1.steps.map((step, index) => <Row key={step}><CheckCircle checked={index < load1.done} onChange={noop} accessibilityLabel={step} /><UiText style={{ fontSize: 13 }}>{step}</UiText></Row>)}<Button label={load1.close} onPress={noop} /></Stack></Card>),
  section("c-err-0", 300, "inline", () => <Stack><OfflineBar offline pending={2} /><ListRow title={err0.row} subtitle={err0.rowSub} leading={<Avatar name={err0.person} size="sm" />} trailing={<Chip label={err0.pending} tone="apricot" />} /><OfflineBar offline={false} pending={0} /></Stack>),
  section("c-err-1", 290, "inline", () => <RetryCard title={err1.title} message={err1.message} onRetry={noop} onViewCached={noop} />),
  section("c-err-2", 290, "inline", () => <DegradedCard title={err2.title} message={err2.message} onRetry={noop} />),
  section("c-err-3", 270, "inline", () => <TextField label={err3.label} value={err3.value} onChangeText={noop} error={err3.error} />),
  section("c-sample-0", 300, "inline", () => <Stack><SampleBar trailing={<Button label={sample0.resume} size="sm" onPress={noop} />} />{sample0.rows.map(([name, sub], index) => <ListRow key={name} title={name!} subtitle={sub!} leading={<Avatar name={name!} />} trailing={index === 0 ? <SampleTag /> : undefined} />)}</Stack>),
  section("c-sample-1", 280, "overlay", () => <ConfirmDialog visible stacked cancelVariant="ghost" icon={{ emoji: "🧪" }} title={sample1.title} message={sample1.message} confirmLabel={sample1.confirm} cancelLabel={sample1.cancel} onConfirm={noop} onCancel={noop} />),
  section("c-chip-0", 359, "inline", () => <Stack gap={8}>{CHIP_ROWS.map(([tone, labels]) => <Row key={tone} gap={6} wrap>{labels.map((label) => <Chip key={label} label={label} tone={tone} />)}</Row>)}</Stack>),
  section("c-pay-0", 300, "inline", () => <Stack><Card><Stack gap={8}><Row><UiText style={{ fontSize: 14, fontWeight: "800", flex: 1 }}>{pay0.title}</UiText><QuotaChip left={2} /></Row><Label>{pay0.sub}</Label><Button label={pay0.use} variant="primary" onPress={noop} /></Stack></Card><Row><QuotaChip left={0} /><Label>{pay0.outNote}</Label></Row></Stack>),
  section("c-pay-1", 320, "inline", () => <Card><Stack><Row gap={12}><MacTile emoji="⏳" tone="apricot" /><Stack gap={2}><UiText style={{ fontSize: 15, fontWeight: "800" }}>{pay1.title}</UiText><Label>{pay1.sub}</Label></Stack></Row><Card variant="flat"><UiText style={{ fontSize: 12.5 }}>{pay1.body}</UiText></Card><Button label={pay1.ok} variant="primary" onPress={noop} /><Button label={pay1.plans} variant="ghost" onPress={noop} /></Stack></Card>),
  section("c-text-0", 330, "inline", () => <ListRow title={text0.name} subtitle={text0.subtitle} leading={<Avatar name={text0.name} />} trailing={<Chip label={text0.chip} tone="blue" />} />),
  section("c-text-1", 280, "inline", () => <Card><Stack gap={4}><UiText numberOfLines={2} style={{ fontSize: 14.5, fontWeight: "800" }}>{text1.title}</UiText><UiText numberOfLines={1} style={{ fontSize: 11.5 }}>{text1.sub}</UiText></Stack></Card>),
  section("c-text-2", 300, "inline", () => <Row><Chip label={text2.chip} tone="lav" /></Row>),
  section("c-ctl-0", 359, "inline", () => <ControlsSection />),
];

export function findComponentSection(id: string | undefined): ComponentSection | null {
  return COMPONENT_SECTIONS.find((section) => section.id === id) ?? null;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  label: { color: colors.ink3Text, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  code: { fontFamily: "Courier", fontSize: 11.5 },
}));
