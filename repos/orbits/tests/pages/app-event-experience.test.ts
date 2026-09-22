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
  // 运营台 任务 1：状态/fetch/动作已原样搬入 ops-0918/use-experience-editor.ts；
  // 下面按「hook 文件 vs JSX 文件」拆分同一组断言，意图不变。
  const hook = source("app/(app)/app/events/ops-0918/use-experience-editor.ts");

  assert.match(operations, /operations\/experience/);
  assert.match(page, /EventExperienceEditor/);
  assert.match(editor, /useExperienceEditor\(eventId\)/);
  assert.match(hook, /method: "PUT"/);
  assert.match(editor, /预览（零写入）/u);
  assert.match(hook, /method: "POST"/);
  assert.match(hook, /expectedRevision/);
  assert.match(editor, /V1.*两题必答/u);
  assert.match(editor, /V2.*0–4/u);
  assert.match(hook, /活动已冻结/u);
  assert.match(editor, /introduction/);
  assert.match(editor, /accentColor/);
  assert.match(editor, /preview\.configuration\.introduction/);
  assert.match(editor, /preview\.configuration\.accentColor/);
  assert.match(editor, /活动封面继续由活动本身的可信内容提供/u);
  assert.doesNotMatch(editor, /asset:event-cover/u);
  assert.doesNotMatch(hook, /asset:event-cover/u);
  assert.doesNotMatch(editor, /https?:\/\//u);
  assert.doesNotMatch(hook, /https?:\/\//u);
});
