import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";

// R01 (RD-05): the App follows the system appearance until the person picks
// light or dark in Settings. The choice is device-local (like iOS apps' own
// appearance setting) and applied through Appearance.setColorScheme, so every
// useColorScheme() reader — useOrbitTheme, createThemedStyles — follows it
// without a provider.
export type AppearanceChoice = "system" | "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "orbit:appearance:v1";

export interface AppearanceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let choice: AppearanceChoice = "system";
let storage: AppearanceStorage | null = null;
const listeners = new Set<() => void>();

function parseChoice(value: string | null): AppearanceChoice {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function apply(next: AppearanceChoice) {
  choice = next;
  // react-native-web has no setColorScheme; there the browser setting stands.
  Appearance.setColorScheme?.(next === "system" ? "unspecified" : next);
  listeners.forEach((listener) => listener());
}

export async function loadAppearancePreference(adapter: AppearanceStorage): Promise<void> {
  storage = adapter;
  let stored: string | null = null;
  try {
    stored = await adapter.getItem(APPEARANCE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  apply(parseChoice(stored));
}

export async function setAppearanceChoice(next: AppearanceChoice): Promise<void> {
  apply(next);
  try {
    await storage?.setItem(APPEARANCE_STORAGE_KEY, next);
  } catch {
    // The screen already switched; the choice just won't survive a restart.
  }
}

export function getAppearanceChoice(): AppearanceChoice {
  return choice;
}

export function useAppearanceChoice(): AppearanceChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAppearanceChoice,
    getAppearanceChoice,
  );
}

export function resetAppearanceForTests() {
  choice = "system";
  storage = null;
  listeners.clear();
}
