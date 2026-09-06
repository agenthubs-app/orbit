// 把 orbits 的跨客户端契约、运行时 Schema 与受控字典拷贝到 App。
//
// App 不在构建期 import ../orbits（见 AGENTS.md），所以契约以副本形式进来，
// 由 tests/contract-sync.test.ts 校验副本与源逐字一致。源改了而副本没跟上，
// npm test 就红——这就是「网页版改 API，手机端立刻知道」的机制。
//
// 用法：npm run sync:contract

import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const syncTargets = [
  {
    label: "契约",
    sourceDir: join(appRoot, "..", "orbits", "shared", "contract"),
    targetDir: join(appRoot, "src", "api", "contract"),
  },
  {
    label: "API Schema",
    sourceDir: join(appRoot, "..", "orbits", "shared", "api-schema"),
    targetDir: join(appRoot, "src", "api", "schema"),
  },
  {
    label: "领域字典",
    sourceDir: join(appRoot, "..", "orbits", "shared", "domain"),
    targetDir: join(appRoot, "src", "api", "domain"),
    fileNames: ["industries.ts", "language.ts"],
  },
];

function contractFileNames(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

function syncDirectory({ label, sourceDir, targetDir, fileNames }) {
  const names = fileNames ?? contractFileNames(sourceDir);

  if (names.length === 0) {
    throw new Error(`${label}源目录是空的：${sourceDir}`);
  }

  rmSync(targetDir, { force: true, recursive: true });
  mkdirSync(targetDir, { recursive: true });

  names.forEach((name) => {
    copyFileSync(join(sourceDir, name), join(targetDir, name));
  });

  console.log(`已同步 ${names.length} 个${label}文件到 ${targetDir}`);
  names.forEach((name) => {
    console.log(`  ${name}`);
  });
}

syncTargets.forEach(syncDirectory);
