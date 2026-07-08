// Deterministic visual generators for demo data.
//
// The static manifest (demo-visual-assets.ts) only covers hand-authored records.
// Real seed data is sparse — most events/contacts have no bespoke asset — so these
// helpers deterministically synthesize a *fitting* cover or an *animated* avatar from
// whatever fields exist (industry/theme/tags for events, display name for people).
// Output is a self-contained data-URI SVG, so no per-record asset files are required.
//
// Resolution order always prefers a curated manifest asset, then falls back to a
// generated one — mirroring how the redesigned UI derives covers/gradients in code.

import {
  getDemoEventSceneAsset,
  getDemoPersonAvatarAsset,
} from "./demo-visual-assets";

export interface ResolvedVisual {
  alt: string;
  animated: boolean;
  generated: boolean;
  src: string;
}

// FNV-1a — small, stable string hash for deterministic palette/motif selection.
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function svgDataUri(svg: string): string {
  // Collapse whitespace so the data URI stays compact, then percent-encode.
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

// ————— Event covers —————

interface CoverTheme {
  from: string;
  keywords: readonly string[];
  label: string;
  motif: "orbit" | "grid" | "waves" | "chart" | "pulse" | "rays";
  to: string;
}

// Ordered by specificity; the first keyword hit wins. Palettes stay in the teal-anchored
// family of the shared design tokens but diverge enough to read as distinct categories.
const COVER_THEMES: readonly CoverTheme[] = [
  {
    keywords: ["finance", "fintech", "invest", "capital", "bank", "vc", "金融", "投资", "风投", "银行"],
    from: "#0b3d5c",
    to: "#155e75",
    motif: "chart",
    label: "Finance",
  },
  {
    keywords: ["saas", "software", "cloud", "ai", "tech", "developer", "data", "云", "科技", "软件", "人工智能"],
    from: "#312e81",
    to: "#6359e9",
    motif: "grid",
    label: "Technology",
  },
  {
    keywords: ["consumer", "retail", "commerce", "d2c", "brand", "marketplace", "电商", "消费", "零售", "品牌"],
    from: "#7a2f4e",
    to: "#e0567f",
    motif: "waves",
    label: "Consumer",
  },
  {
    keywords: ["health", "bio", "medical", "care", "wellness", "医疗", "健康", "生物"],
    from: "#0f5132",
    to: "#2f9e6f",
    motif: "pulse",
    label: "Health",
  },
  {
    keywords: ["founder", "startup", "venture", "roundtable", "summit", "创业", "峰会", "创始"],
    from: "#8a3b12",
    to: "#e08a3c",
    motif: "rays",
    label: "Founders",
  },
  {
    keywords: ["hardware", "semiconductor", "manufactur", "robot", "硬件", "半导体", "制造", "机器人"],
    from: "#334155",
    to: "#64748b",
    motif: "grid",
    label: "Hardware",
  },
];

const DEFAULT_COVER_THEME: CoverTheme = {
  keywords: [],
  from: "#124d5c",
  to: "#155e75",
  motif: "orbit",
  label: "Orbit",
};

function coverThemeFor(haystack: string): CoverTheme {
  const text = haystack.toLowerCase();
  for (const theme of COVER_THEMES) {
    if (theme.keywords.some((keyword) => text.includes(keyword))) {
      return theme;
    }
  }
  return DEFAULT_COVER_THEME;
}

function coverMotif(motif: CoverTheme["motif"]): string {
  switch (motif) {
    case "grid":
      return `<g fill='none' stroke='rgba(255,255,255,0.14)' stroke-width='2'>
        ${Array.from({ length: 7 }, (_, i) => `<line x1='${140 * i}' y1='0' x2='${140 * i}' y2='480'/>`).join("")}
        ${Array.from({ length: 4 }, (_, i) => `<line x1='0' y1='${120 * i}' x2='1200' y2='${120 * i}'/>`).join("")}
      </g>`;
    case "waves":
      return `<g fill='none' stroke='rgba(255,255,255,0.18)' stroke-width='3'>
        <path d='M0 360 C 200 300 400 420 600 360 S 1000 300 1200 360'/>
        <path d='M0 410 C 220 350 420 470 640 410 S 1020 350 1200 410'/>
      </g>`;
    case "chart":
      return `<g fill='rgba(255,255,255,0.16)'>
        ${Array.from({ length: 9 }, (_, i) => `<rect x='${120 + i * 110}' y='${360 - (i % 4) * 60}' width='60' height='${120 + (i % 4) * 60}' rx='6'/>`).join("")}
      </g>`;
    case "pulse":
      return `<path d='M0 240 H360 l40 -120 l60 240 l50 -160 l40 40 H1200' fill='none' stroke='rgba(255,255,255,0.45)' stroke-width='4'/>`;
    case "rays":
      return `<g stroke='rgba(255,255,255,0.16)' stroke-width='2'>
        ${Array.from({ length: 14 }, (_, i) => `<line x1='1080' y1='120' x2='${1080 - Math.cos((i / 14) * 3.14) * 900}' y2='${120 + Math.sin((i / 14) * 3.14) * 900}'/>`).join("")}
      </g>`;
    case "orbit":
    default:
      return `<g fill='none' stroke='rgba(255,255,255,0.2)' stroke-width='2'>
        <ellipse cx='980' cy='150' rx='260' ry='120'/>
        <ellipse cx='980' cy='150' rx='170' ry='78' transform='rotate(24 980 150)'/>
        <circle cx='980' cy='150' r='16' fill='rgba(255,255,255,0.85)'/>
      </g>`;
  }
}

/**
 * Resolve an event cover: curated manifest asset when present, otherwise a generated
 * category-fit cover derived from industry / theme / tags / name.
 */
export function resolveEventCover(input: {
  industry?: string | null;
  name?: string | null;
  recordId?: string | null;
  tags?: readonly string[] | null;
  theme?: string | null;
}): ResolvedVisual {
  const curated = getDemoEventSceneAsset(input.recordId);
  if (curated) {
    return { alt: curated.alt, animated: false, generated: false, src: curated.src };
  }

  const haystack = [
    input.industry ?? "",
    input.theme ?? "",
    (input.tags ?? []).join(" "),
    input.name ?? "",
  ].join(" ");
  const themeChoice = coverThemeFor(haystack);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 480' preserveAspectRatio='xMidYMid slice' role='img'>
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${themeChoice.from}'/>
        <stop offset='1' stop-color='${themeChoice.to}'/>
      </linearGradient>
    </defs>
    <rect width='1200' height='480' fill='url(#bg)'/>
    ${coverMotif(themeChoice.motif)}
  </svg>`;

  return {
    alt: input.name ? `${input.name} cover` : `${themeChoice.label} event cover`,
    animated: false,
    generated: true,
    src: svgDataUri(svg),
  };
}

// ————— Animated avatars —————

// Gradient pairs harmonized with the teal token family but distinct per person.
const AVATAR_PALETTES: readonly [string, string][] = [
  ["#155e75", "#0e7490"],
  ["#312e81", "#6359e9"],
  ["#7a2f4e", "#e0567f"],
  ["#0f5132", "#2f9e6f"],
  ["#8a3b12", "#e08a3c"],
  ["#1e3a8a", "#3b82f6"],
  ["#5b3b8a", "#a855f7"],
  ["#0b3d5c", "#0e7490"],
];

function initialsFor(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) {
    return "·";
  }
  // CJK names: a single leading character reads best.
  if (/[぀-ヿ㐀-鿿가-힯]/.test(trimmed)) {
    return trimmed.slice(0, 1);
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Resolve a person avatar: curated manifest asset when present, otherwise a generated
 * animated SVG (gradient disc + orbiting highlight + initials) derived from the name.
 * The animation is SMIL, which runs even when the SVG is used as an <img src>.
 */
export function resolveAnimatedAvatar(input: {
  displayName?: string | null;
  recordId?: string | null;
}): ResolvedVisual {
  const curated = getDemoPersonAvatarAsset({
    displayName: input.displayName,
    recordId: input.recordId,
  });
  if (curated) {
    return { alt: curated.alt, animated: false, generated: false, src: curated.src };
  }

  const seed = input.recordId || input.displayName || "orbit";
  const hash = hashString(seed);
  const [from, to] = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  const initials = initialsFor(input.displayName);
  // Vary orbit speed slightly so a wall of avatars doesn't pulse in lockstep.
  const duration = 5 + (hash % 4);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' role='img'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${from}'/>
        <stop offset='1' stop-color='${to}'/>
      </linearGradient>
    </defs>
    <circle cx='40' cy='40' r='40' fill='url(#g)'/>
    <g>
      <circle cx='40' cy='9' r='4' fill='rgba(255,255,255,0.9)'/>
      <animateTransform attributeName='transform' type='rotate' from='0 40 40' to='360 40 40' dur='${duration}s' repeatCount='indefinite'/>
    </g>
    <circle cx='40' cy='40' r='31' fill='none' stroke='rgba(255,255,255,0.22)' stroke-width='1.5'/>
    <text x='40' y='40' dy='0.35em' text-anchor='middle' font-family='Inter, system-ui, sans-serif' font-size='26' font-weight='600' fill='#ffffff'>${initials}</text>
  </svg>`;

  return {
    alt: input.displayName ? `${input.displayName} avatar` : "Contact avatar",
    animated: true,
    generated: true,
    src: svgDataUri(svg),
  };
}
