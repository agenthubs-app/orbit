import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const read = (path: string) => readFileSync(join(projectRoot, path), "utf8");

// R17：运营台页面只判登录；数据与权限走 /api/host/events/[id]/*，live 服务按 Event Core 的 owner + event-access 角色判能力。
test("operations page only requires sign-in and leaves capability checks to the host API", () => {
  const page = read("app/(app)/app/events/[id]/operations/page.tsx");
  assert.match(page, /session\?\.user\?\.id/u);
  assert.match(page, /<HostConsole /u);
  assert.doesNotMatch(page, /createEventCrudAndImportService/u);
});

test("host live service authorizes delegates with the same capability policy as requireEventCapability", () => {
  const live = read("features/events/host/live.ts");
  assert.match(live, /canAccessEventCapability\(\{ capability, owner: view\.owner, role: view\.role, state: view\.state \}\)/u);
  assert.match(live, /HostError\(caps\.length \? "FORBIDDEN" : "NOT_FOUND"\)/u);
});

test("legacy operations sub-pages redirect into the console tabs", () => {
  for (const [path, tab] of [["operations/admission", "people"], ["operations/experience", "setup"], ["analytics", "report"]] as const) {
    assert.match(read(`app/(app)/app/events/[id]/${path}/page.tsx`), new RegExp(`operations\\?tab=${tab}`, "u"));
  }
});
