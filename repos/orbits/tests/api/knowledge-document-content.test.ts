import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);
  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);
  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

type KnowledgeDocumentRoute = {
  GET: (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  dynamic?: string;
};

test("dev knowledge document route returns markdown for whitelisted document ids", async () => {
  const route = await importProjectModule<KnowledgeDocumentRoute>(
    "app/api/dev/knowledge/documents/[id]/route.ts",
  );

  const response = await route.GET(
    new Request("https://orbit.local/api/dev/knowledge/documents/technical-design"),
    { params: Promise.resolve({ id: "technical-design" }) },
  );
  const body = await response.json();

  assert.equal(route.dynamic, "force-dynamic");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-orbit-runtime-boundary"), "developer-admin");
  assert.equal(
    response.headers.get("x-orbit-privacy"),
    "developer-debug-document-content",
  );
  assert.equal(body.success, true);
  assert.equal(body.data.id, "technical-design");
  assert.equal(body.data.titleZh, "Orbit 技术设计");
  assert.equal(body.data.sourcePath, "docs/designs/orbit_technical_design.md");
  assert.match(body.data.markdown, /# Orbit 技术设计文档/);
  assert.match(body.data.markdown, /## 1\. 文档目标/);
  assert.match(body.data.markdown, /```json/);
});

test("dev knowledge document route rejects ids outside the knowledge manifest", async () => {
  const route = await importProjectModule<KnowledgeDocumentRoute>(
    "app/api/dev/knowledge/documents/[id]/route.ts",
  );

  const response = await route.GET(
    new Request("https://orbit.local/api/dev/knowledge/documents/../../AGENTS.md"),
    { params: Promise.resolve({ id: "../../AGENTS.md" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.match(body.error.message, /document was not found/i);
});

test("dev knowledge document route is hidden in production runtime", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const route = await importProjectModule<KnowledgeDocumentRoute>(
    "app/api/dev/knowledge/documents/[id]/route.ts",
  );

  process.env.NODE_ENV = "production";
  try {
    const response = await route.GET(
      new Request("https://orbit.local/api/dev/knowledge/documents/technical-design"),
      { params: Promise.resolve({ id: "technical-design" }) },
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
