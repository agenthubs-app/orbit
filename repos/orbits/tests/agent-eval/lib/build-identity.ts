/**
 * The eval server's build identity (agent-design AG04 run-02).
 *
 * run-01's first dev run went to the previous server: `agent-eval:env -- --build` built, saw a server
 * running and kept it. Now:
 * - `--build` replaces a running server (stop → build → record identity → start), see refreshServer();
 * - the build writes `.next/agent-eval-build.json` (the commit it was built from, and whether the tree
 *   was dirty); the eval preload serves it on its loopback control endpoint (`/__agent-eval/state`),
 *   which exists only in the eval server — a production server never loads the preload;
 * - every run records it in manifest.json; a `--gate` run refuses to start unless the build is HEAD
 *   built from a clean tree and the tree is still clean (checkGateIdentity()).
 *
 * Build noise: `next build` rewrites next-env.d.ts's routes import (`.next/dev/types` ↔ `.next/types`).
 * When that line is the file's only change it is not a change to the tree (classifyDirty()).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ORBITS_ROOT } from "./paths";

export interface BuildIdentity {
  commit: string;
  dirty: boolean;
  dirtyPaths: string[];
  builtAt: string;
  nextBuildId: string | null;
}

export const BUILD_IDENTITY_FILE = path.join(ORBITS_ROOT, ".next", "agent-eval-build.json");

const NEXT_ENV = /(^|\/)next-env\.d\.ts$/u;
const ROUTES_IMPORT = /^[+-]import "\.\/\.next\/(dev\/)?types\/routes\.d\.ts";$/u;

/** Changed lines of a diff (headers, hunks and context left out). */
function changedLines(diff: string): string[] {
  return diff.split("\n").filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"));
}

/** Porcelain status lines → the tracked paths that changed, and those that are only the build's noise. */
export function classifyDirty(statusLines: readonly string[], diffOf: (file: string) => string): { dirty: string[]; noise: string[] } {
  const dirty: string[] = [];
  const noise: string[] = [];
  for (const line of statusLines) {
    if (!line.trim() || line.startsWith("??")) continue;
    const file = line.slice(3).trim().replace(/^.* -> /u, "");
    if (NEXT_ENV.test(file)) {
      const lines = changedLines(diffOf(file));
      if (lines.length > 0 && lines.every((changed) => ROUTES_IMPORT.test(changed))) {
        noise.push(file);
        continue;
      }
    }
    dirty.push(file);
  }
  return { dirty, noise };
}

const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** HEAD and the tree's state, from the repository that holds `cwd`. */
export function readTree(cwd = ORBITS_ROOT): { head: string; dirty: string[]; noise: string[] } {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const status = git(root, ["status", "--porcelain", "--untracked-files=no"]).split("\n");
  return { head, ...classifyDirty(status, (file) => git(root, ["diff", "HEAD", "--", file])) };
}

export function writeBuildIdentity(cwd = ORBITS_ROOT): BuildIdentity {
  const tree = readTree(cwd);
  const buildIdFile = path.join(ORBITS_ROOT, ".next", "BUILD_ID");
  const identity: BuildIdentity = {
    builtAt: new Date().toISOString(),
    commit: tree.head,
    dirty: tree.dirty.length > 0,
    dirtyPaths: tree.dirty,
    nextBuildId: fs.existsSync(buildIdFile) ? fs.readFileSync(buildIdFile, "utf8").trim() : null,
  };
  fs.writeFileSync(BUILD_IDENTITY_FILE, JSON.stringify(identity, null, 2));
  return identity;
}

/** Why a gate run must not start on this server (empty: it may). */
export function checkGateIdentity(input: { build: BuildIdentity | null | undefined; head: string; dirty: readonly string[] }): string[] {
  const problems: string[] = [];
  if (!input.build) return ["the eval server reports no build identity (rebuild with npm run agent-eval:env -- --build)"];
  if (input.build.commit !== input.head) problems.push(`the eval server was built from ${input.build.commit.slice(0, 10)}, but HEAD is ${input.head.slice(0, 10)} (rebuild with npm run agent-eval:env -- --build)`);
  if (input.build.dirty) problems.push(`the eval server was built from a dirty tree (${input.build.dirtyPaths.join(", ")})`);
  if (input.dirty.length) problems.push(`the working tree is dirty (${input.dirty.join(", ")}); commit first`);
  return problems;
}

export interface ServerSteps {
  running(): Promise<boolean>;
  stop(): Promise<void>;
  build(): Promise<void>;
  recordIdentity(): Promise<void>;
  start(): Promise<void>;
}

/** `--build` never leaves the old server serving: stop it, build, record what was built, start. */
export async function refreshServer(steps: ServerSteps, options: { build: boolean }): Promise<void> {
  const running = await steps.running();
  if (options.build) {
    if (running) await steps.stop();
    await steps.build();
    await steps.recordIdentity();
    await steps.start();
    return;
  }
  if (!running) await steps.start();
}
