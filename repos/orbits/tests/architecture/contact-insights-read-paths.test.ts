/**
 * W0051 易错边界 1（SC-01／SC-04）：三处读取路径（所有人脉列表、详情弹窗、洞察标签）与待唤醒改读洞察
 * 不 import 生成器、执行器、重新生成或运行时装配，也不预留配额——打开页面 0 次模型调用、0 次扣减。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const READ_PATHS = [
  "features/contacts/insights/read.ts",
  "features/contacts/insights/view.ts",
  "features/contacts/insights/tab-reader.ts",
  "features/contacts/insights/repository.ts",
  "app/(app)/app/contacts/analysis/insights-tab.ts",
  "app/(app)/app/contacts/contact-card-route-service.ts",
  "app/(app)/app/contacts/analysis/opportunities-route-service.ts",
  "app/(app)/app/contacts/analysis/opportunities-view-model.ts",
  "app/(app)/app/contacts/network-0918/network-insights.tsx",
  "app/(app)/app/contacts/network-0918/network-insight-panel.tsx",
  "app/(app)/app/contacts/network-0918/network-cards.tsx",
  "app/(app)/app/contacts/[id]/page.tsx",
  "app/(app)/app/contacts/dashboard/page.tsx",
  "app/api/contacts/page/handler.ts",
  // W0057：详情面板轮询的只读状态接口。
  "app/api/contacts/[id]/insight/handler.ts",
  "app/api/contacts/[id]/insight/route.ts",
];
const FORBIDDEN = [/insights\/generator/, /insights\/worker/, /insights\/regenerate/, /insights\/runtime/, /insights\/maintenance-task/, /insights\/instant/, /deepseek/i, /\.reserve\(/, /beginCall\(/];

test("read paths never import the insight generator, worker, regeneration or runtime, and never reserve quota", () => {
  for (const path of READ_PATHS) {
    const source = readFileSync(join(ROOT, path), "utf8");
    for (const pattern of FORBIDDEN) assert.doesNotMatch(source, pattern, `${path} must not reference ${pattern}`);
  }
});
