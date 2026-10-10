import { build, type Plugin } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// R06: renders the real orbit-2026 components in Chromium. CSS Modules go through
// esbuild's `local-css` loader (the same scoping Next.js does), so class names,
// tokens and media queries are the shipped ones; the R01 tokens.css is injected as
// the root layout does. `entry` is a TSX module that renders into #root.
const root = process.cwd();

/** `stubs`: module specifier pattern → replacement source (for next/navigation, next-auth …). */
export async function bundle(entry: string, stubs: Record<string, string> = {}): Promise<{ js: string; css: string }> {
  const stubPlugin: Plugin = {
    name: "orbit-2026-stubs",
    setup(plugin) {
      Object.entries(stubs).forEach(([pattern, source], index) => {
        plugin.onResolve({ filter: new RegExp(pattern) }, () => ({ path: String(index), namespace: "orbit-2026-stub" }));
        plugin.onLoad({ filter: new RegExp(`^${index}$`), namespace: "orbit-2026-stub" }, () => ({ contents: source, loader: "tsx", resolveDir: root }));
      });
    },
  };
  const result = await build({
    stdin: { contents: entry, loader: "tsx", resolveDir: root },
    bundle: true,
    write: false,
    outdir: "out",
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".module.css": "local-css", ".css": "css" },
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [stubPlugin],
  });
  const js = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  const css = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  return { js, css };
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function open(browser: Browser, code: { js: string; css: string }, options: { width?: number; dark?: boolean; reducedMotion?: boolean; html?: string } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1440, height: 900 }, colorScheme: options.dark ? "dark" : "light", reducedMotion: options.reducedMotion ? "reduce" : "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="ja"><head><style>body{margin:0;background:var(--bg)}</style></head><body>${options.html ?? '<div id="root"></div>'}</body></html>`);
  await page.addStyleTag({ path: `${root}/app/(app)/app/orbit-2026/tokens.css` });
  if (code.css) await page.addStyleTag({ content: code.css });
  await page.addScriptTag({ content: code.js });
  return page;
}

export function errorsOf(page: Page): string[] {
  return (page as Page & { errors?: string[] }).errors ?? [];
}

/** WCAG contrast of two computed CSS colours (rgb / rgba over the page background). */
export function contrast(foreground: string, background: string): number {
  const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const c = [r!, g!, b!].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const a = lum(parse(foreground)), b = lum(parse(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
