// R15 复核 S1：确认「同じ人」→ 统合进已有联系人（mock = R08 演示世界；live = features/invite-codes 的真实实现）。
export { mergeInviteConnection as POST } from "../../../../../../features/invite-codes/handlers";
export const dynamic = "force-dynamic";
