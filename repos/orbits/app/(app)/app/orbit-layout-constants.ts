// 布局共享常量。
// iOrbit 历史侧边栏与人脉页左侧边栏必须同宽；以人脉列宽（212px）为准。
export const ORBIT_LEFT_SIDEBAR_WIDTH = 212;

// R07 Orbit2026Shell (kit/ui.css .web 84px 1fr 360px; b8-responsive.html breakpoints).
// The 212 above stays until the old network screens are replaced (R11).
export const ORBIT_2026_SIDEBAR = 84;
export const ORBIT_2026_SIDEBAR_COMPACT = 72;
export const ORBIT_2026_RAIL = 360;
export const ORBIT_2026_HISTORY = 260;
/** ≥ this width: full left rail and the right rail; below: compact rail, no right rail. */
export const ORBIT_2026_WIDE = 1280;
/** Below this width: no left rail, a bottom capsule instead. */
export const ORBIT_2026_NARROW = 768;
