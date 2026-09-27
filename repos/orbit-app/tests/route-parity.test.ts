import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";

import {
  type RouteParityException,
  webOnlyRouteExceptions,
} from "./route-parity-exceptions";

const repoRoot = new URL("..", import.meta.url).pathname;
const webAppRoot = join(repoRoot, "..", "orbits", "app", "(app)", "app");
const nativeAppRoot = join(repoRoot, "app");

function routeFiles(root: string): string[] {
  const output: string[] = [];

  function walk(directory: string): void {
    readdirSync(directory).forEach((name) => {
      if (name === "node_modules" || name.startsWith(".")) {
        return;
      }

      const filePath = join(directory, name);
      const stats = statSync(filePath);

      if (stats.isDirectory()) {
        walk(filePath);
        return;
      }

      if (/\.(j|t)sx?$/u.test(name)) {
        output.push(filePath);
      }
    });
  }

  walk(root);
  return output;
}

function stripRouteGroups(routePath: string): string {
  return routePath
    .replace(/\([^/]+\)\//gu, "")
    .replace(/\([^/]+\)$/gu, "");
}

function normalizeRoute(routePath: string): string {
  const cleaned = stripRouteGroups(routePath)
    .replace(/\[([^/]+)\]/gu, "[$1]")
    .replace(/^\/+|\/+$/gu, "");

  return `/${cleaned}`;
}

function webRoute(webRoot: string, filePath: string): string | null {
  const routePath = relative(webRoot, filePath).split(sep).join("/");

  if (!/\/page\.(j|t)sx?$/u.test(routePath)) {
    return null;
  }

  return normalizeRoute(routePath.replace(/\/page\.(j|t)sx?$/u, ""));
}

function nativeRoute(nativeRoot: string, filePath: string): string | null {
  const routePath = relative(nativeRoot, filePath).split(sep).join("/");

  if (routePath.includes("/_layout.") || routePath.startsWith("_layout.")) {
    return null;
  }

  return normalizeRoute(
    routePath.replace(/\.(j|t)sx?$/u, "").replace(/\/index$/u, "")
  );
}

interface RouteParityResult {
  missingRoutes: string[];
  exceptionProblems: string[];
}

function checkRouteParity(
  webRoot: string,
  nativeRoot: string,
  exceptions: readonly RouteParityException[]
): RouteParityResult {
  const webRoutes = new Set(
    routeFiles(webRoot)
      .map((filePath) => webRoute(webRoot, filePath))
      .filter((route): route is string => route !== null)
  );
  const nativeRoutes = new Set(
    routeFiles(nativeRoot).map((filePath) => nativeRoute(nativeRoot, filePath))
  );
  const exceptionProblems: string[] = [];
  const excusedRoutes = new Set<string>();
  const seenRoutes = new Set<string>();

  exceptions.forEach(({ route, reason, decidedAt, decidedBy }) => {
    const problemsBefore = exceptionProblems.length;

    if (seenRoutes.has(route)) {
      exceptionProblems.push(`${route}: duplicate exception`);
      return;
    }
    seenRoutes.add(route);

    if (reason.trim().length === 0) {
      exceptionProblems.push(`${route}: exception has no reason`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(decidedAt)) {
      exceptionProblems.push(`${route}: decidedAt must be YYYY-MM-DD`);
    }
    if (decidedBy.trim().length === 0) {
      exceptionProblems.push(`${route}: exception has no decidedBy`);
    }
    if (!webRoutes.has(route)) {
      exceptionProblems.push(`${route}: web page no longer exists; remove the exception`);
    } else if (nativeRoutes.has(route)) {
      exceptionProblems.push(`${route}: native app now has this route; remove the exception`);
    }

    if (exceptionProblems.length === problemsBefore) {
      excusedRoutes.add(route);
    }
  });

  const missingRoutes = [...webRoutes]
    .filter((route) => !nativeRoutes.has(route) && !excusedRoutes.has(route))
    .sort();

  return { missingRoutes, exceptionProblems };
}

test("native app has a route for every web app surface", () => {
  const { missingRoutes, exceptionProblems } = checkRouteParity(
    webAppRoot,
    nativeAppRoot,
    webOnlyRouteExceptions
  );

  assert.deepEqual(exceptionProblems, []);
  assert.deepEqual(missingRoutes, []);
});

test("every web-only exception records a user decision with a reason", () => {
  assert.ok(webOnlyRouteExceptions.length > 0);
  webOnlyRouteExceptions.forEach((exception) => {
    assert.ok(exception.reason.trim().length > 0, `${exception.route} has no reason`);
    assert.equal(exception.decidedAt, "2026-09-27");
    assert.equal(exception.decidedBy, "user");
  });
});

// Fixture checks build real throwaway web/native route trees on disk and run
// the same checker the repository test uses.
function withFixture(
  webPages: string[],
  nativeFiles: string[],
  run: (webRoot: string, nativeRoot: string) => void
): void {
  const root = mkdtempSync(join(tmpdir(), "route-parity-"));
  const webRoot = join(root, "web");
  const nativeRoot = join(root, "native");
  const touch = (filePath: string) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "export default null;\n");
  };

  try {
    mkdirSync(webRoot, { recursive: true });
    mkdirSync(nativeRoot, { recursive: true });
    webPages.forEach((page) => touch(join(webRoot, page)));
    nativeFiles.forEach((file) => touch(join(nativeRoot, file)));
    run(webRoot, nativeRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const decided = { decidedAt: "2026-09-27", decidedBy: "user" };

test("a documented exception removes only its own route from the missing list", () => {
  withFixture(
    ["(main)/contacts/page.tsx", "admin/read-cost/page.tsx", "agent/plan/page.tsx"],
    ["contacts/index.tsx"],
    (webRoot, nativeRoot) => {
      const result = checkRouteParity(webRoot, nativeRoot, [
        { route: "/admin/read-cost", reason: "web admin page", ...decided },
      ]);

      assert.deepEqual(result.missingRoutes, ["/agent/plan"]);
      assert.deepEqual(result.exceptionProblems, []);
    }
  );
});

test("a new web page without a native route still fails when exceptions exist", () => {
  withFixture(
    ["admin/read-cost/page.tsx", "brand-new/page.tsx", "events/[id]/page.tsx"],
    ["events/[id].tsx"],
    (webRoot, nativeRoot) => {
      const result = checkRouteParity(webRoot, nativeRoot, [
        { route: "/admin/read-cost", reason: "web admin page", ...decided },
      ]);

      assert.deepEqual(result.missingRoutes, ["/brand-new"]);
    }
  );
});

test("an exception without a reason is reported and does not hide the route", () => {
  withFixture(["admin/read-cost/page.tsx"], [], (webRoot, nativeRoot) => {
    const result = checkRouteParity(webRoot, nativeRoot, [
      { route: "/admin/read-cost", reason: "   ", ...decided },
    ]);

    assert.deepEqual(result.missingRoutes, ["/admin/read-cost"]);
    assert.deepEqual(result.exceptionProblems, [
      "/admin/read-cost: exception has no reason",
    ]);
  });
});

test("an exception without decidedAt or decidedBy is reported", () => {
  withFixture(["admin/read-cost/page.tsx"], [], (webRoot, nativeRoot) => {
    const result = checkRouteParity(webRoot, nativeRoot, [
      { route: "/admin/read-cost", reason: "web admin page", decidedAt: "soon", decidedBy: "" },
    ]);

    assert.deepEqual(result.exceptionProblems, [
      "/admin/read-cost: decidedAt must be YYYY-MM-DD",
      "/admin/read-cost: exception has no decidedBy",
    ]);
  });
});

test("an exception for a web page that no longer exists is reported as stale", () => {
  withFixture(["contacts/page.tsx"], ["contacts.tsx"], (webRoot, nativeRoot) => {
    const result = checkRouteParity(webRoot, nativeRoot, [
      { route: "/agent/strategy", reason: "not an affairs-assistant page", ...decided },
    ]);

    assert.deepEqual(result.missingRoutes, []);
    assert.deepEqual(result.exceptionProblems, [
      "/agent/strategy: web page no longer exists; remove the exception",
    ]);
  });
});

test("an exception for a route the native app now has is reported as stale", () => {
  withFixture(["agent/plan/page.tsx"], ["agent/plan.tsx"], (webRoot, nativeRoot) => {
    const result = checkRouteParity(webRoot, nativeRoot, [
      { route: "/agent/plan", reason: "not an affairs-assistant page", ...decided },
    ]);

    assert.deepEqual(result.missingRoutes, []);
    assert.deepEqual(result.exceptionProblems, [
      "/agent/plan: native app now has this route; remove the exception",
    ]);
  });
});

test("a duplicated exception is reported", () => {
  withFixture(["agent/plan/page.tsx"], [], (webRoot, nativeRoot) => {
    const entry = { route: "/agent/plan", reason: "not an affairs-assistant page", ...decided };
    const result = checkRouteParity(webRoot, nativeRoot, [entry, entry]);

    assert.deepEqual(result.missingRoutes, []);
    assert.deepEqual(result.exceptionProblems, ["/agent/plan: duplicate exception"]);
  });
});
