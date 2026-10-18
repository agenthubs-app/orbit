// R31b：展示页逐件对照小节的 id（服务端路由也要用，所以不放在 "use client" 的 cells.tsx 里）。
export const CELL_IDS = [
  "c-toast-0", "c-confirm-2", "c-layer-2", "c-ai-0", "c-ai-1", "c-ai-2", "c-chip-0", "c-kbd-0", "c-text-0", "c-ctl-0", "mac-tile",
  "c-why-0", "c-load-0", "c-err-1", "c-err-2", "c-pay-0",
] as const;
export type CellId = (typeof CELL_IDS)[number];

export function isCellId(id: string): id is CellId {
  return (CELL_IDS as readonly string[]).includes(id);
}
