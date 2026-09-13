# Sprint 0020 — 二级行业目录提案

本目录是待审阅的产品提案，不是已实现或已经获批的行业标准。保留现有 14 个一级行业 ID；本 Sprint 不引入外部行业编码体系、三级分类或多选行业。

## 分类规则

- 一份资料选择一个一级行业和一个二级行业。二级 ID 固定为下表的完整字符串，不能根据翻译或显示名称临时生成。
- 每个一级行业都有自己的 `other` 子项，表示用户明确选择“该类下的其他”；它与缺失值不同。未填写、历史记录不自动归入“其他”。
- 企业可能横跨多个领域，按本人确认的主要业务选择；不得根据职位、公司名或模型推断直接覆盖真实资料。例如金融科技公司可自行确认金融科技或企业软件，系统不强制重归类。
- 下表中文名称是提案。实施时在同一字典为所有条目提供中、日、英标签并检查非空、唯一 ID、父子关系和稳定排序；不借此实施整站三语改造。
- 第一版拟定 `INDUSTRY_TAXONOMY_VERSION = 1`。以后重命名标签不改 ID；删除或移动子项必须另有兼容方案，不静默改用户原选择。

## 目录

### 餐饮与食品（food_hospitality）

| 二级 ID | 中文名称 |
| --- | --- |
| `food_hospitality.restaurants` | 餐饮经营 |
| `food_hospitality.cafes_beverages` | 咖啡、茶饮与饮品 |
| `food_hospitality.food_production` | 食品生产与加工 |
| `food_hospitality.food_distribution` | 食品流通 |
| `food_hospitality.hotels_tourism` | 酒店与旅游服务 |
| `food_hospitality.other` | 本类其他行业 |

### 科技与互联网（technology_internet）

| 二级 ID | 中文名称 |
| --- | --- |
| `technology_internet.enterprise_software` | 企业软件与 SaaS |
| `technology_internet.ai_data` | 人工智能与数据 |
| `technology_internet.cloud_infrastructure` | 云计算与基础设施 |
| `technology_internet.cybersecurity` | 网络与信息安全 |
| `technology_internet.internet_platforms` | 互联网平台与应用 |
| `technology_internet.other` | 本类其他行业 |

### 金融与投资（finance_investment）

| 二级 ID | 中文名称 |
| --- | --- |
| `finance_investment.banking` | 银行与信贷 |
| `finance_investment.venture_capital` | 创业投资 |
| `finance_investment.private_equity` | 私募股权投资 |
| `finance_investment.asset_management` | 证券与资产管理 |
| `finance_investment.insurance` | 保险 |
| `finance_investment.fintech` | 金融科技 |
| `finance_investment.other` | 本类其他行业 |

### 专业服务（professional_services）

| 二级 ID | 中文名称 |
| --- | --- |
| `professional_services.management_consulting` | 管理咨询 |
| `professional_services.legal` | 法律服务 |
| `professional_services.tax_accounting` | 会计、审计与税务 |
| `professional_services.human_resources` | 人力资源与招聘 |
| `professional_services.startup_services` | 创业与企业服务 |
| `professional_services.other` | 本类其他行业 |

### 制造与供应链（manufacturing_supply_chain）

| 二级 ID | 中文名称 |
| --- | --- |
| `manufacturing_supply_chain.industrial_equipment` | 工业设备 |
| `manufacturing_supply_chain.robotics` | 机器人与自动化 |
| `manufacturing_supply_chain.automotive` | 汽车与交通装备 |
| `manufacturing_supply_chain.semiconductors` | 半导体 |
| `manufacturing_supply_chain.electronics` | 电子制造 |
| `manufacturing_supply_chain.materials` | 材料与化工 |
| `manufacturing_supply_chain.other` | 本类其他行业 |

### 零售与消费（retail_consumer）

| 二级 ID | 中文名称 |
| --- | --- |
| `retail_consumer.physical_retail` | 线下零售 |
| `retail_consumer.ecommerce` | 电子商务 |
| `retail_consumer.consumer_brands` | 消费品牌 |
| `retail_consumer.lifestyle_services` | 生活服务 |
| `retail_consumer.consumer_products` | 消费品研发与生产 |
| `retail_consumer.other` | 本类其他行业 |

### 贸易与物流（trade_logistics）

| 二级 ID | 中文名称 |
| --- | --- |
| `trade_logistics.import_export` | 进出口贸易 |
| `trade_logistics.freight` | 货运与运输 |
| `trade_logistics.warehousing` | 仓储与配送 |
| `trade_logistics.cross_border_services` | 跨境贸易服务 |
| `trade_logistics.procurement` | 采购与供应链服务 |
| `trade_logistics.other` | 本类其他行业 |

### 房地产与建设（real_estate_construction）

| 二级 ID | 中文名称 |
| --- | --- |
| `real_estate_construction.property_development` | 房地产开发 |
| `real_estate_construction.construction` | 建筑工程 |
| `real_estate_construction.architecture_design` | 建筑与空间设计 |
| `real_estate_construction.property_operations` | 物业与空间运营 |
| `real_estate_construction.real_estate_services` | 房地产交易与服务 |
| `real_estate_construction.other` | 本类其他行业 |

### 医疗与健康（healthcare_life_sciences）

| 二级 ID | 中文名称 |
| --- | --- |
| `healthcare_life_sciences.medical_services` | 医疗服务 |
| `healthcare_life_sciences.pharmaceuticals` | 药品研发与生产 |
| `healthcare_life_sciences.medical_devices` | 医疗器械 |
| `healthcare_life_sciences.biotechnology` | 生物技术 |
| `healthcare_life_sciences.health_management` | 健康管理 |
| `healthcare_life_sciences.other` | 本类其他行业 |

### 教育与研究（education_research）

| 二级 ID | 中文名称 |
| --- | --- |
| `education_research.school_education` | 基础教育 |
| `education_research.higher_education` | 高等教育 |
| `education_research.professional_training` | 职业与专业培训 |
| `education_research.edtech` | 教育科技 |
| `education_research.research_institutes` | 科研机构与研发服务 |
| `education_research.other` | 本类其他行业 |

### 文化传媒与创意（media_creative）

| 二级 ID | 中文名称 |
| --- | --- |
| `media_creative.publishing_content` | 出版与内容 |
| `media_creative.advertising_marketing` | 广告与营销 |
| `media_creative.film_video` | 影视与视频 |
| `media_creative.games_entertainment` | 游戏与娱乐 |
| `media_creative.design_creative` | 设计与创意服务 |
| `media_creative.other` | 本类其他行业 |

### 社群与非营利（community_nonprofit）

| 二级 ID | 中文名称 |
| --- | --- |
| `community_nonprofit.industry_associations` | 行业协会 |
| `community_nonprofit.nonprofits` | 公益与非营利组织 |
| `community_nonprofit.community_operations` | 社群运营 |
| `community_nonprofit.social_enterprises` | 社会企业 |
| `community_nonprofit.other` | 本类其他行业 |

### 政府与公共事务（government_public_affairs）

| 二级 ID | 中文名称 |
| --- | --- |
| `government_public_affairs.public_administration` | 公共行政 |
| `government_public_affairs.public_services` | 公共服务 |
| `government_public_affairs.economic_development` | 招商与产业发展 |
| `government_public_affairs.public_policy` | 公共政策与事务 |
| `government_public_affairs.other` | 本类其他行业 |

### 其他（other）

| 二级 ID | 中文名称 |
| --- | --- |
| `other.other` | 其他未列明行业 |

共 14 个一级行业、79 个二级选项（包含各一级下的“其他”）。本数量用于核对这份提案；批准前可调整目录，但须同步修订 Planner 的示例与测试映射。

## 复用示例

- 本人资料：科技与互联网 → 人工智能与数据，对应 `technology_internet.ai_data`。
- 测试投资人：金融与投资 → 创业投资，对应 `finance_investment.venture_capital`。
- 测试机器人企业联系人：制造与供应链 → 机器人与自动化，对应 `manufacturing_supply_chain.robotics`。
- 筛选“科技与互联网”应包含该类全部子项；筛选“人工智能与数据”只匹配该二级 ID。只有一级的旧记录只能命中一级筛选，不能被伪装成某个子行业。

[返回验收契约](PLANNER.md) · [易读目标](GOAL.md)
