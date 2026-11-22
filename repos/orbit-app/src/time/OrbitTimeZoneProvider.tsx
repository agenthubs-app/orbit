import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Text } from "react-native";
import { validTimeZone } from "./date-time";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

export interface DeviceTimeZone { timeZone: string; canSave: boolean; error: boolean }
const Context = createContext<DeviceTimeZone | null>(null);

export function readDeviceTimeZone(previous?: DeviceTimeZone): DeviceTimeZone {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (validTimeZone(timeZone)) return { timeZone, canSave: true, error: false };
  } catch { /* Retain a confirmed device value, never an account preference. */ }
  return { timeZone: previous?.canSave ? previous.timeZone : "UTC", canSave: previous?.canSave ?? false, error: true };
}

function useDeviceTimeZone(enabled: boolean): DeviceTimeZone {
  const [state, setState] = useState(() => readDeviceTimeZone());
  useEffect(() => {
    if (!enabled) return;
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") setState(previous => readDeviceTimeZone(previous));
    });
    return () => listener.remove();
  }, [enabled]);
  return state;
}

export function OrbitTimeZoneProvider({ children }: { children: ReactNode }) {
  const state = useDeviceTimeZone(true);
  const { t } = useOrbitLocale();
  return <Context.Provider value={state}>
    {state.error ? <Text accessibilityRole="alert">{state.canSave ? t("schedule.timeZoneStale", { timeZone: state.timeZone }) : t("schedule.timeZoneUnavailable")}</Text> : null}
    {children}
  </Context.Provider>;
}

export function useOrbitTimeZone(): DeviceTimeZone {
  const shared = useContext(Context);
  // Isolated route rendering also follows the device; the app root shares one listener.
  const local = useDeviceTimeZone(shared === null);
  return shared ?? local;
}
