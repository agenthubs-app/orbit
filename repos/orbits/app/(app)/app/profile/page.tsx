/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { AppProfileCommandCenter } from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-command-center";

type AppProfileSearchParams = Record<string, string | string[] | undefined>;

interface ProfilePageProps {
  searchParams?: AppProfileSearchParams | Promise<AppProfileSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyProfileStateBoundary() {
  return (
    <div hidden>
      <StateView
        description={bilingualText(
          "在 Orbit 读取任何账号数据之前，资料页会承载身份、权限和隐私选择。",
          "Profile will hold identity, permissions, and privacy choices before Orbit reads any account data.",
        )}
        emptyState={bilingualText(
          "还没有加载身份细节、已连接账号或授权。",
          "No identity details, connected accounts, or permission grants are loaded.",
        )}
        evidence={[
          bilingualText("还没有连接登录服务。", "No sign-in service is connected."),
          bilingualText(
            "权限选择目前只用于展示。",
            "Permission choices are display-only for now.",
          ),
        ]}
        eyebrow={bilingualText("个人资料", "Profile")}
        guardrail={bilingualText(
          "资料页可以说明权限分阶段状态，但不能授予访问权限。",
          "Profile can explain permission staging, but it cannot grant access.",
        )}
        nextStep={bilingualText(
          "在真实登录存在之前，先确认应该显示哪些账号细节。",
          "Confirm which account details should be shown before live sign-in exists.",
        )}
        purpose={bilingualText(
          "在来源连接前设置账号身份和权限上下文。",
          "Set account identity and permission context before sources connect.",
        )}
        title={bilingualText("个人资料", "Profile")}
      />
    </div>
  );
}

function renderProfilePage(searchParams: AppProfileSearchParams | undefined) {
  return (
    <>
      <LegacyProfileStateBoundary />
      <AppProfileCommandCenter searchParams={searchParams} />
    </>
  );
}

export default function ProfilePage({ searchParams }: ProfilePageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderProfilePage(resolvedSearchParams),
    );
  }

  return renderProfilePage(searchParams);
}
