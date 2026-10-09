// Theme bootstrap shared by the root layout (server) and orbit-theme.tsx
// (client). Kept out of the "use client" module: a server component importing
// a value from one receives a client reference, not the string.
//
// R01 (RD-05): with no stored choice the page follows the system
// (prefers-color-scheme); a stored "light" / "dark" wins. Any failure falls
// back to light, the design's default. orbit-2026/tokens.css reads the
// resulting data-theme; the same media query covers the no-script case.

export const ORBIT_THEME_STORAGE_KEY = "orbit-theme";

// Runs before paint in the document <head>. Dependency-free and defensive.
export const ORBIT_THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('${ORBIT_THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}d.setAttribute('data-theme',t);}catch(e){d.setAttribute('data-theme','light');}})();`;
