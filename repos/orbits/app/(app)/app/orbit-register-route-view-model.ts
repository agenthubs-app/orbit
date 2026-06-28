import { getOrbitEventDetailViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";

export interface OrbitRegisterProfileForm {
  bio: string;
  company: string;
  industry: string;
  intro: string;
  level: string;
  lineId: string;
  name: string;
  offering: string[];
  phone: string;
  seeking: string[];
  title: string;
  topics: string[];
  wechatName: string;
}

export interface OrbitRegisterViewModel {
  event: Pick<OrbitLandingEventView, "code" | "name" | "theme">;
  industryOptions: string[];
  levelOptions: string[];
  offeringTags: string[];
  seekingTags: string[];
  topics: string[];
}

export const orbitRegisterEmptyProfile: OrbitRegisterProfileForm = {
  bio: "",
  company: "",
  industry: "",
  intro: "",
  level: "",
  lineId: "",
  name: "",
  offering: [],
  phone: "",
  seeking: [],
  title: "",
  topics: [],
  wechatName: "",
};

export function getOrbitRegisterViewModel(code = "TBC26S"): OrbitRegisterViewModel {
  const event = getOrbitEventDetailViewModel(code);

  return {
    event: {
      code: event.code,
      name: event.name,
      theme: event.theme,
    },
    industryOptions: ["AI / 机器学习", "金融 / FinTech", "硬科技 / 半导体", "消费 / 电商", "SaaS / 企业服务", "医疗 / 生命科学", "综合商社", "风险投资", "其他"],
    levelOptions: ["创始人 / 合伙人", "高管 (C-level / VP)", "总监 / 负责人", "经理 / 主管", "专业人士 / 个人贡献者"],
    offeringTags: ["日本本地化", "渠道资源", "供应链", "技术合作", "投融资", "PR / 品牌", "法务 / 合规", "招聘 / 人才", "海外拓展"],
    seekingTags: ["种子轮", "A 轮融资", "日本客户", "技术合伙人", "出海打法", "并购标的", "代理 / 经销", "联合营销"],
    topics: ["出海", "跨境", "AI 应用", "硬件创业", "Web3", "ESG", "组织管理", "增长", "定价"],
  };
}
