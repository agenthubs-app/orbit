/**
 * Worlds changed wholesale by a patch (eval/README.md §7 「补丁」): `replace`, `replace_B` and `replace_platform_events`
 * cannot be laid over a restored snapshot, so `agent-eval:seed` writes such a world into its own snapshot
 * `<world>+<patch>` (same accounts, the replaced parts taken from the patch) and the runner restores that one.
 */
import { worldRecords } from "./bulk-generator";
import { loadAreaFiles, type AreaFile } from "./cases";
import { isReplacingPatch, loadWorld, replaceRecords, snapshotKey, type FixtureRecord, type PatchDefinition, type WorldFixture } from "./world";
import { sha256, stableStringify } from "./yaml";

export interface NamedPatch {
  name: string;
  patch: PatchDefinition;
}

/** A case's patches in order (a name defined nowhere is left out; the case checker reports it). */
export function casePatchDefinitions(names: readonly string[] | undefined, world: WorldFixture, filePatches: Record<string, unknown>): NamedPatch[] {
  return (names ?? []).flatMap((name) => {
    const patch = (world.patches[name] ?? filePatches[name]) as PatchDefinition | undefined;
    return patch ? [{ name, patch }] : [];
  });
}

/** The one replacing patch of a case, or null; more than one is an error (they would each replace the same world). */
export function replacingPatchOf(patches: readonly NamedPatch[]): NamedPatch | null {
  const replacing = patches.filter((item) => isReplacingPatch(item.patch));
  if (replacing.length > 1) throw new Error(`patches ${replacing.map((item) => item.name).join(" and ")} both replace the world; a case may use one`);
  return replacing[0] ?? null;
}

export function patchSha256(patch: PatchDefinition): string {
  return sha256(stableStringify(patch));
}

/** The replacing patches the cases of these area files use, by snapshot key (`<world>+<patch>`). */
export function replacingSnapshots(areaFiles: readonly AreaFile[], worlds: readonly string[]): Map<string, { world: string; name: string; patch: PatchDefinition }> {
  const out = new Map<string, { world: string; name: string; patch: PatchDefinition }>();
  for (const file of areaFiles) {
    for (const testCase of file.cases) {
      if (!worlds.includes(testCase.world)) continue;
      const replacing = replacingPatchOf(casePatchDefinitions(testCase.patches, loadWorld(testCase.world), file.new_patches ?? {}));
      if (!replacing) continue;
      const key = snapshotKey(testCase.world, replacing.name);
      const known = out.get(key);
      if (known && patchSha256(known.patch) !== patchSha256(replacing.patch)) throw new Error(`two different patches are named ${replacing.name} (${testCase.id})`);
      out.set(key, { name: replacing.name, patch: replacing.patch, world: testCase.world });
    }
  }
  return out;
}

/**
 * What a snapshot key names: the world, and for `<world>+<patch>` the patch, looked up in the world file, then the
 * visible area files, then the sealed ones (a sealed patch only reaches a key through a --sealed run or seed).
 */
export function resolveSnapshotKey(key: string): { world: string; patch: NamedPatch | null } {
  const at = key.indexOf("+");
  if (at < 0) return { patch: null, world: key };
  const world = key.slice(0, at);
  const name = key.slice(at + 1);
  const fixture = loadWorld(world);
  if (fixture.patches[name]) return { patch: { name, patch: fixture.patches[name] }, world };
  for (const sealed of [false, true]) {
    const found = loadAreaFiles({ sealed }).filter((file) => file.sealed === sealed && file.new_patches?.[name]);
    if (found.length > 1 && new Set(found.map((file) => patchSha256(file.new_patches![name]))).size > 1) throw new Error(`two different patches are named ${name}`);
    if (found.length) return { patch: { name, patch: found[0].new_patches![name] as PatchDefinition }, world };
  }
  throw new Error(`snapshot ${key}: patch ${name} is defined nowhere`);
}

/** The records a snapshot holds: the world's, with the replacing patch applied. */
export function snapshotRecords(key: string): FixtureRecord[] {
  const { world, patch } = resolveSnapshotKey(key);
  const fixture = loadWorld(world);
  const records = worldRecords(fixture);
  return patch ? replaceRecords(records, patch.patch, fixture.mainAccount) : records;
}
