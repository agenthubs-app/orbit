// Writes a copy of the onboarding boards with every App font size put through the App type scale (UX-1), for the pixel gate.
// Usage (from repos/orbit-app): node scripts/visual/onboarding-ux1-board.mjs <out dir>; then serve it: python3 -m http.server 3321
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: onboarding-ux1-board.mjs <out dir>");
const root = resolve(import.meta.dirname, "../../../..");
const boards = join(root, "docs/designs/redesign-2026-10");
const target = join(resolve(out), "redesign-2026-10");
const table = /Object\.freeze\(\{(.*?)\}\)/su.exec(readFileSync(join(root, "repos/orbit-app/src/design/type-scale.ts"), "utf8"))[1];
const replace = (text, from, to) => { if (text.split(from).length !== 2) throw new Error(`board changed: ${from}`); return text.replace(from, () => to); };

let html = readFileSync(join(boards, "onboarding-3step-proposal.html"), "utf8");
html = replace(html, "document.querySelectorAll('.scrollto').forEach(m => {", `const UX1 = {${table}};
{ const todo = [];
  document.querySelectorAll('.phone:not(.mweb) .scroll *, .phone:not(.mweb) .foot *').forEach(e => { if (e.closest('svg')) return; const c = getComputedStyle(e); const f = parseFloat(c.fontSize); const m = UX1[f] ?? f; const l = parseFloat(c.lineHeight); todo.push([e, m, Number.isNaN(l) ? null : l / f * m]); });
  // Line breaks as iOS makes them: headings by phrase; the notice's first line is 285 wide in a 284 box and stays on one line there.
  document.querySelectorAll('.phone:not(.mweb) .h1').forEach(e => { e.lang = 'ja'; e.style.wordBreak = 'auto-phrase'; });
  document.querySelectorAll('.phone:not(.mweb) .once > div').forEach(e => { e.style.letterSpacing = '-0.06px'; });
  todo.forEach(([e, m, l]) => { e.style.fontSize = m + 'px'; if (l) e.style.lineHeight = l + 'px'; }); }
document.querySelectorAll('.scrollto').forEach(m => {`);
// The gate moves the frame, which resets a scroll offset: the same offset as a margin.
html = replace(html, "  sc.scrollTop = m.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - (+m.dataset.off || 70);",
  "  const off = m.getBoundingClientRect().top - sc.getBoundingClientRect().top - (+m.dataset.off || 70); sc.firstElementChild.style.marginTop = -off + 'px'; sc.dataset.off = off;");
// Step ① runs past the first screen: A1 and A2 again, scrolled 400 (A1b, A2b), appended so board indexes stay; the suite finds them by title, as the design file itself still grows.
html = replace(html, "docNav(''); orbitChrome();", `{ const frames = [...document.querySelectorAll('.phone:not(.mweb)')]; const holder = frames.at(-1).closest('.boards');
  for (const k of [0, 1]) { const board = frames[k].closest('.board').cloneNode(true); board.querySelector('.board-label').textContent = ['A1b', 'A2b'][k] + ' second screen'; board.querySelector('.scroll').firstElementChild.style.marginTop = '-400px'; holder.append(board); } }
docNav(''); orbitChrome();`);
// Decided 2026-11-25: two tones, as on Web.
html = html.replaceAll("<button>やわらかめ</button>", "");
mkdirSync(target, { recursive: true });
rmSync(join(target, "kit"), { force: true, recursive: false });
symlinkSync(join(boards, "kit"), join(target, "kit"));
writeFileSync(join(target, "onboarding-3step-proposal.html"), html);
