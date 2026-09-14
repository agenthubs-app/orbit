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
  labels: Readonly<Record<"zh" | "ja" | "en", string>>;
  sortOrder: number;
}

export type SecondaryIndustryIdCode =
  | "food_hospitality.restaurants"
  | "food_hospitality.cafes_beverages"
  | "food_hospitality.food_production"
  | "food_hospitality.food_distribution"
  | "food_hospitality.hotels_tourism"
  | "food_hospitality.other"
  | "technology_internet.enterprise_software"
  | "technology_internet.ai_data"
  | "technology_internet.cloud_infrastructure"
  | "technology_internet.cybersecurity"
  | "technology_internet.internet_platforms"
  | "technology_internet.other"
  | "finance_investment.banking"
  | "finance_investment.venture_capital"
  | "finance_investment.private_equity"
  | "finance_investment.asset_management"
  | "finance_investment.insurance"
  | "finance_investment.fintech"
  | "finance_investment.other"
  | "professional_services.management_consulting"
  | "professional_services.legal"
  | "professional_services.tax_accounting"
  | "professional_services.human_resources"
  | "professional_services.startup_services"
  | "professional_services.other"
  | "manufacturing_supply_chain.industrial_equipment"
  | "manufacturing_supply_chain.robotics"
  | "manufacturing_supply_chain.automotive"
  | "manufacturing_supply_chain.semiconductors"
  | "manufacturing_supply_chain.electronics"
  | "manufacturing_supply_chain.materials"
  | "manufacturing_supply_chain.other"
  | "retail_consumer.physical_retail"
  | "retail_consumer.ecommerce"
  | "retail_consumer.consumer_brands"
  | "retail_consumer.lifestyle_services"
  | "retail_consumer.consumer_products"
  | "retail_consumer.other"
  | "trade_logistics.import_export"
  | "trade_logistics.freight"
  | "trade_logistics.warehousing"
  | "trade_logistics.cross_border_services"
  | "trade_logistics.procurement"
  | "trade_logistics.other"
  | "real_estate_construction.property_development"
  | "real_estate_construction.construction"
  | "real_estate_construction.architecture_design"
  | "real_estate_construction.property_operations"
  | "real_estate_construction.real_estate_services"
  | "real_estate_construction.other"
  | "healthcare_life_sciences.medical_services"
  | "healthcare_life_sciences.pharmaceuticals"
  | "healthcare_life_sciences.medical_devices"
  | "healthcare_life_sciences.biotechnology"
  | "healthcare_life_sciences.health_management"
  | "healthcare_life_sciences.other"
  | "education_research.school_education"
  | "education_research.higher_education"
  | "education_research.professional_training"
  | "education_research.edtech"
  | "education_research.research_institutes"
  | "education_research.other"
  | "media_creative.publishing_content"
  | "media_creative.advertising_marketing"
  | "media_creative.film_video"
  | "media_creative.games_entertainment"
  | "media_creative.design_creative"
  | "media_creative.other"
  | "community_nonprofit.industry_associations"
  | "community_nonprofit.nonprofits"
  | "community_nonprofit.community_operations"
  | "community_nonprofit.social_enterprises"
  | "community_nonprofit.other"
  | "government_public_affairs.public_administration"
  | "government_public_affairs.public_services"
  | "government_public_affairs.economic_development"
  | "government_public_affairs.public_policy"
  | "government_public_affairs.other"
  | "other.other";

export interface IndustrySelectionContract {
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
}

export interface SecondaryIndustryDefinitionContract {
  id: SecondaryIndustryIdCode;
  parentId: IndustryIdCode;
  labels: Readonly<Record<"zh" | "ja" | "en", string>>;
  sortOrder: number;
}
