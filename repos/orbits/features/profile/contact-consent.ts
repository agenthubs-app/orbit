/**
 * 联系方式「保存即确认」（2026-11-27 定）。
 *
 * 联系方式只给人脉里的人（交换完成）和报名活动的主办方看，而且要本人在写明「谁能看到」的界面上亲手确认过：
 * - 引导第①步：确认第 1 屏时写进 profileOnboardingFlow 的 contactMethodsConfirmed（既有做法，不动）。
 * - 编辑资料面板：保存时请求里带 contactMethodsConfirmed: true 且确实提交了 handles，
 *   这里写一条 profileContactConsent 记录——四种里至少有一种 → confirmed true；全部清空 → false（撤销，下次再填重新确认）。
 * 名片扫描自动写入、迁移导入、后台同步不带这个标记，不改记录。
 *
 * 读取（人脉 / 主办方）用 contactConsentSql：有 profileContactConsent 记录就以它为准，否则沿用引导的标记。
 * 单独成一条记录，不碰引导进度记录——没有进度记录的老账号若为此新建进度记录，会被引导门禁当成「未完成」拦回去。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export const PROFILE_CONTACT_CONSENT_COLLECTION = "profileContactConsent";
const RECORD_ID = "current";

export interface ProfileContactConsentPayload extends Record<string, unknown> {
  version: 1;
  confirmed: boolean;
  /** 哪个界面写的（目前只有编辑资料面板）。 */
  source: "profile_panel";
}

export function profileContactConsentKey(workspaceId: string, actorId: string) {
  return { workspaceId: `${workspaceId}:profile-onboarding-actor:${actorId}`, collectionName: PROFILE_CONTACT_CONSENT_COLLECTION, recordId: RECORD_ID };
}

/** 写入 / 撤销确认。last-writer-wins：同一个人在两个标签页先后保存，以后一次为准。 */
export async function setProfileContactConsent(input: {
  store: LiveRecordStoreLike<ProfileContactConsentPayload>;
  workspaceId: string;
  actorId: string;
  confirmed: boolean;
  now?: () => string;
}): Promise<void> {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error("Contact consent requires an actor.");
  const key = profileContactConsentKey(input.workspaceId, actorId);
  const at = (input.now ?? (() => new Date().toISOString()))();
  const existing = await input.store.getRecord({ ...key, userId: actorId });
  if (existing?.lifecycleState === "active" && existing.payload.confirmed === input.confirmed) return;
  const record: LiveRecord<ProfileContactConsentPayload> = {
    ...key,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    userId: actorId,
    lifecycleState: "active",
    evidenceIds: [],
    sourceType: "manual",
    sourceId: "profile-contact-consent",
    payload: { version: 1, confirmed: input.confirmed, source: "profile_panel" },
  };
  await input.store.upsertRecord(record);
}

/**
 * SQL 条件：本人是否同意分享联系方式。`workspace` / `actor` 是 SQL 表达式（参数或列）。
 * 有 profileContactConsent 记录就用它的 confirmed，否则看引导第①步写下的 contactMethodsConfirmed。
 */
export function contactConsentSql(workspace: string, actor: string): string {
  const scope = `${workspace} || ':profile-onboarding-actor:' || ${actor}`;
  return `coalesce(
      (select (cc.payload ->> 'confirmed')::boolean from orbit_records cc
        where cc.workspace_id = ${scope} and cc.collection_name = '${PROFILE_CONTACT_CONSENT_COLLECTION}'
          and cc.record_id = '${RECORD_ID}' and cc.user_id = ${actor} and cc.lifecycle_state = 'active' limit 1),
      exists (select 1 from orbit_records consent
        where consent.workspace_id = ${scope}
          and consent.collection_name = 'profileOnboardingFlow' and consent.record_id = 'current'
          and consent.user_id = ${actor} and consent.lifecycle_state = 'active'
          and consent.payload -> 'contactMethodsConfirmed' = 'true'::jsonb))`;
}
