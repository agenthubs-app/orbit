import type { OrbitLandingEventView } from "./orbit-landing-route-view-model";

export interface OrbitHomeAccountView {
  fullName: string;
  headline: string;
  initial: string;
  // 名片档案扩展字段（可选，容忍稀疏数据）：hub 用来展示更完整的个人资料。
  role?: string;
  organization?: string;
  industry?: string;
  homeMarket?: string;
  relationshipGoal?: string;
  bio?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  topics?: readonly string[];
  targetRelationshipTypes?: readonly string[];
  preferredIntroChannels?: readonly string[];
  preferredFollowUpWindow?: string;
}

export interface OrbitHomeStatsView {
  events: number;
  inProgress: number;
  people: number;
}

export interface OrbitHomeViewModel {
  account: OrbitHomeAccountView;
  events: OrbitLandingEventView[];
  stats: OrbitHomeStatsView;
}
