/** Legacy invite-code adapter into the canonical event registration workspace. */
import { notFound, redirect } from "next/navigation";
import {
  loadAppRegisterRouteViewModel,
  type AppRegisterSearchParams,
} from "./compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model";

export default async function AppRegisterPage({
  searchParams,
}: {
  searchParams: Promise<AppRegisterSearchParams>;
}) {
  const query = await searchParams;
  const routeModel = await loadAppRegisterRouteViewModel({
    code: Array.isArray(query.code) ? query.code[0] : query.code,
  });

  if (routeModel.state === "success") {
    const destination = new URLSearchParams();
    const language = Array.isArray(query.language)
      ? query.language[0]
      : query.language;

    if (language) destination.set("language", language);

    const suffix = destination.size > 0 ? `?${destination.toString()}` : "";
    redirect(
      `/app/events/${encodeURIComponent(routeModel.register.event.id)}/register${suffix}#`,
    );
  }

  // 2026-11-21：无码 / 无效码不再显示旧版英文说明页（手机上贴边、开发说明式文案），
  // 照成熟产品对失效邀请链接的做法落到站点自己的「页面不存在」（多语言、有返回入口）。
  notFound();
}
