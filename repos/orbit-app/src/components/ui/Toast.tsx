import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useOrbitTheme } from "../../design/theme";
import { useStandardCopy } from "../../i18n/standard-copy";
import { Icon, type IconName } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { createToast, disarmOwner, mixHex, toastBottom, type ToastInput, type ToastState } from "./toast-model";
import { UiText } from "./Text";

type ToastApi = { show: (input: ToastInput, owner: number) => void; dismiss: () => void; release: (owner: number) => void; bar: (delta: 1 | -1) => void };
const ToastContext = createContext<ToastApi | null>(null);
let nextOwner = 1;

// Mount once at the root, OUTSIDE UiPortalHost: the toast then renders after the
// portal layer, so it stays visible above an open dialog or sheet (R04 review M1).
// `hasTabBar` places the toast above the floating tab bar; a page with its own bottom bar declares it with usePageBottomBar().
export function ToastProvider({ children, hasTabBar = false }: { children: ReactNode; hasTabBar?: boolean }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const [pageBars, setPageBars] = useState(0);
  const api = useMemo<ToastApi>(() => ({
    show: (input, owner) => setCurrent(createToast(input, owner)),
    dismiss: () => setCurrent(null),
    release: (owner) => setCurrent((value) => disarmOwner(value, owner)),
    bar: (delta) => setPageBars((count) => Math.max(0, count + delta)),
  }), []);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <ToastView key={current.id} toast={current} bottom={toastBottom(hasTabBar, pageBars)} onClose={api.dismiss} /> : null}
    </ToastContext.Provider>
  );
}

/**
 * R31a: a page that draws its own bottom bar (会場 · kit .tabbar.livebar) calls this while it is shown, so toasts sit
 * above that bar (kit .toast.pos, bottom 100) instead of near the edge (.notab, 40).
 */
export function usePageBottomBar(active = true) {
  const api = useContext(ToastContext);
  useEffect(() => {
    if (!api || !active) return;
    api.bar(1);
    return () => api.bar(-1);
  }, [api, active]);
}

/**
 * `toast.success("完了にしました", { undo })`, `toast.error(msg, { action: { label: copy.action.retry, onPress } })`.
 * Undo and action callbacks die with the calling screen.
 */
export function useToast() {
  const api = useContext(ToastContext);
  const owner = useRef(nextOwner++).current;
  useEffect(() => () => api?.release(owner), [api, owner]);
  const show = useCallback((kind: NonNullable<ToastInput["kind"]>, message: string, options: Omit<ToastInput, "kind" | "message"> = {}) => api?.show({ kind, message, ...options }, owner), [api, owner]);
  return useMemo(() => ({
    success: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("success", message, options),
    error: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("error", message, options),
    info: (message: string, options?: Omit<ToastInput, "kind" | "message">) => show("info", message, options),
    dismiss: () => api?.dismiss(),
  }), [api, show]);
}

function ToastView({ toast, bottom, onClose }: { toast: ToastState; bottom: number; onClose: () => void }) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const countdown = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: durations.toastIn, useNativeDriver: true }).start();
    if (toast.autoDismissMs === null) return;
    if (!reduced) Animated.timing(countdown, { toValue: 0, duration: toast.autoDismissMs, useNativeDriver: true }).start();
    const timer = setTimeout(onClose, toast.autoDismissMs);
    return () => clearTimeout(timer);
  }, [countdown, enter, onClose, reduced, toast.autoDismissMs]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 16, 0] });
  return (
    <Animated.View
      accessibilityLiveRegion={toast.kind === "error" ? "assertive" : "polite"}
      accessibilityRole={toast.kind === "error" ? "alert" : "text"}
      pointerEvents="box-none"
      style={[styles.position, { bottom, opacity: enter, transform: [{ translateY }] }]}
    >
      <ToastCapsule toast={toast} onClose={onClose} countdown={!reduced ? countdown : null} />
    </Animated.View>
  );
}

/**
 * The capsule itself, without position or entry animation. ToastView draws it; the component
 * showcase (R31a) draws several side by side to match 01-system ① (`countdown` null = a still
 * full-width countdown line).
 */
export function ToastCapsule({ toast, onClose, countdown = null }: { toast: ToastState; onClose: () => void; countdown?: Animated.Value | null }) {
  const { colors, scheme } = useOrbitTheme();
  const copy = useStandardCopy();
  const reduced = useReducedMotion();
  // RD-17 (01-system ① redrawn 2026-10-18, RD-33): a dark capsule in both themes — ink with bg-coloured text in light,
  // surface-3 with ink text in dark. Mark and button tints follow kit color-mix() over the capsule.
  const dark = scheme === "dark";
  const background = dark ? colors.surface3 : colors.ink;
  const text = dark ? colors.ink : colors.onAccent;
  const markColor = toast.kind === "error" ? colors.coral : toast.kind === "success" ? colors.ok : mixHex(dark ? colors.ink : colors.bg, background, 0.22);
  const markIcon = (toast.icon as IconName | undefined) ?? (toast.kind === "error" ? "alert" : toast.kind === "success" ? "check" : "info");
  const markTint = toast.kind === "info" ? text : colors.bg;
  // R31a: no ✕ (kit .toast has none). A toast that stays (error, undo bar) closes with a tap anywhere on it;
  // its button closes the toast first, then runs the undo / action.
  const stays = toast.autoDismissMs === null;
  const body = (
    <>
      <View style={[styles.mark, { backgroundColor: markColor }]}>
        <Icon name={markIcon} size={15} strokeWidth={2.2} color={markTint} />
      </View>
      <View style={styles.message}>
        <UiText numberOfLines={2} style={[styles.title, { color: text }]}>{toast.message}</UiText>
        {toast.sub ? <UiText numberOfLines={toast.keep ? 3 : 1} style={[styles.sub, { color: text }]}>{toast.sub}</UiText> : null}
      </View>
      {toast.undo || toast.action ? (
        // 32 tall like the kit's capsule; hitSlop 6 makes the touch target 44.
        <UiPressable
          accessibilityRole="button"
          accessibilityLabel={toast.undo ? copy.action.undo : toast.action?.label}
          hitSlop={6}
          onPress={() => { const run = toast.undo ?? toast.action?.onPress; onClose(); run?.(); }}
          style={[styles.undo, { backgroundColor: dark ? colors.surface2 : mixHex(colors.bg, background, 0.16) }]}
        >
          {toast.undo ? <Icon name="undo" size={16} color={text} /> : toast.action?.icon ? <Icon name={toast.action.icon as IconName} size={16} color={text} /> : null}
          <UiText numberOfLines={1} style={[styles.undoLabel, { color: text }]}>{toast.undo ? copy.action.undo : toast.action?.label}</UiText>
        </UiPressable>
      ) : null}
      {!stays && !reduced ? <Animated.View style={[styles.countdown, { backgroundColor: text, transform: [{ scaleX: countdown ?? 1 }] }]} /> : null}
    </>
  );
  return stays
    ? <UiPressable accessibilityRole="button" accessibilityLabel={toast.message} accessibilityHint={copy.action.close} onPress={onClose} pressedScale={1} style={[styles.toast, toast.keep && styles.keep, { backgroundColor: background }]}>{body}</UiPressable>
    : <View style={[styles.toast, toast.keep && styles.keep, { backgroundColor: background }]}>{body}</View>;
}

const styles = StyleSheet.create({
  position: { position: "absolute", left: 16, right: 16 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 999, paddingVertical: 9, paddingLeft: 12, paddingRight: 9, overflow: "hidden", minHeight: 48 },
  keep: { borderRadius: 22, paddingVertical: 10, paddingRight: 10 },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  message: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: "700", lineHeight: 17 },
  sub: { fontSize: 11, fontWeight: "600", opacity: 0.68 },
  undo: { minHeight: 32, borderRadius: 999, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 5 },
  undoLabel: { fontSize: 12, fontWeight: "800" },
  countdown: { position: "absolute", left: 22, right: 22, bottom: 3, height: 2, borderRadius: 1, opacity: 0.4 },
});
