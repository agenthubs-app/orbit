import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const prototypeHtmlPath = path.join(
  process.cwd(),
  "public/orbit-reference/orbit-reference.html",
);

let cachedStyleText: string | undefined;
const cachedScriptText = new Map<string, string>();

const reactReferenceIsolationStyles = `
[data-orbit-real-page] button,
[data-orbit-real-page] input,
[data-orbit-real-page] select,
[data-orbit-real-page] textarea {
  background: initial;
  border: initial;
  border-radius: initial;
  color: inherit;
  font: inherit;
  letter-spacing: 0;
  line-height: normal;
  margin: 0;
  max-width: none;
  height: auto;
  min-height: auto;
  min-width: 0;
  padding: 0;
}

[data-orbit-real-page] button {
  font-weight: inherit;
}

[data-orbit-real-page] .orbit-lang-fixed {
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  color: var(--text);
  cursor: pointer;
  font-family: var(--ff);
  font-size: 12.5px;
  line-height: normal;
  padding: 5px 12px;
  position: fixed;
  right: 12px;
  top: 9px;
  white-space: nowrap;
  z-index: 9999;
}

.orbit-party-page button,
.orbit-party-graph-screen button {
  min-width: 0;
}

.orbit-party-auth-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
}

.orbit-live-checkin-page button {
  line-height: normal;
}

.orbit-live-checkin-page button:disabled {
  opacity: 1;
}

.orbit-live-checkin-page .orbit-party-icon-button {
  font-size: 13.3333px;
  font-weight: 400;
  line-height: normal;
  padding: 1px 6px;
}

.orbit-host-admin-page button,
.orbit-admin-access-page button,
.orbit-platform-page button {
  min-width: 0;
}

.orbit-host-admin-page .orbit-host-nav-item {
  background: transparent;
  border-radius: 10px;
  color: var(--text-2);
  display: flex;
  font-size: 14px;
  font-weight: 550;
  gap: 11px;
  height: 40px;
  min-height: 40px;
  padding: 10px 12px;
}

.orbit-host-admin-page .orbit-host-nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 550;
}

.orbit-host-admin-page .orbit-host-exit {
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  font-family: var(--ff);
  font-size: 13.5px;
  gap: 10px;
  padding: 10px 12px;
}

.orbit-platform-page .orbit-platform-nav-item {
  border-radius: 10px;
  color: #AAA8C8;
  font-size: 14px;
  font-weight: 550;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
}

.orbit-platform-page .orbit-platform-nav-item.is-active {
  color: #fff;
}

.orbit-platform-page .orbit-host-exit {
  border-radius: 10px;
  font-size: 13.5px;
  padding: 10px 12px;
}

@media (max-width: 760px) {
  .orbit-platform-page .orbit-platform-nav-item {
    height: 42px;
    min-height: 42px;
    padding: 0 8px;
  }

  .orbit-host-admin-page .orbit-host-stat-tile.card {
    border-radius: var(--r-md);
  }
}

.orbit-host-admin-page .orbit-host-portfolio-card.card {
  border: 0;
  border-radius: 18px;
}

.orbit-host-admin-page .orbit-host-portfolio-cover {
  border-radius: 0 !important;
}

.orbit-host-admin-page .orbit-host-event-stat-cover {
  border-radius: 0 !important;
}

[data-orbit-real-page] button:disabled,
[data-orbit-real-page] input:disabled,
[data-orbit-real-page] select:disabled,
[data-orbit-real-page] textarea:disabled {
  opacity: 1;
}

[data-orbit-real-page] textarea {
  resize: none;
}

[data-orbit-real-page] .mono {
  font-family: var(--ff-mono);
}

[data-orbit-real-page].orbit-shell {
  display: block;
  gap: normal;
  margin: 0;
  max-width: none;
  min-height: 100dvh;
  width: 100%;
}

[data-orbit-real-page].orbit-page,
[data-orbit-real-page].orbit-personal-page {
  display: block;
  gap: normal;
  margin: 0;
  max-width: none;
  min-height: 100dvh;
  padding: 0;
  place-items: normal;
  width: 100%;
}

[data-orbit-real-page] .btn {
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 550;
  gap: 8px;
  height: 44px;
  justify-content: center;
  letter-spacing: 0;
  padding: 0 20px;
  text-decoration: none;
  transition: background .15s, border-color .15s, color .15s, transform .08s, box-shadow .15s;
  user-select: none;
  white-space: nowrap;
}

[data-orbit-real-page] .btn:active {
  transform: translateY(0.5px);
}

[data-orbit-real-page] .btn-primary {
  background: var(--accent);
  box-shadow: var(--sh-xs);
  color: var(--on-accent);
}

[data-orbit-real-page] .btn-primary:hover {
  background: var(--accent-hover);
}

[data-orbit-real-page] .btn-dark {
  background: var(--ink);
  color: #fff;
}

[data-orbit-real-page] .btn-dark:hover {
  background: #000;
}

[data-orbit-real-page] .btn-soft {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page] .btn-soft:hover {
  background: #E5E3FA;
}

[data-orbit-real-page] .btn-ghost {
  background: var(--surface);
  border-color: var(--border-2);
  box-shadow: var(--sh-xs);
  color: var(--text);
}

[data-orbit-real-page] .btn-ghost:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

[data-orbit-real-page] .btn-quiet {
  background: transparent;
  color: var(--text-2);
}

[data-orbit-real-page] .btn-quiet:hover {
  background: var(--surface-3);
  color: var(--text);
}

[data-orbit-real-page] .btn-sm {
  border-radius: var(--r-xs);
  font-size: 13.5px;
  height: 36px;
  padding: 0 14px;
}

[data-orbit-real-page] .btn-lg {
  border-radius: var(--r-md);
  font-size: 16px;
  height: 50px;
  padding: 0 24px;
}

[data-orbit-real-page] .btn-block {
  width: 100%;
}

[data-orbit-real-page] .btn[disabled],
[data-orbit-real-page] .btn.is-disabled {
  background: var(--surface-3);
  border-color: transparent;
  box-shadow: none;
  color: var(--text-4);
  cursor: not-allowed;
}

[data-orbit-real-page] .orbit-agent-btn {
  align-items: center;
  background: var(--accent-soft);
  border: 1px solid rgba(99,89,233,0.22);
  border-radius: 999px;
  color: var(--accent);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--ff);
  font-size: 14px;
  font-weight: 600;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  text-decoration: none;
  white-space: nowrap;
}

[data-orbit-real-page] .orbit-agent-btn:hover {
  background: rgba(99,89,233,0.16);
}

[data-orbit-real-page] .orbit-top-nav .orbit-nav-link {
  font-weight: 550;
}

[data-orbit-real-page="agent"] .orbit-nav-link {
  font-weight: 550;
}

[data-orbit-real-page] .chip {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 500;
  gap: 6px;
  height: 30px;
  letter-spacing: 0;
  min-height: auto;
  padding: 0 12px;
  transition: background .14s, color .14s, border-color .14s;
  white-space: nowrap;
}

[data-orbit-real-page] .chip:hover {
  background: var(--surface-3);
}

[data-orbit-real-page] .chip.is-active {
  background: var(--ink);
  color: #fff;
}

[data-orbit-real-page] .chip-accent {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page] .chip.badge-live {
  background: var(--live-soft);
  color: var(--live);
}

[data-orbit-real-page="explore"] .orbit-map-rail button,
[data-orbit-real-page="explore"] .orbit-map-canvas button,
[data-orbit-real-page="explore"] .orbit-map-canvas-inner button {
  font-size: 13.3333px;
  font-weight: 400;
}

[data-orbit-real-page="home-events"] button.orbit-account-event-card {
  font-size: 13.3333px;
  font-weight: 400;
}

[data-orbit-real-page] .card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-sm);
}

[data-orbit-real-page] .card-hover {
  cursor: pointer;
  transition: box-shadow .18s, transform .18s, border-color .18s;
}

[data-orbit-real-page] .card-hover:hover {
  border-color: var(--border-2);
  box-shadow: var(--sh-md);
  transform: translateY(-2px);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-person.card {
  border-radius: var(--r-md);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-seat.chip {
  background: var(--accent-soft);
  color: var(--accent);
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-search input {
  color: var(--text);
  font-size: 14px;
  padding: 1px 2px;
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-filter.btn {
  padding: 0;
}

[data-orbit-real-page].orbit-party-page .orbit-party-network-tags .chip {
  font-size: 12px;
  height: 26px;
}

[data-orbit-real-page] .orbit-graph-canvas {
  background:
    radial-gradient(circle at 50% 45%, var(--surface), var(--bg-sunken) 62%),
    var(--bg-sunken);
  min-height: 560px;
  overflow: hidden;
  position: relative;
}

[data-orbit-real-page] .orbit-graph-canvas svg {
  display: block;
  min-height: 560px;
}

@media (max-width: 640px) {
  [data-orbit-real-page] .orbit-graph-canvas,
  [data-orbit-real-page] .orbit-graph-canvas svg {
    min-height: 460px;
  }
}

[data-orbit-real-page] .field {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: 15px;
  height: 48px;
  outline: none;
  padding: 0 14px;
  transition: border-color .14s, box-shadow .14s, background .14s;
  width: 100%;
}

[data-orbit-real-page] .field::placeholder {
  color: var(--text-4);
}

[data-orbit-real-page] .field:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 4px var(--accent-ring);
}
`;

interface BundledAsset {
  compressed?: boolean;
  data: string;
  mime: string;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractBundlerScript(srcDoc: string, type: string): string | undefined {
  const escapedType = type.replace("/", "\\/");
  return srcDoc.match(new RegExp(`<script type="${escapedType}">([\\s\\S]*?)<\\/script>`))?.[1];
}

function unpackTemplate(srcDoc: string) {
  const manifestText = extractBundlerScript(srcDoc, "__bundler/manifest");
  const templateText = extractBundlerScript(srcDoc, "__bundler/template");

  if (!manifestText || !templateText) return srcDoc;

  const manifest = JSON.parse(manifestText) as Record<string, BundledAsset>;
  let template = JSON.parse(templateText) as string;

  for (const [uuid, entry] of Object.entries(manifest)) {
    const compressed = Buffer.from(entry.data, "base64");
    const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
    const dataUrl = `data:${entry.mime};base64,${bytes.toString("base64")}`;
    template = template.split(uuid).join(dataUrl);
  }

  return template;
}

function readReferenceStyles() {
  if (cachedStyleText) return cachedStyleText;

  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(/<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/)?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const template = unpackTemplate(decodeHtmlAttribute(srcDoc));
  cachedStyleText = [...template.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");

  return cachedStyleText;
}

export function readPrototypeScriptAsset(uuid: string) {
  const cached = cachedScriptText.get(uuid);
  if (cached) return cached;

  const html = fs.readFileSync(prototypeHtmlPath, "utf8");
  const srcDoc = html.match(/<iframe class="browser-frame"[^>]*srcdoc="([\s\S]*?)"><\/iframe>/)?.[1];

  if (!srcDoc) {
    throw new Error("Orbit reference iframe srcdoc was not found.");
  }

  const manifestText = extractBundlerScript(decodeHtmlAttribute(srcDoc), "__bundler/manifest");

  if (!manifestText) {
    throw new Error("Orbit reference manifest was not found.");
  }

  const manifest = JSON.parse(manifestText) as Record<string, BundledAsset>;
  const entry = manifest[uuid];

  if (!entry) {
    throw new Error(`Orbit reference script asset ${uuid} was not found.`);
  }

  const compressed = Buffer.from(entry.data, "base64");
  const bytes = entry.compressed ? zlib.gunzipSync(compressed) : compressed;
  const script = bytes.toString("utf8");

  cachedScriptText.set(uuid, script);
  return script;
}

function scriptContent(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

export function OrbitReferenceThreeRuntime() {
  const threeScript = readPrototypeScriptAsset("4636af91-bda9-4959-bb19-8ab1c003d4e6");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: scriptContent(threeScript) }} />
      <script dangerouslySetInnerHTML={{ __html: "window.__orbitPrototypeThreeReady = !!window.THREE;" }} />
    </>
  );
}

export function OrbitReferenceStyles() {
  return <style dangerouslySetInnerHTML={{ __html: `${readReferenceStyles()}\n${reactReferenceIsolationStyles}` }} />;
}
