// Scenario app for the R04 ui tests (bundled by tests/helpers/ui-harness.ts).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OrbitLocaleContext } from "../../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../../src/i18n/messages";
import { useOrbitTheme } from "../../src/design/theme";
import {
  Accordion, ActionSheet, Avatar, AvatarStack, BottomSheet, Button, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog,
  CountUp, DegradedCard, EmptyState, FilterOption, IconButton, ListRow, MacTile, OfflineBar, ProgressBar, QuotaChip, Radio, ReducedMotionOverride,
  RetryCard, RingChart, SampleBar, SampleTag, SearchField, Segmented, Skeleton, SwipeRow, TextField, Toggle, ToastProvider, UiFeedbackHost,
  UiPortalHost, WhyDisclosure, presentConfirm, useToast, Card, FullDrawer,
} from "../../src/components/ui";

declare global { interface Window { uiFixture: Record<string, unknown>; events: string[]; ui: Record<string, unknown> } }
window.events = [];
const log = (event: string) => window.events.push(event);
const fixture = window.uiFixture;

function Locale({ children }: { children: React.ReactNode }) {
  const language = (fixture.language as "ja" | "zh" | "en") ?? "ja";
  return <OrbitLocaleContext.Provider value={{ language, t: createTranslator(language) } as never}>{children}</OrbitLocaleContext.Provider>;
}

function ToastScreen() {
  const toast = useToast();
  window.ui = {
    ...window.ui,
    success: () => toast.success("完了にしました", { undo: () => log("undo") }),
    successPlain: () => toast.success("コピーしました"),
    error: () => toast.error("保存できませんでした"),
    retry: () => toast.error("保存できませんでした", { action: { label: "再試行", onPress: () => log("retry") } }),
    keep: () => toast.info("名刺を交換しました", { keep: true, sub: "24時間以内なら取り消せます", undo: () => log("undo-keep") }),
  };
  return <View />;
}

function ToastScenario() {
  const [mounted, setMounted] = useState(true);
  (window.ui ??= {}).unmount = () => setMounted(false);
  return <>{mounted ? <ToastScreen /> : null}<View testID="page" /></>;
}

function DialogScenario() {
  const destructive = fixture.destructive !== false;
  return (
    <ConfirmDialog
      visible
      destructive={destructive}
      title="このタスクを削除しますか？"
      message="元に戻せません。"
      confirmLabel="削除する"
      onConfirm={() => log("confirm")}
      onCancel={() => log("cancel")}
    />
  );
}

function ImperativeScenario() {
  window.ui = { ask: () => presentConfirm({ title: "ログアウトしますか？", confirmLabel: "ログアウト", destructive: true }).then((value) => log(`answer:${value}`)) };
  return <UiFeedbackHost />;
}

function Gallery() {
  const [on, setOn] = useState(true);
  const [segment, setSegment] = useState<"a" | "b">("a");
  const [text, setText] = useState("名刺");
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["primary", "accent", "secondary", "ghost", "danger", "dangerGhost", "dangerSoft"] as const).map((variant) => <Button key={variant} label="保存" variant={variant} onPress={() => log(variant)} />)}
        <Button label="追加" size="sm" onPress={() => undefined} />
        <IconButton accessibilityLabel="通知" icon="bell" dot onPress={() => undefined} />
        <IconButton accessibilityLabel="閉じる" icon="x" size={34} onPress={() => undefined} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {(["neutral", "coral", "apricot", "lav", "teal", "blue", "pink"] as const).map((tone) => <Chip key={tone} label="参加予定" tone={tone} />)}
        <SampleTag /><QuotaChip left={2} /><QuotaChip left={0} />
      </View>
      <Card><ListRow title="山本 彩" subtitle="伊藤忠テクノロジーベンチャーズ" leading={<Avatar name="山本 彩" />} trailing={<Chip label="今日" tone="apricot" />} onPress={() => undefined} /></Card>
      <Card variant="flat"><AvatarStack names={["山本", "佐藤", "Alex Kim", "鈴木"]} /><MacTile emoji="📇" accessibilityLabel="名刺" /></Card>
      <SwipeRow actions={[{ key: "tomorrow", label: "明日", icon: "clock", tone: "lav", onPress: () => undefined }, { key: "done", label: "完了", icon: "check", tone: "ok", onPress: () => undefined }]}><ListRow title="資料を再送" subtitle="山本さん" /></SwipeRow>
      <SearchField value={text} onChangeText={setText} placeholder="人脈を検索" />
      <TextField label="イベントの URL" value="https://example.com" error="ログインが必要なページです。" onChangeText={() => undefined} />
      <Accordion title="詳細" initiallyOpen><Card variant="line"><WhyDisclosure reason="10/2 の面談メモ" /></Card></Accordion>
      <ConfirmCard state="pending" title="プランに追加しますか？" detail="今週のタスクに追加します" actions={[{ label: "追加する", primary: true, onPress: () => undefined }, { label: "やめる", onPress: () => undefined }]} />
      <ConfirmCard state="success" title="追加しました" actions={[{ label: "元に戻す", onPress: () => undefined }]} />
      <ConfirmCard state="failure" title="カレンダーに追加できませんでした" detail="何も書き込まれていません。" actions={[{ label: "再接続", primary: true, onPress: () => undefined }]} />
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Toggle value={on} onValueChange={setOn} accessibilityLabel="通知" />
        <CheckCircle checked onChange={() => undefined} accessibilityLabel="完了" />
        <Checkbox checked onChange={() => undefined} accessibilityLabel="選択" />
        <Radio selected onSelect={() => undefined} accessibilityLabel="日本語" />
      </View>
      <Segmented segments={[{ key: "a", label: "カレンダー" }, { key: "b", label: "To-do" }]} value={segment} onChange={setSegment} accessibilityLabel="Task" />
      <View style={{ flexDirection: "row", gap: 6 }}><FilterOption label="東京" selected count={12} onToggle={() => undefined} /><FilterOption label="大阪" selected={false} onToggle={() => undefined} /></View>
      <CategoryTabs options={[{ key: "all", label: "すべて", count: 28 }, { key: "ai", label: "秘書" }]} value="all" onChange={() => undefined} accessibilityLabel="分類" />
      <ProgressBar value={0.6} accessibilityLabel="進捗" />
      <RingChart segments={[{ value: 3, color: "#8A6FC4" }, { value: 2, color: "#C9B8EA" }]} center="46" accessibilityLabel="スコア 46" />
      <View testID="count"><CountUp value={1280} /></View>
      <EmptyState title="まだメモはありません" message="面談のあとに一言残すと、ここに並びます。" steps={[{ label: "名刺を取り込む", state: "done" }, { label: "会う人を選ぶ", state: "now" }, { label: "メモを残す", state: "later" }]} ghostRows={2} action={{ label: "メモを追加", onPress: () => undefined }} />
      <Skeleton lines={3} onRetry={() => undefined} />
      <OfflineBar offline pending={2} />
      <RetryCard title="タスクを読み込めませんでした" onRetry={() => undefined} onViewCached={() => undefined} />
      <DegradedCard />
      <SampleBar />
    </View>
  );
}

// Open overlays (R04 review M1 / M2 / M5 / M6 / M7 / m8): one of sheet, tallSheet,
// dialog, drawer, actionSheet is open (fixture.overlay); toasts can be fired over it.
function Overlays() {
  const [open, setOpen] = useState(true);
  const overlay = String(fixture.overlay);
  const close = (event: string) => () => { log(event); setOpen(false); };
  return (
    <View style={{ padding: 16 }}>
      <ToastScreen />
      <BottomSheet visible={open && overlay === "sheet"} onClose={close("sheet-close")} accessibilityLabel="シート">
        <TextField label="メモ" value="" onChangeText={() => undefined} />
        <Button label="保存" onPress={() => log("save")} />
      </BottomSheet>
      <BottomSheet visible={open && overlay === "tallSheet"} onClose={close("sheet-close")} accessibilityLabel="長いシート">
        <TextField label="一番上のメモ" value="" onChangeText={() => undefined} />
        {Array.from({ length: 30 }, (_, index) => <ListRow key={index} title={`行 ${index + 1}`} />)}
      </BottomSheet>
      <ConfirmDialog visible={open && overlay === "dialog"} destructive title="このタスクを削除しますか？" message="元に戻せません。" confirmLabel="削除する" onConfirm={close("confirm")} onCancel={close("cancel")} />
      <FullDrawer visible={open && overlay === "drawer"} title="メニュー" onClose={close("drawer-close")}><Button label="設定" onPress={() => log("settings")} /></FullDrawer>
      <ActionSheet visible={open && overlay === "actionSheet"} title="参加を取り消しますか？" effects={[{ icon: "bell", text: "主催者に取り消しが通知されます" }]} options={[{ key: "withdraw", label: "参加を取り消す", destructive: true }, { key: "keep", label: "参加を続ける" }]} onSelect={(key) => { log(key); setOpen(false); }} onClose={close("sheet-dismiss")} />
    </View>
  );
}

const scenarios: Record<string, () => React.ReactElement> = { toast: () => <ToastScenario />, dialog: () => <DialogScenario />, imperative: () => <ImperativeScenario />, gallery: () => <Gallery />, overlays: () => <Overlays /> };
const App = scenarios[String(fixture.scenario)]!;
function Page({ children }: { children: React.ReactNode }) {
  const { colors } = useOrbitTheme();
  return <View style={{ flex: 1, minHeight: "100vh" as never, backgroundColor: colors.bg }}>{children}</View>;
}
createRoot(document.getElementById("root")!).render(
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Locale><ReducedMotionOverride.Provider value={fixture.reducedMotion === undefined ? null : Boolean(fixture.reducedMotion)}><ToastProvider hasTabBar={Boolean(fixture.hasTabBar)}><UiPortalHost><Page><App /></Page></UiPortalHost></ToastProvider></ReducedMotionOverride.Provider></Locale></SafeAreaProvider>,
);
