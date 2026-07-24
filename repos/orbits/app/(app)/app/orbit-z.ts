/**
 * Semantic z-index scale for app/(app)/app.
 *
 * Replaces the inline zIndex literals (1/5/20/40/60/90/100/200/300) that had
 * accreted ad hoc across the product surface (audit P1-4 / C.3). Each tier
 * leaves headroom for local ordering within it (e.g. two overlays that both
 * need to be "above sticky bars" can each add a small offset and stay below
 * the next tier).
 *
 *   raised   — local intra-component stacking (avatar overlap, header bars
 *              sitting above the content that scrolls beneath them). Not a
 *              global layer; just "above its own siblings".
 *   sticky   — sticky/fixed bars that stay pinned during scroll: sticky
 *              section headers, sticky footer action bars, mobile CTA bars.
 *              Must stay below dropdowns/overlays/modals/toasts.
 *   dropdown — floating menus anchored to a trigger (account menu, item
 *              context menus).
 *   overlay  — drawers / sheets that cover the viewport with a scrim
 *              (mobile history drawer, relationship inbox sheet).
 *   modal    — centered dialogs / bottom sheets that block the page
 *              (confirm dialogs, person detail overlay). Deliberately above
 *              `overlay`: a modal opened from within a drawer/sheet (e.g.
 *              confirming an action from the relationship inbox) must stack
 *              on top of it, never behind it.
 *   toast    — transient status messages; must float above modals.
 *   debug    — dev-only overlays (kept far above product UI).
 */
export const ORBIT_Z = {
  raised: 10,
  sticky: 100,
  dropdown: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  debug: 900,
} as const;
