import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { StateView } from "../../../../shared/ui/state-view";
import type { OrbitLanguage } from "../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteStateViewModel,
  type AppProfileSearchParams,
} from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import { OrbitRealProfile } from "./orbit-real-profile";

interface FounderProfileCopy {
  bio: string;
  company: string;
  fullName: string;
  headline: string;
  industry: string;
  industries: readonly string[];
  intro: string;
  offering: readonly string[];
  seeking: readonly string[];
  title: string;
  topics: readonly string[];
}

const FOUNDER_PROFILE_COPY: Record<"en" | "zh", FounderProfileCopy> = {
  en: {
    bio:
      "Founder of Orbit. I help companies put AI into sales, support, operations, knowledge bases, reporting, and approval workflows. I usually start with one painful workflow, then work out where automation or AI can save time without adding another tool nobody uses.",
    company: "Orbit",
    fullName: "Xinyi Zhao",
    headline:
      "Founder of Orbit, helping companies put AI into real business workflows",
    industry: "AI for business operations",
    industries: [
      "AI for business operations",
      "Workflow automation",
      "Enterprise software",
      "Japan market entry",
    ],
    intro:
      "Reach out if you are evaluating AI adoption, workflow automation, or Japan-market partnerships. I can help map the problem, compare tools, and introduce product teams, service providers, founders, and local business resources.",
    offering: [
      "AI adoption planning",
      "Workflow automation advice",
      "Enterprise AI tool selection",
      "Japan local business resources",
      "Founder and service-provider introductions",
    ],
    seeking: [
      "Companies with real AI adoption needs",
      "Business owners willing to run a PoC",
      "Japan-market partners",
      "Enterprise software and automation teams",
    ],
    title: "Founder",
    topics: [
      "AI in sales and support",
      "Operations automation",
      "Internal knowledge bases",
      "Cross-border business",
      "Japan market entry",
    ],
  },
  zh: {
    bio:
      "Orbit 的创始人，帮企业把 AI 放进销售、客服、运营和内部知识库这些真实流程里。我的工作通常从一个具体流程开始：哪里最耗人、哪里反复出错、哪里信息找不到，然后用合适的 AI 工具和自动化把它改轻。",
    company: "Orbit",
    fullName: "Xinyi Zhao",
    headline: "Orbit 创始人，帮企业把 AI 放进真实业务流程里",
    industry: "AI 企业应用",
    industries: [
      "AI 企业应用",
      "业务流程自动化",
      "企业服务",
      "出海与日本市场",
    ],
    intro:
      "如果你正在看企业 AI 导入、流程自动化、日本市场合作，或者只是有一个卡住的内部流程，可以找我一起拆。我能提供产品选型、落地路径、服务商和创业者资源，也能介绍合适的合作方。",
    offering: [
      "AI 落地方案拆解",
      "业务流程自动化建议",
      "企业 AI 工具选型",
      "日本本地商务资源",
      "创业者和服务商介绍",
    ],
    seeking: [
      "有真实 AI 导入需求的企业",
      "愿意一起做 PoC 的业务负责人",
      "日本市场合作伙伴",
      "企业服务和自动化产品团队",
    ],
    title: "创始人",
    topics: [
      "销售和客服自动化",
      "运营流程优化",
      "内部知识库",
      "跨境业务协作",
      "日本市场落地",
    ],
  },
};

function founderProfileCopy(language: OrbitLanguage): FounderProfileCopy {
  return language === "en" ? FOUNDER_PROFILE_COPY.en : FOUNDER_PROFILE_COPY.zh;
}

function uniqueProfileValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildFounderProfileViewModel(
  viewModel: OrbitProfileViewModel,
  language: OrbitLanguage,
): OrbitProfileViewModel {
  const copy = founderProfileCopy(language);

  return {
    industries: uniqueProfileValues([copy.industry, ...copy.industries]),
    offeringTags: uniqueProfileValues([...copy.offering]),
    profile: {
      ...viewModel.profile,
      bio: copy.bio,
      company: copy.company,
      // 身份来自数据层(live 库的 operator profile,如"小雨");
      // 硬编码文案只补数据没有的富字段,不覆盖用户是谁。
      fullName: viewModel.profile.fullName?.trim() || copy.fullName,
      headline: copy.headline,
      industry: copy.industry,
      intro: copy.intro,
      offering: [...copy.offering],
      seeking: [...copy.seeking],
      title: copy.title,
      topics: [...copy.topics],
    },
    seekingTags: uniqueProfileValues([...copy.seeking]),
    topics: uniqueProfileValues([...copy.topics]),
  };
}

type ProfileRouteState =
  | AppProfileRouteStateViewModel
  | {
      copy: AppProfileRouteStateViewModel["copy"];
      evidenceIds: readonly string[];
      recoveryActions?: readonly AppProfileRouteStateViewModel["recoveryActions"][number][];
    };

function ProfileRouteStateBoundary({
  routeState,
}: {
  routeState: ProfileRouteState;
}) {
  return (
    <div data-orbit-route="app-profile-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={(routeState.recoveryActions ?? []).map((action) => ({
          id: action.id,
          label: action.label,
          recoveryCopy: action.recoveryCopy,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppProfilePage({
  searchParams,
}: {
  searchParams?: Promise<AppProfileSearchParams>;
} = {}) {
  // 个人资料是登录后的页面:未登录跳登录页,带回跳地址。
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fprofile");
  }

  const routeModel = await loadAppProfileRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <OrbitRealProfile
          viewModel={localizeOrbitTree(
            buildFounderProfileViewModel(
              profileRouteToOrbitProfileViewModel(routeModel),
              language ?? "zh",
            ),
            language ?? "zh",
          )}
        />
      ) : (
        <ProfileRouteStateBoundary
          routeState={
            routeModel.state === "route-state"
              ? routeModel.routeState
              : {
                  copy: routeModel.failure,
                  evidenceIds: routeModel.failure.evidenceIds,
                }
          }
        />
      )}
    </>
  );
}
