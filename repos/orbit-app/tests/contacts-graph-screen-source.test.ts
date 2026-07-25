import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactsGraphScreen.tsx"),
  "utf8"
);

test("contacts graph screen can open a connection evidence review card", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /connectionDetailPath/u);
  assert.match(screenSource, /connectionEvidenceDetailToView/u);
  assert.match(screenSource, /loadConnectionEvidence/u);
  assert.match(screenSource, /client\.get<unknown>\(connectionDetailPath/u);
  assert.match(screenSource, /ConnectionEvidenceCard/u);
  assert.match(screenSource, /title="证据链"/u);
  assert.match(screenSource, /查看证据/u);
});

test("contacts graph screen can add reviewed manual evidence through the web API", () => {
  assert.match(screenSource, /buildConnectionEvidenceAddRequest/u);
  assert.match(screenSource, /addConnectionEvidence/u);
  assert.match(screenSource, /client\.post<unknown>\(request\.request\.endpoint/u);
  assert.match(screenSource, /body: request\.request\.body/u);
  assert.match(screenSource, /placeholder="写清楚这条关系为什么值得跟进"/u);
  assert.match(screenSource, /添加证据/u);
});

test("contacts graph screen can preview relationship profiles through the web API", () => {
  assert.match(screenSource, /buildConnectionProfilePreviewRequest/u);
  assert.match(screenSource, /connectionProfileToView/u);
  assert.match(screenSource, /loadConnectionProfile/u);
  assert.match(screenSource, /client\.patch<unknown>\(request\.request\.endpoint/u);
  assert.match(screenSource, /body: request\.request\.body/u);
  assert.match(screenSource, /ConnectionProfileCard/u);
  assert.match(screenSource, /title="关系画像"/u);
  assert.match(screenSource, /生成画像/u);
});
