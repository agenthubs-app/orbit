# Relationship Mockdata 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/mockdata/orbit_mock_data_ai_relationship_design.md` |
| 中文镜像 | `knowledge/docs/zh/mockdata-design.zh.md` |
| 分类 | `mockdata` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

用于生成关系 mock 数据、AI 画像建模、活动场景和 demo 数据的长文档。

## 审计依据

已核对 mockdata exports、validator、relationship_data_goal_runner.py 和 generated relationship fixtures 存在；长文档作为数据设计来源保留。

## 结构化阅读入口

- 第 1 节：Orbit Mock 数据 & AI 关系 设计 文档
- 第 2 节：1. 文档目的
- 第 3 节：2. 核心设计判断
- 第 4 节：3. 设计原则
- 第 5 节：3.1 不替换现有字段
- 第 6 节：3.2 产品字段和 AI 字段分离
- 第 7 节：3.3 mock 数据要服务真实场景
- 第 8 节：3.4 区分事实和推测
- 第 9 节：4. 推荐的数据分层
- 第 10 节：4.1 第一层：现有产品业务层
- 第 11 节：4.2 第二层：AI 语义增强层
- 第 12 节：4.3 第三层：测试 / demo 层
- 第 13 节：5. 建议增加或强化的核心模块
- 第 14 节：5.1 EventParticipant / 活动参与者意图
- 第 15 节：5.2 AIAnalysis / AI 分析结果
- 第 16 节：5.3 Connection 关系 Profile
- 第 17 节：5.4 Interaction Memory / 互动记忆
- 第 18 节：5.5 MatchRecommendation / 推荐结果
- 第 19 节：5.6 GoldenMatch / 推荐测试样本
- 第 20 节：6. 日本商业人士 + 华人圈的数据比例设计
- 第 21 节：7. 推荐 persona 模板
- 第 22 节：7.1 日本大企业 DX / 新规事业负责人
- 第 23 节：7.2 日本中小企业老板
- 第 24 节：7.3 在日华人创业者
- 第 25 节：7.4 华人社群组织者
- 第 26 节：7.5 日本 VC / CVC / angel
- 第 27 节：7.6 餐饮 / 零售 / inbound 商户
- 第 28 节：7.7 招聘 / HR / global talent
- 第 29 节：7.8 咨询顾问 / 士业
- 第 30 节：8. 推荐活动模板
- 第 31 节：源标题：8.1 Tokyo Business Connect
- 第 32 节：源标题：8.2 Japan China AI DX Salon
- 第 33 节：源标题：8.3 Inbound Retail & Restaurant Growth Meetup
- 第 34 节：源标题：8.4 Cross border Startup Investor Night
- 第 35 节：源标题：8.5 Global Talent & Bilingual Career Forum
- 第 36 节：源标题：8.6 Real Estate & Overseas Investors Roundtable
- 第 37 节：源标题：8.7 B2B SaaS Sales Japan Entry Meetup
- 第 38 节：8.8 本地 SME Digital Transformation Workshop
- 第 39 节：源标题：8.9 China Market Expansion Breakfast
- 第 40 节：8.10 Organizer Demo 活动
- 第 41 节：9. mock 数据规模建议
- 第 42 节：9.1 v0：开发用小数据
- 第 43 节：9.2 v1：高质量 demo 数据
- 第 44 节：9.3 v2：压力测试数据
- 第 45 节：10. 数据生成顺序
- 第 46 节：11. 推荐算法测试思路
- 第 47 节：12. demo 必须覆盖的 10 个场景
- 第 48 节：场景 1：日本餐饮老板找华人客户增长
- 第 49 节：场景 2：华人 AI founder 找日本 PoC 客户
- 第 50 节：场景 3：日本企业想进入中国市场
- 第 51 节：场景 4：投资人找中日 cross-border 项目
- 第 52 节：场景 5：活动主办方做同桌安排
- 第 53 节：场景 6：名片 OCR 后自动生成联系人画像
- 第 54 节：场景 7：活动后 follow-up 生成
- 第 55 节：场景 8：沉睡关系重新激活
- 第 56 节：场景 9：重复联系人合并
- 第 57 节：场景 10：不应该推荐的关系
- 第 58 节：13. Dirty Data / 脏数据设计
- 第 59 节：13.1 姓名问题
- 第 60 节：13.2 公司名问题
- 第 61 节：13.3 语言字段问题
- 第 62 节：13.4 用户目标过泛
- 第 63 节：13.5 信息缺失
- 第 64 节：14. 推荐文件结构
- 第 65 节：15. 项目接入建议
- 第 66 节：Phase 1：字段映射
- 第 67 节：Phase 2：优先补三个能力
- 第 68 节：Phase 3：构建 v0 seed
- 第 69 节：Phase 4：构建 v1 demo seed
- 第 70 节：Phase 5：接入推荐测试
- 第 71 节：16. 推荐优先级
- 第 72 节：P0：必须做
- 第 73 节：P1：强烈建议做
- 第 74 节：P2：后续再做
- 第 75 节：17. 设计结论

## 保留的代码与命令证据

### 代码证据 1

```txt
User 用户
Event 活动
EventParticipant 活动参与者
Contact 联系人
Connection / Relationship 关系
Interaction 互动记录
AIAnalysis AI 分析结果
MatchRecommendation 推荐结果
GoldenMatch 推荐测试样本
```

### 代码证据 2

```txt
metadata
profile_json
result_json
mock-only json
extension table
```

### 代码证据 3

```txt
name
company
title
industry
event_id
status
message
```

### 代码证据 4

```txt
confirmed_facts
inferred_traits
source_refs
confidence
business_relevance_score
recommendation_reason
```

### 代码证据 5

```txt
这个人为什么参加这个活动？
他想找谁？
谁适合他？
为什么适合？
他不应该被推荐给谁？
活动后下一步是什么？
```

### 代码证据 6

```txt
“我想认识有趣的人”
“我对 AI 感兴趣”
“我想拓展人脉”
```

### 代码证据 7

```txt
confirmed_facts 已确认事实
inferred_traits AI 推测
confidence 置信度
source_refs 来源
```

### 代码证据 8

```json
{
  "confirmed_facts": [
    {
      "field": "company",
      "value": "Tanaka Foods株式会社",
      "source": "business_card",
      "confidence": 1.0
    }
  ],
  "inferred_traits": [
    {
      "trait": "可能对华语圈 inbound 客户增长感兴趣",
      "reason": "活动报名中提到希望接触中国語対応できるマーケティングパートナー",
      "source_refs": ["event_registration"],
      "confidence": 0.82
    }
  ]
}
```

### 代码证据 9

```txt
users
events
event_participants
contacts
connections
conversations
messages
```

### 代码证据 10

```txt
ai_analyses
match_recommendations
relationship_profiles
event_intents
interaction_memories
```

### 代码证据 11

```txt
golden_matches
negative_cases
dirty_data_cases
demo_scenarios
expected_recommendation_results
```

### 代码证据 12

```txt
在 AI / DX 活动里：想找日本企业 PoC 客户
在投资人活动里：想找 seed investor
在华人创业活动里：想找 BD 合作伙伴
在餐饮 inbound 活动里：想找真实业务场景
```

### 代码证据 13

```ts
type EventParticipant = {
  id: string;
  event_id: string;
  user_id: string;

  status: "registered" | "checked_in" | "cancelled" | "no_show";
  role_in_event: "attendee" | "speaker" | "organizer" | "sponsor" | "vip";

  looking_for_at_event: string[];
  can_offer_at_event: string[];
  motivation: string;
  preferred_language: string[];

  checked_in_at?: string;
  table_id?: string;

  metadata?: Record<string, any>;
};
```

### 代码证据 14

```json
{
  "id": "ep_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "status": "checked_in",
  "role_in_event": "attendee",
  "looking_for_at_event": [
    "外国人観光客向けの集客に詳しい方",
    "中国語対応できるマーケティングパートナー",
    "予約・CRMツールに詳しい方"
  ],
  "can_offer_at_event": [
    "都内店舗での実証実験",
    "飲食店経営者ネットワーク",
    "イベント会場としての店舗提供"
  ],
  "motivation": "インバウンド客向けの集客を強化したい",
  "preferred_language": ["ja"]
}
```

### 代码证据 15

```ts
type AIAnalysis = {
  id: string;

  target_type:
    | "user"
    | "contact"
    | "connection"
    | "event"
    | "event_participant"
    | "conversation"
    | "recommendation";

  target_id: string;

  analysis_type:
    | "user_profile_summary"
    | "contact_profile_summary"
    | "relationship_summary"
    | "event_intent_summary"
    | "match_reasoning"
    | "follow_up_suggestion"
    | "organizer_dashboard_summary";

  input_source:
    | "business_card"
    | "registration_form"
    | "manual_note"
    | "chat"
    | "event_history"
    | "mixed";

  result_json: Record<string, any>;

  created_at: string;
  updated_at?: string;
};
```

### 代码证据 16

```json
{
  "id": "ai_user_profile_001",
  "target_type": "user",
  "target_id": "u_jp_restaurant_001",
  "analysis_type": "user_profile_summary",
  "input_source": "mixed",
  "result_json": {
    "summary": "東京都内で複数店舗を運営する飲食店経営者。インバウンド集客と外国人顧客対応に課題があり、華人コミュニティや多言語マーケティングに関心が高い。",
    "confirmed_facts": [
      {
        "field": "company",
        "value": "Tanaka Foods株式会社",
        "source": "business_card",
        "confidence": 1.0
      },
      {
        "field": "industry",
        "value": "restaurant",
        "source": "registration_form",
        "confidence": 1.0
      }
    ],
    "inferred_traits": [
      {
        "trait": "对华语圈 inbound 客户增长感兴趣",
        "reason": "报名信息中提到中国語対応マーケティング和外国人観光客集客",
        "source_refs": ["event_registration"],
        "confidence": 0.86
      }
    ],
    "business_goals": [
      "外国人観光客向けの集客を強化したい",
      "中国語対応できるマーケティングパートナーを探したい"
    ],
    "can_offer": [
      "都内店舗での実証実験",
      "イベント会場としての協力"
    ],
    "looking_for": [
      "中文营销顾问",
      "华人社群组织者",
      "预约 / CRM 工具服务商"
    ],
    "relationship_style": "慎重だが、実店舗で試せる提案には前向き",
    "preferred_language": ["ja"],
    "risk_notes": [
      "初回沟通最好使用日文",
      "不要过度技术化介绍方案"
    ]
  }
}
```

### 代码证据 17

```ts
type Connection = {
  id: string;
  user_id: string;
  contact_id: string;

  relationship_type:
    | "met_once"
    | "exchanged_card"
    | "warm_intro"
    | "potential_client"
    | "potential_partner"
    | "investor_candidate"
    | "mentor"
    | "recruiting"
    | "existing_client"
    | "inactive_contact"
    | "do_not_contact";

  source_event_id?: string;

  relationship_strength: number;
  trust_level: number;
  business_relevance_score: number;

  shared_topics: string[];
  suggested_actions: string[];
  ai_summary: string;

  first_met_at?: string;
  last_interaction_at?: string;
  next_action_at?: string;

  metadata?: Record<string, any>;
};
```

### 代码证据 18

```json
{
  "id": "conn_001",
  "user_id": "u_ai_founder_001",
  "contact_id": "contact_jp_sme_owner_001",
  "relationship_type": "potential_client",
  "source_event_id": "event_ai_dx_001",
  "relationship_strength": 0.42,
  "trust_level": 0.55,
  "business_relevance_score": 0.88,
  "shared_topics": [
    "AI workflow automation",
    "中小企業DX",
    "業務効率化"
  ],
  "suggested_actions": [
    "イベント後24時間以内に日文でお礼メッセージを送る",
    "相手の業務課題を聞く短いオンライン面談を提案する"
  ],
  "ai_summary": "一度イベントで会話済み。相手は中小企業の業務効率化に関心があり、軽量なAI PoCの提案先として有望。",
  "first_met_at": "2026-06-15T10:30:00+09:00",
  "last_interaction_at": "2026-06-15T11:10:00+09:00"
}
```

### 代码证据 19

```ts
type Interaction = {
  id: string;
  connection_id: string;

  type:
    | "business_card_exchange"
    | "event_note"
    | "manual_note"
    | "chat_message"
    | "chat_summary"
    | "email_follow_up"
    | "wechat_follow_up"
    | "intro_note"
    | "meeting_summary"
    | "reminder";

  content: string;
  language: "ja" | "zh" | "en" | "mixed";

  source:
    | "user_input"
    | "business_card"
    | "event"
    | "chat"
    | "ai_generated"
    | "imported";

  sentiment?: "positive" | "neutral" | "negative";
  follow_up_required: boolean;
  created_at: string;

  metadata?: Record<string, any>;
};
```

### 代码证据 20

```json
{
  "id": "int_001",
  "connection_id": "conn_001",
  "type": "event_note",
  "content": "在 Japan-China AI / DX Salon 见面。对方经营一家日本中小制造企业，正在考虑用 AI 减少重复性文书工作。对技术不熟，但愿意先听一个轻量 demo。",
  "language": "zh",
  "source": "user_input",
  "sentiment": "positive",
  "follow_up_required": true,
  "created_at": "2026-06-15T12:00:00+09:00"
}
```

### 代码证据 21

```ts
type MatchRecommendation = {
  id: string;

  event_id?: string;
  user_id: string;
  recommended_user_id: string;

  match_type:
    | "buyer_seller"
    | "investor_founder"
    | "market_entry"
    | "channel_partner"
    | "hiring_talent"
    | "knowledge_exchange"
    | "community_connector"
    | "follow_up_priority"
    | "weak_match"
    | "bad_match";

  score: number;

  explanation: {
    ja?: string;
    zh?: string;
    en?: string;
  };

  icebreaker_questions: string[];
  evidence: string[];
  risks: string[];

  status:
    | "generated"
    | "shown"
    | "accepted"
    | "dismissed"
    | "converted_to_connection";

  created_at: string;
};
```

### 代码证据 22

```json
{
  "id": "rec_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_cn_marketing_001",
  "match_type": "buyer_seller",
  "score": 0.91,
  "explanation": {
    "zh": "田中さん正在寻找能帮助餐饮门店吸引外国人客群的合作伙伴。林さん有华语用户内容营销和社群运营经验，并且正在寻找日本本地餐饮客户。两人的需求和供给高度互补，适合先围绕“中文社群集客 × 线下门店试点”交流。",
    "ja": "田中さんはインバウンド集客と中国語対応のマーケティングパートナーを探しています。林さんは華語圏ユーザー向けのコンテンツマーケティングとコミュニティ運営の経験があり、日本の飲食店との協業機会を探しています。まずは「中国語圏向け集客 × 店舗での小規模実証」について話すと良さそうです。"
  },
  "icebreaker_questions": [
    "外国人観光客向けの集客で、今いちばん困っていることは何ですか？",
    "小さく試すなら、1店舗だけでどのようなキャンペーンができそうですか？",
    "中国語圏ユーザー向けの集客で、過去に反応が良かった施策はありますか？"
  ],
  "evidence": [
    "田中さんの登録目的: インバウンド集客",
    "林さんの提供価値: 中文社群推广、内容营销",
    "双方都希望线下门店合作"
  ],
  "risks": [
    "田中さんは日本語中心のため、初回沟通最好用日文"
  ],
  "status": "generated",
  "created_at": "2026-06-20T10:00:00+09:00"
}
```

### 代码证据 23

```ts
type GoldenMatch = {
  id: string;

  event_id: string;
  user_id: string;
  recommended_user_id: string;

  expected_match_type:
    | "buyer_seller"
    | "investor_founder"
    | "market_entry"
    | "channel_partner"
    | "hiring_talent"
    | "knowledge_exchange"
    | "community_connector"
    | "follow_up_priority"
    | "weak_match"
    | "bad_match";

  expected_rank_range?: [number, number];

  must_include_reason_keywords: string[];
  must_not_include_reason_keywords: string[];

  negative_case: boolean;

  notes?: string;
};
```

### 代码证据 24

```json
{
  "id": "gm_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_cn_marketing_001",
  "expected_match_type": "buyer_seller",
  "expected_rank_range": [1, 3],
  "must_include_reason_keywords": [
    "インバウンド",
    "中国語",
    "飲食店集客"
  ],
  "must_not_include_reason_keywords": [
    "投資",
    "採用"
  ],
  "negative_case": false,
  "notes": "日本餐饮老板和华人营销顾问应当是 inbound 活动中的高优先级推荐。"
}
```

### 代码证据 25

```json
{
  "id": "gm_002",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_student_jobseeker_001",
  "expected_match_type": "bad_match",
  "expected_rank_range": null,
  "must_include_reason_keywords": [],
  "must_not_include_reason_keywords": [
    "strong business fit",
    "high priority",
    "非常适合合作"
  ],
  "negative_case": true,
  "notes": "学生求职者和餐饮老板在该活动场景下不是高价值商业匹配。"
}
```

### 代码证据 26

```txt
日本企业想找华语市场资源
华人创业者想找日本客户
日本商户想接触外国人客群
投资人想找跨境项目
招聘方想找双语人才
活动主办方想提高连接成功率
```

### 代码证据 27

```txt
寻找 AI / SaaS 解决方案
寻找 PoC 合作方
了解中国市场或外国人用户
需要内部说明材料
有预算但决策流程较慢
```

### 代码证据 28

```txt
AI startup
bilingual PM
行业 consultant
有日本落地经验的服务商
```

### 代码证据 29

```txt
想获客
想做 DX
想降低人手成本
想接触外国人客户
不太懂技术
```

### 代码证据 30

```txt
AI automation 服务商
华人营销资源
inbound / 小红书 / TikTok 运营
预约 / CRM 服务商
支付服务商
```

### 代码证据 31

```txt
寻找日本客户
寻找合作伙伴
寻找投资人
寻找懂日本商业规则的人
需要日文商务沟通支持
```

### 代码证据 32

```txt
日本企业负责人
日本顾问
投资人
活动主办方
双语 BD
```

### 代码证据 33

```txt
寻找 sponsor
寻找合作活动
寻找优质嘉宾
提升活动商业价值
管理大量弱关系
```

### 代码证据 34

```txt
日本企业
餐饮 / 零售商户
招聘公司
投资人
B2B 服务商
```

### 代码证据 35

```txt
寻找早期项目
寻找 AI / SaaS / inbound / cross-border 方向
寻找有中日市场潜力的团队
寻找 deal source
```

### 代码证据 36

```txt
founder
社群组织者
技术团队
行业专家
```

### 代码证据 37

```txt
寻找外国人客户
寻找中文营销
寻找预约 / 支付 / 会员系统
寻找活动合作
寻找 KOL / 社群分发
```

### 代码证据 38

```txt
华人社群
旅游公司
营销顾问
AI 预约 / CRM 工具
支付公司
```

### 代码证据 39

```txt
寻找双语人才
寻找技术人才
寻找企业客户
寻找学校或社群渠道
```

### 代码证据 40

```txt
留学生创业者
AI 工程师
华人社群
日本企业 DX 部门
猎头
```

### 代码证据 41

```txt
行政書士
税理士
法务顾问
公司设立顾问
补助金顾问
经营咨询
```

### 代码证据 42

```txt
寻找创业者客户
寻找中小企业客户
寻找合作转介绍
建立长期信任关系
```

### 代码证据 43

```txt
创业者
外国人在日经营者
日本中小企业
不动产公司
投资人
```

### 代码证据 44

```txt
综合型中日商业 networking
```

### 代码证据 45

```txt
多行业推荐
中日双语用户
活动报名
AI 推荐
同桌安排
会后 follow-up
```

### 代码证据 46

```txt
AI 与企业业务落地
```

### 代码证据 47

```txt
AI 服务商和日本企业需求方匹配
PoC 场景
技术方如何用业务语言解释价值
```

### 代码证据 48

```txt
餐饮、零售、旅游、外国人客户增长
```

### 代码证据 49

```txt
日本商户和华人营销资源匹配
线下门店和社群合作
小红书 / 抖音 / inbound 渠道
```

### 代码证据 50

```txt
中日创业者与投资人
```

### 代码证据 51

```txt
founder-investor match
融资阶段过滤
投资方向匹配
不适合项目的降权
```

### 代码证据 52

```txt
双语人才、企业 HR、猎头、学校资源
```

### 代码证据 53

```txt
招聘匹配
双语人才发现
企业和社群连接
```

### 代码证据 54

```txt
日本不动产、海外客户、税务法务
```

### 代码证据 55

```txt
高信任关系
风险提示
不应过度推荐
信息不足时 AI 保守表达
```

### 代码证据 56

```txt
进入日本市场的 SaaS 企业
```

### 代码证据 57

```txt
日本市场进入
渠道伙伴
本地代理
企业销售线索
```

### 代码证据 58

```txt
日本地方中小企业 DX
```

### 代码证据 59

```txt
日语主导场景
非技术用户
地方商工会 demo
AI 工具业务解释能力
```

### 代码证据 60

```txt
日本企业进入中国 / 华语市场
```

### 代码证据 61

```txt
日本企业和华人市场顾问匹配
中国平台、社群、营销、渠道
跨文化沟通
```

### 代码证据 62

```txt
专门给活动主办方看的 demo 活动
```

### 代码证据 63

```txt
organizer dashboard
参会者构成分析
高价值 match 数
同桌推荐
活动后 follow-up 数据
```

### 代码证据 64

```txt
用户：30
活动：3
公司：20
报名：80
关系：100
互动：150
推荐：60
```

### 代码证据 65

```txt
页面渲染
列表筛选
用户详情页
活动详情页
简单推荐
联系人列表
```

### 代码证据 66

```txt
用户：120–150
活动：10–12
公司：80–100
报名记录：400–600
关系记录：800–1200
互动记录：1000–1500
推荐记录：300–500
golden matches：100–200
```

### 代码证据 67

```txt
核心主角用户：30 个
核心活动：5 个
核心推荐关系：100 条
核心 follow-up 场景：50 条
```

### 代码证据 68

```txt
用户：5,000
活动：300
公司：2,000
报名：30,000
关系：50,000
互动：100,000
推荐：20,000
```

### 代码证据 69

```txt
1. 定义行业和商业生态
2. 生成公司 / 组织
3. 生成用户
4. 生成用户长期画像
5. 生成活动
6. 根据活动主题选择参会者
7. 为参会者生成本次活动目标
8. 生成推荐关系
9. 生成名片交换和互动记录
10. 生成 follow-up、提醒、关系状态
11. 生成 AI profile 和推荐解释
12. 生成 golden matches 和 negative cases
```

### 代码证据 70

```txt
随机生成 100 个用户
随机生成 10 个活动
随机把用户塞进活动
随机生成推荐
```

### 代码证据 71

```txt
日本餐饮老板想找华人客户
华人社群主理人有社群资源
中文营销顾问能做小红书 / 抖音
预约系统服务商能解决外国人预约
活动主办方想提高 sponsor 收入

所以这些人之间自然形成商业连接。
```

### 代码证据 72

```txt
match_score =
  0.35 * offer_need_fit
+ 0.20 * business_context_fit
+ 0.15 * language_or_market_bridge
+ 0.10 * seniority_decision_power
+ 0.10 * relationship_timing
+ 0.05 * trust_or_mutual_context
+ 0.05 * event_relevance
- penalty_conflict
- penalty_low_confidence
```

### 代码证据 73

```txt
不要只按行业相同推荐
不要只按兴趣相同推荐
不要只因为都对 AI 感兴趣就推荐
```

### 代码证据 74

```txt
A 有需求，B 有解决方案
A 想进日本市场，B 有日本渠道
A 是企业决策者，B 能提供落地服务
A 是投资人，B 是符合方向的 founder
A 是主办方，B 是高质量 speaker / sponsor
A 有中国资源，B 有日本本地业务需求
```

### 代码证据 75

```txt
日本餐饮老板
华人社群组织者
小红书 / 抖音营销顾问
预约系统服务商
inbound 旅行社
```

### 代码证据 76

```txt
推荐谁该认识
解释为什么推荐
生成日文 follow-up
活动后提醒下一步
```

### 代码证据 77

```txt
在日华人 AI 创业者
日本中小企业老板
日本 DX 顾问
商工会活动组织者
CVC 投资人
```

### 代码证据 78

```txt
不是把 AI 人推荐给 AI 人
而是把 AI founder 推荐给有真实业务场景的人
```

### 代码证据 79

```txt
日本品牌负责人
中国市场顾问
华人 KOL agency
跨境电商负责人
法务 / 税务顾问
```

### 代码证据 80

```txt
识别 market-entry 关系
推荐顺序按落地价值排序
生成轻量 intro message
```

### 代码证据 81

```txt
日本 VC
CVC
华人 founder
日本技术创业者
社群组织者
```

### 代码证据 82

```txt
根据投资方向匹配
根据融资阶段过滤
不把所有 founder 都推荐给投资人
```

### 代码证据 83

```txt
Organizer
80 个参会者
10 张桌子
每桌 6–8 人
```

### 代码证据 84

```txt
每桌有需求方和供给方
每桌有 connector
避免同质人群扎堆
考虑语言沟通
避免完全无关的人硬凑
```

### 代码证据 85

```txt
用户上传名片
名片只有公司、姓名、职位
用户追加一句备注
```

### 代码证据 86

```txt
根据名片 + 备注生成联系人画像
区分 confirmed facts 和 inferred traits
信息不足时不乱推断
```

### 代码证据 87

```txt
用户活动后有 15 张名片
只记得其中 5 个人
需要优先跟进
```

### 代码证据 88

```txt
根据商业相关性排序
生成日文 / 中文 follow-up
自动建议 next action
创建提醒但不自动发送
```

### 代码证据 89

```txt
6 个月前认识的人
最近又参加同类活动
现在有新的合作机会
```

### 代码证据 90

```txt
发现旧联系人
提醒“你们之前见过”
生成自然的重新联系话术
```

### 代码证据 91

```txt
同一个人有两张名片
一次中文名，一次日文名
公司名略有变化
邮箱相同或相似
```

### 代码证据 92

```txt
检测可能重复
给出合并建议
需要用户确认，不自动合并
```

### 代码证据 93

```txt
只想招聘的人
强销售的人
目标完全不匹配的人
信息不足的人
竞争关系太强的人
```

### 代码证据 94

```txt
AI 不为了凑数硬推荐
低置信度时表达不确定
推荐理由不夸大
```

### 代码证据 95

```txt
王 晨
Wang Chen
チェン・ワン
王晨
Chen Wang
```

### 代码证据 96

```txt
重复联系人检测
多语言姓名搜索
名片合并建议
```

### 代码证据 97

```txt
株式会社BridgeWave
BridgeWave Inc.
BridgeWave株式会社
Bridge Wave
ブリッジウェーブ
```

### 代码证据 98

```txt
公司名归一化
同公司多人识别
旧公司 / 新公司识别
```

### 代码证据 99

```txt
中文
中国語
Mandarin
普通话
Chinese
繁體中文
```

### 代码证据 100

```txt
语言归一化
多语言推荐
日文 / 中文 follow-up 生成
```

### 代码证据 101

```txt
想认识有趣的人
AIに興味があります
人脉を広げたい
ビジネスパートナーを探しています
```

### 代码证据 102

```txt
AI 是否能追问
是否降低置信度
是否避免强推荐
```

### 代码证据 103

```txt
没有公司
没有职位
没有行业
只上传名片
只有活动备注
没有联系方式
```

### 代码证据 104

```txt
画像生成是否保守
推荐理由是否避免编造
UI 是否提示信息不足
```

### 代码证据 105

```txt
mock-data/
  dictionaries/
    industries.json
    roles.json
    company_types.json
    languages.json
    relationship_types.json
    event_types.json
    business_goals.json
    offer_need_pairs.json
    follow_up_templates.json

  seed/
    users.seed.json
    events.seed.json
    event_participants.seed.json
    contacts.seed.json
    connections.seed.json
    interactions.seed.json
    messages.seed.json
    ai_analyses.seed.json
    match_recommendations.seed.json

  tests/
    golden_matches.json
    negative_cases.json
    dirty_data_cases.json

  scenarios/
    scenario_01_jp_restaurant_inbound.json
    scenario_02_cn_ai_founder_japan_poc.json
    scenario_03_jp_company_china_market_entry.json
    scenario_04_investor_founder_matching.json
    scenario_05_organizer_table_matching.json
    scenario_06_business_card_profile_generation.json
    scenario_07_post_event_follow_up.json
    scenario_08_dormant_relationship_reactivation.json
    scenario_09_duplicate_contact_merge.json
    scenario_10_bad_match_filtering.json

  generated/
    users.generated.json
    events.generated.json
    event_participants.generated.json
    contacts.generated.json
    connections.generated.json
    interactions.generated.json
    match_recommendations.generated.json

  exports/
    local_seed.json
    demo_seed.json
    supabase_seed.sql
```

### 代码证据 106

```txt
现有 users 字段     -> mock users 字段
现有 events 字段    -> mock events 字段
现有 contacts 字段  -> mock contacts 字段
现有 messages 字段  -> mock messages 字段
```

### 代码证据 107

```txt
哪些建议字段已经存在
哪些字段可以放 metadata
哪些字段需要新建表
哪些字段只用于 mock
```

### 代码证据 108

```txt
1. EventParticipant 里的 looking_for_at_event / can_offer_at_event
2. AIAnalysis.result_json
3. MatchRecommendation / golden_matches
```

### 代码证据 109

```txt
用户：30
活动：3
报名：80
关系：100
推荐：60
```

### 代码证据 110

```txt
用户：120–150
活动：10–12
报名：400–600
关系：800–1200
互动：1000+
推荐：300–500
golden matches：100–200
```

### 代码证据 111

```txt
应该推荐的人是否出现在 top 3
推荐类型是否正确
推荐理由是否包含核心关键词
推荐理由是否没有乱说
不该推荐的人是否被过滤
日文 / 中文解释是否自然
```

### 代码证据 112

```txt
event_participants.looking_for_at_event
event_participants.can_offer_at_event
ai_analyses.result_json
connections.relationship_strength
connections.business_relevance_score
match_recommendations
```

### 代码证据 113

```txt
confirmed_facts
inferred_traits
source_refs
confidence
interaction_memories
follow_up_required
golden_matches
negative_cases
dirty_data_cases
```

### 代码证据 114

```txt
organizations
company-level profile
organizer advanced dashboard
table matching optimization
multi-hop relationship graph
long-term relationship lifecycle
```

### 代码证据 115

```txt
让 AI 能够理解真实商业关系，并把“认识人”转化为“知道该认识谁、为什么、下一步做什么”。
```

### 代码证据 116

```txt
1. 活动中的临时意图
   用户这次为什么来？想找谁？能提供什么？

2. 关系中的长期价值
   这个联系人和我是什么关系？关系强度如何？商业相关性如何？下一步是什么？

3. AI 输出的可解释性
   推荐为什么成立？来源是什么？哪些是事实？哪些是推测？置信度多少？
```

### 代码证据 117

```txt
保留现有 schema
增加 EventParticipant intent 字段
增加 AIAnalysis.result_json
增加 MatchRecommendation mock/result 表
增加 GoldenMatch 测试文件
用 v1 demo seed 构造 10 个高价值商业场景
```

### 代码证据 118

```txt
不会大幅推翻现有产品结构
可以快速生成高质量 mock 数据
可以让 demo 更像真实商业场景
可以测试 AI 推荐是否靠谱
可以为后续 organizer dashboard、同桌推荐、follow-up agent 打基础
```

### 代码证据 119

```txt
活动是场景
用户是节点
画像是理解
关系是资产
推荐是决策
follow-up 是行动
dashboard 是客户价值
```

## 源文档正文

## 1. 文档目的

本文档用于指导 Orbit 项目的 mock 数据生成、AI 画像建模、活动场景设计、人脉推荐测试与 demo 数据构建。

Orbit 当前已经有既定产品字段和数据结构，因此本文档**不是要求重写现有 schema**，而是提供一套可渐进接入的增强设计，用于支持以下能力：

1. 本地开发测试；
2. 客户 demo；
3. 活动 mock 数据；
4. 用户画像生成；
5. 人脉关系分析；
6. AI 推荐解释；
7. 会前匹配、会中推荐、会后 follow-up；
8. 推荐质量 regression test；
9. 日本商业人士与华人圈商业社交场景模拟。

---

## 2. 核心设计判断

Orbit 的 mock 数据不应该只是随机生成一批用户和活动。

Orbit 的核心价值不是：

> 有很多活动，有很多用户。

而是：

> 用户参加某个活动后，Orbit 能理解这个人是谁、他想找什么、他能提供什么、他和谁应该认识、为什么应该认识、认识后下一步该怎么做。

因此 mock 数据必须构造一个真实感强的商业社交网络。

核心对象包括：

```txt
User 用户
Event 活动
EventParticipant 活动参与者
Contact 联系人
Connection / Relationship 关系
Interaction 互动记录
AIAnalysis AI 分析结果
MatchRecommendation 推荐结果
GoldenMatch 推荐测试样本
```

其中：

- `User / Event / Contact / Message` 是产品基础层；
- `AIAnalysis / MatchRecommendation / Connection Profile` 是 AI 语义层；
- `GoldenMatch / DirtyCases / DemoScenarios` 是测试和 demo 层。

---

## 3. 设计原则

### 3.1 不替换现有字段

Orbit 当前已有字段是主干。
本文档里的字段建议优先通过以下方式接入：

```txt
metadata
profile_json
result_json
mock-only json
extension table
```

不建议一开始大规模修改主表字段。

---

### 3.2 产品字段和 AI 字段分离

产品字段用于业务逻辑和 UI 展示，例如：

```txt
name
company
title
industry
event_id
status
message
```

AI 字段用于解释、推理、推荐和总结，例如：

```txt
confirmed_facts
inferred_traits
source_refs
confidence
business_relevance_score
recommendation_reason
```

AI 字段变化更快，应该优先放在 JSON 或独立分析表中。

---

### 3.3 mock 数据要服务真实场景

每条 mock 数据都应该回答一个问题：

```txt
这个人为什么参加这个活动？
他想找谁？
谁适合他？
为什么适合？
他不应该被推荐给谁？
活动后下一步是什么？
```

不要生成无意义的假资料，例如：

```txt
“我想认识有趣的人”
“我对 AI 感兴趣”
“我想拓展人脉”
```

这些数据无法测试 Orbit 的核心价值。

---

### 3.4 区分事实和推测

AI 画像必须区分：

```txt
confirmed_facts 已确认事实
inferred_traits AI 推测
confidence 置信度
source_refs 来源
```

示例：

```json
{
  "confirmed_facts": [
    {
      "field": "company",
      "value": "Tanaka Foods株式会社",
      "source": "business_card",
      "confidence": 1.0
    }
  ],
  "inferred_traits": [
    {
      "trait": "可能对华语圈 inbound 客户增长感兴趣",
      "reason": "活动报名中提到希望接触中国語対応できるマーケティングパートナー",
      "source_refs": ["event_registration"],
      "confidence": 0.82
    }
  ]
}
```

这会让 Orbit 的 AI 显得更可信，不像普通 chatbot 那样乱编。

---

## 4. 推荐的数据分层

### 4.1 第一层：现有产品业务层

这一层应该尽量沿用 Orbit 当前字段。

包括：

```txt
users
events
event_participants
contacts
connections
conversations
messages
```

这部分是产品运行必须的数据。

---

### 4.2 第二层：AI 语义增强层

这一层用于画像、推荐、总结、解释。

包括：

```txt
ai_analyses
match_recommendations
relationship_profiles
event_intents
interaction_memories
```

这部分可以不全部建表，很多内容可以放在 JSON 中。

---

### 4.3 第三层：测试 / demo 层

这一层不进入生产数据库，只用于 mock、测试和演示。

包括：

```txt
golden_matches
negative_cases
dirty_data_cases
demo_scenarios
expected_recommendation_results
```

这部分的价值是帮助你们测试 AI 推荐是否稳定。

---

## 5. 建议增加或强化的核心模块

### 5.1 EventParticipant / 活动参与者意图

这是最应该优先补充的模块。

同一个用户在不同活动里的目标可能不同，所以不能只依赖用户长期画像。

例如一个 AI founder：

```txt
在 AI / DX 活动里：想找日本企业 PoC 客户
在投资人活动里：想找 seed investor
在华人创业活动里：想找 BD 合作伙伴
在餐饮 inbound 活动里：想找真实业务场景
```

建议字段：

```ts
type EventParticipant = {
  id: string;
  event_id: string;
  user_id: string;

  status: "registered" | "checked_in" | "cancelled" | "no_show";
  role_in_event: "attendee" | "speaker" | "organizer" | "sponsor" | "vip";

  looking_for_at_event: string[];
  can_offer_at_event: string[];
  motivation: string;
  preferred_language: string[];

  checked_in_at?: string;
  table_id?: string;

  metadata?: Record<string, any>;
};
```

示例：

```json
{
  "id": "ep_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "status": "checked_in",
  "role_in_event": "attendee",
  "looking_for_at_event": [
    "外国人観光客向けの集客に詳しい方",
    "中国語対応できるマーケティングパートナー",
    "予約・CRMツールに詳しい方"
  ],
  "can_offer_at_event": [
    "都内店舗での実証実験",
    "飲食店経営者ネットワーク",
    "イベント会場としての店舗提供"
  ],
  "motivation": "インバウンド客向けの集客を強化したい",
  "preferred_language": ["ja"]
}
```

优先级：**最高**。

原因：这是 Orbit 会前推荐、同桌推荐、活动后 follow-up 的核心输入。

---

### 5.2 AIAnalysis / AI 分析结果

建议将 AI 画像、推荐解释、关系总结、follow-up 建议都统一放进 `AIAnalysis`。

推荐结构：

```ts
type AIAnalysis = {
  id: string;

  target_type:
    | "user"
    | "contact"
    | "connection"
    | "event"
    | "event_participant"
    | "conversation"
    | "recommendation";

  target_id: string;

  analysis_type:
    | "user_profile_summary"
    | "contact_profile_summary"
    | "relationship_summary"
    | "event_intent_summary"
    | "match_reasoning"
    | "follow_up_suggestion"
    | "organizer_dashboard_summary";

  input_source:
    | "business_card"
    | "registration_form"
    | "manual_note"
    | "chat"
    | "event_history"
    | "mixed";

  result_json: Record<string, any>;

  created_at: string;
  updated_at?: string;
};
```

用户画像示例：

```json
{
  "id": "ai_user_profile_001",
  "target_type": "user",
  "target_id": "u_jp_restaurant_001",
  "analysis_type": "user_profile_summary",
  "input_source": "mixed",
  "result_json": {
    "summary": "東京都内で複数店舗を運営する飲食店経営者。インバウンド集客と外国人顧客対応に課題があり、華人コミュニティや多言語マーケティングに関心が高い。",
    "confirmed_facts": [
      {
        "field": "company",
        "value": "Tanaka Foods株式会社",
        "source": "business_card",
        "confidence": 1.0
      },
      {
        "field": "industry",
        "value": "restaurant",
        "source": "registration_form",
        "confidence": 1.0
      }
    ],
    "inferred_traits": [
      {
        "trait": "对华语圈 inbound 客户增长感兴趣",
        "reason": "报名信息中提到中国語対応マーケティング和外国人観光客集客",
        "source_refs": ["event_registration"],
        "confidence": 0.86
      }
    ],
    "business_goals": [
      "外国人観光客向けの集客を強化したい",
      "中国語対応できるマーケティングパートナーを探したい"
    ],
    "can_offer": [
      "都内店舗での実証実験",
      "イベント会場としての協力"
    ],
    "looking_for": [
      "中文营销顾问",
      "华人社群组织者",
      "预约 / CRM 工具服务商"
    ],
    "relationship_style": "慎重だが、実店舗で試せる提案には前向き",
    "preferred_language": ["ja"],
    "risk_notes": [
      "初回沟通最好使用日文",
      "不要过度技术化介绍方案"
    ]
  }
}
```

优先级：**高**。

原因：让项目不用频繁改主表，同时可以承载复杂 AI 输出。

---

### 5.3 Connection / Relationship Profile

Orbit 的核心不是联系人列表，而是关系资产。

建议在现有 `contacts` 或 `connections` 的基础上，强化关系画像。

推荐字段：

```ts
type Connection = {
  id: string;
  user_id: string;
  contact_id: string;

  relationship_type:
    | "met_once"
    | "exchanged_card"
    | "warm_intro"
    | "potential_client"
    | "potential_partner"
    | "investor_candidate"
    | "mentor"
    | "recruiting"
    | "existing_client"
    | "inactive_contact"
    | "do_not_contact";

  source_event_id?: string;

  relationship_strength: number;
  trust_level: number;
  business_relevance_score: number;

  shared_topics: string[];
  suggested_actions: string[];
  ai_summary: string;

  first_met_at?: string;
  last_interaction_at?: string;
  next_action_at?: string;

  metadata?: Record<string, any>;
};
```

示例：

```json
{
  "id": "conn_001",
  "user_id": "u_ai_founder_001",
  "contact_id": "contact_jp_sme_owner_001",
  "relationship_type": "potential_client",
  "source_event_id": "event_ai_dx_001",
  "relationship_strength": 0.42,
  "trust_level": 0.55,
  "business_relevance_score": 0.88,
  "shared_topics": [
    "AI workflow automation",
    "中小企業DX",
    "業務効率化"
  ],
  "suggested_actions": [
    "イベント後24時間以内に日文でお礼メッセージを送る",
    "相手の業務課題を聞く短いオンライン面談を提案する"
  ],
  "ai_summary": "一度イベントで会話済み。相手は中小企業の業務効率化に関心があり、軽量なAI PoCの提案先として有望。",
  "first_met_at": "2026-06-15T10:30:00+09:00",
  "last_interaction_at": "2026-06-15T11:10:00+09:00"
}
```

优先级：**高**。

原因：这是 Orbit 区别于普通名片夹和 CRM 的地方。

---

### 5.4 Interaction Memory / 互动记忆

不要只存站内聊天。
Orbit 应该把所有与关系相关的事件都看作 interaction。

推荐类型：

```ts
type Interaction = {
  id: string;
  connection_id: string;

  type:
    | "business_card_exchange"
    | "event_note"
    | "manual_note"
    | "chat_message"
    | "chat_summary"
    | "email_follow_up"
    | "wechat_follow_up"
    | "intro_note"
    | "meeting_summary"
    | "reminder";

  content: string;
  language: "ja" | "zh" | "en" | "mixed";

  source:
    | "user_input"
    | "business_card"
    | "event"
    | "chat"
    | "ai_generated"
    | "imported";

  sentiment?: "positive" | "neutral" | "negative";
  follow_up_required: boolean;
  created_at: string;

  metadata?: Record<string, any>;
};
```

示例：

```json
{
  "id": "int_001",
  "connection_id": "conn_001",
  "type": "event_note",
  "content": "在 Japan-China AI / DX Salon 见面。对方经营一家日本中小制造企业，正在考虑用 AI 减少重复性文书工作。对技术不熟，但愿意先听一个轻量 demo。",
  "language": "zh",
  "source": "user_input",
  "sentiment": "positive",
  "follow_up_required": true,
  "created_at": "2026-06-15T12:00:00+09:00"
}
```

优先级：**中高**。

原因：AI 画像和 follow-up 不应该只依赖用户 profile，而应该依赖真实互动。

---

### 5.5 MatchRecommendation / 推荐结果

这个模块用于存储 AI 推荐结果。

它可以先作为 mock 数据文件，之后再决定是否进入正式数据库。

推荐结构：

```ts
type MatchRecommendation = {
  id: string;

  event_id?: string;
  user_id: string;
  recommended_user_id: string;

  match_type:
    | "buyer_seller"
    | "investor_founder"
    | "market_entry"
    | "channel_partner"
    | "hiring_talent"
    | "knowledge_exchange"
    | "community_connector"
    | "follow_up_priority"
    | "weak_match"
    | "bad_match";

  score: number;

  explanation: {
    ja?: string;
    zh?: string;
    en?: string;
  };

  icebreaker_questions: string[];
  evidence: string[];
  risks: string[];

  status:
    | "generated"
    | "shown"
    | "accepted"
    | "dismissed"
    | "converted_to_connection";

  created_at: string;
};
```

示例：

```json
{
  "id": "rec_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_cn_marketing_001",
  "match_type": "buyer_seller",
  "score": 0.91,
  "explanation": {
    "zh": "田中さん正在寻找能帮助餐饮门店吸引外国人客群的合作伙伴。林さん有华语用户内容营销和社群运营经验，并且正在寻找日本本地餐饮客户。两人的需求和供给高度互补，适合先围绕“中文社群集客 × 线下门店试点”交流。",
    "ja": "田中さんはインバウンド集客と中国語対応のマーケティングパートナーを探しています。林さんは華語圏ユーザー向けのコンテンツマーケティングとコミュニティ運営の経験があり、日本の飲食店との協業機会を探しています。まずは「中国語圏向け集客 × 店舗での小規模実証」について話すと良さそうです。"
  },
  "icebreaker_questions": [
    "外国人観光客向けの集客で、今いちばん困っていることは何ですか？",
    "小さく試すなら、1店舗だけでどのようなキャンペーンができそうですか？",
    "中国語圏ユーザー向けの集客で、過去に反応が良かった施策はありますか？"
  ],
  "evidence": [
    "田中さんの登録目的: インバウンド集客",
    "林さんの提供価値: 中文社群推广、内容营销",
    "双方都希望线下门店合作"
  ],
  "risks": [
    "田中さんは日本語中心のため、初回沟通最好用日文"
  ],
  "status": "generated",
  "created_at": "2026-06-20T10:00:00+09:00"
}
```

优先级：**中高**。

原因：它可以帮助展示“为什么推荐这个人”，而不是只展示一个头像列表。

---

### 5.6 GoldenMatch / 推荐测试样本

这个模块不进入正式产品，只用于本地测试和 AI regression test。

推荐结构：

```ts
type GoldenMatch = {
  id: string;

  event_id: string;
  user_id: string;
  recommended_user_id: string;

  expected_match_type:
    | "buyer_seller"
    | "investor_founder"
    | "market_entry"
    | "channel_partner"
    | "hiring_talent"
    | "knowledge_exchange"
    | "community_connector"
    | "follow_up_priority"
    | "weak_match"
    | "bad_match";

  expected_rank_range?: [number, number];

  must_include_reason_keywords: string[];
  must_not_include_reason_keywords: string[];

  negative_case: boolean;

  notes?: string;
};
```

示例：

```json
{
  "id": "gm_001",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_cn_marketing_001",
  "expected_match_type": "buyer_seller",
  "expected_rank_range": [1, 3],
  "must_include_reason_keywords": [
    "インバウンド",
    "中国語",
    "飲食店集客"
  ],
  "must_not_include_reason_keywords": [
    "投資",
    "採用"
  ],
  "negative_case": false,
  "notes": "日本餐饮老板和华人营销顾问应当是 inbound 活动中的高优先级推荐。"
}
```

负例：

```json
{
  "id": "gm_002",
  "event_id": "event_inbound_001",
  "user_id": "u_jp_restaurant_001",
  "recommended_user_id": "u_student_jobseeker_001",
  "expected_match_type": "bad_match",
  "expected_rank_range": null,
  "must_include_reason_keywords": [],
  "must_not_include_reason_keywords": [
    "strong business fit",
    "high priority",
    "非常适合合作"
  ],
  "negative_case": true,
  "notes": "学生求职者和餐饮老板在该活动场景下不是高价值商业匹配。"
}
```

优先级：**中**。

原因：这个模块可以让每次改 prompt、改推荐逻辑、改 embedding 检索后，快速知道推荐质量有没有退化。

---

## 6. 日本商业人士 + 华人圈的数据比例设计

Orbit 的主要 demo 客户是日本商业人士，同时华人圈会是重要客户群。因此 mock 数据不能只偏向华人，也不能让华人只是装饰。

建议 v1 demo 数据比例：

| 用户群体 | 建议比例 | 作用 |
|---|---:|---|
| 日本本地商业人士 | 45–55% | 让日本客户有代入感 |
| 在日华人商业人士 | 25–35% | 展示中日桥梁价值 |
| 大中华区相关商业人士 | 10–15% | 展示跨境网络 |
| 其他国际用户 | 5–10% | 展示国际化 |

语言比例：

| 语言能力 | 建议比例 |
|---|---:|
| 日语 only | 25% |
| 日语 + 英语 | 20% |
| 日语 + 中文 | 20% |
| 中文 + 日语 + 英语 | 15% |
| 中文 only / 中文 + 英语 | 10% |
| 英语主导 | 10% |

这样可以产生自然的推荐场景：

```txt
日本企业想找华语市场资源
华人创业者想找日本客户
日本商户想接触外国人客群
投资人想找跨境项目
招聘方想找双语人才
活动主办方想提高连接成功率
```

---

## 7. 推荐 persona 模板

mock 数据建议围绕 persona 生成，而不是完全随机生成。

### 7.1 日本大企业 DX / 新规事业负责人

典型需求：

```txt
寻找 AI / SaaS 解决方案
寻找 PoC 合作方
了解中国市场或外国人用户
需要内部说明材料
有预算但决策流程较慢
```

适合推荐给：

```txt
AI startup
bilingual PM
行业 consultant
有日本落地经验的服务商
```

---

### 7.2 日本中小企业老板

典型需求：

```txt
想获客
想做 DX
想降低人手成本
想接触外国人客户
不太懂技术
```

适合推荐给：

```txt
AI automation 服务商
华人营销资源
inbound / 小红书 / TikTok 运营
预约 / CRM 服务商
支付服务商
```

---

### 7.3 在日华人创业者

典型需求：

```txt
寻找日本客户
寻找合作伙伴
寻找投资人
寻找懂日本商业规则的人
需要日文商务沟通支持
```

适合推荐给：

```txt
日本企业负责人
日本顾问
投资人
活动主办方
双语 BD
```

---

### 7.4 华人社群组织者

典型需求：

```txt
寻找 sponsor
寻找合作活动
寻找优质嘉宾
提升活动商业价值
管理大量弱关系
```

适合推荐给：

```txt
日本企业
餐饮 / 零售商户
招聘公司
投资人
B2B 服务商
```

---

### 7.5 日本 VC / CVC / angel

典型需求：

```txt
寻找早期项目
寻找 AI / SaaS / inbound / cross-border 方向
寻找有中日市场潜力的团队
寻找 deal source
```

适合推荐给：

```txt
founder
社群组织者
技术团队
行业专家
```

---

### 7.6 餐饮 / 零售 / inbound 商户

典型需求：

```txt
寻找外国人客户
寻找中文营销
寻找预约 / 支付 / 会员系统
寻找活动合作
寻找 KOL / 社群分发
```

适合推荐给：

```txt
华人社群
旅游公司
营销顾问
AI 预约 / CRM 工具
支付公司
```

---

### 7.7 招聘 / HR / global talent

典型需求：

```txt
寻找双语人才
寻找技术人才
寻找企业客户
寻找学校或社群渠道
```

适合推荐给：

```txt
留学生创业者
AI 工程师
华人社群
日本企业 DX 部门
猎头
```

---

### 7.8 咨询顾问 / 士业

包括：

```txt
行政書士
税理士
法务顾问
公司设立顾问
补助金顾问
经营咨询
```

典型需求：

```txt
寻找创业者客户
寻找中小企业客户
寻找合作转介绍
建立长期信任关系
```

适合推荐给：

```txt
创业者
外国人在日经营者
日本中小企业
不动产公司
投资人
```

---

## 8. 推荐活动模板

第一版 v1 demo seed 建议至少准备 10–12 个活动。

### 8.1 Tokyo Business Connect

定位：

```txt
综合型中日商业 networking
```

适合测试：

```txt
多行业推荐
中日双语用户
活动报名
AI 推荐
同桌安排
会后 follow-up
```

---

### 8.2 Japan-China AI / DX Salon

定位：

```txt
AI 与企业业务落地
```

适合测试：

```txt
AI 服务商和日本企业需求方匹配
PoC 场景
技术方如何用业务语言解释价值
```

---

### 8.3 Inbound Retail & Restaurant Growth Meetup

定位：

```txt
餐饮、零售、旅游、外国人客户增长
```

适合测试：

```txt
日本商户和华人营销资源匹配
线下门店和社群合作
小红书 / 抖音 / inbound 渠道
```

---

### 8.4 Cross-border Startup Investor Night

定位：

```txt
中日创业者与投资人
```

适合测试：

```txt
founder-investor match
融资阶段过滤
投资方向匹配
不适合项目的降权
```

---

### 8.5 Global Talent & Bilingual Career Forum

定位：

```txt
双语人才、企业 HR、猎头、学校资源
```

适合测试：

```txt
招聘匹配
双语人才发现
企业和社群连接
```

---

### 8.6 Real Estate & Overseas Investors Roundtable

定位：

```txt
日本不动产、海外客户、税务法务
```

适合测试：

```txt
高信任关系
风险提示
不应过度推荐
信息不足时 AI 保守表达
```

---

### 8.7 B2B SaaS Sales Japan Entry Meetup

定位：

```txt
进入日本市场的 SaaS 企业
```

适合测试：

```txt
日本市场进入
渠道伙伴
本地代理
企业销售线索
```

---

### 8.8 Local SME Digital Transformation Workshop

定位：

```txt
日本地方中小企业 DX
```

适合测试：

```txt
日语主导场景
非技术用户
地方商工会 demo
AI 工具业务解释能力
```

---

### 8.9 China Market Expansion Breakfast

定位：

```txt
日本企业进入中国 / 华语市场
```

适合测试：

```txt
日本企业和华人市场顾问匹配
中国平台、社群、营销、渠道
跨文化沟通
```

---

### 8.10 Organizer Demo Event

定位：

```txt
专门给活动主办方看的 demo 活动
```

适合测试：

```txt
organizer dashboard
参会者构成分析
高价值 match 数
同桌推荐
活动后 follow-up 数据
```

---

## 9. mock 数据规模建议

### 9.1 v0：开发用小数据

目标：让本地功能跑通。

```txt
用户：30
活动：3
公司：20
报名：80
关系：100
互动：150
推荐：60
```

用途：

```txt
页面渲染
列表筛选
用户详情页
活动详情页
简单推荐
联系人列表
```

---

### 9.2 v1：高质量 demo 数据

目标：客户演示、产品截图、内部验证。

```txt
用户：120–150
活动：10–12
公司：80–100
报名记录：400–600
关系记录：800–1200
互动记录：1000–1500
推荐记录：300–500
golden matches：100–200
```

重点手工设计：

```txt
核心主角用户：30 个
核心活动：5 个
核心推荐关系：100 条
核心 follow-up 场景：50 条
```

这是最重要的一版。

---

### 9.3 v2：压力测试数据

目标：性能、分页、搜索、过滤、推荐速度测试。

```txt
用户：5,000
活动：300
公司：2,000
报名：30,000
关系：50,000
互动：100,000
推荐：20,000
```

v2 可以程序生成，不需要每条数据都有完整故事。

---

## 10. 数据生成顺序

不要从随机用户开始生成。

推荐顺序：

```txt
1. 定义行业和商业生态
2. 生成公司 / 组织
3. 生成用户
4. 生成用户长期画像
5. 生成活动
6. 根据活动主题选择参会者
7. 为参会者生成本次活动目标
8. 生成推荐关系
9. 生成名片交换和互动记录
10. 生成 follow-up、提醒、关系状态
11. 生成 AI profile 和推荐解释
12. 生成 golden matches 和 negative cases
```

错误方式：

```txt
随机生成 100 个用户
随机生成 10 个活动
随机把用户塞进活动
随机生成推荐
```

正确方式：

```txt
日本餐饮老板想找华人客户
华人社群主理人有社群资源
中文营销顾问能做小红书 / 抖音
预约系统服务商能解决外国人预约
活动主办方想提高 sponsor 收入

所以这些人之间自然形成商业连接。
```

---

## 11. 推荐算法测试思路

mock 数据应该支持推荐质量测试。

推荐分数可以参考：

```txt
match_score =
  0.35 * offer_need_fit
+ 0.20 * business_context_fit
+ 0.15 * language_or_market_bridge
+ 0.10 * seniority_decision_power
+ 0.10 * relationship_timing
+ 0.05 * trust_or_mutual_context
+ 0.05 * event_relevance
- penalty_conflict
- penalty_low_confidence
```

关键点：

```txt
不要只按行业相同推荐
不要只按兴趣相同推荐
不要只因为都对 AI 感兴趣就推荐
```

更好的匹配通常是：

```txt
A 有需求，B 有解决方案
A 想进日本市场，B 有日本渠道
A 是企业决策者，B 能提供落地服务
A 是投资人，B 是符合方向的 founder
A 是主办方，B 是高质量 speaker / sponsor
A 有中国资源，B 有日本本地业务需求
```

---

## 12. demo 必须覆盖的 10 个场景

### 场景 1：日本餐饮老板找华人客户增长

参与者：

```txt
日本餐饮老板
华人社群组织者
小红书 / 抖音营销顾问
预约系统服务商
inbound 旅行社
```

Orbit 展示价值：

```txt
推荐谁该认识
解释为什么推荐
生成日文 follow-up
活动后提醒下一步
```

---

### 场景 2：华人 AI founder 找日本 PoC 客户

参与者：

```txt
在日华人 AI 创业者
日本中小企业老板
日本 DX 顾问
商工会活动组织者
CVC 投资人
```

Orbit 展示价值：

```txt
不是把 AI 人推荐给 AI 人
而是把 AI founder 推荐给有真实业务场景的人
```

---

### 场景 3：日本企业想进入中国市场

参与者：

```txt
日本品牌负责人
中国市场顾问
华人 KOL agency
跨境电商负责人
法务 / 税务顾问
```

Orbit 展示价值：

```txt
识别 market-entry 关系
推荐顺序按落地价值排序
生成轻量 intro message
```

---

### 场景 4：投资人找中日 cross-border 项目

参与者：

```txt
日本 VC
CVC
华人 founder
日本技术创业者
社群组织者
```

Orbit 展示价值：

```txt
根据投资方向匹配
根据融资阶段过滤
不把所有 founder 都推荐给投资人
```

---

### 场景 5：活动主办方做同桌安排

参与者：

```txt
Organizer
80 个参会者
10 张桌子
每桌 6–8 人
```

Orbit 展示价值：

```txt
每桌有需求方和供给方
每桌有 connector
避免同质人群扎堆
考虑语言沟通
避免完全无关的人硬凑
```

---

### 场景 6：名片 OCR 后自动生成联系人画像

参与者：

```txt
用户上传名片
名片只有公司、姓名、职位
用户追加一句备注
```

Orbit 展示价值：

```txt
根据名片 + 备注生成联系人画像
区分 confirmed facts 和 inferred traits
信息不足时不乱推断
```

---

### 场景 7：活动后 follow-up 生成

参与者：

```txt
用户活动后有 15 张名片
只记得其中 5 个人
需要优先跟进
```

Orbit 展示价值：

```txt
根据商业相关性排序
生成日文 / 中文 follow-up
自动建议 next action
创建提醒但不自动发送
```

---

### 场景 8：沉睡关系重新激活

参与者：

```txt
6 个月前认识的人
最近又参加同类活动
现在有新的合作机会
```

Orbit 展示价值：

```txt
发现旧联系人
提醒“你们之前见过”
生成自然的重新联系话术
```

---

### 场景 9：重复联系人合并

参与者：

```txt
同一个人有两张名片
一次中文名，一次日文名
公司名略有变化
邮箱相同或相似
```

Orbit 展示价值：

```txt
检测可能重复
给出合并建议
需要用户确认，不自动合并
```

---

### 场景 10：不应该推荐的关系

参与者：

```txt
只想招聘的人
强销售的人
目标完全不匹配的人
信息不足的人
竞争关系太强的人
```

Orbit 展示价值：

```txt
AI 不为了凑数硬推荐
低置信度时表达不确定
推荐理由不夸大
```

---

## 13. Dirty Data / 脏数据设计

真实 networking 产品一定会遇到脏数据。mock 数据里必须故意加入。

### 13.1 姓名问题

示例：

```txt
王 晨
Wang Chen
チェン・ワン
王晨
Chen Wang
```

测试目标：

```txt
重复联系人检测
多语言姓名搜索
名片合并建议
```

---

### 13.2 公司名问题

示例：

```txt
株式会社BridgeWave
BridgeWave Inc.
BridgeWave株式会社
Bridge Wave
ブリッジウェーブ
```

测试目标：

```txt
公司名归一化
同公司多人识别
旧公司 / 新公司识别
```

---

### 13.3 语言字段问题

示例：

```txt
中文
中国語
Mandarin
普通话
Chinese
繁體中文
```

测试目标：

```txt
语言归一化
多语言推荐
日文 / 中文 follow-up 生成
```

---

### 13.4 用户目标过泛

示例：

```txt
想认识有趣的人
AIに興味があります
人脉を広げたい
ビジネスパートナーを探しています
```

测试目标：

```txt
AI 是否能追问
是否降低置信度
是否避免强推荐
```

---

### 13.5 信息缺失

示例：

```txt
没有公司
没有职位
没有行业
只上传名片
只有活动备注
没有联系方式
```

测试目标：

```txt
画像生成是否保守
推荐理由是否避免编造
UI 是否提示信息不足
```

---

## 14. 推荐文件结构

建议项目中创建：

```txt
mock-data/
  dictionaries/
    industries.json
    roles.json
    company_types.json
    languages.json
    relationship_types.json
    event_types.json
    business_goals.json
    offer_need_pairs.json
    follow_up_templates.json

  seed/
    users.seed.json
    events.seed.json
    event_participants.seed.json
    contacts.seed.json
    connections.seed.json
    interactions.seed.json
    messages.seed.json
    ai_analyses.seed.json
    match_recommendations.seed.json

  tests/
    golden_matches.json
    negative_cases.json
    dirty_data_cases.json

  scenarios/
    scenario_01_jp_restaurant_inbound.json
    scenario_02_cn_ai_founder_japan_poc.json
    scenario_03_jp_company_china_market_entry.json
    scenario_04_investor_founder_matching.json
    scenario_05_organizer_table_matching.json
    scenario_06_business_card_profile_generation.json
    scenario_07_post_event_follow_up.json
    scenario_08_dormant_relationship_reactivation.json
    scenario_09_duplicate_contact_merge.json
    scenario_10_bad_match_filtering.json

  generated/
    users.generated.json
    events.generated.json
    event_participants.generated.json
    contacts.generated.json
    connections.generated.json
    interactions.generated.json
    match_recommendations.generated.json

  exports/
    local_seed.json
    demo_seed.json
    supabase_seed.sql
```

---

## 15. 项目接入建议

### Phase 1：字段映射

先不要改数据库。

先做一个 mapping 文档：

```txt
现有 users 字段     -> mock users 字段
现有 events 字段    -> mock events 字段
现有 contacts 字段  -> mock contacts 字段
现有 messages 字段  -> mock messages 字段
```

目标是确认：

```txt
哪些建议字段已经存在
哪些字段可以放 metadata
哪些字段需要新建表
哪些字段只用于 mock
```

---

### Phase 2：优先补三个能力

最优先建议补：

```txt
1. EventParticipant 里的 looking_for_at_event / can_offer_at_event
2. AIAnalysis.result_json
3. MatchRecommendation / golden_matches
```

这三个能最快提升 Orbit 的 demo 表现。

---

### Phase 3：构建 v0 seed

先生成：

```txt
用户：30
活动：3
报名：80
关系：100
推荐：60
```

目标是让本地功能跑通。

---

### Phase 4：构建 v1 demo seed

再生成：

```txt
用户：120–150
活动：10–12
报名：400–600
关系：800–1200
互动：1000+
推荐：300–500
golden matches：100–200
```

目标是用于客户 demo 和产品截图。

---

### Phase 5：接入推荐测试

用 `golden_matches.json` 检查：

```txt
应该推荐的人是否出现在 top 3
推荐类型是否正确
推荐理由是否包含核心关键词
推荐理由是否没有乱说
不该推荐的人是否被过滤
日文 / 中文解释是否自然
```

---

## 16. 推荐优先级

### P0：必须做

```txt
event_participants.looking_for_at_event
event_participants.can_offer_at_event
ai_analyses.result_json
connections.relationship_strength
connections.business_relevance_score
match_recommendations
```

这些直接影响 Orbit 的核心体验。

---

### P1：强烈建议做

```txt
confirmed_facts
inferred_traits
source_refs
confidence
interaction_memories
follow_up_required
golden_matches
negative_cases
dirty_data_cases
```

这些直接影响 AI 可信度和测试质量。

---

### P2：后续再做

```txt
organizations
company-level profile
organizer advanced dashboard
table matching optimization
multi-hop relationship graph
long-term relationship lifecycle
```

这些有价值，但第一版不必急着做重。

---

## 17. 设计结论

Orbit 的 mock data 和 schema 增强应该围绕一句话展开：

```txt
让 AI 能够理解真实商业关系，并把“认识人”转化为“知道该认识谁、为什么、下一步做什么”。
```

因此，项目更改时不建议只增加几个展示字段，而应该优先补齐这三类信息：

```txt
1. 活动中的临时意图
   用户这次为什么来？想找谁？能提供什么？

2. 关系中的长期价值
   这个联系人和我是什么关系？关系强度如何？商业相关性如何？下一步是什么？

3. AI 输出的可解释性
   推荐为什么成立？来源是什么？哪些是事实？哪些是推测？置信度多少？
```

最小可落地改造方案：

```txt
保留现有 schema
增加 EventParticipant intent 字段
增加 AIAnalysis.result_json
增加 MatchRecommendation mock/result 表
增加 GoldenMatch 测试文件
用 v1 demo seed 构造 10 个高价值商业场景
```

这样做的好处是：

```txt
不会大幅推翻现有产品结构
可以快速生成高质量 mock 数据
可以让 demo 更像真实商业场景
可以测试 AI 推荐是否靠谱
可以为后续 organizer dashboard、同桌推荐、follow-up agent 打基础
```

最终目标不是生成一批假人，而是生成一个可以证明 Orbit 价值的商业关系网络：

```txt
活动是场景
用户是节点
画像是理解
关系是资产
推荐是决策
follow-up 是行动
dashboard 是客户价值
```
