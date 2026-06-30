import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
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

test("Orbit reference styles render as an external stylesheet link", async () => {
  const referenceStyles = await importProjectModule<{
    OrbitReferenceStyles: () => {
      props: {
        dangerouslySetInnerHTML?: unknown;
        href?: string;
        rel?: string;
      };
      type: string;
    };
  }>("app/(app)/app/orbit-reference-styles.tsx");

  const element = referenceStyles.OrbitReferenceStyles();

  assert.equal(element.type, "link");
  assert.equal(element.props.rel, "stylesheet");
  assert.equal(element.props.href, "/api/orbit-reference/styles");
  assert.equal(element.props.dangerouslySetInnerHTML, undefined);
});

test("Orbit reference stylesheet route serves extracted prototype CSS", async () => {
  const route = await importProjectModule<{
    GET: () => Response;
  }>("app/api/orbit-reference/styles/route.ts");

  const response = route.GET();
  const css = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/css/);
  assert.match(response.headers.get("cache-control") ?? "", /max-age/);
  assert.match(css, /data-orbit-real-page/);
  assert.match(css, /Orbit landing/);
  assert.ok(
    css.length > 1_000_000,
    "external stylesheet should still contain the extracted prototype CSS",
  );
});
