/**
 * 引导记录（W0004，W0006 扩展）：`orbit_records` collection `guideState`、recordId `current`。
 *
 * 写法沿用 `features/community/membership.ts` 的单记录模式：workspaceId 按 actor 分片
 * （`<workspace>:guide-actor:<actorId>`），同时写 userId 作为第二道隔离，每人一条，读不到别人的。
 *
 * 字段：
 *   - `grandfathered`：D2 老用户判定的**首次**结果（true / false 都落库），写入后不再改变；
 *     null 表示还没判定过。
 *   - `bannerCollapsed`：示例横条是否收起成导航药丸（换浏览器也一致）。
 *   - `step1Skipped`（W0006）：第 1 步点过「先这样，继续」。W0054（W54-1）起跳过关闭：只读兼容存量 true
 *     （照算第 1 步完成），服务层与接口都不再写入。
 *   - `currentStep`（W0006）：`/app/start` 停在第几步（1–3；W0035 前可能写过 4，读成 null）。
 *     用户切换步骤、某一步完成后前进到下一步时由页面写入；3 步完成时服务端清空（null = 显示
 *     完成卡片）。
 *   - `completedAt`（W0006）：服务端第一次看到 3 步全部完成的时间，写入后不再改变。
 *   - `version`：记录结构版本（当前为 2）。v1 记录没有 W0006 的三个字段，读取时按默认值
 *     （未跳过、未记录步骤、未完成）补齐，不需要改写存量数据。
 *
 * 写入走 compare-and-swap（`insertRecordIfAbsent` / `updateRecordIfCurrent`），两个字段并发
 * 更新时不会互相覆盖；存储不支持时回落到 upsert。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { isGuideStartStep, type GuideStartStep } from "./start-steps";

export const GUIDE_STATE_COLLECTION = "guideState";
export const GUIDE_STATE_RECORD_ID = "current";
export const GUIDE_STATE_VERSION = 2;

/** `GET /api/guide/state` 的 data 形状。 */
export interface GuideState {
  bannerCollapsed: boolean;
  /** null：前 3 步还没全部完成过。 */
  completedAt: string | null;
  /** null：没有记录（页面按进度推导停在哪一步）。 */
  currentStep: GuideStartStep | null;
  /** null：尚未做过首次判定。 */
  grandfathered: boolean | null;
  step1Skipped: boolean;
  version: number;
}

/**
 * 客户端可写的字段（`PATCH /api/guide/state`）；`grandfathered`、`completedAt` 只由服务端写。
 * W0054：`step1Skipped` 不再可写（存量值只读）。
 */
export interface GuideStatePatch {
  bannerCollapsed?: boolean;
  currentStep?: GuideStartStep;
}

export interface GuideStateService {
  get: () => Promise<GuideState>;
  /** 只在尚未完成过时写入 completedAt 并清空 currentStep；已完成时原样返回。 */
  markCompleted: () => Promise<GuideState>;
  /** 只在尚未判定时写入；已判定时原样返回第一次的结果。 */
  recordGrandfathered: (value: boolean) => Promise<GuideState>;
  setBannerCollapsed: (value: boolean) => Promise<GuideState>;
  /** 一次写入多个客户端字段（同一次 compare-and-swap）；值没变时不写。 */
  update: (patch: GuideStatePatch) => Promise<GuideState>;
}

export interface GuideStatePayload extends Record<string, unknown> {
  bannerCollapsed?: boolean;
  completedAt?: string;
  currentStep?: number | null;
  grandfathered?: boolean;
  step1Skipped?: boolean;
  version: number;
}

export function guideStateWorkspaceId(workspaceId: string, actorId: string): string {
  return `${workspaceId}:guide-actor:${actorId}`;
}

function completedAtFrom(payload: GuideStatePayload | null | undefined): string | null {
  const value = payload?.completedAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function stateFrom(record: LiveRecord<GuideStatePayload> | null): GuideState {
  const payload = record?.payload;
  return {
    bannerCollapsed: payload?.bannerCollapsed === true,
    completedAt: completedAtFrom(payload),
    // 存量数据里的非法值（不是 1–3，包括 W0035 删去「活动」一步之前写下的 4）按「没有记录」处理。
    currentStep: isGuideStartStep(payload?.currentStep) ? payload.currentStep : null,
    grandfathered: typeof payload?.grandfathered === "boolean" ? payload.grandfathered : null,
    step1Skipped: payload?.step1Skipped === true,
    version: GUIDE_STATE_VERSION,
  };
}

/** CAS 要求新的 updatedAt 严格晚于旧值；同一毫秒内连续写时顺延 1ms。 */
function nextTimestamp(now: string, previous: string | undefined): string {
  const nowMs = Date.parse(now);
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  if (Number.isFinite(previousMs) && !(nowMs > previousMs)) {
    return new Date(previousMs + 1).toISOString();
  }
  return now;
}

const MAX_WRITE_ATTEMPTS = 4;

export function createStorageGuideStateService(input: {
  actorId: string;
  now?: () => string;
  store: LiveRecordStoreLike<GuideStatePayload>;
  /** 部署级 workspace（未按 actor 分片）。 */
  workspaceId: string;
}): GuideStateService {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error("Guide state requires an actor.");
  const now = input.now ?? (() => new Date().toISOString());
  const key = {
    collectionName: GUIDE_STATE_COLLECTION,
    recordId: GUIDE_STATE_RECORD_ID,
    workspaceId: guideStateWorkspaceId(input.workspaceId, actorId),
  };

  const readRecord = async () => input.store.getRecord({ ...key, userId: actorId });

  /**
   * 读-改-写：`change` 返回 null 表示不需要写（例如已判定过）。冲突时重读重试。
   */
  async function mutate(
    change: (current: GuideStatePayload | null) => GuideStatePayload | null,
  ): Promise<GuideState> {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const existing = await readRecord();
      const current = existing && existing.lifecycleState !== "deleted" ? existing : null;
      const payload = change(current?.payload ?? null);
      if (!payload) return stateFrom(current);

      const updatedAt = nextTimestamp(now(), current?.updatedAt);
      const record: LiveRecord<GuideStatePayload> = {
        ...key,
        createdAt: current?.createdAt ?? updatedAt,
        evidenceIds: [],
        lifecycleState: "active",
        payload,
        searchText: "iorbit guide state",
        sourceId: "guide-state",
        sourceLabel: "iOrbit onboarding guide state",
        sourceType: "manual",
        updatedAt,
        userId: actorId,
      };

      if (!current) {
        if (!input.store.insertRecordIfAbsent) return stateFrom(await input.store.upsertRecord(record));
        const inserted = await input.store.insertRecordIfAbsent(record);
        if (inserted) return stateFrom(inserted);
        continue;
      }
      if (!input.store.updateRecordIfCurrent) return stateFrom(await input.store.upsertRecord(record));
      const updated = await input.store.updateRecordIfCurrent(record, {
        updatedAt: current.updatedAt,
        userId: actorId,
      });
      if (updated) return stateFrom(updated);
    }
    throw new Error("Guide state changed concurrently; retry later.");
  }

  return {
    async get() {
      return stateFrom(await readRecord());
    },
    recordGrandfathered(value) {
      return mutate((current) =>
        typeof current?.grandfathered === "boolean"
          ? null
          : { ...current, grandfathered: value, version: GUIDE_STATE_VERSION },
      );
    },
    setBannerCollapsed(value) {
      return mutate((current) =>
        current?.bannerCollapsed === value
          ? null
          : { ...current, bannerCollapsed: value, version: GUIDE_STATE_VERSION },
      );
    },
    update(patch) {
      return mutate((current) => {
        const next: GuideStatePayload = { ...current, version: GUIDE_STATE_VERSION };
        let changed = false;
        if (patch.bannerCollapsed !== undefined && current?.bannerCollapsed !== patch.bannerCollapsed) {
          next.bannerCollapsed = patch.bannerCollapsed;
          changed = true;
        }
        if (patch.currentStep !== undefined) {
          if (!isGuideStartStep(patch.currentStep)) throw new Error("currentStep must be 1–3.");
          if (current?.currentStep !== patch.currentStep) {
            next.currentStep = patch.currentStep;
            changed = true;
          }
        }
        return changed ? next : null;
      });
    },
    markCompleted() {
      return mutate((current) => {
        if (completedAtFrom(current)) return null;
        return { ...current, completedAt: now(), currentStep: null, version: GUIDE_STATE_VERSION };
      });
    },
  };
}
