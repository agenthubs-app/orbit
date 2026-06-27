/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../shared/ui/state-view";
import { bilingualText } from "../../../shared/ui/bilingual";
import { AppWorkbench } from "../compose-app-from-previously-approved-mock-first-capabilities/app-workbench";
import { OrbitAiCommandCenter } from "./orbit-ai-command-center";

type AppHomeSearchParams = Record<string, string | string[] | undefined>;

interface AppHomePageProps {
  searchParams?: AppHomeSearchParams | Promise<AppHomeSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyHomeStateBoundary() {
  return (
    <div hidden>
      <StateView
        description={bilingualText(
          "连接真实来源后，首页会显示需要关注的人、活动上下文和跟进事项。",
          "The home workspace will show the people, event context, and follow-ups that need attention after real sources are connected.",
        )}
        emptyState={bilingualText(
          "还没有加载关系记录、活动信号或跟进队列。",
          "No relationship records, event signals, or follow-up queues are loaded.",
        )}
        evidence={[
          bilingualText("还没有加载关系记录。", "No relationship records are loaded."),
          bilingualText(
            "账号上下文由外层工作区提供。",
            "Account context is supplied by the shell.",
          ),
        ]}
        eyebrow={bilingualText("首页", "Home")}
        guardrail={bilingualText(
          "首页可以指向设置路径，但不能创建任务或发送消息。",
          "Home can point to setup routes, but it cannot create tasks or send messages.",
        )}
        nextStep={bilingualText(
          "联系人捕获准备好后，选择添加来源。",
          "Choose Add a source when contact capture is ready.",
        )}
        purpose={bilingualText(
          "梳理需要关注的关系工作。",
          "Triage the relationship work that needs attention.",
        )}
        title={bilingualText("首页", "Home")}
      />
    </div>
  );
}

function renderAppHomePage(searchParams: AppHomeSearchParams | undefined) {
  if (searchParams?.scenario) {
    return <AppWorkbench searchParams={searchParams} />;
  }

  return (
    <>
      <LegacyHomeStateBoundary />
      <OrbitAiCommandCenter searchParams={searchParams} />
    </>
  );
}

export default function AppHomePage({ searchParams }: AppHomePageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderAppHomePage(resolvedSearchParams),
    );
  }

  return renderAppHomePage(searchParams);
}
