// R15：招待コード（mock = R08 演示世界；live = features/invite-codes 的真实实现）。
export { createInviteCode as POST } from "../../../features/invite-codes/handlers";
// R15：我的码的履历（DESIGN §4.2）。
export { listInviteCodeHistory as GET } from "../../../features/invite-codes/handlers";
export const dynamic = "force-dynamic";
