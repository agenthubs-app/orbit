import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { NetworkImport } from "../../app/(app)/app/contacts/network-0918/network-import";

const availability = { available: true, reason: "ready" } as const;

// 名片 V2 入口用 useRouter()，静态渲染需要挂一个 app router 上下文。
const router: AppRouterInstance = { back() {}, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} };
function render(element: React.ReactElement) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>);
}

test("import screen renders the four design methods; only scanning is interactive", () => {
  const html = render(<NetworkImport availability={availability} />);
  assert.match(html, /data-network-screen="import"/);
  for (const m of ["上传 CSV", "导入通讯录", "扫描名片夹", "从活动添加联系人"]) assert.match(html, new RegExp(m));
  assert.equal((html.match(/nw-import-cta-soon/g) ?? []).length, 3);
  assert.equal((html.match(/class="btn nw-import-cta"/g) ?? []).length, 1);
  assert.match(html, /去重识别/);
  assert.doesNotMatch(html, /客户名单\.xlsx|iCloud 通讯录/);
});

test("scan is the default selected method and the V2 work area is mounted", () => {
  const html = render(<NetworkImport availability={availability} />);
  // 选中卡（设计 border #4B4FC7 / bg #F7F7FD）只有一张：扫描名片夹
  assert.equal((html.match(/border-color:#4B4FC7/g) ?? []).length, 1);
  assert.match(html, /class="nw-import-panel"/);
  assert.match(html, /class="bci-start"/);
  // 导入记录：SSR 阶段尚未拉取，不渲染行也不渲染空态（空态只在拉取结果为空时出现）；表头与设计一致
  assert.doesNotMatch(html, /class="btn nw-import-row"|class="nw-empty"/);
  for (const h of ["导入时间", "来源", "文件 / 活动", "导入总数", "新增联系人", "合并联系人", "状态", "操作"]) assert.match(html, new RegExp(h));
});

test("unavailable capture renders the note card with the reason copy instead of the V2 entry", () => {
  const html = render(
    <NetworkImport availability={{ available: false, reason: "ocr_provider_unconfigured" }} />,
  );
  assert.doesNotMatch(html, /class="bci-start"/);
  assert.match(html, /nw-import-note[\s\S]*未配置云端 OCR/);
});

test("?job= renders the batch detail in the work area and keeps the method cards", () => {
  const html = render(<NetworkImport availability={availability} jobId="batch:abc" />);
  assert.match(html, /data-network-import-job="batch:abc"/);
  assert.doesNotMatch(html, /class="bci-start"/);
  assert.match(html, /扫描名片夹/);
});
