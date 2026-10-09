import { createContext, useContext, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { motion } from "../../design/tokens";

// R04 unified behaviour: with "Reduce Motion" on, components keep only fades —
// no translate, scale, shimmer or number roll. The showcase can force it on
// through ReducedMotionOverride; everything else follows the system setting.
export const ReducedMotionOverride = createContext<boolean | null>(null);

export function useReducedMotion(): boolean {
  const override = useContext(ReducedMotionOverride);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (alive) setSystem(Boolean(value)); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (value: boolean) => setSystem(value));
    return () => { alive = false; subscription?.remove?.(); };
  }, []);
  return override ?? system;
}

export const durations = motion.duration;
