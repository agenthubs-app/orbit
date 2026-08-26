# 名片批量导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 批量上传名片照片/多页 PDF，服务端 worker 后台识别，可恢复进度页，全批完成后逐张确认（固定格子 + 零丢失备注聚合）写入联系人。

**Architecture:** 两个新 live collection（`businessCardBatches`/`businessCardBatchItems`）承载持久批任务，lease 语义照抄通知投递服务；独立 worker 脚本并发调用现有 DeepSeek 两阶段 provider；转码卡图存本地目录、确认/跳过即删；确认复用现有名片写入服务并扩展 `notes` 字段。

**Tech Stack:** Next.js + TypeScript、`node --test --import tsx`、`pdfjs-dist` + `@napi-rs/canvas`（新依赖，PDF 拆页）、现有 `heic-convert`/`sharp` 归一化、Postgres live record store。

**Spec:** `docs/superpowers/specs/2026-08-26-business-card-batch-import-design.md`

## Global Constraints

- 工作目录 `/Users/li/work/orbit/repos/orbits`（下文相对路径以此为根）。
- **GitNexus 纪律**：改已有符号前跑 impact（该子树索引只到文件粒度时，允许用文件级依赖 cypher 替代并报告，先例见单张识别计划）；提交前 `detect-changes -r orbit`。
- 单批上限逐字：`BUSINESS_CARD_BATCH_MAX_ITEMS = 500`（图片张数 + PDF 页数合计），超限整批拒绝，错误码 `BUSINESS_CARD_BATCH_TOO_LARGE`；图片 ≤10MiB/张，PDF ≤50MB/个（`BUSINESS_CARD_BATCH_MAX_PDF_BYTES = 50 * 1024 * 1024`）。
- 图片目录 env：`ORBIT_BATCH_UPLOAD_DIR`，默认 `.orbit-batch-uploads`（加入 `.gitignore`）；**确认/跳过即删单图，批次 completed/过期删整目录**；批次过期 = 创建 + 7 天。
- worker 并发 3、失败自动重试 1 次（`attempts` ≥ 2 才标 `failed`）、lease 30s 过期回收。
- 备注聚合不变量（属性测试守护）：固定格子取值 ∪ 备注内容 ⊇ 规范化抽取的全部非空字段值（`detectedLanguages` 除外，属元数据）。
- 识别引擎、HEIC 归一化零改动复用；确认前零联系人写入；显式失败不回退。
- 入口 UI 必须是**两个按钮**：「批量上传照片」（multiple，仅图片 accept）与「上传 PDF」（单选，仅 `application/pdf,.pdf`）。
- 测试：单文件 `node --test --import tsx tests/...`；全量 `npm test` 与基线对比零新增失败（基线文件在 scratchpad `baseline-failures.txt`，如无则先跑一次全量存档）。仓库 typecheck ratchet 会检查 scripts/ 与生产代码类型，全部新代码必须过 `npm run typecheck`。

---

### Task 1: 契约与备注聚合纯函数

**Files:**
- Create: `features/acquisition/business-card-batch-contract.ts`
- Create: `features/acquisition/business-card-notes-aggregation.ts`
- Test: `tests/capabilities/business-card-notes-aggregation.test.ts`

**Interfaces:**
- Produces（逐字，后续任务全部依赖）:

```ts
// business-card-batch-contract.ts
import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";

export const BUSINESS_CARD_BATCH_MAX_ITEMS = 500;
export const BUSINESS_CARD_BATCH_MAX_PDF_BYTES = 50 * 1024 * 1024;
export const BUSINESS_CARD_BATCH_EXPIRY_DAYS = 7;
export const BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS = 30_000;
export const BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS = 2;

export type BusinessCardBatchStatus = "processing" | "ready_for_review" | "completed";
export type BusinessCardBatchItemStatus =
  | "pending" | "processing" | "extracted" | "failed" | "confirmed" | "skipped";
export type BusinessCardBatchItemErrorCode =
  | "OCR_PROVIDER_FAILED" | "OCR_PROVIDER_TIMEOUT" | "OCR_INVALID_OUTPUT";

export interface BusinessCardBatchSourceFile {
  fileName: string;
  kind: "image" | "pdf";
  itemCount: number;
}

export interface BusinessCardBatchDTO {
  id: string;
  actorId: string;
  status: BusinessCardBatchStatus;
  totalItems: number;
  processedItems: number;   // extracted 数
  failedItems: number;
  confirmedItems: number;
  skippedItems: number;
  sourceFiles: readonly BusinessCardBatchSourceFile[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface BusinessCardBatchItemDTO {
  id: string;
  batchId: string;
  actorId: string;
  seq: number;
  sourceFileName: string;
  sourcePage: number | null;          // PDF 页码（1 起），图片为 null
  status: BusinessCardBatchItemStatus;
  imagePath: string | null;           // 删除后为 null
  /** 图片 item = 上传原始文件字节的 sha256:<hex>；PDF item = 该页渲染 JPEG 字节的摘要。 */
  imageDigest: string;
  uploadMimeType: string;
  extraction: BusinessCardStructuredExtraction | null;
  reviewIssues: readonly BusinessCardReviewIssue[];
  usage: BusinessCardCloudOcrUsage | null;
  errorCode: BusinessCardBatchItemErrorCode | null;
  attempts: number;
  leaseOwner: string | null;
  leasedAt: string | null;
  confirmedContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewBusinessCardBatchItemInput {
  seq: number;
  sourceFileName: string;
  sourcePage: number | null;
  imageJpegBase64: string;   // 已归一化的 JPEG
  imageDigest: string;
  uploadMimeType: string;
}
```

```ts
// business-card-notes-aggregation.ts
export function aggregateBusinessCardNotes(
  extraction: BusinessCardStructuredExtraction,
  chosen: { email: string | null; phone: string | null },
): string
```

- [ ] **Step 1: 写失败测试**

`tests/capabilities/business-card-notes-aggregation.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { aggregateBusinessCardNotes } from "../../features/acquisition/business-card-notes-aggregation";

function extraction(
  overrides: Partial<BusinessCardStructuredExtraction> = {},
): BusinessCardStructuredExtraction {
  return {
    addresses: [],
    certifications: [],
    contactPoints: [],
    departments: [],
    detectedLanguages: ["ja"],
    emails: [],
    fullName: "青空 太郎",
    nativeFullName: "青空 太郎",
    organization: "架空技研株式会社",
    romanizedFullName: null,
    title: "室長",
    website: null,
    ...overrides,
  };
}

test("notes aggregation captures every field that has no fixed slot, with labels", () => {
  const notes = aggregateBusinessCardNotes(
    extraction({
      addresses: [
        { label: "本社", value: "東京都テスト区1-2-3" },
        { label: "関西", value: "大阪府サンプル市4-5-6" },
      ],
      certifications: ["宅地建物取引士"],
      contactPoints: [
        { label: "TEL", type: "phone", value: "03-0000-1111" },
        { label: "FAX", type: "fax", value: "03-0000-2222" },
        { label: "携帯", type: "mobile", value: "090-0000-3333" },
      ],
      departments: ["事業開発室"],
      emails: [
        { label: "E-mail", value: "taro@example.test" },
        { label: "共用", value: "info@example.test" },
      ],
      romanizedFullName: "Taro Aozora",
      website: "https://example.test",
    }),
    { email: "taro@example.test", phone: "03-0000-1111" },
  );

  for (const expected of [
    "東京都テスト区1-2-3",
    "大阪府サンプル市4-5-6",
    "宅地建物取引士",
    "03-0000-2222",
    "090-0000-3333",
    "事業開発室",
    "info@example.test",
    "Taro Aozora",
    "https://example.test",
    "本社",
    "FAX",
  ]) {
    assert.ok(notes.includes(expected), `notes must include ${expected}`);
  }
  assert.ok(!notes.includes("taro@example.test"), "chosen email stays in its fixed slot");
  assert.ok(!notes.includes("03-0000-1111"), "chosen phone stays in its fixed slot");
});

test("notes aggregation returns an empty string when nothing is left over", () => {
  const notes = aggregateBusinessCardNotes(
    extraction({
      contactPoints: [{ label: null, type: "phone", value: "03-1111-2222" }],
      emails: [{ label: null, value: "only@example.test" }],
    }),
    { email: "only@example.test", phone: "03-1111-2222" },
  );

  assert.equal(notes, "");
});

test("property: fixed slots plus notes lose no non-empty field value", () => {
  const pools = {
    addresses: [[], [{ label: "HQ", value: "Addr-1" }], [{ label: null, value: "Addr-2" }]],
    certifications: [[], ["Cert-A", "Cert-B"]],
    contactPoints: [
      [],
      [{ label: "TEL", type: "phone" as const, value: "01-111" }],
      [
        { label: null, type: "mobile" as const, value: "02-222" },
        { label: "FAX", type: "fax" as const, value: "03-333" },
      ],
    ],
    departments: [[], ["Dept-1"]],
    emails: [[], [{ label: null, value: "a@x.test" }], [{ label: "sub", value: "b@x.test" }]],
    romanizedFullName: [null, "Roman Name"],
    website: [null, "https://w.test"],
  };

  let caseIndex = 0;
  for (const addresses of pools.addresses)
    for (const certifications of pools.certifications)
      for (const contactPoints of pools.contactPoints)
        for (const departments of pools.departments)
          for (const emails of pools.emails)
            for (const romanizedFullName of pools.romanizedFullName)
              for (const website of pools.website) {
                caseIndex += 1;
                const input = extraction({
                  addresses, certifications, contactPoints, departments, emails,
                  romanizedFullName, website,
                });
                const chosenEmail = emails[0]?.value ?? null;
                const chosenPhone =
                  contactPoints.find((point) => point.type !== "fax")?.value ?? null;
                const notes = aggregateBusinessCardNotes(input, {
                  email: chosenEmail,
                  phone: chosenPhone,
                });
                const covered = [
                  input.fullName, input.nativeFullName, input.organization, input.title,
                  chosenEmail, chosenPhone, notes,
                ].filter(Boolean).join("\n");
                const allValues = [
                  ...input.addresses.map((item) => item.value),
                  ...input.certifications,
                  ...input.contactPoints.map((item) => item.value),
                  ...input.departments,
                  ...input.emails.map((item) => item.value),
                  input.romanizedFullName, input.website,
                  input.fullName, input.nativeFullName, input.organization, input.title,
                ].filter((value): value is string => Boolean(value));
                for (const value of allValues) {
                  assert.ok(covered.includes(value), `case ${caseIndex}: lost ${value}`);
                }
              }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --import tsx tests/capabilities/business-card-notes-aggregation.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `business-card-batch-contract.ts`（内容见 Interfaces，原样）。创建 `business-card-notes-aggregation.ts`：

```ts
import type { BusinessCardStructuredExtraction } from "./business-card-cloud-ocr";

const CONTACT_POINT_TYPE_LABEL: Record<string, string> = {
  fax: "传真",
  mobile: "手机",
  phone: "电话",
};

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function labeled(base: string, label: string | null): string {
  return label ? `${base}(${label})` : base;
}

/**
 * Everything the fixed review slots do not carry lands here, each value with
 * its printed label, so confirming a card never silently drops information.
 * `detectedLanguages` is metadata and intentionally excluded.
 */
export function aggregateBusinessCardNotes(
  extraction: BusinessCardStructuredExtraction,
  chosen: { email: string | null; phone: string | null },
): string {
  const lines: string[] = [];

  if (
    extraction.romanizedFullName &&
    extraction.romanizedFullName !== extraction.fullName &&
    extraction.romanizedFullName !== extraction.nativeFullName
  ) {
    lines.push(line("罗马字姓名", extraction.romanizedFullName));
  }
  if (
    extraction.nativeFullName &&
    extraction.fullName &&
    extraction.nativeFullName !== extraction.fullName
  ) {
    lines.push(line("原文姓名", extraction.nativeFullName));
  }
  for (const department of extraction.departments) {
    lines.push(line("部门", department));
  }
  for (const email of extraction.emails) {
    if (email.value !== chosen.email) {
      lines.push(line(labeled("邮箱", email.label), email.value));
    }
  }
  for (const point of extraction.contactPoints) {
    if (point.value !== chosen.phone) {
      lines.push(
        line(
          labeled(CONTACT_POINT_TYPE_LABEL[point.type] ?? point.type, point.label),
          point.value,
        ),
      );
    }
  }
  if (extraction.website) {
    lines.push(line("网站", extraction.website));
  }
  for (const address of extraction.addresses) {
    lines.push(line(labeled("地址", address.label), address.value));
  }
  for (const certification of extraction.certifications) {
    lines.push(line("资质", certification));
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --import tsx tests/capabilities/business-card-notes-aggregation.test.ts`
Expected: 3 项 PASS（属性用例枚举 648 组合）。

- [ ] **Step 5: Commit**

```bash
git add features/acquisition/business-card-batch-contract.ts features/acquisition/business-card-notes-aggregation.ts tests/capabilities/business-card-notes-aggregation.test.ts
git commit -m "feat(acquisition): add batch import contract and lossless notes aggregation"
```

---

### Task 2: 图片文件仓 + 批次存储服务（创建/读取/认领/完成/失败）

**Files:**
- Create: `features/acquisition/storage/business-card-batch-image-store.ts`
- Create: `features/acquisition/business-card-batch-service.ts`
- Modify: `.gitignore`（追加一行 `.orbit-batch-uploads/`）
- Test: `tests/capabilities/business-card-batch-service.test.ts`

**Interfaces:**
- Consumes: Task 1 契约；`shared/storage/live-record-store.ts` 的 `LiveRecordStoreLike`；`shared/storage/configured-live-record-store.ts` 的 `createConfiguredPostgresLiveRecordStore({env})`（返回 `{store, workspaceId} | null`，模式照抄 `features/acquisition/storage/business-card-scan-live-record-provider.ts:234-252`）。
- Produces（逐字）:

```ts
// business-card-batch-image-store.ts
export interface BusinessCardBatchImageStore {
  save(batchId: string, itemId: string, jpegBytes: Buffer): Promise<string>; // 返回绝对路径
  read(imagePath: string): Promise<Buffer | null>;
  removeItemImage(imagePath: string): Promise<void>;   // 幂等
  removeBatchImages(batchId: string): Promise<void>;   // 幂等
}
export function createBusinessCardBatchImageStore(options?: { rootDir?: string }): BusinessCardBatchImageStore
// rootDir 默认 process.env.ORBIT_BATCH_UPLOAD_DIR ?? ".orbit-batch-uploads"

// business-card-batch-service.ts
export interface BusinessCardBatchService {
  createBatch(input: {
    actorId: string; now: string;
    items: readonly NewBusinessCardBatchItemInput[];
    sourceFiles: readonly BusinessCardBatchSourceFile[];
  }): Promise<BusinessCardBatchDTO>;
  listBatches(actorId: string): Promise<readonly BusinessCardBatchDTO[]>;
  getBatch(actorId: string, batchId: string):
    Promise<{ batch: BusinessCardBatchDTO; items: readonly BusinessCardBatchItemDTO[] } | null>;
  claimPendingItems(input: { workerId: string; now: string; limit: number }):
    Promise<readonly BusinessCardBatchItemDTO[]>;
  completeItem(input: {
    itemId: string; batchId: string; workerId: string; now: string;
    extraction: BusinessCardStructuredExtraction;
    reviewIssues: readonly BusinessCardReviewIssue[];
    usage: BusinessCardCloudOcrUsage;
  }): Promise<void>;
  failItem(input: {
    itemId: string; batchId: string; workerId: string; now: string;
    errorCode: BusinessCardBatchItemErrorCode;
  }): Promise<void>;
  retryItem(input: { actorId: string; itemId: string; batchId: string; now: string }): Promise<void>;
  confirmItem(input: { actorId: string; itemId: string; batchId: string; now: string; contactId: string }): Promise<void>;
  skipItem(input: { actorId: string; itemId: string; batchId: string; now: string }): Promise<void>;
  finishBatch(input: { actorId: string; batchId: string; now: string }): Promise<void>;
  sweepExpired(now: string): Promise<number>;
}
export function createBusinessCardBatchService(options: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  imageStore: BusinessCardBatchImageStore;
  idFactory?: () => string;    // 默认 crypto.randomUUID
}): BusinessCardBatchService
export function createConfiguredBusinessCardBatchService(options?: {
  env?: Record<string, string | undefined>;
  imageStore?: BusinessCardBatchImageStore;
}): BusinessCardBatchService | null
```

行为规则（实现要点，测试逐条覆盖）:
- record 形制：collection `businessCardBatches` / `businessCardBatchItems`，`recordId` = DTO id，`userId` = actorId，`payload` = `{ kind: "business_card_batch", batch }` / `{ kind: "business_card_batch_item", item }`（item 的 `imageJpegBase64` **不进** record，只有 `imagePath`）；`sourceType: "business_card_ocr"`、`sourceId` = batch id、`evidenceIds: []`。
- `createBatch`：>500 项抛 `Error("BUSINESS_CARD_BATCH_TOO_LARGE")`；逐项 `imageStore.save` 后写 item（status `pending`），最后写 batch（status `processing`）。
- `claimPendingItems`：workspace 范围（不带 userId）listRecords item collection，取 `status==="pending"` 或（`status==="processing"` 且 `leasedAt` 早于 `now - BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS`，lease 回收），按 createdAt+seq 排序取 limit，写回 `processing` + leaseOwner/leasedAt。
- `completeItem`/`failItem`：校验 `leaseOwner === workerId` 否则抛错（照 delivery-service `updateOwned` 語义）；`failItem` 时 `attempts+1 < BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS` 则回 `pending`（自动重试），否则 `failed`+errorCode。两者都重算批次计数；当 `processedItems + failedItems === totalItems` 且批次仍为 `processing` → 置 `ready_for_review` 并返回时在 payload 上打 `justBecameReady: true` 标记（worker 用来触发通知，见 Task 5）——具体机制：`completeItem`/`failItem` 返回类型改为 `Promise<{ batchBecameReady: boolean }>`。
- `retryItem`：仅 `failed`→`pending`（清 errorCode/lease，attempts 归 0），actor 校验。
- `confirmItem`/`skipItem`：actor 校验；状态仅允许从 `extracted`（skip 另允许 `failed`）迁移；写 `confirmed`+contactId / `skipped`；`imageStore.removeItemImage` 后把 `imagePath` 置 null；重算计数。
- `finishBatch`：所有 item ∈ {confirmed, skipped, failed} 才允许；置 `completed` + `removeBatchImages`。
- `sweepExpired`：`expiresAt < now` 且未 completed 的批次 → `completed` + 删目录，返回清理数。

- [ ] **Step 1: 写失败测试**

`tests/capabilities/business-card-batch-service.test.ts`（内存 store + 临时目录 image store）：

```ts
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BUSINESS_CARD_BATCH_MAX_ITEMS,
  type NewBusinessCardBatchItemInput,
} from "../../features/acquisition/business-card-batch-contract";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:batch-owner";
const NOW = "2026-08-26T10:00:00.000Z";

function item(seq: number): NewBusinessCardBatchItemInput {
  return {
    seq,
    sourceFileName: `card-${seq}.jpg`,
    sourcePage: null,
    imageJpegBase64: Buffer.from(`jpeg-${seq}`).toString("base64"),
    imageDigest: `sha256:${String(seq).padStart(4, "0")}`,
    uploadMimeType: "image/jpeg",
  };
}

async function setup() {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-test-"));
  const service = createBusinessCardBatchService({
    imageStore: createBusinessCardBatchImageStore({ rootDir }),
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  return { rootDir, service };
}

const EXTRACTION = {
  addresses: [], certifications: [], contactPoints: [], departments: [],
  detectedLanguages: ["ja"], emails: [], fullName: "青空 太郎",
  nativeFullName: "青空 太郎", organization: "架空技研株式会社",
  romanizedFullName: null, title: "室長", website: null,
};
const USAGE = { inputTokens: 100, latencyMs: 10, outputTokens: 50 };

test("createBatch persists items, stores images on disk, and rejects oversize batches", async () => {
  const { rootDir, service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR, now: NOW,
    items: [item(1), item(2)],
    sourceFiles: [{ fileName: "a.jpg", itemCount: 1, kind: "image" }, { fileName: "b.jpg", itemCount: 1, kind: "image" }],
  });

  assert.equal(batch.status, "processing");
  assert.equal(batch.totalItems, 2);
  assert.equal(batch.expiresAt, "2026-09-02T10:00:00.000Z");
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items.length, 2);
  assert.equal(detail?.items[0]?.status, "pending");
  assert.equal((await readdir(join(rootDir, batch.id))).length, 2);
  assert.equal(await service.getBatch("account:other", batch.id), null);

  await assert.rejects(
    service.createBatch({
      actorId: ACTOR, now: NOW,
      items: Array.from({ length: BUSINESS_CARD_BATCH_MAX_ITEMS + 1 }, (_, i) => item(i)),
      sourceFiles: [],
    }),
    /BUSINESS_CARD_BATCH_TOO_LARGE/,
  );
});

test("claim leases items, expired leases are reclaimed, and ownership is enforced", async () => {
  const { service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR, now: NOW, items: [item(1), item(2)], sourceFiles: [],
  });

  const claimedA = await service.claimPendingItems({ limit: 1, now: NOW, workerId: "w-a" });
  assert.equal(claimedA.length, 1);
  assert.equal(claimedA[0]?.leaseOwner, "w-a");

  const claimedB = await service.claimPendingItems({ limit: 5, now: NOW, workerId: "w-b" });
  assert.equal(claimedB.length, 1, "leased item must not be claimable before expiry");

  const later = "2026-08-26T10:01:00.000Z";
  const reclaimed = await service.claimPendingItems({ limit: 5, now: later, workerId: "w-c" });
  assert.equal(reclaimed.length, 1, "expired lease is reclaimed");

  await assert.rejects(
    service.completeItem({
      batchId: batch.id, extraction: EXTRACTION, itemId: claimedA[0]!.id,
      now: later, reviewIssues: [], usage: USAGE, workerId: "not-owner",
    }),
  );
});

test("complete and fail drive batch counts, auto-retry, and ready_for_review transition", async () => {
  const { service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR, now: NOW, items: [item(1), item(2)], sourceFiles: [],
  });
  const [first, second] = await service.claimPendingItems({ limit: 2, now: NOW, workerId: "w" });

  const notReady = await service.completeItem({
    batchId: batch.id, extraction: EXTRACTION, itemId: first!.id,
    now: NOW, reviewIssues: [], usage: USAGE, workerId: "w",
  });
  assert.equal(notReady.batchBecameReady, false);

  const failedOnce = await service.failItem({
    batchId: batch.id, errorCode: "OCR_PROVIDER_TIMEOUT", itemId: second!.id, now: NOW, workerId: "w",
  });
  assert.equal(failedOnce.batchBecameReady, false, "first failure re-queues, batch not ready");
  const requeued = await service.claimPendingItems({ limit: 5, now: NOW, workerId: "w" });
  assert.equal(requeued.length, 1, "failed item returns to pending once");

  const ready = await service.failItem({
    batchId: batch.id, errorCode: "OCR_PROVIDER_TIMEOUT", itemId: second!.id, now: NOW, workerId: "w",
  });
  assert.equal(ready.batchBecameReady, true);
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.batch.status, "ready_for_review");
  assert.equal(detail?.batch.processedItems, 1);
  assert.equal(detail?.batch.failedItems, 1);
  assert.equal(
    detail?.items.find((entry) => entry.id === second!.id)?.errorCode,
    "OCR_PROVIDER_TIMEOUT",
  );
});

test("confirm and skip delete the card image; finishBatch clears the directory; sweep expires old batches", async () => {
  const { rootDir, service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR, now: NOW, items: [item(1), item(2)], sourceFiles: [],
  });
  const [first, second] = await service.claimPendingItems({ limit: 2, now: NOW, workerId: "w" });
  for (const claimed of [first!, second!]) {
    await service.completeItem({
      batchId: batch.id, extraction: EXTRACTION, itemId: claimed.id,
      now: NOW, reviewIssues: [], usage: USAGE, workerId: "w",
    });
  }

  await service.confirmItem({
    actorId: ACTOR, batchId: batch.id, contactId: "contact:1", itemId: first!.id, now: NOW,
  });
  await service.skipItem({ actorId: ACTOR, batchId: batch.id, itemId: second!.id, now: NOW });

  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items.every((entry) => entry.imagePath === null), true);
  assert.equal(detail?.batch.confirmedItems, 1);
  assert.equal(detail?.batch.skippedItems, 1);
  assert.equal((await readdir(join(rootDir, batch.id))).length, 0);

  await service.finishBatch({ actorId: ACTOR, batchId: batch.id, now: NOW });
  assert.equal((await service.getBatch(ACTOR, batch.id))?.batch.status, "completed");

  const stale = await service.createBatch({
    actorId: ACTOR, now: NOW, items: [item(3)], sourceFiles: [],
  });
  const afterExpiry = "2026-09-03T10:00:01.000Z";
  assert.equal(await service.sweepExpired(afterExpiry), 1);
  assert.equal((await service.getBatch(ACTOR, stale.id))?.batch.status, "completed");
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `node --test --import tsx tests/capabilities/business-card-batch-service.test.ts`；Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 image store**

```ts
// features/acquisition/storage/business-card-batch-image-store.ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface BusinessCardBatchImageStore {
  save(batchId: string, itemId: string, jpegBytes: Buffer): Promise<string>;
  read(imagePath: string): Promise<Buffer | null>;
  removeItemImage(imagePath: string): Promise<void>;
  removeBatchImages(batchId: string): Promise<void>;
}

export function createBusinessCardBatchImageStore({
  rootDir = process.env.ORBIT_BATCH_UPLOAD_DIR ?? ".orbit-batch-uploads",
}: { rootDir?: string } = {}): BusinessCardBatchImageStore {
  const absoluteRoot = resolve(rootDir);

  function guardInsideRoot(imagePath: string): string {
    const absolute = resolve(imagePath);
    if (!absolute.startsWith(absoluteRoot + "/")) {
      throw new Error("Business-card batch image path escapes the upload root.");
    }
    return absolute;
  }

  return {
    async save(batchId, itemId, jpegBytes) {
      const directory = join(absoluteRoot, batchId);
      await mkdir(directory, { recursive: true });
      const imagePath = join(directory, `${itemId}.jpg`);
      await writeFile(imagePath, jpegBytes);
      return imagePath;
    },
    async read(imagePath) {
      try {
        return await readFile(guardInsideRoot(imagePath));
      } catch {
        return null;
      }
    },
    async removeItemImage(imagePath) {
      await rm(guardInsideRoot(imagePath), { force: true });
    },
    async removeBatchImages(batchId) {
      await rm(join(absoluteRoot, batchId), { force: true, recursive: true });
    },
  };
}
```

- [ ] **Step 4: 实现批次服务**

`features/acquisition/business-card-batch-service.ts` 按 Interfaces 与行为规则实现。骨架（record 读写与状态迁移核心，其余方法同构展开）：

```ts
import { randomUUID } from "node:crypto";

import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";
import {
  BUSINESS_CARD_BATCH_EXPIRY_DAYS,
  BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS,
  BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS,
  BUSINESS_CARD_BATCH_MAX_ITEMS,
  type BusinessCardBatchDTO,
  type BusinessCardBatchItemDTO,
  type BusinessCardBatchItemErrorCode,
  type BusinessCardBatchSourceFile,
  type NewBusinessCardBatchItemInput,
} from "./business-card-batch-contract";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import {
  createBusinessCardBatchImageStore,
  type BusinessCardBatchImageStore,
} from "./storage/business-card-batch-image-store";

export const BUSINESS_CARD_BATCH_COLLECTIONS = {
  batches: "businessCardBatches",
  items: "businessCardBatchItems",
} as const;

type Envelope = LiveRecord<Record<string, unknown>>;

function envelope(input: {
  workspaceId: string; collectionName: string; recordId: string;
  actorId: string; now: string; createdAt?: string; payload: Record<string, unknown>;
}): Envelope {
  return {
    collectionName: input.collectionName,
    createdAt: input.createdAt ?? input.now,
    evidenceIds: [],
    lifecycleState: "active",
    payload: input.payload,
    recordId: input.recordId,
    sourceId: input.recordId,
    sourceType: "business_card_ocr",
    updatedAt: input.now,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
}

function batchFromRecord(record: Envelope): BusinessCardBatchDTO | null {
  const batch = record.payload.batch;
  return batch && typeof batch === "object" ? (batch as BusinessCardBatchDTO) : null;
}

function itemFromRecord(record: Envelope): BusinessCardBatchItemDTO | null {
  const item = record.payload.item;
  return item && typeof item === "object" ? (item as BusinessCardBatchItemDTO) : null;
}

// createBusinessCardBatchService({ store, workspaceId, imageStore, idFactory = randomUUID }):
//   内部辅助：
//   - saveBatch(batch, createdAt) / saveItem(item, createdAt)：包 envelope 后 upsertRecord
//   - readBatch(batchId) / readItem(itemId)：getRecord + payload 解包
//   - listItems(batchId)：listRecords({collectionName: items, sourceId? 不可用 → 全列后 filter item.batchId===batchId}）
//   - recomputeCounts(batchId, now)：由 items 统计 processed/failed/confirmed/skipped 写回 batch；
//     返回 { batchBecameReady }：当 processed+failed===total 且原 status==="processing" 时置
//     "ready_for_review" 并返回 true。
//   各公开方法按行为规则组合上述辅助；confirmItem/skipItem 在状态校验通过后先
//   imageStore.removeItemImage(item.imagePath!)，再写 imagePath: null。
//   过期时间：new Date(Date.parse(now) + BUSINESS_CARD_BATCH_EXPIRY_DAYS * 86_400_000).toISOString()
```

（实现体按注释展开为真实代码；所有方法均已在 Step 1 测试中给定可观察行为，实现以测试为准绳。）

`createConfiguredBusinessCardBatchService`：照 `createConfiguredStorageBusinessCardScanOcrProvider` 的模式——`createConfiguredPostgresLiveRecordStore({env})` 为 null 则返回 null，否则用其 `{store, workspaceId}` + `imageStore ?? createBusinessCardBatchImageStore()` 构造。

`.gitignore` 追加一行 `.orbit-batch-uploads/`。

- [ ] **Step 5: 跑测试确认通过** — Run: `node --test --import tsx tests/capabilities/business-card-batch-service.test.ts`；Expected: 4 项 PASS。

- [ ] **Step 6: Commit**

```bash
git add features/acquisition/business-card-batch-service.ts features/acquisition/storage/business-card-batch-image-store.ts tests/capabilities/business-card-batch-service.test.ts .gitignore
git commit -m "feat(acquisition): add durable business-card batch service with leased items"
```

---

### Task 3: PDF 拆页模块

**Files:**
- Create: `features/acquisition/business-card-pdf-pagination.ts`
- Test: `tests/capabilities/business-card-pdf-pagination.test.ts`

**Interfaces:**
- Produces: `async function paginatePdfToCardImages(input: { pdfBytes: Buffer; maxPages: number }): Promise<readonly { page: number; jpegBytes: Buffer }[]>`——每页渲染为长边 ≤3072px、质量 88 的 JPEG；页数超 `maxPages` 抛 `Error("BUSINESS_CARD_BATCH_TOO_LARGE")`；无法解析抛 `Error("BUSINESS_CARD_PDF_UNREADABLE")`。

- [ ] **Step 1: 安装依赖并探针验证**

```bash
cd /Users/li/work/orbit/repos/orbits && npm i pdfjs-dist @napi-rs/canvas
```

写一次性探针（scratchpad）：用 `pdfjs-dist/legacy/build/pdf.mjs` 的 `getDocument({ data, disableWorker: true })` + `@napi-rs/canvas` 的 `createCanvas` 渲染下方 Step 2 的最小 PDF 第 1 页，确认能得到非空 JPEG。**若 pdfjs 在本 Node 版本 (v25) 报兼容错误**，改用 `mupdf` npm 包（AGPL，需在任务汇报中向用户明示许可证影响并等确认）——先探针，探针通过才继续。

- [ ] **Step 2: 写失败测试**

`tests/capabilities/business-card-pdf-pagination.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { paginatePdfToCardImages } from "../../features/acquisition/business-card-pdf-pagination";

// 手写最小两页空白 PDF（Letter 尺寸），pdfjs 可解析。
const TWO_PAGE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 5
0000000000 65535 f 
trailer << /Size 5 /Root 1 0 R >>
startxref
0
%%EOF`,
  "latin1",
);

test("a two-page PDF becomes two JPEG card images", async () => {
  const pages = await paginatePdfToCardImages({ maxPages: 500, pdfBytes: TWO_PAGE_PDF });

  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((entry) => entry.page), [1, 2]);
  for (const entry of pages) {
    assert.equal(entry.jpegBytes[0], 0xff);
    assert.equal(entry.jpegBytes[1], 0xd8);
  }
});

test("page count above maxPages rejects as batch-too-large", async () => {
  await assert.rejects(
    paginatePdfToCardImages({ maxPages: 1, pdfBytes: TWO_PAGE_PDF }),
    /BUSINESS_CARD_BATCH_TOO_LARGE/,
  );
});

test("garbage bytes reject as unreadable", async () => {
  await assert.rejects(
    paginatePdfToCardImages({ maxPages: 500, pdfBytes: Buffer.from("not a pdf") }),
    /BUSINESS_CARD_PDF_UNREADABLE/,
  );
});
```

（若手写 PDF 无法被 pdfjs 解析——xref 简化可能不被接受——Step 1 探针阶段改为用 `sips -s format pdf` 从 fixture PNG 生成单页 PDF、提交为 `tests/fixtures/business-card-two-page.pdf`（两份单页合并可用 macOS `join.py`），测试读 fixture 文件。以探针结果为准，二选一落实，不留两可。）

- [ ] **Step 3: 跑测试确认失败** — Run: `node --test --import tsx tests/capabilities/business-card-pdf-pagination.test.ts`；Expected: FAIL。

- [ ] **Step 4: 实现**

```ts
// features/acquisition/business-card-pdf-pagination.ts
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_RENDER_EDGE_PX = 3072;
const JPEG_QUALITY = 88;

export async function paginatePdfToCardImages(input: {
  pdfBytes: Buffer;
  maxPages: number;
}): Promise<readonly { page: number; jpegBytes: Buffer }[]> {
  let document;
  try {
    document = await getDocument({
      data: new Uint8Array(input.pdfBytes),
      disableWorker: true,
    }).promise;
  } catch {
    throw new Error("BUSINESS_CARD_PDF_UNREADABLE");
  }

  if (document.numPages > input.maxPages) {
    throw new Error("BUSINESS_CARD_BATCH_TOO_LARGE");
  }

  const pages: { page: number; jpegBytes: Buffer }[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      MAX_RENDER_EDGE_PX / Math.max(baseViewport.width, baseViewport.height),
      4,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    pages.push({
      jpegBytes: canvas.toBuffer("image/jpeg", JPEG_QUALITY / 100),
      page: pageNumber,
    });
  }

  return pages;
}
```

（`@napi-rs/canvas` 的 `toBuffer("image/jpeg", quality)` 质量参数为 0–1；类型断言按探针实测调整——pdfjs 的 render 参数类型与 napi canvas context 存在名义类型差异，用 `as unknown as` 桥接并加一行注释说明。）

- [ ] **Step 5: 跑测试确认通过** — Run: `node --test --import tsx tests/capabilities/business-card-pdf-pagination.test.ts`；Expected: 3 项 PASS。

- [ ] **Step 6: Commit**

```bash
git add features/acquisition/business-card-pdf-pagination.ts tests/capabilities/business-card-pdf-pagination.test.ts package.json package-lock.json
git add tests/fixtures/business-card-two-page.pdf 2>/dev/null || true
git commit -m "feat(acquisition): rasterize multi-page PDFs into batch card images"
```

---

### Task 4: 批次 API（创建/列表/详情/取图）

**Files:**
- Create: `app/api/contact-drafts/business-card/batches/route.ts` + `handler.ts`
- Create: `app/api/contact-drafts/business-card/batches/[id]/route.ts` + `handler.ts`
- Create: `app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/route.ts` + `handler.ts`
- Test: `tests/api/business-card-batch-routes.test.ts`

**Interfaces:**
- Consumes: Task 2 service、Task 3 pagination、现有 `business-card-image-normalization`（`resolveBusinessCardUploadMimeType`/`isBusinessCardUploadMimeType`/`normalizeBusinessCardUploadImage`）、`app/api/_shared/authenticated-actor.ts`（`resolveAuthenticatedApiActor` 注入模式照抄 `app/api/contact-drafts/business-card/scan/handler.ts:94-105`）、`shared/api/envelope.ts` 的 `success`/`failure`/`runtimeBoundaryHeaders`。
- Produces:
  - `POST /api/contact-drafts/business-card/batches`：multipart `files[]`；成功 → `success({ batch, acceptedFiles, rejectedFiles })`；超 500 → 400 `BUSINESS_CARD_BATCH_TOO_LARGE`。`rejectedFiles: {fileName, reason}[]`（单文件损坏/超限/类型不符不阻断整批，除非拒绝后 0 项）。
  - `GET /api/contact-drafts/business-card/batches` → `success({ batches })`（当前 actor）。
  - `GET /api/contact-drafts/business-card/batches/[id]` → `success({ batch, items })`；items 在 `processing` 阶段不含 `extraction`（只含状态字段），`ready_for_review` 起含全量（响应体积控制，spec 组件 2）。
  - `GET .../items/[itemId]/image` → `image/jpeg` 字节，`Cache-Control: private, max-age=0`；图已删/非本人 → 404。
- Handler 工厂均为 `createXxxHandler(resolveActor = resolveAuthenticatedApiActor, service = createConfiguredBusinessCardBatchService())` 形式，测试注入内存实现。

- [ ] **Step 1: 写失败测试**

`tests/api/business-card-batch-routes.test.ts`（照 `tests/api/agent-action-ledger-routes.test.ts` 的 route-handler 直调风格；内存 store + 临时目录构造真 service，`resolveActor` 注入假 actor）：

```ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBusinessCardBatchCollectionHandlers } from "../../app/api/contact-drafts/business-card/batches/handler";
import { createBusinessCardBatchDetailHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/handler";
import { createBusinessCardBatchItemImageHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/handler";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = { id: "account:batch-api", label: "Batch API Tester" };
const resolveActor = async () => ACTOR;

// 1x1 JPEG（最小合法 JPEG 字节）
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

async function setup() {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-api-"));
  const imageStore = createBusinessCardBatchImageStore({ rootDir });
  const service = createBusinessCardBatchService({
    imageStore,
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  return { service };
}

function uploadRequest(files: { name: string; type: string; bytes: Buffer }[]): Request {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", new File([file.bytes], file.name, { type: file.type }));
  }
  return new Request("http://localhost/api/contact-drafts/business-card/batches", {
    body: formData,
    method: "POST",
  });
}

test("batch upload accepts images, rejects bad files without dropping the batch, and lists it", async () => {
  const { service } = await setup();
  const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, service);

  const response = await handlers.POST(
    uploadRequest([
      { bytes: TINY_JPEG, name: "card-1.jpg", type: "image/jpeg" },
      { bytes: Buffer.from("nope"), name: "junk.txt", type: "text/plain" },
    ]),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      batch: { id: string; totalItems: number };
      rejectedFiles: readonly { fileName: string }[];
    };
  };
  assert.equal(body.data.batch.totalItems, 1);
  assert.equal(body.data.rejectedFiles[0]?.fileName, "junk.txt");

  const listResponse = await handlers.GET();
  const listBody = (await listResponse.json()) as { data: { batches: readonly { id: string }[] } };
  assert.equal(listBody.data.batches[0]?.id, body.data.batch.id);
});

test("batch detail hides extraction while processing and the image route serves then 404s", async () => {
  const { service } = await setup();
  const handlers = createBusinessCardBatchCollectionHandlers(resolveActor, service);
  const detail = createBusinessCardBatchDetailHandler(resolveActor, service);
  const image = createBusinessCardBatchItemImageHandler(resolveActor, service);

  const created = await handlers.POST(
    uploadRequest([{ bytes: TINY_JPEG, name: "card-1.jpg", type: "image/jpeg" }]),
  );
  const { batch } = ((await created.json()) as { data: { batch: { id: string } } }).data;

  const detailResponse = await detail(
    new Request("http://localhost"), { params: Promise.resolve({ id: batch.id }) },
  );
  const detailBody = (await detailResponse.json()) as {
    data: { items: readonly { id: string; extraction?: unknown }[] };
  };
  const itemId = detailBody.data.items[0]!.id;
  assert.equal("extraction" in detailBody.data.items[0]!, false);

  const imageResponse = await image(
    new Request("http://localhost"),
    { params: Promise.resolve({ id: batch.id, itemId }) },
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/jpeg");

  await service.skipItem({ actorId: ACTOR.id, batchId: batch.id, itemId, now: new Date().toISOString() });
  const goneResponse = await image(
    new Request("http://localhost"),
    { params: Promise.resolve({ id: batch.id, itemId }) },
  );
  assert.equal(goneResponse.status, 404);
});
```

（`skipItem` 对 `pending` item 的调用在 Task 2 状态校验里只允许 extracted/failed——本测试改为先用 service 直接把 item 走到 extracted：`claimPendingItems` + `completeItem`，再 skip。写测试时按此调整，保持状态机严格。）

- [ ] **Step 2: 跑测试确认失败** — Run: `node --test --import tsx tests/api/business-card-batch-routes.test.ts`；Expected: FAIL。

- [ ] **Step 3: 实现 handlers**

`batches/handler.ts` 核心逻辑（POST）：

```ts
// 伪签名：createBusinessCardBatchCollectionHandlers(resolveActor, service?)
//   -> { GET(): Promise<Response>; POST(request: Request): Promise<Response> }
// POST 流程：
//   actor = await resolveActor(); 无 → authenticatedApiActorRequiredResponse(mode)
//   service 为 null → failure BUSINESS_CARD_BATCH_UNCONFIGURED (503)
//   formData = await request.formData(); files = formData.getAll("files") 中的 File
//   对每个 file：
//     mime = resolveBusinessCardUploadMimeType({ declaredType: file.type, fileName: file.name })
//     if mime === "application/pdf" 或扩展名 .pdf：
//       bytes ≤ BUSINESS_CARD_BATCH_MAX_PDF_BYTES 否则 rejected(reason:"pdf_too_large")
//       pages = await paginatePdfToCardImages({ pdfBytes, maxPages: 剩余额度 })
//         BUSINESS_CARD_PDF_UNREADABLE → rejected(reason:"pdf_unreadable")，继续下一文件
//         BUSINESS_CARD_BATCH_TOO_LARGE → 整批 400（额度语义）
//       每页 → item: { imageJpegBase64: page.jpegBytes.toString("base64"),
//                      imageDigest: sha256(page.jpegBytes), sourcePage: page.page,
//                      uploadMimeType: "application/pdf" }
//     else if isBusinessCardUploadMimeType(mime)：
//       bytes ≤ 10MiB 否则 rejected(reason:"image_too_large")
//       normalized = await normalizeBusinessCardUploadImage({ imageBase64, mimeType: mime })
//         失败 → rejected(reason:"image_unreadable")
//       item: { imageJpegBase64: normalized.imageBase64,
//               imageDigest: sha256(原始 bytes), sourcePage: null, uploadMimeType: mime }
//     else rejected(reason:"unsupported_type")
//   items.length === 0 → 400 BUSINESS_CARD_BATCH_EMPTY
//   items.length > BUSINESS_CARD_BATCH_MAX_ITEMS → 400 BUSINESS_CARD_BATCH_TOO_LARGE
//   batch = await service.createBatch({...}); success({ batch, acceptedFiles, rejectedFiles })
```

按注释展开为真实代码；envelope/错误码用 `shared/api/envelope.ts` 与 `shared/errors/app-error.ts` 现有工具（错误码不存在则用 `failure` 的通用 AppError 构造，HTTP 状态显式传入，参考 scan handler 的 `businessCardScanOcrFailureToAppError` 用法但无需新建映射表——批次 API 直接构造 `AppError`）。detail handler 的 `extraction` 裁剪：`batch.status === "processing"` 时对每个 item 展开 `{ extraction: _omit, ...rest }`。image handler：`service.getBatch` 校验 actor → 找 item → `imagePath` 非空 → 用与 service 相同的 imageStore 读字节（`createBusinessCardBatchItemImageHandler(resolveActor, service, imageStore?)` 第三参注入，默认 `createBusinessCardBatchImageStore()`）。三个 `route.ts` 只做 `export const POST/GET = handler` 接线（照 scan/route.ts）。

- [ ] **Step 4: 跑测试确认通过** — Run: `node --test --import tsx tests/api/business-card-batch-routes.test.ts && npm run typecheck`；Expected: PASS + 类型干净。

- [ ] **Step 5: Commit**

```bash
git add app/api/contact-drafts/business-card/batches tests/api/business-card-batch-routes.test.ts
git commit -m "feat(api): add business-card batch upload, listing, detail, and image routes"
```

---

### Task 5: 后台 worker + launch.json + 完成通知

**Files:**
- Create: `features/acquisition/business-card-batch-worker.ts`（可测核心）
- Create: `scripts/run-business-card-batch-worker.ts`（进程入口，照 `scripts/run-notification-delivery-worker.ts`）
- Modify: `/Users/li/work/orbit/.claude/launch.json`（新增 worker 配置）
- Test: `tests/capabilities/business-card-batch-worker.test.ts`

**Interfaces:**
- Consumes: Task 2 service；`BusinessCardCloudOcrProvider`（注入，生产用 `createConfiguredBusinessCardCloudOcrProvider()`）；`normalizeBusinessCardExtraction`/`reviewIssuesForBusinessCard`；通知：`createNotificationDeliveryService({ actorId })` 的 `.materialize({ signalId, signalRevision, phase: "commitment", channel: "in_app", title, body, data, scheduledFor })`（接口见 `features/notifications/delivery-service.ts:73-90`）。
- Produces:

```ts
export function createBusinessCardBatchWorker(options: {
  service: BusinessCardBatchService;
  imageStore: BusinessCardBatchImageStore;
  provider: BusinessCardCloudOcrProvider;
  notify: (input: { actorId: string; batchId: string; now: string }) => Promise<void>;
  concurrency?: number;   // 默认 3
}): { runOnce(input: { workerId: string; now: string }): Promise<{ claimed: number; completed: number; failed: number; swept: number }> }
```

`runOnce` 行为：`sweepExpired(now)` → `claimPendingItems({limit: concurrency})` → 并发处理每 item：读图（`imageStore.read(imagePath)`，图丢失按 `OCR_PROVIDER_FAILED` fail）→ `provider.extract({imageBase64, mimeType: "image/jpeg"})` → `normalizeBusinessCardExtraction` + `reviewIssuesForBusinessCard` → `completeItem`；provider 抛错按错误码映射（`PROVIDER_TIMEOUT`→`OCR_PROVIDER_TIMEOUT`、`INVALID_STRUCTURED_OUTPUT`→`OCR_INVALID_OUTPUT`、其余→`OCR_PROVIDER_FAILED`）→ `failItem`。任一 complete/fail 返回 `batchBecameReady: true` → 调 `notify`（batch 的 actorId 从 item 取）。

- [ ] **Step 1: 写失败测试**

`tests/capabilities/business-card-batch-worker.test.ts`：

```ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../../features/acquisition/business-card-batch-worker";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { BusinessCardCloudOcrProviderError } from "../../features/acquisition/business-card-ocr-validation";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:batch-worker-test";
const NOW = "2026-08-26T12:00:00.000Z";

const EXTRACTION = {
  addresses: [], certifications: [], contactPoints: [], departments: [],
  detectedLanguages: ["ja"], emails: [], fullName: "青空 太郎",
  nativeFullName: "青空 太郎", organization: "架空技研株式会社",
  romanizedFullName: null, title: "室長", website: null,
};

async function setup(extract: (input: { imageBase64: string }) => Promise<unknown>) {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-worker-"));
  const imageStore = createBusinessCardBatchImageStore({ rootDir });
  const service = createBusinessCardBatchService({
    imageStore, store: createMemoryLiveRecordStore(), workspaceId: "workspace:test",
  });
  const notifications: { actorId: string; batchId: string }[] = [];
  const worker = createBusinessCardBatchWorker({
    imageStore,
    notify: async (input) => { notifications.push(input); },
    provider: {
      model: "test-model", providerName: "test-provider",
      extract: extract as never,
    },
    service,
  });
  return { notifications, service, worker };
}

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    imageDigest: `sha256:${index}`,
    imageJpegBase64: Buffer.from(`jpeg-${index}`).toString("base64"),
    seq: index + 1,
    sourceFileName: `card-${index + 1}.jpg`,
    sourcePage: null,
    uploadMimeType: "image/jpeg",
  }));
}

test("worker extracts claimed items and notifies once when the batch becomes ready", async () => {
  const { notifications, service, worker } = await setup(async () => ({
    extraction: EXTRACTION,
    usage: { inputTokens: 10, latencyMs: 5, outputTokens: 5 },
  }));
  const batch = await service.createBatch({
    actorId: ACTOR, items: items(2), now: NOW, sourceFiles: [],
  });

  const first = await worker.runOnce({ now: NOW, workerId: "w" });
  assert.equal(first.completed, 2);

  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.batch.status, "ready_for_review");
  assert.equal(detail?.items[0]?.extraction?.fullName, "青空 太郎");
  assert.deepEqual(notifications, [{ actorId: ACTOR, batchId: batch.id, now: NOW }]);

  const idle = await worker.runOnce({ now: NOW, workerId: "w" });
  assert.equal(idle.claimed, 0, "no re-processing after ready");
  assert.equal(notifications.length, 1, "notify fires exactly once");
});

test("worker retries a timeout once and then marks the item failed", async () => {
  let calls = 0;
  const { service, worker } = await setup(async () => {
    calls += 1;
    throw new BusinessCardCloudOcrProviderError("PROVIDER_TIMEOUT", "timed out");
  });
  const batch = await service.createBatch({
    actorId: ACTOR, items: items(1), now: NOW, sourceFiles: [],
  });

  await worker.runOnce({ now: NOW, workerId: "w" });   // 第一次失败 → 回 pending
  await worker.runOnce({ now: NOW, workerId: "w" });   // 第二次失败 → failed

  assert.equal(calls, 2);
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items[0]?.status, "failed");
  assert.equal(detail?.items[0]?.errorCode, "OCR_PROVIDER_TIMEOUT");
  assert.equal(detail?.batch.status, "ready_for_review");
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `node --test --import tsx tests/capabilities/business-card-batch-worker.test.ts`；Expected: FAIL。

- [ ] **Step 3: 实现 worker 核心**

`features/acquisition/business-card-batch-worker.ts` 按 Interfaces 行为实现（`runOnce` 内 `Promise.all` 处理已认领 items；notify 去重靠 `batchBecameReady` 只在状态迁移那一次返回 true——Task 2 已保证）。

- [ ] **Step 4: 实现进程入口与 launch 配置**

`scripts/run-business-card-batch-worker.ts`：

```ts
import { loadEnvConfig } from "@next/env";

import { createConfiguredBusinessCardBatchService } from "../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../features/acquisition/business-card-batch-worker";
import { createBusinessCardBatchImageStore } from "../features/acquisition/storage/business-card-batch-image-store";
import { createConfiguredBusinessCardCloudOcrProvider } from "../features/acquisition/business-card-ocr-provider-selection";
import { createNotificationDeliveryService } from "../features/notifications/delivery-service";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  1_000,
  Number.parseInt(process.env.ORBIT_BATCH_WORKER_POLL_MS ?? "3000", 10) || 3_000,
);
const workerId =
  process.env.ORBIT_BATCH_WORKER_ID?.trim() ?? `business-card-batch-worker:${process.pid}`;

async function main(): Promise<void> {
  const service = createConfiguredBusinessCardBatchService();
  const provider = createConfiguredBusinessCardCloudOcrProvider();
  if (!service) throw new Error("A configured live database is required for the batch worker.");
  if (!provider) throw new Error("A configured business-card OCR provider is required for the batch worker.");

  const worker = createBusinessCardBatchWorker({
    imageStore: createBusinessCardBatchImageStore(),
    notify: async ({ actorId, batchId, now }) => {
      await createNotificationDeliveryService({ actorId }).materialize({
        body: "名片批次识别完成，请回到导入中心逐张确认。",
        channel: "in_app",
        data: { batchId },
        phase: "commitment",
        scheduledFor: now,
        signalId: `signal:business-card-batch:${batchId}`,
        signalRevision: "1",
        title: "名片批量识别完成",
      });
    },
    provider,
    service,
  });

  while (true) {
    const result = await worker.runOnce({ now: new Date().toISOString(), workerId });
    if (result.claimed > 0 || result.swept > 0) {
      process.stdout.write(`${JSON.stringify({ result, workerId })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
```

`/Users/li/work/orbit/.claude/launch.json` 的 `configurations` 追加：

```json
{
  "name": "batch-worker",
  "runtimeExecutable": "npx",
  "runtimeArgs": ["tsx", "scripts/run-business-card-batch-worker.ts"],
  "cwd": "repos/orbits"
}
```

（launch.json 无 `cwd` 字段支持则改为 `"runtimeArgs": ["--prefix", "repos/orbits", "exec", "tsx", "scripts/run-business-card-batch-worker.ts"]` 用 npm，落实前看现有条目怎么写 `--prefix`。）

- [ ] **Step 5: 跑测试与 typecheck** — Run: `node --test --import tsx tests/capabilities/business-card-batch-worker.test.ts && npm run typecheck`；Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add features/acquisition/business-card-batch-worker.ts scripts/run-business-card-batch-worker.ts tests/capabilities/business-card-batch-worker.test.ts ../../.claude/launch.json
git commit -m "feat(acquisition): add leased business-card batch worker with ready notification"
```

---

### Task 6: 确认写入扩展（notes + allowDuplicate）与批次确认 API

**Files:**
- Modify: `shared/domain/contracts.ts`（`ContactDTO` 增 `notes?: string`，插在 `profileSnippet?` 之后）
- Modify: `features/contacts/contact-write-contract.ts:22-35`（`ConfirmBusinessCardContactInput` 增 `notes?: string; allowDuplicate?: boolean;`）
- Modify: `features/contacts/live-contact-write-service.ts`（透传 notes；`allowDuplicate===true` 时跳过 `findDuplicate`）
- Modify: `features/acquisition/storage/business-card-scan-live-record-provider.ts:105-121`（`contactFromRecord` 增 `notes: optionalString(payload.notes)`）
- Create: `app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/confirm/route.ts` + `handler.ts`
- Create: `app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/skip/route.ts` + `handler.ts`
- Create: `app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/retry/route.ts` + `handler.ts`
- Create: `app/api/contact-drafts/business-card/batches/[id]/finish/route.ts` + `handler.ts`
- Modify: 联系人详情页备注展示——先 `grep -rn "profileSnippet" "app/(app)/app/contacts/[id]"` 定位渲染处，在其旁增加 notes 区块（`{contact.notes ? <展示块> : null}`，多行 `white-space: pre-line`）
- Test: `tests/capabilities/business-card-contact-write.test.ts`（追加）、`tests/api/business-card-batch-routes.test.ts`（追加确认流用例）

**Interfaces:**
- Consumes: Task 1 `aggregateBusinessCardNotes`（由前端预填，API 只接收最终 notes 字符串）；Task 2 service；现有 `createBusinessCardContactWriteService`。
- Produces:
  - `POST .../items/[itemId]/confirm`：body `{ displayName, organization, role, email, phone, relationshipContext, notes, allowDuplicate? }`；流程：读 item（须 `extracted`）→ `writeService.confirmBusinessCardContact({...body, actorId, actorLabel, confirmed: true, draftId: itemId, imageDigest: item.imageDigest, evidenceIds: [\`evidence:business-card-batch:${itemId}\`]})` → `duplicate_review` 且未 allowDuplicate → `success({ state: "duplicate_review", duplicate })`（item 不动）；写入成功 → `service.confirmItem` → `success({ state, contact })`。
  - `POST .../skip`、`POST .../retry`：调 service 对应方法。
  - `POST .../finish`：`service.finishBatch`。

- [ ] **Step 1: GitNexus impact**

对 `live-contact-write-service.ts`、`contact-write-contract.ts`、`shared/domain/contracts.ts` 跑文件级依赖 cypher（`MATCH (a)-[r]->(f:File) WHERE f.filePath = '...' RETURN DISTINCT a.filePath`，`-r orbit`，路径前缀 `repos/orbits/`），报告 blast radius。`shared/domain/contracts.ts` 依赖方极多（预计 HIGH 数量级）——但改动是**新增可选字段**，向后兼容；在汇报中说明这一点后继续。

- [ ] **Step 2: 写失败测试**

`tests/capabilities/business-card-contact-write.test.ts` 末尾追加（构造方式照该文件既有用例——先读其 provider stub 写法，用内存 contacts 数组实现 `getContact`/`listContacts`/`saveContact`）：

```ts
test("confirm persists notes and allowDuplicate bypasses duplicate review", async () => {
  // saved: ContactDTO[]，provider stub 把 saveContact 推入 saved 并回显
  // 先 confirm 一个 email=dup@example.test 的联系人；
  // 再用相同 email、不同 draftId confirm：
  //   1) 默认 → 结果 state === "duplicate_review"，saved 长度不变
  //   2) allowDuplicate: true → state === "created"，saved 新增一条
  // 且第一条写入的 contact.notes === "部门: 事業開発室\n传真(本社): 03-0000-2222"
});
```

（测试体按该文件既有 stub 风格写实，断言如注释所列，不留伪码——执行时先读文件再落笔。）

`tests/api/business-card-batch-routes.test.ts` 追加一个用例：内存 service 造一个 extracted item → confirm handler 注入 stub write service（返回 created）→ 断言 item 变 `confirmed` 且响应 `state: "created"`；再对另一 item 用返回 `duplicate_review` 的 stub → 断言 item 仍 `extracted`。

- [ ] **Step 3: 跑测试确认失败** — Run: `node --test --import tsx tests/capabilities/business-card-contact-write.test.ts tests/api/business-card-batch-routes.test.ts`；Expected: 新用例 FAIL。

- [ ] **Step 4: 实现**

- `contracts.ts`：`profileSnippet?: string;` 下一行加 `notes?: string;`。
- `contact-write-contract.ts`：input 增两个可选字段（字母序插入：`allowDuplicate?: boolean;` 在 `actorLabel` 后、`notes?: string;` 在 `imageDigest` 后）。
- `live-contact-write-service.ts`：`isValidInput` 不变；写 contact 时 `...(nonEmpty(input.request.notes ?? "") ? { notes: input.request.notes } : {})`；`findDuplicate` 调用处包一层 `input.request.allowDuplicate === true ? null : findDuplicate(...)`。
- 四个批次动作 handler：工厂注入 `(resolveActor, batchService?, writeService?)`；route.ts 接线。
- 联系人详情页 notes 区块。

- [ ] **Step 5: 跑测试确认通过** — Run: `node --test --import tsx tests/capabilities/business-card-contact-write.test.ts tests/api/business-card-batch-routes.test.ts tests/capabilities/business-card-scan-ocr-live-store.test.ts && npm run typecheck && npm run lint`；Expected: 全 PASS（lint 的 tsc 列表含 contracts.ts 与 contact 页面）。

- [ ] **Step 6: Commit**

```bash
git add shared/domain/contracts.ts features/contacts/contact-write-contract.ts features/contacts/live-contact-write-service.ts features/acquisition/storage/business-card-scan-live-record-provider.ts "app/api/contact-drafts/business-card/batches/[id]" "app/(app)/app/contacts/[id]" tests/capabilities/business-card-contact-write.test.ts tests/api/business-card-batch-routes.test.ts
git commit -m "feat(contacts): persist business-card notes and add batch confirm actions"
```

---

### Task 7: 前端——两按钮入口、批次列表、进度页、逐张确认

**Files:**
- Create: `app/(app)/app/contacts/new/batch/[id]/page.tsx`（服务端组件：availability + 首屏批次数据）
- Create: `app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx`（客户端：进度 + 确认两模式）
- Create: `app/(app)/app/contacts/business-card-batch-entry.tsx`（两按钮入口 + 批次列表，客户端组件）
- Modify: `app/(app)/app/contacts/orbit-real-cards-import.tsx`（桌面 `nc-note` 之后、移动「其他来源」之前挂 `<BusinessCardBatchEntry />`）
- Test: `tests/pages/app-business-card-batch-view.test.tsx`

**Interfaces:**
- Consumes: Task 4/6 全部 API；Task 1 `aggregateBusinessCardNotes`；现有 `useOrbitLanguage`、`Icon`、`AccountTopNav`、`.bcc-*`/`btn` 样式类（复用 `business-card-capture-workspace.tsx` 的 CAPTURE_STYLE 类名约定，页面局部 `<style>` 照 `orbit-real-cards-import.tsx` 的 `LOCAL_STYLE` 模式，作用域前缀 `[data-orbit-real-page]`）。

**入口组件（Global Constraints 逐字要求）**：两个并排按钮——

```tsx
<div className="bcc-actions">
  <button className="btn btn-primary" onClick={() => photoInputRef.current?.click()} type="button">
    <Icon name="upload" size={17} />
    {t({ en: "Bulk upload photos", zh: "批量上传照片" })}
  </button>
  <button className="btn btn-ghost" onClick={() => pdfInputRef.current?.click()} type="button">
    <Icon name="doc" size={17} />
    {t({ en: "Upload PDF", zh: "上传 PDF" })}
  </button>
</div>
<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
       multiple onChange={submitBatch} ref={photoInputRef} style={{ display: "none" }} type="file" />
<input accept="application/pdf,.pdf"
       onChange={submitBatch} ref={pdfInputRef} style={{ display: "none" }} type="file" />
```

（`Icon` 的可用图标名先 grep `orbit-reference-primitives` 确认，"doc" 不存在就用现有最近似图标。）`submitBatch`：FormData `files` 逐个 append → POST 批次 API → 成功 `window.location.href = /app/contacts/new/batch/${batch.id}`；`rejectedFiles` 非空时先 toast/文本提示。入口下方渲染批次列表（GET 列表 API，状态 pill + 链接进批次页）。

**批次页视图状态机**：

- 所有模式顶部常驻隐私说明（spec 隐私放宽条款的界面明示，逐字）：`{t({ en: "Card images are kept only until you finish reviewing them, then deleted.", zh: "卡图保留至你完成确认，确认或跳过后立即删除。" })}`，样式复用 `.bcc-privacy`。
- `processing`：进度条（`processedItems + failedItems`/`totalItems`）、逐卡状态网格（seq + 来源文件名/页码 + 状态 pill；extracted 卡显示缩略图 `<img src={image API}>`）；3s `setInterval` 轮询详情 API（`useEffect` 清理）；`batch.updatedAt` 距今 >60s 且无 item processing → 顶部警示「处理服务未运行，请启动 batch-worker」。
- `ready_for_review`：逐张确认——当前卡 = 第一个 `extracted` 的 item；左 `<img>`（可点开大图）右表单：六个固定格（姓名 `fullName ?? nativeFullName`、公司、职位、邮箱 `emails[0]`、电话 `首个非 fax contactPoint`、认识场景默认 `批量导入 · ${sourceFileName}`）+ 备注 textarea 预填 `aggregateBusinessCardNotes(extraction, { email: 邮箱格当前值初始值, phone: 电话格初始值 })`；按钮：确认并下一张 / 跳过 / （failed 卡）重试；`duplicate_review` 响应 → 卡内提示条 + 「跳过」「仍然创建」（后者带 `allowDuplicate: true` 重发）。全部处理完 → 「完成批次」按钮 → finish API → 完成态（统计 + 返回导入中心链接）。中途刷新/离开：重进时从 API 状态推导当前卡，天然可恢复。
- `completed`：只读统计。

- [ ] **Step 1: 写失败测试**

`tests/pages/app-business-card-batch-view.test.tsx`（照 `tests/pages/app-agent-execution-settings.test.tsx` 的 React 测试环境写法——先读该文件确定 render 工具，再落笔）覆盖三条纯渲染断言：processing 态显示进度与 worker 停摆提示（注入过期 updatedAt 的假批次）；ready_for_review 态第一张 extracted 卡的姓名格预填、备注 textarea 含聚合行；duplicate 提示条在注入 `duplicate_review` 状态时出现。数据全部以 props 注入（把纯视图拆成 `BusinessCardBatchViewPure` 导出供测试，网络层包在外层组件）。

- [ ] **Step 2: 跑测试确认失败** — Run: `node --test --import tsx tests/pages/app-business-card-batch-view.test.tsx`；Expected: FAIL。

- [ ] **Step 3: 实现三个组件与接线** — 按上述结构实现；`page.tsx` 服务端组件照 `app/(app)/app/contacts/new/page.tsx` 的模式（读 availability、传初始数据、`AccountTopNav active="cards"`）。

- [ ] **Step 4: 跑测试 + lint** — Run: `node --test --import tsx tests/pages/app-business-card-batch-view.test.tsx tests/pages/app-contacts-new-live-route-services.test.ts && npm run lint && npm run typecheck`；Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/contacts/new/batch" "app/(app)/app/contacts/business-card-batch-entry.tsx" "app/(app)/app/contacts/orbit-real-cards-import.tsx" tests/pages/app-business-card-batch-view.test.tsx
git commit -m "feat(contacts): add batch import entry, progress page, and card-by-card review"
```

---

### Task 8: 端到端验证 + 收尾

**Files:** 无新代码（发现 bug 则修，修必带测试）。

- [ ] **Step 1: 全量测试对比基线** — `npm test 2>&1 | tail -30`，与基线 diff，零新增失败。
- [ ] **Step 2: 造真实测试物料** — 用 `docs/designs/random_meishi.heic` 转出的两张单卡裁剪 JPEG（scratchpad 已有 `crop-trust.jpg` 的裁剪法）+ scratchpad 里 `npm i pdf-lib` 写脚本把两张 JPEG 合成一个 2 页 PDF。
- [ ] **Step 3: 起 dev server + worker** — Browser pane `preview_start {name:"orbits"}` 与 `{name:"batch-worker"}`；qa@orbit.test 登录。
- [ ] **Step 4: 走全流程** — 导入中心 →「批量上传照片」传 2 张 JPEG +「上传 PDF」传 2 页 PDF（分两批）→ 进批次页看进度 → **关闭页面**、通过导入中心批次列表重进 → 进度恢复 → 全部完成（站内通知出现，铃铛数字变化）→ 逐张确认：至少 1 张改字段+核对备注聚合、1 张触发重复提示选跳过、如有失败卡走重试 → 完成批次 → `/app/contacts` 核对新联系人与详情页备注。文件注入用 DataTransfer+dispatchEvent（只操作 `.orbit-desktop-only` 内 input，避免双布局双请求——先例见单张验证）。桌面 + 移动视口各截图。
- [ ] **Step 5: GitNexus detect-changes + 汇报** — 顶层 `node .gitnexus/run.cjs detect-changes -r orbit --scope compare --base-ref <开工前 HEAD>`；向用户汇报：截图、备注聚合样例、blast radius、`.env.local`/launch 新增项说明（`ORBIT_BATCH_UPLOAD_DIR` 可选）。
