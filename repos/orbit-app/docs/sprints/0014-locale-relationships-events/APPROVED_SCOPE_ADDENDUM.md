# Sprint 0014 — run-01 精确文件边界补充

2026-09-15。依 `docs/sprints/RULES.md` 第 0、4、6 节复用用户已记录的“全部获准”，在启动前把 Planner 的目录边界收窄为实际路由文件，并登记完成原 SC 所需的直接消费者。此补充不改变 SC-0014-01～04，不修改 Provider、报名资格、OCR 或服务端业务规则。

## 实际页面锁

- 人脉列表／详情／邀请：`src/screens/contacts/ContactsScreen.tsx`、`ContactDetailScreen.tsx`、`ContactPage.tsx`、`ContactNotesSection.tsx`、`RelationshipInvitationScreen.tsx`。
- 名片入口／摄入／复核：`src/screens/contacts/ContactAcquisitionScreen.tsx`、`BusinessCardIngestStartScreen.tsx`、`BusinessCardIngestScreen.tsx`、`BusinessCardBatchScreen.tsx`、`BusinessCardImportScreen.tsx`。
- 活动发现／详情／报名：`src/screens/events/EventsScreen.tsx`、`EventDetailScreen.tsx`、`EventRegistrationScreen.tsx`。
- 明确排除同目录的 dashboard、pipeline、graph、intros、structure detail，以及 event center、operations、analytics、attendees、admission、check-in、experience、roles 页面；它们不属于本 Sprint 的发现／详情／报名链路。

## 必要直接消费者

- `src/components/BusinessCardBatchReviewForm.tsx`：两套名片复核路由共同渲染的真实字段、冲突来源和操作按钮；不迁移会导致 SC-0014-02 在页面中心仍为固定中文。
- Planner 已列 `src/view-models/contacts.ts`、`events.ts`；仅当真实页面状态来自直接 view-model 时，追加 `business-card-batch.ts`、`business-card-ingest.ts`、`contact-acquisition.ts`、`contact-communication.ts`、`contact-detail-editor.ts`、`contact-notes.ts`、`event-registration.ts`。只能增加可选 translator／产品枚举标签，默认中文兼容现有消费者；请求字段、稳定 ID、原文与保存 payload 不变。
- 新三语交互测试与上述文件现有直接测试可按实际影响追加；共享字典仍由 0014 独占。因为涉及共享 view-model 和报名／名片写入消费者，本 run 验证档升级为 H，代码收口时对 App 执行一次全量。
