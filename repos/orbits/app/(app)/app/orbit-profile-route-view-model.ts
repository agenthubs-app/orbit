export interface OrbitProfileView {
  bio: string;
  company: string;
  email: string;
  fullName: string;
  headline: string;
  industry: string;
  intro: string;
  lineId: string;
  offering: string[];
  seeking: string[];
  title: string;
  topics: string[];
  wechatName: string;
}

export interface OrbitProfileViewModel {
  industries: string[];
  offeringTags: string[];
  profile: OrbitProfileView;
  seekingTags: string[];
  topics: string[];
}

export function getOrbitProfileViewModel(): OrbitProfileViewModel {
  return {
    industries: [
      "AI / 机器学习",
      "金融 / FinTech",
      "硬科技 / 半导体",
      "消费 / 电商",
      "SaaS / 企业服务",
      "医疗 / 生命科学",
      "综合商社",
      "风险投资",
      "其他",
    ],
    offeringTags: [
      "日本本地化",
      "渠道资源",
      "供应链",
      "技术合作",
      "投融资",
      "PR / 品牌",
      "法务 / 合规",
      "招聘 / 人才",
      "海外拓展",
    ],
    profile: {
      bio: "连续创业者，专注 AI 基础设施与出海工程团队搭建。",
      company: "东京科技有限公司",
      email: "ming.li@tokyo-tech.jp",
      fullName: "李明",
      headline: "把对的工程文化带到出海团队",
      industry: "AI / 机器学习",
      intro: "想认识在日做 GTM 与本地化的朋友，也乐意分享工程团队从 0 到 50 的经验。",
      lineId: "ming.li",
      offering: ["技术合作", "海外拓展", "招聘 / 人才"],
      seeking: ["A 轮融资", "日本客户", "出海打法"],
      title: "CTO",
      topics: ["出海", "AI 应用", "硬件创业"],
      wechatName: "mingli_tech",
    },
    seekingTags: [
      "种子轮",
      "A 轮融资",
      "日本客户",
      "技术合伙人",
      "出海打法",
      "并购标的",
      "代理 / 经销",
      "联合营销",
    ],
    topics: ["出海", "跨境", "AI 应用", "硬件创业", "Web3", "ESG", "组织管理", "增长", "定价"],
  };
}
