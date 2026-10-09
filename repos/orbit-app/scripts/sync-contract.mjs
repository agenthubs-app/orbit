// 把 orbits 的跨客户端契约、运行时 Schema、受控字典与共用计算代码拷贝到 App。
//
// App 不在构建期 import ../orbits（见 AGENTS.md），所以契约以副本形式进来，
// 由 tests/contract-sync.test.ts 校验副本与源逐字一致。源改了而副本没跟上，
// npm test 就红——这就是「网页版改 API，手机端立刻知道」的机制。
//
// Sprint 0117（看板 D3，设计案决定 3）：shared/compute 是唯一明确允许两端共用的
// 运行时代码目录（纯函数：只能互相引用、引用契约类型和两个受控字典，不碰 IO、
// 网络、时钟；规则见 orbits/tests/support/shared-compute-audit.ts，两端测试都跑）。
// 它整目录逐字拷到 src/api/compute；其他 shared 目录仍然不进 App，domain 仍只放行两个字典。
//
// 改版 R01（RD-08）：shared/design 只放行生成好的 tokens.ts（零 import 常量），
// 拷到 src/api/design；tokens.json 源文件和 README 不进 App。
// 改版 R02：同目录生成的 icons.ts（图标形状，零 import）一起放行；icons.json 不进 App。
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
  {
    label: "共用计算",
    sourceDir: join(appRoot, "..", "orbits", "shared", "compute"),
    targetDir: join(appRoot, "src", "api", "compute"),
  },
  {
    label: "设计 token",
    sourceDir: join(appRoot, "..", "orbits", "shared", "design"),
    targetDir: join(appRoot, "src", "api", "design"),
    fileNames: ["tokens.ts", "icons.ts"],
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
