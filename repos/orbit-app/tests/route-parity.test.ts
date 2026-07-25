import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

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

function webRoute(filePath: string): string | null {
  const routePath = relative(webAppRoot, filePath).split(sep).join("/");

  if (!/\/page\.(j|t)sx?$/u.test(routePath)) {
    return null;
  }

  return normalizeRoute(routePath.replace(/\/page\.(j|t)sx?$/u, ""));
}

function nativeRoute(filePath: string): string | null {
  const routePath = relative(nativeAppRoot, filePath).split(sep).join("/");

  if (routePath.includes("/_layout.") || routePath.startsWith("_layout.")) {
    return null;
  }

  return normalizeRoute(
    routePath.replace(/\.(j|t)sx?$/u, "").replace(/\/index$/u, "")
  );
}

test("native app has a route for every web app surface", () => {
  const webRoutes = routeFiles(webAppRoot).map(webRoute).filter(Boolean);
  const nativeRoutes = new Set(routeFiles(nativeAppRoot).map(nativeRoute).filter(Boolean));
  const missingRoutes = webRoutes
    .filter((route) => !nativeRoutes.has(route))
    .sort();

  assert.deepEqual(missingRoutes, []);
});
