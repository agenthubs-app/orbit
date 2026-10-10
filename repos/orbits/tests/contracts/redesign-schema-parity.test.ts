import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R08 review M4: the TS contracts and their zod schemas agree (see
// redesign-schema-parity.check.mts), checked under a strict tsconfig.
const DIR = join(process.cwd(), "tests", "contracts");
const tsc = (project: string) => spawnSync(process.execPath, [join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), "-p", project], { encoding: "utf8" });

test("every R08 contract and its zod schema describe the same shape", () => {
  const result = tsc(join(DIR, "tsconfig.parity.json"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("the parity check notices a drift (a field optional in zod, required in the contract)", () => {
  const probe = join(DIR, "zz-parity-probe.check.mts");
  const config = join(DIR, "tsconfig.parity-probe.json");
  try {
    writeFileSync(probe, `import { z } from "zod";
interface Contract { id: string; next: { a: string } | null }
const schema = z.object({ id: z.string().optional(), next: z.object({ a: z.string() }).nullable() });
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function expectParity<T extends true>(): T | undefined { return undefined; }
expectParity<Same<Contract, z.infer<typeof schema>>>();
`);
    writeFileSync(config, JSON.stringify({ extends: "../../tsconfig.json", compilerOptions: { strict: true, incremental: false, noEmit: true, plugins: [] }, include: ["zz-parity-probe.check.mts"] }));
    const result = tsc(config);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /TS2344/u);
  } finally {
    rmSync(probe, { force: true });
    rmSync(config, { force: true });
  }
});
