import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { useOrbitTheme } from "../../design/theme";
import { useStandardCopy } from "../../i18n/standard-copy";
import { Icon } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { createToast, disarmOwner, toastBottom, type ToastInput, type ToastState } from "./toast-model";
import { UiText } from "./Text";

type ToastApi = { show: (input: ToastInput, owner: number) => void; dismiss: () => void; release: (owner: number) => void };
const ToastContext = createContext<ToastApi | null>(null);
let nextOwner = 1;

// Mount once at the root. `hasTabBar` places the toast above the floating tab bar.
export function ToastProvider({ children, hasTabBar = false }: { children: ReactNode; hasTabBar?: boolean }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const api = useMemo<ToastApi>(() => ({
    show: (input, owner) => setCurrent(createToast(input, owner)),
    dismiss: () => setCurrent(null),
    release: (owner) => setCurrent((value) => disarmOwner(value, owner)),
  }), []);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <ToastView key={current.id} toast={current} bottom={toastBottom(hasTabBar)} onClose={api.dismiss} /> : null}
    </ToastContext.Provider>
  );
}

/** `toast.success("完了にしました", { undo })`. Undo callbacks die with the calling screen. */
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
  const { colors, scheme } = useOrbitTheme();
  const copy = useStandardCopy();
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
  // RD-17: a dark capsule in both themes — ink in light, one step above the dark page in dark.
  const background = scheme === "dark" ? colors.surface3 : colors.ink;
  const text = scheme === "dark" ? colors.ink : colors.onAccent;
  const markColor = toast.kind === "error" ? colors.coral : toast.kind === "success" ? colors.ok : colors.ink3;
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 16, 0] });
  return (
    <Animated.View
      accessibilityLiveRegion={toast.kind === "error" ? "assertive" : "polite"}
      accessibilityRole={toast.kind === "error" ? "alert" : "text"}
      pointerEvents="box-none"
      style={[styles.position, { bottom, opacity: enter, transform: [{ translateY }] }]}
    >
      <View style={[styles.toast, toast.keep && styles.keep, { backgroundColor: background }]}>
        <View style={[styles.mark, { backgroundColor: markColor }]}>
          <Icon name={toast.kind === "error" ? "alert" : toast.kind === "success" ? "check" : "info"} size={16} color={colors.onAccent} />
        </View>
        <View style={styles.message}>
          <UiText numberOfLines={2} style={[styles.title, { color: text }]}>{toast.message}</UiText>
          {toast.sub ? <UiText numberOfLines={toast.keep ? 3 : 1} style={[styles.sub, { color: text }]}>{toast.sub}</UiText> : null}
        </View>
        {toast.undo ? (
          <UiPressable accessibilityRole="button" accessibilityLabel={copy.action.undo} onPress={() => { toast.undo?.(); onClose(); }} style={[styles.undo, { backgroundColor: scheme === "dark" ? colors.surface2 : colors.ink2 }]}>
            <UiText numberOfLines={1} style={[styles.undoLabel, { color: text }]}>{copy.action.undo}</UiText>
          </UiPressable>
        ) : null}
        {toast.autoDismissMs === null ? (
          <UiPressable accessibilityRole="button" accessibilityLabel={copy.action.close} hitSlop={10} onPress={onClose} style={styles.close}>
            <Icon name="x" size={16} color={text} />
          </UiPressable>
        ) : null}
        {toast.autoDismissMs !== null && !reduced ? <Animated.View style={[styles.countdown, { backgroundColor: text, transform: [{ scaleX: countdown }] }]} /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", left: 16, right: 16 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 999, paddingVertical: 9, paddingLeft: 12, paddingRight: 9, overflow: "hidden", minHeight: 48 },
  keep: { borderRadius: 22, paddingVertical: 10 },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  message: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: "700", lineHeight: 17 },
  sub: { fontSize: 11, fontWeight: "600" },
  undo: { minHeight: 32, borderRadius: 999, paddingHorizontal: 13, justifyContent: "center" },
  undoLabel: { fontSize: 12, fontWeight: "800" },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  countdown: { position: "absolute", left: 22, right: 22, bottom: 3, height: 2, borderRadius: 1, opacity: 0.4 },
});
