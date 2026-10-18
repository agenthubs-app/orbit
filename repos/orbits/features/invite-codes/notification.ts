/**
 * R15「邀请被接受」的站内通知（DESIGN add-and-invite §2.4「成功」、§9 #22 #33）。Owner: 甲 (R15).
 * Used by: `configured.ts`（事务提交后写给邀请人）。
 *
 * 用现有枚举：`sourceKind = 'contact'`、`kind = 'update'`、`target.kind = 'source'`（href 指向对方的联系人详情），
 * 不加枚举值（读取端遇到未知枚举整条跳过）。同一条连接只有一条通知（`semanticKey` 按连接 id）。
 */
import type { InboxNotificationUpsert } from "../notifications/inbox-record-service";
import type { InviteConnectedNotice } from "./service";

export type InviteNotificationCopy = Readonly<Record<"ja" | "zh" | "en", { title: string; reason: string }>>;

export function inviteNotificationCopy(name: string): InviteNotificationCopy {
  return {
    en: { reason: "You have been added to each other's contacts.", title: `${name} joined from your invite` },
    ja: { reason: "お互いの人脈に追加されました。", title: `${name}さんが招待から登録しました` },
    zh: { reason: "你们已互相加入人脉。", title: `${name}通过你的邀请加入了` },
  };
}

export function inviteConnectedNotification(input: InviteConnectedNotice & { contactRevision: string }): InboxNotificationUpsert {
  const copy = inviteNotificationCopy(input.redeemerDisplayName);
  return {
    actions: ["read", "dismiss", "handle"],
    actorId: input.inviterActorId,
    copy,
    kind: "update",
    object: { id: input.inviterContactId, name: input.redeemerDisplayName },
    occurredAt: input.at,
    origin: "business",
    reason: copy.ja.reason,
    semanticKey: `invite-connection:${input.connectionId}`,
    sources: [{ occurredAt: input.at, readAt: input.at, sourceId: input.inviterContactId, sourceKind: "contact", sourceRevision: input.contactRevision }],
    target: { href: `/contacts/${encodeURIComponent(input.inviterContactId)}`, id: input.inviterContactId, kind: "source", status: "available" },
    title: copy.ja.title,
  };
}
export function inviteRedeemerNotification(input: {at:string;connectionId:string;redeemerActorId:string;redeemerContactId:string;inviterDisplayName:string;contactRevision:string}):InboxNotificationUpsert {
 const copy={
  en:{title:`You connected with ${input.inviterDisplayName}`,reason:"You have been added to each other's contacts."},
  ja:{title:`${input.inviterDisplayName}さんとつながりました`,reason:'お互いの人脈に追加されました。'},
  zh:{title:`你已与${input.inviterDisplayName}建立联系`,reason:'你们已互相加入人脉。'},
 };
 return {actions:['read','dismiss','handle'],actorId:input.redeemerActorId,copy,kind:'update',object:{id:input.redeemerContactId,name:input.inviterDisplayName},occurredAt:input.at,origin:'business',reason:copy.ja.reason,semanticKey:`invite-connection:${input.connectionId}`,sources:[{occurredAt:input.at,readAt:input.at,sourceId:input.redeemerContactId,sourceKind:'contact',sourceRevision:input.contactRevision}],target:{href:`/contacts/${encodeURIComponent(input.redeemerContactId)}`,id:input.redeemerContactId,kind:'source',status:'available'},title:copy.ja.title};
}
