import { type Href, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, TextInput, View } from "react-native";
import { z } from "zod";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { OrbitApiClient } from "../../api/client";
import type { HomeWidgetKey, HomeWidgetSlot } from "../../api/contract/home-layout";
import { AppScreen } from "../../components/AppScreen";
import { isTabPageHref, openMainTab } from "../../components/shell-navigation";
import { shellGreeting, shellHeaderDate } from "../../components/shell-date";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { UiPressable } from "../../components/ui/Pressable";
import { UiText } from "../../components/ui/Text";
import { useToast } from "../../components/ui/Toast";
import { createThemedStyles } from "../../design/theme";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { homeAppTargetHref } from "./home-target";
import { HomeWidgetBody } from "./HomeWidgetCards";
import { HOME_WIDGETS, addWidget, dragTargetIndex, moveWidget, moveWidgetTo, removeWidget, resizeWidget } from "./home-widget-model";
import { useHomeLayout } from "./use-home-layout";
import { useHomeRead } from "./use-home-read";

const TITLE: Record<HomeWidgetKey, "home.widgetToday" | "home.widgetPending" | "home.widgetWeek" | "home.widgetPlan" | "home.widgetEvent" | "home.widgetEventPick" | "home.widgetNetwork" | "home.widgetSecretary" | "home.widgetMemo"> = {
  today: "home.widgetToday", pending: "home.widgetPending", week: "home.widgetWeek", planScore: "home.widgetPlan",
  nextEvent: "home.widgetEvent", eventPick: "home.widgetEventPick", network: "home.widgetNetwork",
  secretary: "home.widgetSecretary", memo: "home.widgetMemo", deadline: "home.widgetWeek",
};
const guideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hidden"), reason: z.string() }), z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("progress"), completed: z.number().int().min(0).max(3), confirmedContacts: z.number().int().nonnegative(),
    nextStep: z.enum(["contacts", "goal", "plan"]).nullable().optional(), steps: z.object({ contacts: z.boolean(), goal: z.boolean(), plan: z.boolean() }) }),
]);

export function HomeWidgetsScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const { t } = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([auth.actorId, server.baseUrl, auth.cookieHeader]) });
  const actorId = auth.actorId ?? "";
  if (!auth.ready || !auth.signedIn || !server.ready || !actorId) return <AppScreen inset="kit" title={t("home.title")}><UiText>{t("common.loadingLabel")}</UiText></AppScreen>;
  return <HomeWorkspace key={`${server.baseUrl}:${actorId}`} actorId={actorId} baseUrl={server.baseUrl} client={client} />;
}

function HomeWorkspace({ actorId, baseUrl, client }: { actorId: string; baseUrl: string; client: OrbitApiClient }) {
  const router = useRouter(); const auth = useOrbitAuthSession(); const { t, language } = useOrbitLocale(); const { timeZone } = useOrbitTimeZone(); const toast = useToast();
  const { styles } = useStyles();
  const onConflict = useCallback(() => toast.error(t("home.widgetConflict")), [t, toast]);
  const { layout, state, saving, pending, fetchedAt, reload, save } = useHomeLayout({ actorId, baseUrl, client, onConflict });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HomeWidgetSlot[] | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [library, setLibrary] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const badge = useRelationshipInboxBadgeCount(actorId);
  const guide = useHomeRead(client, "/api/home/guide-progress", guideSchema);
  const now = useMemo(() => new Date(), []);
  const date = shellHeaderDate(now, language, timeZone, t);
  const greeting = shellGreeting(now, timeZone, auth.user?.name, t);
  const items = editing ? draft ?? [...layout.app] : layout.app;
  const navigate = (target: string) => {
    const href = homeAppTargetHref(target);
    if (!href) return;
    if (isTabPageHref(href)) openMainTab(router, href); else router.push(href as Href);
  };
  const begin = () => { if (state === "error") return; setDraft([...layout.app]); setEditRevision(layout.revision); setEditing(true); };
  const finish = async () => {
    if (!draft || JSON.stringify(draft) === JSON.stringify(layout.app)) { setEditing(false); return; }
    const result = await save(draft, undefined, editRevision ?? undefined);
    if (result === "saved" || result === "queued") { setEditing(false); if (result === "queued") toast.info(t("home.widgetSavedOffline")); }
    else if (result === "conflict") { setEditing(false); setDraft(null); }
    else toast.error(t("home.widgetUnavailable"), { action: { label: t("home.readAgain"), onPress: () => void finish() } });
  };
  const remove = (key: HomeWidgetKey) => {
    const before = [...items]; setDraft(removeWidget(before, key));
    toast.info(t(TITLE[key]), { undo: () => setDraft(before) });
  };
  const dismissHint = async () => {
    setHintHidden(true);
    const result = await save(layout.app, new Date().toISOString());
    if (result === "error") { setHintHidden(false); toast.error(t("home.widgetUnavailable")); }
  };
  return <AppScreen inset="kit" title={date} header={<View style={styles.header}>
    <View style={styles.avatar}><UiText style={styles.avatarText}>{auth.user?.name?.slice(0, 1) || "O"}</UiText></View>
    <View style={styles.headerWords}><UiText style={styles.date}>{date}</UiText><UiText style={styles.greeting}>{greeting}</UiText></View>
    <IconButton icon="bell" accessibilityLabel={t("home.inbox")} dot={Boolean(badge)} onPress={() => router.push("/inbox" as Href)} />
    <Button label={editing ? t("home.widgetDone") : t("home.widgetEdit")} icon="grid" variant="surface" onPress={() => { if (editing) void finish(); else begin(); }} disabled={saving || state === "error"} />
  </View>}>
    {state === "error" ? <View><UiText style={styles.error}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={() => void reload()} variant="secondary" /></View> : null}
    {state === "loading" ? <UiText style={styles.hintText}>{t("common.loadingLabel")}</UiText> : null}
    {state !== "error" && state !== "loading" ? <>
      {guide.kind === "ready" && guide.data.kind === "progress" ? <Guide progress={guide.data} navigate={navigate} /> : null}
      {state === "stale" || pending ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")}{fetchedAt ? ` · ${new Date(fetchedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")}` : ""}</UiText> : null}
      {!editing && !layout.hintDismissedAt && !hintHidden ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetHint")}</UiText><UiPressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => void dismissHint()}><UiText style={styles.hintText}>×</UiText></UiPressable></View> : null}
      {editing ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetDragHint")}</UiText></View> : null}
      <View style={styles.grid}>{items.map((slot, index) => <DraggableWidget key={slot.key} widget={slot.key} index={index} count={items.length} editing={editing}
        small={slot.size === "s"} dropTarget={dropTarget === index} onTarget={setDropTarget} onDrop={(key, to) => setDraft(moveWidgetTo(items, key, to))}>
        <UiPressable onLongPress={begin} delayLongPress={400} accessibilityLabel={t(TITLE[slot.key])} style={styles.widgetPress}>
          <Card style={styles.widget}><View style={styles.widgetHead}><UiText style={styles.widgetTitle}>{iconFor(slot.key)}  {t(TITLE[slot.key])}</UiText>
            {editing ? <View style={styles.controls}>
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetMoveUp")}`} text="↑" disabled={index === 0} press={() => setDraft(moveWidget(items, slot.key, -1))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetMoveDown")}`} text="↓" disabled={index === items.length - 1} press={() => setDraft(moveWidget(items, slot.key, 1))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetSize")}`} text={slot.size === "s" ? t("home.widgetSmall") : t("home.widgetMedium")} press={() => setDraft(resizeWidget(items, slot.key))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetRemove")}`} text="−" press={() => remove(slot.key)} />
            </View> : null}</View>
            <HomeWidgetBody widget={slot.key} size={slot.size} client={client} actorId={actorId} navigate={navigate} />
          </Card>
        </UiPressable>
      </DraggableWidget>)}</View>
      {editing ? <Button label={t("home.widgetAdd")} icon="plus" onPress={() => setLibrary(true)} variant="surface" /> : null}
    </> : null}
    <BottomSheet visible={library} onClose={() => setLibrary(false)} accessibilityLabel={t("home.widgetAdd")}>
      <WidgetLibrary slots={items} onAdd={slot => { setDraft(addWidget(items, slot)); setLibrary(false); }} />
    </BottomSheet>
  </AppScreen>;
}

function iconFor(key: HomeWidgetKey): string {
  return { today: "✅", planScore: "💰", nextEvent: "🎟️", network: "👥", secretary: "🗂️", pending: "◉", week: "🗓️", eventPick: "🎫", memo: "📝", deadline: "" }[key];
}

function Control({ label, text, press, disabled = false }: { label: string; text: string; press: () => void; disabled?: boolean }) {
  const { styles } = useStyles(); return <UiPressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={press} style={[styles.control, disabled && styles.disabled]}><UiText style={styles.controlText}>{text}</UiText></UiPressable>;
}

function DraggableWidget({ widget, index, count, editing, small, dropTarget, onTarget, onDrop, children }: {
  widget: HomeWidgetKey; index: number; count: number; editing: boolean; small: boolean; dropTarget: boolean;
  onTarget: (value: number | null) => void; onDrop: (key: HomeWidgetKey, to: number) => void; children: ReactNode;
}) {
  const { styles } = useStyles();
  const pan = useRef(new Animated.ValueXY()).current;
  const height = useRef(180);
  const target = useRef(index);
  const props = useRef({ widget, index, count, editing, onTarget, onDrop });
  props.current = { widget, index, count, editing, onTarget, onDrop };
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => props.current.editing && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
    onPanResponderGrant: () => { target.current = props.current.index; },
    onPanResponderMove: (_, gesture) => {
      pan.setValue({ x: gesture.dx, y: gesture.dy });
      const next = dragTargetIndex(props.current.index, props.current.count, height.current, gesture.dx, gesture.dy);
      if (next !== target.current) { target.current = next; props.current.onTarget(next === props.current.index ? null : next); }
    },
    onPanResponderRelease: () => {
      const { widget: key, index: from, onDrop: drop, onTarget: mark } = props.current;
      if (target.current !== from) drop(key, target.current);
      mark(null); Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { props.current.onTarget(null); Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(); },
  }), [pan]);
  return <Animated.View {...responder.panHandlers} onLayout={event => { height.current = event.nativeEvent.layout.height + 12; }}
    style={[styles.widgetWrap, small && styles.widgetSmall, dropTarget && styles.dropTarget, { transform: pan.getTranslateTransform(), zIndex: dropTarget ? 2 : 1 }]}>{children}</Animated.View>;
}

function Guide({ progress, navigate }: { progress: { completed: number; steps: { contacts: boolean; goal: boolean; plan: boolean } }; navigate: (href: string) => void }) {
  const { styles } = useStyles(); const { t } = useOrbitLocale();
  const steps = [
    { key: "contacts", label: t("home.widgetGuideContacts"), href: "/contacts" },
    { key: "goal", label: t("home.widgetGuideGoal"), href: "/task?seg=plan" },
    { key: "plan", label: t("home.widgetGuidePlan"), href: "/task?seg=plan" },
  ] as const;
  return <Card><View style={styles.guideHead}><UiText style={styles.widgetTitle}>{t("home.widgetGuide")}</UiText><UiText>{progress.completed}/3</UiText></View>{steps.map(step => <UiPressable key={step.key} accessibilityRole="link" onPress={() => navigate(step.href)} style={styles.guideStep}><UiText style={styles.hintText}>{progress.steps[step.key] ? "✓" : "○"} {step.label} →</UiText></UiPressable>)}</Card>;
}

function WidgetLibrary({ slots, onAdd }: { slots: readonly HomeWidgetSlot[]; onAdd: (slot: HomeWidgetSlot) => void }) {
  const { t } = useOrbitLocale(); const { colors, styles } = useStyles();
  const [category, setCategory] = useState("all"); const [query, setQuery] = useState("");
  const categories = ["all", "today", "network", "event", "plan", "secretary"] as const;
  const categoryLabels = ["home.widgetAll", "home.today", "home.widgetNetwork", "home.events", "home.widgetPlan", "home.widgetSecretary"] as const;
  const available = HOME_WIDGETS.filter(item => !slots.some(slot => slot.key === item.key) && (category === "all" || item.category === category)
    && t(TITLE[item.key]).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <View style={styles.library}><UiText style={styles.date}>{t("home.widgetAdd")}</UiText><TextInput accessibilityLabel={t("home.widgetSearch")} placeholder={t("home.widgetSearch")} placeholderTextColor={colors.ink3Text} value={query} onChangeText={setQuery} style={styles.search} />
    <View style={styles.categories}>{categories.map((item, index) => <UiPressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryOn]}><UiText style={styles.hintText}>{t(categoryLabels[index]!)}</UiText></UiPressable>)}</View>
    {available.map(item => <View key={item.key} style={styles.libraryRow}><UiText style={styles.libraryName}>{t(TITLE[item.key])}</UiText><Control label={`${t(TITLE[item.key])} ${t("home.widgetSmall")}`} text={`+ ${t("home.widgetSmall")}`} disabled={slots.length >= 10} press={() => onAdd({ key: item.key, size: "s" })} /><Control label={`${t(TITLE[item.key])} ${t("home.widgetMedium")}`} text={`+ ${t("home.widgetMedium")}`} disabled={slots.length >= 10} press={() => onAdd({ key: item.key, size: "m" })} /></View>)}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 11 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, avatarText: { color: colors.accentText, fontSize: 15, fontWeight: "700" }, headerWords: { flex: 1, minWidth: 0 }, date: { color: colors.ink, fontSize: 18, fontWeight: "700" }, greeting: { color: colors.ink3Text, fontSize: 10 },
  error: { color: colors.coralText, fontSize: 12 }, stale: { color: colors.coralText, fontSize: 11 },
  hint: { borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, hintText: { color: colors.ink3Text, fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }, widgetWrap: { width: "100%" }, widgetSmall: { width: "48%" }, widgetPress: { flex: 1 }, widget: { flex: 1, minHeight: 155 }, widgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 3, marginBottom: 12 }, widgetTitle: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  dropTarget: { borderColor: colors.accentText, borderWidth: 1, borderStyle: "dashed", borderRadius: 24 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 3, justifyContent: "flex-end", flex: 1 }, control: { paddingHorizontal: 5, minHeight: 29, minWidth: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, controlText: { color: colors.accentText, fontSize: 11 }, disabled: { opacity: .35 },
  guideHead: { flexDirection: "row", justifyContent: "space-between" }, guideStep: { paddingVertical: 8 },
  library: { paddingHorizontal: 20, paddingBottom: 30, gap: 12 }, search: { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 9, minHeight: 40, paddingHorizontal: 12 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 5 }, category: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 }, categoryOn: { backgroundColor: colors.surface2 }, libraryRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 }, libraryName: { flex: 1, color: colors.ink, fontSize: 12 },
}));
