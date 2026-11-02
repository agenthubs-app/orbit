import { type Href, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
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
import { durations, useReducedMotion } from "../../components/ui/motion";
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
import { HOME_COPY_FRESH_MS, HOME_WIDGETS, addWidget, homeDropPlan, moveWidget, moveWidgetTo, removeWidget, resizeWidget, type WidgetBox } from "./home-widget-model";
import { useHomeLayout } from "./use-home-layout";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useHomeWidgetSnapshot } from "./use-home-widget-snapshot";
import { useStandardCopy } from "../../i18n/standard-copy";
import { accountProfilePath } from "../me/account-api";
import { accountScreenResponseSchema } from "../me/account-response";

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
  const router = useRouter(); const auth = useOrbitAuthSession(); const { t, language } = useOrbitLocale(); const { timeZone, canSave: timeZoneConfirmed } = useOrbitTimeZone(); const toast = useToast(); const copy = useStandardCopy();
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
  const [dragging, setDragging] = useState(false);
  const badge = useRelationshipInboxBadgeCount(actorId);
  // LF1: the guide's last answer is a page copy (no domain derives it on the device); re-read after its fresh window or a write.
  const guideCopy = usePageCopyResource<unknown>("/api/home/guide-progress", () => false, { copy: { id: "home-guide-progress" },
    freshForMs: HOME_COPY_FRESH_MS, accept: value => guideSchema.safeParse(value).success });
  const guideParsed = guideCopy.kind === "success" ? guideSchema.safeParse(guideCopy.data) : null;
  const guideProgress = guideParsed?.success && guideParsed.data.kind === "progress" ? guideParsed.data : null;
  const now = useMemo(() => new Date(), []);
  const date = shellHeaderDate(now, language, timeZone, t);
  // UX: greet with the name on the profile card (我的), the sign-in account name until that copy is read.
  const profileCopy = usePageCopyResource<unknown>(accountProfilePath(undefined, false), () => false, { copy: { id: "self-profile" },
    scopeKey: JSON.stringify([actorId, auth.cookieHeader, baseUrl]), freshForMs: HOME_COPY_FRESH_MS, accept: value => accountScreenResponseSchema.safeParse(value).success });
  const profileParsed = profileCopy.kind === "success" || profileCopy.kind === "empty" ? accountScreenResponseSchema.safeParse(profileCopy.data) : null;
  const displayName = (profileParsed?.success ? profileParsed.data.profile?.displayName?.trim() : "") || auth.user?.name?.trim() || "";
  const greeting = shellGreeting(now, timeZone, displayName, t);
  const items = editing ? draft ?? [...layout.app] : layout.app;
  const menuSlot = menu ? layout.app.find(slot => slot.key === menu) : null;
  const navigate = (target: string) => {
    const href = homeAppTargetHref(target);
    if (!href) return;
    if (isTabPageHref(href)) openMainTab(router, href); else router.push(href as Href);
  };
  const begin = () => { if (state === "error") return; setDraft([...layout.app]); setEditRevision(layout.revision); setEditing(true); };
  const drag = useWidgetDrag(items, editing, begin, {
    onDrop: (key, to) => setDraft(current => current ? moveWidgetTo(current, key, to) : current),
    // Held and let go without moving, from the normal home screen: like iOS, that is the widget's menu.
    onHoldRelease: key => { setEditing(false); setDraft(null); setMenu(key); },
    onDragging: setDragging,
  });
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
    {/* UX: the avatar opens 我的 (profile and settings), as on the old dashboard. */}
    <UiPressable accessibilityRole="button" accessibilityLabel={copy.nav.me} hitSlop={2} onPress={() => router.push("/profile" as Href)} style={styles.avatar}><UiText style={styles.avatarText}>{Array.from(displayName)[0]?.toUpperCase() || "O"}</UiText></UiPressable>
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
      <View style={styles.grid} onLayout={event => drag.measureGrid(event.nativeEvent.layout.width)}>{items.map((slot, index) => <DraggableWidget key={slot.key} widget={slot.key} index={index} editing={editing}
        small={slot.size === "s"} enabled={!saving} drag={drag}>
        <View pointerEvents={editing ? "none" : "auto"} style={styles.widgetPress}>
          <Card style={styles.widget}><View style={styles.widgetHead}><UiText style={styles.widgetTitle}>{iconFor(slot.key)}  {t(TITLE[slot.key])}</UiText></View>
            <HomeWidgetBody widget={slot.key} size={slot.size} client={client} actorId={actorId} navigate={navigate} guide={guideProgress}
              onDataSettled={() => setWidgetRefreshRevision(value => value + 1)} />
          </Card>
        </View>
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

type WidgetDrag = ReturnType<typeof useWidgetDrag>;
type DragState = { key: HomeWidgetKey | null; x: number; y: number; to: number; moved: boolean };

/**
 * Sprint 0147: iOS-style widget dragging. Holding a widget lifts it (from the normal home screen this
 * also starts edit mode); it then follows the finger on the UI thread, the others slide aside to show
 * where it would land (computed from every widget's measured box), and letting go commits the order.
 */
function useWidgetDrag(items: readonly HomeWidgetSlot[], editing: boolean, begin: () => void, handlers: {
  onDrop: (key: HomeWidgetKey, to: number) => void; onHoldRelease: (key: HomeWidgetKey) => void; onDragging: (dragging: boolean) => void;
}) {
  const state = useSharedValue<DragState>({ key: null, x: 0, y: 0, to: -1, moved: false });
  const shift = useSharedValue<{ x: number; y: number }[]>([]);
  const boxes = useSharedValue<WidgetBox[]>([]);
  const gridWidth = useSharedValue(0);
  const measured = useRef<Partial<Record<HomeWidgetKey, WidgetBox>>>({});
  const live = useRef({ items, editing, begin, handlers });
  live.current = { items, editing, begin, handlers };
  const fromHome = useRef(false);
  const resetAfterLayout = useRef(false);
  const syncBoxes = useCallback(() => { boxes.value = live.current.items.map(slot => measured.current[slot.key] ?? { x: 0, y: 0, width: 0, height: 0 }); }, [boxes]);
  const reset = useCallback(() => { shift.value = []; state.value = { key: null, x: 0, y: 0, to: -1, moved: false }; }, [shift, state]);
  // The new order and the cleared offsets land together, so the widgets do not jump for a frame.
  useLayoutEffect(() => { syncBoxes(); if (resetAfterLayout.current) { resetAfterLayout.current = false; reset(); } }, [items, syncBoxes, reset]);
  const lift = useCallback((_key: HomeWidgetKey) => {
    fromHome.current = !live.current.editing;
    if (fromHome.current) live.current.begin();
    live.current.handlers.onDragging(true);
  }, []);
  const release = useCallback((key: HomeWidgetKey, to: number, moved: boolean, success: boolean) => {
    const { items: current, handlers: on } = live.current;
    on.onDragging(false);
    const from = current.findIndex(slot => slot.key === key);
    if (success && moved && to >= 0 && to !== from) { resetAfterLayout.current = true; on.onDrop(key, to); }
    else { reset(); if (success && !moved && fromHome.current) on.onHoldRelease(key); }
    fromHome.current = false;
  }, [reset]);
  return {
    state, shift, boxes, gridWidth, lift, release,
    measureGrid: (width: number) => { gridWidth.value = width; },
    measure: (key: HomeWidgetKey, box: WidgetBox) => { measured.current[key] = box; syncBoxes(); },
  };
}

function DraggableWidget({ widget, index, editing, small, enabled, drag, children }: {
  widget: HomeWidgetKey; index: number; editing: boolean; small: boolean; enabled: boolean; drag: WidgetDrag; children: ReactNode;
}) {
  const { styles } = useStyles();
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
  const { state, shift, boxes, gridWidth, lift, release, measure } = drag;
  // Hold to lift (400ms on the home screen, 220ms in edit mode); moving before that scrolls the page.
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(editing ? 220 : 400)
    .onStart(() => {
      state.value = { key: widget, x: 0, y: 0, to: index, moved: false };
      runOnJS(lift)(widget);
    })
    .onUpdate(event => {
      const plan = homeDropPlan(boxes.value, index, event.translationX, event.translationY, gridWidth.value);
      const moved = state.value.moved || Math.abs(event.translationX) + Math.abs(event.translationY) > 10;
      state.value = { key: widget, x: event.translationX, y: event.translationY, to: plan.to, moved };
      shift.value = plan.shift;
    })
    .onEnd((_event, success) => {
      runOnJS(release)(widget, state.value.to, state.value.moved, success);
    });
  const motion = useAnimatedStyle(() => {
    const active = state.value.key === widget;
    const offset = shift.value[index] ?? { x: 0, y: 0 };
    // While a drag is on, the others glide to their preview places; when it ends they are set at once,
    // because the committed order moves them there in the same frame.
    const glide = (value: number) => state.value.key !== null && !reduced ? withTiming(value, { duration: durations.press }) : value;
    return {
      zIndex: active ? 3 : 1,
      transform: [
        { translateX: active ? state.value.x : glide(offset.x) },
        { translateY: active ? state.value.y : glide(offset.y) },
        { scale: reduced ? 1 : withTiming(active ? 1.04 : 1, { duration: durations.press }) },
      ],
    };
  });
  return <GestureDetector gesture={pan} touchAction="pan-y">
    <Reanimated.View onLayout={event => measure(widget, event.nativeEvent.layout)} style={[styles.widgetWrap, small && styles.widgetSmall, motion]}>
      <Animated.View style={[styles.widgetFill, { transform: [{ rotate }] }]}>{children}</Animated.View>
    </Reanimated.View>
  </GestureDetector>;
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }, widgetWrap: { width: "100%" }, widgetSmall: { width: "48%" }, widgetFill: { flex: 1 }, widgetPress: { flex: 1 }, widget: { flex: 1, minHeight: 155 }, widgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 3, marginBottom: 12 }, widgetTitle: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
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
