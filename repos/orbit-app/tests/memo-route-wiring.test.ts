import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("four legacy memo URLs enter the new screens and keep the contact-scoped route", () => {
  const files = [
    ["app/notes/index.tsx", "MemoListScreen"],
    ["app/notes/new.tsx", "NewMemoScreen"],
    ["app/notes/[id].tsx", "MemoDetailScreen"],
    ["app/notes/[id]/edit.tsx", "EditMemoScreen"],
  ] as const;
  for (const [file, screen] of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`src/screens/memo/${screen}`));
    assert.match(source, /withOrbitPrivateRoute/u);
  }
  assert.match(readFileSync("app/notes/index.tsx", "utf8"), /LegacyTaskRedirect/u);
});
