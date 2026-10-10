"use client";

import { useCallback, useEffect, useRef } from "react";

// R06: one stack of open layers (dialog, drawer, popover, menu) for the whole page.
// Escape and outside clicks act only on the top layer, so a dialog opened from a
// drawer closes first and the drawer stays (01-system: Esc closes the top layer).
// `useOrbitModalA11y` registers its own Escape handler per dialog; components pass it
// a close that only runs when they are on top.
const stack: number[] = [];
let nextLayer = 1;

export function openLayer(): number {
  const id = nextLayer++;
  stack.push(id);
  return id;
}

export function closeLayer(id: number): void {
  const index = stack.indexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

export function isTopLayer(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

export function openLayerCount(): number {
  return stack.length;
}

/** While `open`, this component holds a layer; `isTop()` says whether it is the top one. */
export function useLayer(open: boolean): () => boolean {
  const id = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const layer = openLayer();
    id.current = layer;
    return () => {
      closeLayer(layer);
      if (id.current === layer) id.current = null;
    };
  }, [open]);
  return useCallback(() => id.current !== null && isTopLayer(id.current), []);
}
