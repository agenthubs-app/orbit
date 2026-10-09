import { createContext, useContext, useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

import { motion } from "../../design/tokens";

// R04 unified behaviour: with "Reduce Motion" on, components keep only fades —
// no translate, scale, shimmer or number roll. The showcase can force it on
// through ReducedMotionOverride; everything else follows the system setting.
export const ReducedMotionOverride = createContext<boolean | null>(null);

// One app-wide reading of the system setting (R04 review M7): asked once when this
// module loads and kept current by a single listener, so a dialog or toast that
// appears later already knows the answer on its first frame, and long lists don't
// start one native query per pressable.
let systemReduced = false;
const listeners = new Set<() => void>();
let started = false;

function publish(value: boolean) {
  if (value === systemReduced) return;
  systemReduced = value;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => publish(Boolean(value))).catch(() => undefined);
  AccessibilityInfo.addEventListener?.("reduceMotionChanged", (value: boolean) => publish(Boolean(value)));
}
start();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const read = () => systemReduced;

export function useReducedMotion(): boolean {
  const override = useContext(ReducedMotionOverride);
  const system = useSyncExternalStore(subscribe, read, read);
  return override ?? system;
}

/** Test hook: the system value as the store currently holds it. */
export function systemReducedMotion(): boolean {
  return systemReduced;
}

export const durations = motion.duration;
