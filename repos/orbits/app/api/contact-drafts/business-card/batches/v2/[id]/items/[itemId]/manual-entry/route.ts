import { createIngestV2ManualEntryHandler } from "../../../../handlers";

export const dynamic = "force-dynamic";
// W0057（G-8）：确认后在 `after()` 里当场生成洞察（合批 ≤3 s + 供应商 ≤45 s + 写回），需要容纳它的时长。
export const maxDuration = 120;

export const POST = createIngestV2ManualEntryHandler();
