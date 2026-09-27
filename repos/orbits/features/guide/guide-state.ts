/**
 * 引导记录（W0004，W0006 扩展）：`orbit_records` collection `guideState`、recordId `current`。
 *
 * 写法沿用 `features/community/membership.ts` 的单记录模式：workspaceId 按 actor 分片
 * （`<workspace>:guide-actor:<actorId>`），同时写 userId 作为第二道隔离，每人一条，读不到别人的。
 *
 * 本 Sprint 只有三个字段：
 *   - `grandfathered`：D2 老用户判定的**首次**结果（true / false 都落库），写入后不再改变；
 *     null 表示还没判定过。
 *   - `bannerCollapsed`：示例横条是否收起成导航药丸（换浏览器也一致）。
 *   - `version`：记录结构版本（当前为 1），W0006 扩展字段时据此迁移。
 *
 * 写入走 compare-and-swap（`insertRecordIfAbsent` / `updateRecordIfCurrent`），两个字段并发
 * 更新时不会互相覆盖；存储不支持时回落到 upsert。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export const GUIDE_STATE_COLLECTION = "guideState";
export const GUIDE_STATE_RECORD_ID = "current";
export const GUIDE_STATE_VERSION = 1;

/** `GET /api/guide/state` 的 data 形状。 */
export interface GuideState {
  bannerCollapsed: boolean;
  /** null：尚未做过首次判定。 */
  grandfathered: boolean | null;
  version: number;
}

export interface GuideStateService {
  get: () => Promise<GuideState>;
  /** 只在尚未判定时写入；已判定时原样返回第一次的结果。 */
  recordGrandfathered: (value: boolean) => Promise<GuideState>;
  setBannerCollapsed: (value: boolean) => Promise<GuideState>;
}

export interface GuideStatePayload extends Record<string, unknown> {
  bannerCollapsed?: boolean;
  grandfathered?: boolean;
  version: number;
}

export function guideStateWorkspaceId(workspaceId: string, actorId: string): string {
  return `${workspaceId}:guide-actor:${actorId}`;
}

function stateFrom(record: LiveRecord<GuideStatePayload> | null): GuideState {
  const payload = record?.payload;
  return {
    bannerCollapsed: payload?.bannerCollapsed === true,
    grandfathered: typeof payload?.grandfathered === "boolean" ? payload.grandfathered : null,
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
  };
}
