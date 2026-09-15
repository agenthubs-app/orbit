import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for Orbit reference style tests`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("Orbit reference styles link the generated asset and keep only product overrides inline", async () => {
  const referenceStyles = await importProjectModule<{
    OrbitReferenceStyles: () => React.ReactNode;
  }>("app/(app)/app/orbit-reference-styles.tsx");

  const html = renderToStaticMarkup(referenceStyles.OrbitReferenceStyles());

  assert.match(
    html,
    /<link[^>]+href="\/orbit-reference\/orbit-reference\.generated\.css"[^>]+rel="stylesheet"/,
  );
  assert.match(html, /<style>/);
  assert.match(html, /reactReferenceIsolationStyles|data-orbit-real-page/);
  assert.ok(
    html.length < 250_000,
    "rendered product overrides must not inline the multi-megabyte prototype base",
  );
});

test("generated Orbit reference stylesheet contains the extracted prototype CSS", () => {
  const generatedPath = join(
    projectRoot,
    "public/orbit-reference/orbit-reference.generated.css",
  );
  assert.equal(existsSync(generatedPath), true);
  const css = readFileSync(generatedPath, "utf8");

  assert.match(css, /:root\s*\{/);
  assert.match(css, /orbit-home-hero/);
  assert.match(css, /orbit-top-nav/);
  assert.ok(
    css.length > 100_000,
    "generated asset should retain the extracted prototype CSS",
  );
  assert.ok(
    css.length < 500_000,
    "unused embedded font families must stay stripped from the static asset",
  );
});

test("reference CSS build writes the same static path used by the product component", () => {
  const buildSource = readFileSync(
    join(projectRoot, "scripts/build-reference-css.mjs"),
    "utf8",
  );
  const componentSource = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx"),
    "utf8",
  );

  assert.match(
    buildSource,
    /public\/orbit-reference\/orbit-reference\.generated\.css/,
  );
  assert.match(
    componentSource,
    /\/orbit-reference\/orbit-reference\.generated\.css/,
  );
  assert.doesNotMatch(componentSource, /\/api\/orbit-reference\/styles/);
});

test("reference CSS build strips only the unused embedded font families", () => {
  const buildSource = readFileSync(
    join(projectRoot, "scripts/build-reference-css.mjs"),
    "utf8",
  );

  assert.match(buildSource, /UNUSED_FONT_FAMILIES = \["Inter", "Inter Tight", "Geist Mono"\]/);
  assert.match(buildSource, /stripUnusedFontFaces\(raw\)/);
  assert.match(buildSource, /fs\.writeFileSync\(outputPath, stripped, "utf8"\)/);
});
