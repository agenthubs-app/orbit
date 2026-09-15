/**
 * Extracts the Orbit prototype stylesheet into a cacheable static asset.
 *
 * Background (UI audit 2026-07-26, P0-2): the product surface used to inline the
 * whole prototype stylesheet into every server-rendered page via a `<style>`
 * tag. That stylesheet carries 140 base64 `@font-face` blocks (Inter / Inter
 * Tight / Geist Mono, 4.8 MB) which Next also serialises a second time into the
 * RSC flight payload — every navigation shipped ~10 MB of HTML and first
 * contentful paint measured 4.9 s on a page with only 401 DOM nodes.
 *
 * Those three families are dead weight: the product token layer in
 * `app/(app)/app/orbit-reference-styles.tsx` remaps `--ff` to 'Noto Sans SC',
 * `--ff-serif` / `--ff-display` / `--ff-tight` to 'Noto Serif SC' and `--ff-mono`
 * to 'JetBrains Mono' — all of which load as ordinary cacheable woff2 files from
 * `public/iorbit-starfield/fonts/`. Nothing resolves to Inter / Inter Tight /
 * Geist Mono, so stripping their `@font-face` blocks takes the stylesheet from
 * 4.94 MB to 116 KB with no rendering change.
 *
 * Run `npm run build:reference-css` after replacing the prototype asset.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const repoRoot = path.resolve(import.meta.dirname, "..");
const prototypeHtmlPath = path.join(
  repoRoot,
  "public/orbit-reference/orbit-reference.html",
);
const outputPath = path.join(
  repoRoot,
  "public/orbit-reference/orbit-reference.generated.css",
);

// Families whose `@font-face` blocks never win a font-family lookup on a product
// page (see the module comment). Keep this list in sync with the `--ff*` tokens.
const UNUSED_FONT_FAMILIES = ["Inter", "Inter Tight", "Geist Mono"];

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractBundlerScript(srcDoc, type) {
  const escapedType = type.replace("/", "\\/");
  return srcDoc.match(new RegExp(`<script type="${escapedType}">([\\s\\S]*?)<\\/script>`))?.[1];
}

function unpackTemplate(srcDoc) {
  const manifestText = extractBundlerScript(srcDoc, "__bundler/manifest");
  const templateText = extractBundlerScript(srcDoc, "__bundler/template");

  if (!manifestText || !templateText) return srcDoc;

  const manifest = JSON.parse(manifestText);
  let template = JSON.parse(templateText);

  for (const [uuid, entry] of Object.entries(manifest)) {
    const compressed = Buffer.from(entry.data, "base64");
    const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
    const dataUrl = `data:${entry.mime};base64,${bytes.toString("base64")}`;
    template = template.split(uuid).join(dataUrl);
  }

  return template;
}

/** Drops `@font-face` blocks whose family is in UNUSED_FONT_FAMILIES. */
export function stripUnusedFontFaces(css) {
  return css.replace(/@font-face\s*\{[^}]*\}\s*/g, (block) => {
    const family = block.match(/font-family:\s*['"]([^'"]+)['"]/)?.[1];
    return family && UNUSED_FONT_FAMILIES.includes(family) ? "" : block;
  });
}

export function readPrototypeStyleText() {
  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(
    /<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/,
  )?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const template = unpackTemplate(decodeHtmlAttribute(srcDoc));

  return [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");
}

const raw = readPrototypeStyleText();
const stripped = stripUnusedFontFaces(raw);

fs.writeFileSync(outputPath, stripped, "utf8");

const asKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `orbit-reference.generated.css: ${asKb(raw.length)} -> ${asKb(stripped.length)} ` +
    `(dropped ${UNUSED_FONT_FAMILIES.join(", ")} @font-face blocks)`,
);
