// R05 shell geometry shared by the tab bar and the pages under it. Kept free of
// imports so page code (and the test bundles that render pages) never pulls in
// the bar's native glass and safe-area modules.
/** kit .tabbar height (ui.css:97). */
export const TAB_BAR_HEIGHT = 62;
/** Bottom padding of a tab page so its last row scrolls clear of the floating bar. */
export const TAB_BAR_CLEARANCE = 140;
