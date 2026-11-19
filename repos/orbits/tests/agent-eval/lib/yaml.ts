import { createHash } from "node:crypto";
import fs from "node:fs";
import yaml from "js-yaml";

export function readYamlFile<T = unknown>(file: string): T {
  return yaml.load(fs.readFileSync(file, "utf8")) as T;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fileSha256(file: string): string {
  return sha256(fs.readFileSync(file));
}

/** Deterministic JSON (sorted keys) for hashing and stable diffs. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortDeep((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
