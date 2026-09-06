import type { OrbitLanguage } from "./language";

export type IndustryIdCode =
  | "food_hospitality"
  | "technology_internet"
  | "finance_investment"
  | "professional_services"
  | "manufacturing_supply_chain"
  | "retail_consumer"
  | "trade_logistics"
  | "real_estate_construction"
  | "healthcare_life_sciences"
  | "education_research"
  | "media_creative"
  | "community_nonprofit"
  | "government_public_affairs"
  | "other";

export interface IndustryDefinitionContract {
  id: IndustryIdCode;
  labels: Readonly<Record<OrbitLanguage, string>>;
  sortOrder: number;
}
