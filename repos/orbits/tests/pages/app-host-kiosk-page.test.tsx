import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

// R17（host DESIGN §2.6）：/operations/check-in 换成新 kiosk（HostKiosk，不挂壳）。页面只判登录、不读活动；
// 名单与权限（requireEventCapability check_in.*）在 GET /api/host/events/[id]/kiosk，无权限时 kiosk 显示说明。
// QR：BarcodeDetector 优先，不支持时只在 kiosk 里动态加载 @zxing/browser（Safari / Firefox 回退）。
test("check-in page signs in first, reads no event itself and mounts the R17 kiosk", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/operations/check-in/page.tsx"), "utf8");
  const kiosk = readFileSync(join(projectRoot, "app/(app)/app/orbit-2026/host/HostKiosk.tsx"), "utf8");
  assert.match(page, /await Promise\.all\(\[params, auth\(\), getOrbitServerLanguage\(\)\]\)/u);
  assert.match(page, /redirect\(`\/app\/account\/login\?next=\$\{encodeURIComponent\(`\/app\/events\/\$\{encodeURIComponent\(eventId\)\}\/operations\/check-in`\)\}`\)/u);
  assert.match(page, /return <HostKiosk eventId=\{eventId\} language=\{language\} \/>;/u);
  // 页面本身不读活动（未公开活动的标题不给任意登录用户）、不挂旧 ops-0918 壳。
  assert.doesNotMatch(page, /loadEventOperationsPageEvent|getEvent\(|OpsConsoleShell|ops-0918/u);
  // kiosk 的读写都走主催接口（权限在接口里判），受付动作走 operations admin check-ins。
  assert.match(kiosk, /hostApi\.kiosk\(/u);
  assert.match(kiosk, /hostApi\.checkIn\(/u);
  // QR：原生优先，zxing 只在这里按需 import（不进别的页面的包）。
  assert.match(kiosk, /BarcodeDetector/u);
  assert.match(kiosk, /await import\("@zxing\/browser"\)/u);
  assert.doesNotMatch(kiosk, /^import .*@zxing/mu);
});
