/**
 * 最近一次使用的界面语言（2026-11-27 定）：给「跟随系统」的用户发通知邮件时用。
 * 发信语言顺序：手动设置 → 最近一次使用的界面语言 → （只读兜底）最近一次报名请求的语言 → 日文；只看收件人。
 *
 * 存法：orbit_records 里每个账号一条 accountUiLanguageSeen（不改表、不需要迁移；不碰会同步到 App 的
 * account_language_preferences）。写入搭在 auth.ts jwt 回调已有的会话检查上：令牌里记着上次写过的语言，
 * 实际生效的语言变了才写一次（同一会话不会重复写），不为此给页面加查询。
 */
import { createHash } from "node:crypto";

import type { OrbitLanguage } from "../../shared/contract/language";
import { parseOrbitLanguage } from "../../shared/i18n/orbit-language";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";

export const ACCOUNT_UI_LANGUAGE_SEEN_COLLECTION = "accountUiLanguageSeen";

function recordId(actorId: string): string {
  return createHash("sha256").update(JSON.stringify(["account-ui-language-seen", actorId])).digest("hex");
}

/** 写入（覆盖）这个账号最近一次使用的界面语言。读写失败由调用方吞掉，不影响登录。 */
export async function recordLastUiLanguage(actorId: string, language: OrbitLanguage, now: () => string = () => new Date().toISOString()): Promise<void> {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured || !actorId.trim()) return;
  const at = now();
  await configured.store.upsertRecord({
    workspaceId: configured.workspaceId,
    collectionName: ACCOUNT_UI_LANGUAGE_SEEN_COLLECTION,
    recordId: recordId(actorId),
    userId: actorId,
    createdAt: at,
    updatedAt: at,
    lifecycleState: "active",
    evidenceIds: [],
    sourceType: "manual",
    sourceId: "ui-language-seen",
    payload: { version: 1, actorId, language },
  });
}

/** SQL 子查询：这个账号最近一次使用的界面语言（ja / zh / en 或 null）。`workspace` / `actor` 是 SQL 表达式。 */
export function lastUiLanguageSql(workspace: string, actor: string): string {
  return `(select seen.payload ->> 'language' from orbit_records seen
     where seen.workspace_id = ${workspace} and seen.collection_name = '${ACCOUNT_UI_LANGUAGE_SEEN_COLLECTION}'
       and seen.user_id = ${actor} and seen.lifecycle_state <> 'deleted' order by seen.updated_at desc limit 1)`;
}

export function uiLanguageValue(value: unknown): OrbitLanguage | null {
  return typeof value === "string" ? parseOrbitLanguage(value) : null;
}
