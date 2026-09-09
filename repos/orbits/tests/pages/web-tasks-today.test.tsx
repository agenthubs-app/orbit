import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import AppTodayPageContent from "../../app/(app)/app/today/today-page-content";

test("Today exposes canonical task management without removing its decision and schedule sections", async () => {
  const html = renderToStaticMarkup(await AppTodayPageContent({ ledgerService: null }));
  assert.ok(html.includes('href="/app/tasks"'), "Today needs a reachable all-tasks entry");
  for (const marker of ["data-orbit-today-spine-column", "data-orbit-today-decide-column", "data-orbit-today-collapsed-column"]) {
    assert.ok(html.includes(marker), `existing ${marker} must remain`);
  }
  assert.ok(html.includes('id="arrangements"'), "the actual spine column must retain the arrangements anchor");
});
