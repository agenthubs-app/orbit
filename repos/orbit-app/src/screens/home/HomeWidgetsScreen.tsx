import { type Href, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
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
import { Icon } from "../../components/ui/Icon";
import { IconButton } from "../../components/ui/IconButton";
import { useReducedMotion } from "../../components/ui/motion";
import { Segmented } from "../../components/ui/Segmented";
import { UiPressable } from "../../components/ui/Pressable";
import { UiPortal } from "../../components/ui/Portal";
import { UiText } from "../../components/ui/Text";
import { useToast } from "../../components/ui/Toast";
import { useBackHandler } from "../../components/ui/useBackHandler";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { floatShadow, radius } from "../../design/tokens";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { homeAppTargetHref } from "./home-target";
import { HomeWidgetBody } from "./HomeWidgetCards";
import { HOME_COPY_FRESH_MS, HOME_WIDGETS, addWidget, dragTargetIndex, moveWidget, moveWidgetTo, removeWidget, resizeWidget } from "./home-widget-model";
import { useHomeLayout } from "./use-home-layout";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useHomeWidgetSnapshot } from "./use-home-widget-snapshot";

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
  const router = useRouter(); const auth = useOrbitAuthSession(); const { t, language } = useOrbitLocale(); const { timeZone, canSave: timeZoneConfirmed } = useOrbitTimeZone(); const toast = useToast();
  const { colors, styles } = useStyles(); const insets = useSafeAreaInsets();
  const onConflict = useCallback(() => toast.error(t("home.widgetConflict")), [t, toast]);
  const { layout, state, saving, pending, fetchedAt, reload, save } = useHomeLayout({ actorId, baseUrl, client, onConflict });
  const [widgetRefreshRevision, setWidgetRefreshRevision] = useState(0);
  useHomeWidgetSnapshot({ actorId, baseUrl, client, timeZone, layoutRevision: layout.revision,
    layoutReady: state === "ready" && !pending, offline: auth.offline || auth.deletionPending || !timeZoneConfirmed, refreshRevision: widgetRefreshRevision });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HomeWidgetSlot[] | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [library, setLibrary] = useState(false);
  const [menu, setMenu] = useState<HomeWidgetKey | null>(null);
  const [hintHidden, setHintHidden] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const badge = useRelationshipInboxBadgeCount(actorId);
  // LF1: the guide's last answer is a page copy (no domain derives it on the device); re-read after its fresh window or a write.
  const guideCopy = usePageCopyResource<unknown>("/api/home/guide-progress", () => false, { copy: { id: "home-guide-progress" },
    freshForMs: HOME_COPY_FRESH_MS, accept: value => guideSchema.safeParse(value).success });
  const guideParsed = guideCopy.kind === "success" ? guideSchema.safeParse(guideCopy.data) : null;
  const guideProgress = guideParsed?.success && guideParsed.data.kind === "progress" ? guideParsed.data : null;
  const now = useMemo(() => new Date(), []);
  const date = shellHeaderDate(now, language, timeZone, t);
  const greeting = shellGreeting(now, timeZone, auth.user?.name, t);
  const items = editing ? draft ?? [...layout.app] : layout.app;
  const menuSlot = menu ? layout.app.find(slot => slot.key === menu) : null;
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
    toast.info(t("home.widgetRemovedToast", { name: t(TITLE[key]) }), { undo: () => setDraft(before) });
  };
  const contextSize = async (key: HomeWidgetKey, size: "s" | "m") => {
    setMenu(null);
    const next = resizeWidget(layout.app, key, size);
    if (JSON.stringify(next) === JSON.stringify(layout.app)) return;
    const result = await save(next);
    if (result === "error") toast.error(t("home.widgetUnavailable"));
  };
  const contextRemove = async (key: HomeWidgetKey) => {
    setMenu(null);
    const before = [...layout.app];
    const result = await save(removeWidget(before, key));
    if (result === "saved" || result === "queued") toast.info(t(TITLE[key]), { undo: () => { void save(before); } });
    else if (result === "error") toast.error(t("home.widgetUnavailable"));
  };
  const dismissHint = async () => {
    setHintHidden(true);
    const result = await save(layout.app, new Date().toISOString());
    if (result === "error") { setHintHidden(false); toast.error(t("home.widgetUnavailable")); }
  };
  return <AppScreen inset="kit" title={date} scrollEnabled={!dragging} header={<View style={styles.header}>
    <View style={styles.avatar}><UiText style={styles.avatarText}>{auth.user?.name?.slice(0, 1) || "O"}</UiText></View>
    <View style={styles.headerWords}><UiText style={styles.date}>{date}</UiText><UiText style={styles.greeting}>{greeting}</UiText></View>
    {/* UX-2: iOS home-screen editing — "+" adds a widget, "完成" ends the jiggle mode. */}
    {editing ? <View style={styles.editBarSpace} /> : <>
      <IconButton icon="bell" accessibilityLabel={t("home.inbox")} dot={Boolean(badge)} onPress={() => router.push("/inbox" as Href)} />
      <Button label={t("home.widgetEdit")} icon="grid" variant="surface" onPress={begin} disabled={saving || state === "error"} />
    </>}
  </View>}>
    {state === "error" ? <View><UiText style={styles.error}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={() => void reload()} variant="secondary" /></View> : null}
    {state === "loading" ? <UiText style={styles.hintText}>{t("common.loadingLabel")}</UiText> : null}
    {state !== "error" && state !== "loading" ? <>
      {state === "stale" || pending ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")}{fetchedAt ? ` · ${new Date(fetchedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</UiText> : null}
      {!editing && !layout.hintDismissedAt && !hintHidden ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetHint")}</UiText><UiPressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => void dismissHint()}><UiText style={styles.hintText}>×</UiText></UiPressable></View> : null}
      {editing ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetDragHint")}</UiText></View> : null}
      <View style={styles.grid}>{items.map((slot, index) => <DraggableWidget key={slot.key} widget={slot.key} index={index} count={items.length} editing={editing}
        small={slot.size === "s"} dropTarget={dropTarget === index} onTarget={setDropTarget} onLift={setDragging} onDrop={(key, to) => setDraft(moveWidgetTo(items, key, to))}>
        <UiPressable accessible={false} pointerEvents={editing ? "none" : "auto"} onLongPress={() => { if (!editing) setMenu(slot.key); }} delayLongPress={400} style={styles.widgetPress}>
          <Card style={styles.widget}><View style={styles.widgetHead}><UiText style={styles.widgetTitle}>{iconFor(slot.key)}  {t(TITLE[slot.key])}</UiText></View>
            <HomeWidgetBody widget={slot.key} size={slot.size} client={client} actorId={actorId} navigate={navigate} guide={guideProgress}
              onDataSettled={() => setWidgetRefreshRevision(value => value + 1)} />
          </Card>
        </UiPressable>
        {editing ? <RemoveBadge label={`${t(TITLE[slot.key])} ${t("home.widgetRemove")}`} onPress={() => remove(slot.key)} /> : null}
        {/* Screen readers cannot drag: reordering stays available as actions on the widget. */}
        {editing ? <View accessible pointerEvents="none" accessibilityLabel={t(TITLE[slot.key])} style={styles.a11yReorder}
          accessibilityActions={[{ name: "moveUp", label: t("home.widgetMoveUp") }, { name: "moveDown", label: t("home.widgetMoveDown") }, { name: "resize", label: t("home.widgetSize") }]}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === "moveUp" && index > 0) setDraft(moveWidget(items, slot.key, -1));
            else if (event.nativeEvent.actionName === "moveDown" && index < items.length - 1) setDraft(moveWidget(items, slot.key, 1));
            else if (event.nativeEvent.actionName === "resize") setDraft(resizeWidget(items, slot.key));
          }} /> : null}
      </DraggableWidget>)}</View>
    </> : null}
    {/* Fixed like iOS's Done: the bar stays at the top while the page scrolls under it. */}
    {editing && !library ? <UiPortal><View style={[styles.editBar, floatShadow(colors), { top: insets.top + 6 }]}>
      <IconButton icon="plus" accessibilityLabel={t("home.widgetAdd")} onPress={() => setLibrary(true)} />
      <Button label={t("home.widgetDone")} variant="primary" size="sm" onPress={() => void finish()} disabled={saving} />
    </View></UiPortal> : null}
    <BottomSheet visible={library} onClose={() => setLibrary(false)} accessibilityLabel={t("home.widgetAdd")}>
      <WidgetLibrary slots={items} onClose={() => setLibrary(false)} onAdd={slot => { setDraft(addWidget(items, slot)); setLibrary(false); }} />
    </BottomSheet>
    {menuSlot && !editing ? <HomeWidgetContextMenu slot={menuSlot} client={client} actorId={actorId} navigate={navigate}
      guide={guideProgress} onClose={() => setMenu(null)}
      onEdit={() => { setMenu(null); begin(); }} onSize={size => void contextSize(menuSlot.key, size)} onRemove={() => void contextRemove(menuSlot.key)} /> : null}
  </AppScreen>;
}

function HomeWidgetContextMenu({ slot, client, actorId, navigate, guide, onClose, onEdit, onSize, onRemove }: {
  slot: HomeWidgetSlot; client: OrbitApiClient; actorId: string; navigate: (target: string) => void;
  guide: Extract<z.infer<typeof guideSchema>, { kind: "progress" }> | null;
  onClose: () => void; onEdit: () => void; onSize: (size: "s" | "m") => void; onRemove: () => void;
}) {
  const { t } = useOrbitLocale(); const { colors, styles } = useStyles(); const { scheme } = useOrbitTheme();
  const { height } = useWindowDimensions();
  const menuBottom = Math.max(96, height * .145);
  useBackHandler(true, onClose);
  return <UiPortal><View accessibilityViewIsModal onAccessibilityEscape={onClose} style={StyleSheet.absoluteFill}>
    <BlurView intensity={25} tint={scheme === "dark" ? "dark" : "light"} style={[StyleSheet.absoluteFill, styles.contextBackdrop]} />
    <UiPressable accessible={false} onPress={onClose} style={[StyleSheet.absoluteFill, styles.contextBackdrop, { backgroundColor: colors.scrim }]} />
    <UiPressable accessible={false} onPress={onClose} style={styles.contextTabDismiss} />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.contextPreview, { bottom: menuBottom + 136 }]}><Card style={styles.contextPreviewCard}>
      <UiText style={styles.widgetTitle}>{iconFor(slot.key)}  {t(TITLE[slot.key])}</UiText>
      <HomeWidgetBody widget={slot.key} size={slot.size} client={client} actorId={actorId} navigate={navigate} guide={guide} />
    </Card></View>
    <View style={[styles.contextMenu, floatShadow(colors), { bottom: menuBottom }]}>
      <UiPressable accessibilityRole="button" onPress={onEdit} style={styles.contextRow}><UiText style={styles.contextText}>✎  {t("home.widgetEditHome")}</UiText></UiPressable>
      <View style={styles.contextLine} />
      <View style={styles.contextRow}><UiText style={[styles.contextText, styles.contextGrow]}>▦  {t("home.widgetSizeShort")}</UiText>
        {(["s", "m"] as const).map(size => <UiPressable key={size} accessibilityRole="radio" accessibilityState={{ checked: slot.size === size }}
          accessibilityLabel={`${t(TITLE[slot.key])} ${t(size === "s" ? "home.widgetSmall" : "home.widgetMedium")}`} hitSlop={9} onPress={() => onSize(size)}
          style={[styles.contextSize, slot.size === size && styles.contextSizeOn]}><UiText style={[styles.contextSizeText, slot.size === size && styles.contextSizeTextOn]}>{t(size === "s" ? "home.widgetSmall" : "home.widgetMedium")}</UiText></UiPressable>)}
      </View>
      <View style={styles.contextLine} />
      <UiPressable accessibilityRole="button" onPress={onRemove} style={styles.contextRow}><UiText style={styles.contextRemove}>×  {t("home.widgetRemoveFromHome")}</UiText></UiPressable>
    </View>
  </View></UiPortal>;
}

function iconFor(key: HomeWidgetKey): string {
  return { today: "✅", planScore: "💰", nextEvent: "🎟️", network: "👥", secretary: "🗂️", pending: "◉", week: "🗓️", eventPick: "🎫", memo: "📝", deadline: "" }[key];
}

/** UX-2: the iOS edit-mode delete badge, on the widget's top-right corner. */
function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, styles } = useStyles();
  return <UiPressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={styles.removeBadge}>
    <Icon name="x" size={13} color={colors.surface} strokeWidth={2.6} />
  </UiPressable>;
}

function DraggableWidget({ widget, index, count, editing, small, dropTarget, onTarget, onLift, onDrop, children }: {
  widget: HomeWidgetKey; index: number; count: number; editing: boolean; small: boolean; dropTarget: boolean;
  onTarget: (value: number | null) => void; onLift: (lifted: boolean) => void; onDrop: (key: HomeWidgetKey, to: number) => void; children: ReactNode;
}) {
  const { styles } = useStyles();
  const pan = useRef(new Animated.ValueXY()).current;
  // UX-2: in edit mode every widget jiggles like an iOS home screen icon (alternating phase per
  // position); Reduce Motion keeps them still.
  const reduced = useReducedMotion();
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!editing || reduced) { wiggle.stopAnimation(); wiggle.setValue(0); return; }
    const swing = (to: number) => Animated.timing(wiggle, { toValue: to, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const direction = index % 2 === 0 ? 1 : -1;
    const loop = Animated.loop(Animated.sequence([swing(direction), swing(-direction)]));
    loop.start();
    return () => { loop.stop(); wiggle.setValue(0); };
  }, [editing, reduced, index, wiggle]);
  const rotate = wiggle.interpolate({ inputRange: [-1, 1], outputRange: [small ? "-1.6deg" : "-0.8deg", small ? "1.6deg" : "0.8deg"] });
  const height = useRef(180);
  const target = useRef(index);
  const props = useRef({ widget, index, count, editing, onTarget, onLift, onDrop });
  props.current = { widget, index, count, editing, onTarget, onLift, onDrop };
  // UX-2: like iOS, hold to lift a widget (it grows a little and the page stops scrolling), then
  // drag it; a quick swipe before it lifts still scrolls the page.
  const lift = useRef(new Animated.Value(1)).current;
  const lifted = useRef(false);
  const [isLifted, setIsLifted] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  const settle = (drop: boolean) => {
    clearHold();
    if (!lifted.current) return;
    const { widget: key, index: from, onDrop: dropAt, onTarget: mark, onLift: setLifted } = props.current;
    if (drop && target.current !== from) dropAt(key, target.current);
    lifted.current = false; setIsLifted(false); mark(null); setLifted(false);
    Animated.parallel([
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => props.current.editing,
    onMoveShouldSetPanResponder: () => props.current.editing && lifted.current,
    onPanResponderTerminationRequest: () => !lifted.current,
    onPanResponderGrant: () => {
      target.current = props.current.index;
      clearHold();
      holdTimer.current = setTimeout(() => {
        lifted.current = true; setIsLifted(true); props.current.onLift(true);
        Animated.spring(lift, { toValue: 1.04, useNativeDriver: true }).start();
      }, 220);
    },
    onPanResponderMove: (_, gesture) => {
      if (!lifted.current) { if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 10) clearHold(); return; }
      pan.setValue({ x: gesture.dx, y: gesture.dy });
      const next = dragTargetIndex(props.current.index, props.current.count, height.current, gesture.dx, gesture.dy);
      if (next !== target.current) { target.current = next; props.current.onTarget(next === props.current.index ? null : next); }
    },
    onPanResponderRelease: () => settle(true),
    onPanResponderTerminate: () => settle(false),
  }), [pan, lift]);
  return <Animated.View {...responder.panHandlers} onLayout={event => { height.current = event.nativeEvent.layout.height + 12; }}
    style={[styles.widgetWrap, small && styles.widgetSmall, dropTarget && styles.dropTarget, { transform: [...pan.getTranslateTransform(), { rotate }, { scale: lift }], zIndex: isLifted ? 3 : dropTarget ? 2 : 1 }]}>{children}</Animated.View>;
}

const DESCRIPTION: Record<HomeWidgetKey, "home.widgetTodayDescription" | "home.widgetPendingDescription" | "home.widgetWeekDescription" | "home.widgetPlanDescription" | "home.widgetEventDescription" | "home.widgetEventPickDescription" | "home.widgetNetworkDescription" | "home.widgetSecretaryDescription" | "home.widgetMemoDescription"> = {
  today: "home.widgetTodayDescription", pending: "home.widgetPendingDescription", week: "home.widgetWeekDescription", planScore: "home.widgetPlanDescription",
  nextEvent: "home.widgetEventDescription", eventPick: "home.widgetEventPickDescription", network: "home.widgetNetworkDescription",
  secretary: "home.widgetSecretaryDescription", memo: "home.widgetMemoDescription", deadline: "home.widgetWeekDescription",
};

/** UX-2: the widget gallery as one readable list — icon, name, what it shows, size, add. */
function WidgetLibrary({ slots, onAdd, onClose }: { slots: readonly HomeWidgetSlot[]; onAdd: (slot: HomeWidgetSlot) => void; onClose: () => void }) {
  const { t } = useOrbitLocale(); const { colors, styles } = useStyles();
  const [sizes, setSizes] = useState<Partial<Record<HomeWidgetKey, "s" | "m">>>({});
  const full = slots.length >= 10;
  const available = HOME_WIDGETS.filter(item => !slots.some(slot => slot.key === item.key));
  return <View style={styles.library}>
    <View style={styles.libraryHeader}>
      <UiText accessibilityRole="header" style={styles.libraryTitle}>{t("home.widgetAdd")}</UiText>
      <IconButton icon="x" size={34} accessibilityLabel={t("common.close")} onPress={onClose} />
    </View>
    {available.length === 0 ? <UiText style={styles.libraryDescription}>{t("home.widgetLibraryAllAdded")}</UiText> : null}
    <View style={styles.libraryList}>{available.map((item, index) => {
      const selected = sizes[item.key] ?? (item.key === "memo" ? "s" : "m");
      const name = t(TITLE[item.key]);
      return <View key={item.key} style={[styles.libraryRow, index > 0 && styles.libraryRowLine]}>
        <View style={styles.libraryIconWrap}><UiText style={styles.libraryIcon}>{iconFor(item.key)}</UiText></View>
        <View style={styles.libraryWords}>
          <UiText numberOfLines={1} style={styles.libraryName}>{name}</UiText>
          <UiText numberOfLines={2} style={styles.libraryDescription}>{t(DESCRIPTION[item.key])}</UiText>
        </View>
        <Segmented inline segments={[{ key: "s", label: t("home.widgetSmallShort") }, { key: "m", label: t("home.widgetMediumShort") }]} value={selected}
          onChange={size => setSizes(current => ({ ...current, [item.key]: size }))} accessibilityLabel={`${name} ${t("home.widgetSize")}`} />
        <UiPressable accessibilityRole="button" accessibilityLabel={`${name} ${t("home.widgetAddOne")}`} disabled={full} hitSlop={6}
          onPress={() => onAdd({ key: item.key, size: selected })} style={[styles.libraryAdd, full && styles.disabled]}>
          <Icon name="plus" size={16} color={colors.surface} strokeWidth={2.4} />
        </UiPressable>
      </View>;
    })}</View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 11 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, avatarText: { color: colors.accentText, fontSize: 17, fontWeight: "700" }, headerWords: { flex: 1, minWidth: 0 }, date: { color: colors.ink, fontSize: 20, fontWeight: "700" }, greeting: { color: colors.ink3Text, fontSize: 12 },
  error: { color: colors.coralText, fontSize: 14 }, stale: { color: colors.coralText, fontSize: 13 },
  hint: { borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, hintText: { color: colors.ink3Text, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }, widgetWrap: { width: "100%" }, widgetSmall: { width: "48%" }, widgetPress: { flex: 1 }, widget: { flex: 1, minHeight: 155 }, widgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 3, marginBottom: 12 }, widgetTitle: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
  dropTarget: { borderColor: colors.accentText, borderWidth: 1, borderStyle: "dashed", borderRadius: 24 },
  widgetHeadEditing: { flexDirection: "column", alignItems: "stretch" },
  disabled: { opacity: 0.4 },
  editBarSpace: { width: 120, height: 44 }, editBar: { position: "absolute", right: 12, flexDirection: "row", alignItems: "center", gap: 6, padding: 4, borderRadius: 26, backgroundColor: colors.surface },
  removeBadge: { position: "absolute", top: -9, right: -9, zIndex: 3, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.bg },
  a11yReorder: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  library: { paddingBottom: 24, gap: 8 }, libraryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  libraryTitle: { color: colors.ink, fontSize: 22, fontWeight: "700" }, libraryList: { paddingHorizontal: 2 },
  libraryRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingVertical: 12 }, libraryRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  libraryIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  libraryIcon: { fontSize: 22 }, libraryWords: { flex: 1, gap: 2 }, libraryName: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  libraryDescription: { color: colors.ink3Text, fontSize: 14, lineHeight: 19 },
  libraryAdd: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
  contextPreview: { position: "absolute", right: 18, width: 178 }, contextPreviewCard: { minHeight: 184, gap: 8 },
  contextBackdrop: { bottom: 88 }, contextTabDismiss: { position: "absolute", left: 0, right: 0, bottom: 0, height: 88 },
  contextMenu: { position: "absolute", right: 18, width: 216, borderRadius: radius.menu, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 5 },
  contextRow: { minHeight: 39, flexDirection: "row", alignItems: "center", gap: 5 }, contextText: { color: colors.ink, fontSize: 15, fontWeight: "600" }, contextGrow: { flex: 1 },
  contextLine: { height: 1, backgroundColor: colors.line }, contextSize: { width: 23, height: 23, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, contextSizeOn: { backgroundColor: colors.ink },
  contextSizeText: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" }, contextSizeTextOn: { color: colors.surface }, contextRemove: { color: colors.coralText, fontSize: 15, fontWeight: "600" },
}));
