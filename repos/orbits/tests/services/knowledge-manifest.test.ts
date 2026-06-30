import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../shared/knowledge/knowledge-manifest";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("app knowledge manifest exposes Chinese project knowledge without parent-directory reads", () => {
  assert.equal(ORBIT_KNOWLEDGE_MANIFEST.schemaVersion, 1);
  assert.match(ORBIT_KNOWLEDGE_MANIFEST.titleZh, /知识库/);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.documents.length >= 20);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.topicPages.length >= 5);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.recentHistory.length >= 1);
  assert.ok(ORBIT_KNOWLEDGE_MANIFEST.learnings.length >= 3);

  for (const doc of ORBIT_KNOWLEDGE_MANIFEST.documents) {
    assert.match(doc.titleZh, /[\u4e00-\u9fff]/);
    assert.match(doc.summaryZh, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(doc.sourcePath, /^harness-state\/runs\//);
  }

  const source = readFileSync(
    join(projectRoot, "shared/knowledge/knowledge-manifest.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\.\.\//);
  assert.doesNotMatch(source, /node:fs|from "fs"|readFileSync/);
});
