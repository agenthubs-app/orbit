// R15 P1：改当前招待码的共享项目（mock = R08 演示世界；live = features/invite-codes 的真实实现）。
export { updateCurrentInviteShare as PUT } from "../../../../../features/invite-codes/handlers";
export const dynamic = "force-dynamic";
