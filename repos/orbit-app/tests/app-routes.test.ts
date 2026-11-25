import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { APP_ROUTES, appRouteParams } from "../src/view-models/app-routes";

const app = new URL("../app", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);

test("the route table is exactly the pages under app/", () => {
  const routes = files(app).filter(file => file.endsWith(".tsx")).map(file => `/${relative(app, file)}`.replace(/\.tsx$/u, ""))
    .filter(route => !/\/_layout$|\/\+html$|\[\.\.\./u.test(route)).map(route => route.replace(/\/\([^)]*\)/gu, "").replace(/\/index$/u, "") || "/");
  assert.deepEqual([...APP_ROUTES], [...new Set(routes)].sort());
});

test("which params belong to the path; a written-out page wins over a dynamic one", () => {
  assert.deepEqual(appRouteParams("/events/e1/participants/p1"), ["id", "participantId"]);
  assert.deepEqual(appRouteParams("/contacts/new/scan/b1"), ["batchId"]);
  assert.deepEqual(appRouteParams("/contacts/list"), []);
  assert.deepEqual(appRouteParams("/contacts/c1"), ["id"]);
  assert.deepEqual(appRouteParams("/events/assessments/a1"), ["id"]);
  assert.deepEqual(appRouteParams("/"), []);
  assert.equal(appRouteParams("/nowhere/at/all"), null);
});
