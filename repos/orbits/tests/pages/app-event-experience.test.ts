import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(projectRoot, path), "utf8");

test("organizer operations exposes the bounded event experience editor", () => {
  const operations = source(
    "app/(app)/app/events/[id]/operations/event-operations-admin-workspace.tsx",
  );
  const editor = source(
    "app/(app)/app/events/[id]/operations/experience/event-experience-editor.tsx",
  );
  const page = source(
    "app/(app)/app/events/[id]/operations/experience/page.tsx",
  );

  assert.match(operations, /operations\/experience/);
  assert.match(page, /EventExperienceEditor/);
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /预览（零写入）/u);
  assert.match(editor, /method: "POST"/);
  assert.match(editor, /expectedRevision/);
  assert.match(editor, /V1.*两题必答/u);
  assert.match(editor, /V2.*0–4/u);
  assert.match(editor, /活动已冻结/u);
  assert.match(editor, /introduction/);
  assert.match(editor, /accentColor/);
  assert.match(editor, /preview\.configuration\.introduction/);
  assert.match(editor, /preview\.configuration\.accentColor/);
  assert.match(editor, /活动封面继续由活动本身的可信内容提供/u);
  assert.doesNotMatch(editor, /asset:event-cover/u);
  assert.doesNotMatch(editor, /https?:\/\//u);
});
