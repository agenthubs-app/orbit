"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";

// R07 shell slots (frozen): a page fills the main header and the optional right
// rail by rendering <ShellPage …/> anywhere in its tree; the shell draws them.
//   title / subtitle — the centred main title (mainhead);
//   left / right     — buttons either side of the title;
//   demoPill         — the sample-mode pill (ShellDemoPill), shown next to the title;
//   rightRail        — the rail content (≥1280 only; `false` hides the rail).
// Node slots render inside the shell, not inside the page: anything they need
// from the page (demo mode, page state) must be read in the page and passed in
// as props (see ShellDemoPill). Several <ShellPage>s may be mounted at once; each
// sets only the slots it names, the later-mounted one wins a slot both name.
export type ShellSlots = {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  demoPill?: ReactNode;
  rightRail?: ReactNode | false;
};

type SetSlots = (id: string, slots: ShellSlots | null) => void;

const SlotsContext = createContext<ShellSlots | null>(null);
// The setter lives in its own context and never changes, so a <ShellPage> does not
// re-render (and re-run its effect) every time the slots change.
const SetSlotsContext = createContext<SetSlots | null>(null);

const SLOT_KEYS = ["title", "subtitle", "left", "right", "demoPill", "rightRail"] as const;
const sameSlots = (a: ShellSlots, b: ShellSlots) => SLOT_KEYS.every((key) => Object.is(a[key], b[key]));

export function ShellSlotsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ReadonlyArray<readonly [string, ShellSlots]>>([]);
  const set = useCallback<SetSlots>((id, part) => setEntries((current) => {
    const index = current.findIndex(([key]) => key === id);
    if (part === null) return index === -1 ? current : current.filter(([key]) => key !== id);
    if (index === -1) return [...current, [id, part] as const];
    if (sameSlots(current[index]![1], part)) return current;
    const next = [...current];
    next[index] = [id, part] as const;
    return next;
  }), []);
  const slots = useMemo<ShellSlots>(() => {
    const merged: ShellSlots = {};
    for (const [, part] of entries) for (const key of SLOT_KEYS) if (part[key] !== undefined) (merged as Record<string, unknown>)[key] = part[key];
    return merged;
  }, [entries]);
  return (
    <SetSlotsContext.Provider value={set}>
      <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
    </SetSlotsContext.Provider>
  );
}

export function useShellSlots(): ShellSlots {
  return useContext(SlotsContext) ?? {};
}

/** Sets the shell slots while mounted. Outside the shell (signed out, tests) it renders nothing. */
export function ShellPage(props: ShellSlots) {
  const id = useId();
  const set = useContext(SetSlotsContext);
  const { title, subtitle, left, right, demoPill, rightRail } = props;
  useEffect(() => {
    if (!set) return;
    set(id, { title, subtitle, left, right, demoPill, rightRail });
  }, [set, id, title, subtitle, left, right, demoPill, rightRail]);
  useEffect(() => (set ? () => set(id, null) : undefined), [set, id]);
  return null;
}
