import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { ImportLogRow, NetworkImport, importHref } from "../../app/(app)/app/contacts/network-0918/network-import";
import { followUpCopy, ReviewRow } from "../../app/(app)/app/contacts/network-0918/network-import-file";
import type { ContactImportBatchView, ContactImportRowView } from "../../app/(app)/app/contacts/network-0918/network-import-client";
import { NETWORK_IMPORT_FLOW_CSS } from "../../app/(app)/app/contacts/network-0918/network-import-styles";

const availability = { available: true, reason: "ready" } as const;
const zh = (copy: { zh: string }) => copy.zh;

// 名片 V2 入口用 useRouter()，静态渲染需要挂一个 app router 上下文。
const router: AppRouterInstance = { back() {}, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} };
function render(element: React.ReactElement) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>);
}

test("W0053: all four design methods are interactive; no unimplemented promises (10,000 records / .xlsx / coming soon); real limits shown", () => {
  const html = render(<NetworkImport availability={availability} />);
  assert.match(html, /data-network-screen="import"/);
  for (const m of ["上传 CSV", "导入通讯录", "扫描名片夹", "从活动添加联系人"]) assert.match(html, new RegExp(m));
  assert.equal((html.match(/class="btn nw-import-cta( nw-import-cta-on)?"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /即将开放|Coming soon|nw-import-cta-soon|aria-disabled/);
  assert.doesNotMatch(html, /10,000|10MB|\.xlsx/);
  assert.match(html, /单个文件不超过 5 MB、最多 2,000 条记录/);
  assert.match(html, /Excel 请另存为 CSV/);
  assert.match(html, /合并到已有联系人前都会让你确认/);
  assert.doesNotMatch(html, /客户名单\.xlsx|iCloud 通讯录/);
});

test("scan is still the default selected method and the V2 card uploader is mounted", () => {
  const html = render(<NetworkImport availability={availability} />);
  assert.equal((html.match(/class="nw-import-method nw-import-method-on"/g) ?? []).length, 1);
  assert.match(html, /data-import-method="scan"[^>]*>[\s\S]*?class="btn nw-import-cta nw-import-cta-on"/);
  assert.match(html, /data-import-panel="scan"/);
  assert.match(html, /data-card-uploader/);
  assert.match(html, /批量上传名片照片/);
  // 导入记录：SSR 阶段尚未拉取，不渲染行也不渲染空态；表头与设计一致
  assert.doesNotMatch(html, /class="btn nw-import-row"|class="nw-empty"/);
  for (const h of ["导入时间", "来源", "文件 / 活动", "导入总数", "新增联系人", "合并联系人", "状态", "操作"]) assert.match(html, new RegExp(h));
});

test("?method=csv / contacts / event mount their own work areas (file uploader, vCard uploader, event list with an event-page link)", () => {
  const csv = render(<NetworkImport availability={availability} initialMethod="csv" />);
  assert.match(csv, /data-import-method="csv"[^>]*class="nw-import-method nw-import-method-on"|class="nw-import-method nw-import-method-on"[^>]*data-import-method="csv"/);
  assert.match(csv, /data-import-uploader="csv"/);
  assert.match(csv, /accept="\.csv,text\/csv"/);
  assert.match(csv, /LinkedIn 导出的 Connections\.csv 自动识别/);
  assert.doesNotMatch(csv, /data-card-uploader/);

  const vcard = render(<NetworkImport availability={availability} initialMethod="contacts" />);
  assert.match(vcard, /data-import-uploader="vcard"/);
  assert.match(vcard, /accept="\.vcf,text\/vcard,text\/x-vcard"/);

  const event = render(<NetworkImport availability={availability} initialMethod="event" />);
  assert.match(event, /data-import-events/);
  assert.match(event, /正在读取你参加过的活动/);
  assert.match(event, /只有互相交换过名片的人可以添加/);
  assert.match(event, /<a class="nwi-link" href="\/app\/events">去活动页交换名片<\/a>/);
});

test("the CSV/vCard availability does not depend on OCR: unavailable card capture only affects the scan method", () => {
  const scan = render(<NetworkImport availability={{ available: false, reason: "ocr_provider_unconfigured" }} />);
  assert.doesNotMatch(scan, /data-card-uploader/);
  assert.match(scan, /nw-import-note[\s\S]*未配置云端 OCR/);
  const csv = render(<NetworkImport availability={{ available: false, reason: "ocr_provider_unconfigured" }} initialMethod="csv" />);
  assert.match(csv, /data-import-uploader="csv"/);
});

test("?job= renders the full-width card review sub-page with a back link (Network v2 10 名片确认)", () => {
  const html = render(<NetworkImport availability={availability} jobId="batch:abc" />);
  assert.match(html, /data-network-import-job="batch:abc"/);
  assert.match(html, /class="btn nw-import-back"[^>]*>← 导入人脉</);
  assert.doesNotMatch(html, /data-card-uploader/);
  assert.doesNotMatch(html, /data-import-method=/, "method cards are not part of the review sub-page");
});

const baseRow: ContactImportRowView = {
  candidate: null, contactId: null, decision: "create", fields: { connectedOn: "", displayName: "Avery Lin", email: "avery@example.com", linkedinUrl: "", location: "", notes: "", organization: "Northwind", phone: "", role: "PM" },
  inFileDuplicateOf: null, issues: [], mergeIntoContactId: null, seq: 1, status: "pending",
};
const candidate = { address: "", contactId: "contact:x", displayName: "Avery Lin", email: "avery@example.com", identical: false, matchedOn: ["email"] as ("email" | "phone" | "name_organization")[], organization: "Old Co", phone: "", role: "" };

test("review table rows: a non-identical candidate shows the match reason and both sides and must be chosen; identical is pre-selected merge; unreadable rows cannot be chosen", () => {
  const undecided = renderToStaticMarkup(<ReviewRow busy={false} onDecide={() => undefined} t={zh} row={{ ...baseRow, candidate, decision: null }} />);
  assert.match(undecided, /data-import-decision="undecided"/);
  assert.match(undecided, /可能是同一个联系人/);
  assert.match(undecided, /同邮箱/);
  assert.match(undecided, /人脉里：Avery Lin · Old Co · avery@example\.com/);
  assert.match(undecided, /class="nwi-select nwi-select-required"/);
  assert.match(undecided, /<option value="" disabled="" selected="">请选择…<\/option>/);
  assert.match(undecided, /<option value="merge">合并到已有联系人<\/option><option value="create">仍然新建<\/option><option value="skip">跳过<\/option>/);

  const identical = renderToStaticMarkup(<ReviewRow busy={false} onDecide={() => undefined} t={zh} row={{ ...baseRow, candidate: { ...candidate, identical: true, matchedOn: ["email", "name_organization"] }, decision: "merge", mergeIntoContactId: "contact:x" }} />);
  assert.match(identical, /人脉里已有（完全一致）/);
  assert.match(identical, /同邮箱 · 同姓名加公司/);
  assert.match(identical, /<option value="merge" selected="">合并到已有联系人<\/option>/);

  const blocked = renderToStaticMarkup(<ReviewRow busy={false} onDecide={() => undefined} t={zh} row={{ ...baseRow, decision: "skip", fields: { ...baseRow.fields, displayName: "" }, issues: ["missing_name"] }} />);
  assert.match(blocked, /缺少姓名，无法导入/);
  assert.doesNotMatch(blocked, /<select/);

  const duplicate = renderToStaticMarkup(<ReviewRow busy={false} onDecide={() => undefined} t={zh} row={{ ...baseRow, decision: "skip", inFileDuplicateOf: 1, seq: 3 }} />);
  assert.match(duplicate, /与第 1 行重复/);
});

const batch: ContactImportBatchView = {
  completedAt: "2026-10-03T03:01:00.000Z", counts: { created: 12, failed: 1, merged: 3, skipped: 2 }, createdAt: "2026-10-03T03:00:00.000Z", expiresAt: "2026-10-10T03:01:00.000Z",
  fileName: "Connections.csv", followUp: { enrichmentDeferredUntil: "2026-10-03T15:00:00.000Z", state: "done" }, format: "linkedin", headers: [], id: "contact-import:1",
  kind: "csv", mapping: null, review: null, rowCount: 18, sourceEventId: null, status: "completed",
};

test("import log rows show the real source, file name, total, created and merged counts, plus follow-up state (补全明天继续／后续更新待重试)", () => {
  const html = renderToStaticMarkup(<ImportLogRow batch={batch} href={importHref(batch)} nowMs={Date.parse("2026-10-03T04:00:00.000Z")} t={zh} />);
  assert.match(html, /data-import-log="contact-import:1"/);
  assert.match(html, /<span>上传 CSV<\/span><span class="nw-import-row-file" title="Connections\.csv">Connections\.csv<\/span><span>18<\/span><span>12<\/span><span>3<\/span>/);
  assert.match(html, /已完成<span class="nwi-log-follow">补全明天继续<\/span>/);
  assert.equal(followUpCopy({ ...batch, followUp: { enrichmentDeferredUntil: null, state: "retry" } })?.zh, "后续更新待重试");
  assert.equal(followUpCopy(batch, Date.parse("2026-10-04T00:00:00.000Z")), null, "after the retry day the note disappears");

  const reviewing = renderToStaticMarkup(<ImportLogRow batch={{ ...batch, counts: { created: 0, failed: 0, merged: 0, skipped: 0 }, kind: "vcard", status: "reviewing" }} href={importHref({ id: "contact-import:1", kind: "vcard" })} t={zh} />);
  assert.match(reviewing, /<a class="btn nw-import-row" href="\/app\/contacts\/new\?method=contacts&amp;import=contact-import%3A1"/);
  assert.match(reviewing, /导入通讯录/);
  assert.match(reviewing, /继续核对/);
  const event = renderToStaticMarkup(<ImportLogRow batch={{ ...batch, fileName: "架空 SaaS Night", kind: "event" }} href="#" t={zh} />);
  assert.match(event, /从活动添加/);
  assert.match(event, /架空 SaaS Night/);
});

test("new links carry their own colour and :hover rule (0918 anchor-colour gate); buttons use two-class selectors past the control reset", () => {
  assert.match(NETWORK_IMPORT_FLOW_CSS, /\.nwi-link \{ color: #4B4FC7;/);
  assert.match(NETWORK_IMPORT_FLOW_CSS, /\.nwi-link:hover \{ color: #2E3270; \}/);
  assert.match(NETWORK_IMPORT_FLOW_CSS, /\.btn\.nwi-primary \{/);
  assert.match(NETWORK_IMPORT_FLOW_CSS, /\.nwi-mapping \.nwi-select/);
});

test("import log keeps a distinct error state for a failed batches fetch instead of the empty-state copy", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../../app/(app)/app/contacts/network-0918/network-import.tsx", import.meta.url)), "utf8");
  assert.match(src, /useState<readonly IngestBatchDTO\[\] \| null \| "error">/);
  assert.match(src, /if \(!response\.ok\) throw/);
  assert.match(src, /\.catch\(\(\) => \{\s*if \(!cancelled\) setBatches\("error"\)/);
  assert.match(src, /batches === "error" \?[\s\S]*?class(Name)?="nw-empty"[^>]*data-import-log-error[^>]*>\{t\(\{ en: "Could not load import history", zh: "无法加载导入记录" \}\)\}/);
  // 错误态不再复用「还没有导入记录」
  assert.doesNotMatch(src, /catch\(\(\) => \{\s*if \(!cancelled\) setBatches\(\[\]\)/);
});
