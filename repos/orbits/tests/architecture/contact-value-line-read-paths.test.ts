/**
 * W0061 SC-04（易错边界 1，D61）：「TA 能帮你」一句话的组件、纯函数与两条只读数据源不 import 生成器、执行器、
 * 重新生成、运行时装配或配额模块，也不经 `insights/read.ts`（它静态 import 了配额常量）、不标待更新——
 * 三处渲染与读取 0 次模型调用、0 次扣减、0 次写入。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const PATHS = [
  "features/contacts/insights/evidence-labels.ts",
  "features/contacts/insights/value-lines.ts",
  "app/api/contacts/value-lines/handler.ts",
  "app/api/contacts/value-lines/route.ts",
  "app/(app)/app/contacts/network-0918/contact-value.ts",
  "app/(app)/app/contacts/network-0918/contact-value-line.tsx",
];
const FORBIDDEN = [
  /insights\/generator/,
  /insights\/worker/,
  /insights\/regenerate/,
  /insights\/runtime/,
  /insights\/maintenance-task/,
  /insights\/instant/,
  /insights\/read["']/,
  /\.\/read["']/,
  /ai-quota/,
  /deepseek/i,
  /\.reserve\(/,
  /beginCall\(/,
  /markContactInsights/,
  /\bafter\(/,
];

test("value-line paths never import the generator, runtime, quota or read.ts, never mark dirty and never schedule work", () => {
  for (const path of PATHS) {
    const source = readFileSync(join(ROOT, path), "utf8");
    for (const pattern of FORBIDDEN) assert.doesNotMatch(source, pattern, `${path} must not reference ${pattern}`);
  }
});

test("the candidate routes attach values through the read-only value-lines module only", () => {
  const source = readFileSync(join(ROOT, "app/api/agent/plans/candidates/route-handlers.ts"), "utf8");
  assert.match(source, /features\/contacts\/insights\/value-lines/);
  for (const pattern of [/insights\/generator/, /insights\/instant/, /insights\/runtime/, /ai-quota/, /markContactInsights/]) assert.doesNotMatch(source, pattern);
});
