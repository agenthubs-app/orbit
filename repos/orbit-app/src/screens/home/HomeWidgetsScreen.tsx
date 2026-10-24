import { type Href, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
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
  const { styles } = useStyles();
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
    toast.info(t(TITLE[key]), { undo: () => setDraft(before) });
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
  return <AppScreen inset="kit" title={date} header={<View style={styles.header}>
    <View style={styles.avatar}><UiText style={styles.avatarText}>{auth.user?.name?.slice(0, 1) || "O"}</UiText></View>
    <View style={styles.headerWords}><UiText style={styles.date}>{date}</UiText><UiText style={styles.greeting}>{greeting}</UiText></View>
    <IconButton icon="bell" accessibilityLabel={t("home.inbox")} dot={Boolean(badge)} onPress={() => router.push("/inbox" as Href)} />
    <Button label={editing ? t("home.widgetDone") : t("home.widgetEdit")} icon="grid" variant="surface" onPress={() => { if (editing) void finish(); else begin(); }} disabled={saving || state === "error"} />
  </View>}>
    {state === "error" ? <View><UiText style={styles.error}>{t("home.widgetUnavailable")}</UiText><Button label={t("home.readAgain")} onPress={() => void reload()} variant="secondary" /></View> : null}
    {state === "loading" ? <UiText style={styles.hintText}>{t("common.loadingLabel")}</UiText> : null}
    {state !== "error" && state !== "loading" ? <>
      {state === "stale" || pending ? <UiText style={styles.stale}>{t("home.widgetSavedOffline")}{fetchedAt ? ` · ${new Date(fetchedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")}` : ""}</UiText> : null}
      {!editing && !layout.hintDismissedAt && !hintHidden ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetHint")}</UiText><UiPressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => void dismissHint()}><UiText style={styles.hintText}>×</UiText></UiPressable></View> : null}
      {editing ? <View style={styles.hint}><UiText style={styles.hintText}>{t("home.widgetDragHint")}</UiText></View> : null}
      <View style={styles.grid}>{items.map((slot, index) => <DraggableWidget key={slot.key} widget={slot.key} index={index} count={items.length} editing={editing}
        small={slot.size === "s"} dropTarget={dropTarget === index} onTarget={setDropTarget} onDrop={(key, to) => setDraft(moveWidgetTo(items, key, to))}>
        <UiPressable accessible={false} onLongPress={() => { if (!editing) setMenu(slot.key); }} delayLongPress={400} style={styles.widgetPress}>
          <Card style={styles.widget}><View style={[styles.widgetHead, editing && styles.widgetHeadEditing]}><UiText style={styles.widgetTitle}>{iconFor(slot.key)}  {t(TITLE[slot.key])}</UiText>
            {editing ? <View style={styles.controls}>
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetMoveUp")}`} text="↑" disabled={index === 0} press={() => setDraft(moveWidget(items, slot.key, -1))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetMoveDown")}`} text="↓" disabled={index === items.length - 1} press={() => setDraft(moveWidget(items, slot.key, 1))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetSize")}`} text={slot.size === "s" ? t("home.widgetSmall") : t("home.widgetMedium")} press={() => setDraft(resizeWidget(items, slot.key))} />
              <Control label={`${t(TITLE[slot.key])} ${t("home.widgetRemove")}`} text="−" press={() => remove(slot.key)} />
            </View> : null}</View>
            <HomeWidgetBody widget={slot.key} size={slot.size} client={client} actorId={actorId} navigate={navigate} guide={guideProgress}
              onDataSettled={() => setWidgetRefreshRevision(value => value + 1)} />
          </Card>
        </UiPressable>
      </DraggableWidget>)}</View>
      {editing ? <Button label={t("home.widgetAdd")} icon="plus" onPress={() => setLibrary(true)} variant="surface" /> : null}
    </> : null}
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

function WidgetLibrary({ slots, onAdd, onClose }: { slots: readonly HomeWidgetSlot[]; onAdd: (slot: HomeWidgetSlot) => void; onClose: () => void }) {
  const { t } = useOrbitLocale(); const { colors, styles } = useStyles();
  const [category, setCategory] = useState("all"); const [query, setQuery] = useState("");
  const [sizes, setSizes] = useState<Partial<Record<HomeWidgetKey, "s" | "m">>>({});
  const categories = ["all", "today", "network", "event", "plan", "secretary"] as const;
  const categoryLabels = ["home.widgetAll", "home.today", "home.widgetNetwork", "home.events", "home.widgetPlan", "home.widgetSecretary"] as const;
  const available = HOME_WIDGETS.filter(item => !slots.some(slot => slot.key === item.key) && (category === "all" || item.category === category)
    && t(TITLE[item.key]).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const descriptions = { pending: "home.widgetPendingDescription", week: "home.widgetWeekDescription", eventPick: "home.widgetEventPickDescription", memo: "home.widgetMemoDescription" } as const;
  return <View style={styles.library}><View style={styles.libraryHeader}><View style={styles.libraryHeading}><UiText style={styles.date}>{t("home.widgetAdd")}</UiText><UiText style={styles.hintText}>{t("home.widgetLibraryHint")}</UiText></View><UiPressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={styles.libraryClose}><UiText style={styles.hintText}>×</UiText></UiPressable></View><TextInput accessibilityLabel={t("home.widgetSearch")} placeholder={t("home.widgetSearch")} placeholderTextColor={colors.ink3Text} value={query} onChangeText={setQuery} style={styles.search} />
    <View style={styles.categories}>{categories.map((item, index) => <UiPressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryOn]}><UiText style={styles.hintText}>{t(categoryLabels[index]!)}</UiText></UiPressable>)}</View>
    <View style={styles.libraryCards}>{available.map(item => {
      const selected = sizes[item.key] ?? (item.key === "memo" ? "s" : "m");
      return <View key={item.key} style={styles.libraryCard}><UiText style={styles.libraryIcon}>{iconFor(item.key)}</UiText><UiText style={styles.libraryName}>{t(TITLE[item.key])}</UiText><UiText numberOfLines={2} style={styles.hintText}>{item.key in descriptions ? t(descriptions[item.key as keyof typeof descriptions]) : t(TITLE[item.key])}</UiText><View style={styles.librarySizes}>{(["s", "m"] as const).map(size => <UiPressable key={size} accessibilityRole="button" accessibilityLabel={`${t(TITLE[item.key])} ${t(size === "s" ? "home.widgetSmall" : "home.widgetMedium")}`} accessibilityState={{ selected: selected === size }} hitSlop={6} onPress={() => setSizes(current => ({ ...current, [item.key]: size }))} style={[styles.librarySize, selected === size && styles.librarySizeSelected]}><UiText style={[styles.librarySizeText, selected === size && styles.librarySizeTextSelected]}>{t(size === "s" ? "home.widgetSmall" : "home.widgetMedium")}</UiText></UiPressable>)}<UiPressable accessibilityRole="button" accessibilityLabel={`${t(TITLE[item.key])} ${t("home.widgetAdd")}`} disabled={slots.length >= 10} hitSlop={5} onPress={() => onAdd({ key: item.key, size: selected })} style={[styles.libraryPlus, slots.length >= 10 && styles.disabled]}><UiText style={styles.libraryPlusText}>＋</UiText></UiPressable></View></View>;
    })}</View>
    <View style={styles.libraryExisting}><UiText style={styles.hintText}>{t("home.widgetOnHome")} {slots.length}</UiText><UiText numberOfLines={2} style={styles.hintText}>{slots.map(slot => t(TITLE[slot.key])).join(" · ")}</UiText></View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 11 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, avatarText: { color: colors.accentText, fontSize: 17, fontWeight: "700" }, headerWords: { flex: 1, minWidth: 0 }, date: { color: colors.ink, fontSize: 20, fontWeight: "700" }, greeting: { color: colors.ink3Text, fontSize: 12 },
  error: { color: colors.coralText, fontSize: 14 }, stale: { color: colors.coralText, fontSize: 13 },
  hint: { borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, hintText: { color: colors.ink3Text, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }, widgetWrap: { width: "100%" }, widgetSmall: { width: "48%" }, widgetPress: { flex: 1 }, widget: { flex: 1, minHeight: 155 }, widgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 3, marginBottom: 12 }, widgetTitle: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
  dropTarget: { borderColor: colors.accentText, borderWidth: 1, borderStyle: "dashed", borderRadius: 24 },
  widgetHeadEditing: { flexDirection: "column", alignItems: "stretch" },
  controls: { flexDirection: "row", gap: 3, justifyContent: "flex-end", marginTop: 8 }, control: { paddingHorizontal: 5, minHeight: 29, minWidth: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, controlText: { color: colors.accentText, fontSize: 13 }, disabled: { opacity: .35 },
  library: { minHeight: 500, paddingBottom: 20, gap: 12 }, libraryHeader: { flexDirection: "row", alignItems: "center" }, libraryHeading: { flex: 1, gap: 3 }, libraryClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  search: { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 18, minHeight: 40, paddingHorizontal: 12 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 5 }, category: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 }, categoryOn: { backgroundColor: colors.surface2 },
  libraryCards: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }, libraryCard: { width: "48%", minHeight: 130, padding: 10, borderRadius: 14, backgroundColor: colors.surface2 }, libraryIcon: { fontSize: 19 }, libraryName: { color: colors.ink, fontSize: 14, fontWeight: "700", marginTop: 3 }, librarySizes: { flexDirection: "row", alignItems: "center", marginTop: "auto", gap: 4 },
  librarySize: { width: 27, height: 27, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, librarySizeSelected: { backgroundColor: colors.ink }, librarySizeText: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" }, librarySizeTextSelected: { color: colors.surface }, libraryPlus: { marginLeft: "auto", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink }, libraryPlusText: { color: colors.surface, fontSize: 22, lineHeight: 25 },
  libraryExisting: { backgroundColor: colors.surface2, borderRadius: 14, minHeight: 52, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  contextPreview: { position: "absolute", right: 18, width: 178 }, contextPreviewCard: { minHeight: 184, gap: 8 },
  contextBackdrop: { bottom: 88 }, contextTabDismiss: { position: "absolute", left: 0, right: 0, bottom: 0, height: 88 },
  contextMenu: { position: "absolute", right: 18, width: 216, borderRadius: radius.menu, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 5 },
  contextRow: { minHeight: 39, flexDirection: "row", alignItems: "center", gap: 5 }, contextText: { color: colors.ink, fontSize: 15, fontWeight: "600" }, contextGrow: { flex: 1 },
  contextLine: { height: 1, backgroundColor: colors.line }, contextSize: { width: 23, height: 23, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, contextSizeOn: { backgroundColor: colors.ink },
  contextSizeText: { color: colors.ink3Text, fontSize: 12, fontWeight: "700" }, contextSizeTextOn: { color: colors.surface }, contextRemove: { color: colors.coralText, fontSize: 15, fontWeight: "600" },
}));
