import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyOutOfServiceScope,
  ORBIT_AI_OUT_OF_SCOPE_CATEGORIES,
} from "../../features/orbit-ai/service-scope-service";

// 超纲侧:每个品类至少一个真实问法，断言判定结果与转人脉用的领域标签。
const outOfScopeCases: readonly {
  category: string;
  domains: readonly string[];
  message: string;
}[] = [
  {
    category: "cooking",
    domains: ["restaurant", "food_beverage"],
    message: "麻辣香锅怎么做？给我个详细菜谱",
  },
  {
    category: "cooking",
    domains: ["restaurant", "food_beverage"],
    message: "红烧肉的做法是什么",
  },
  {
    category: "travel",
    domains: ["tourism"],
    message: "东京三日游怎么安排行程比较好",
  },
  {
    category: "health",
    domains: ["healthcare"],
    message: "我这两天一直头痛，要吃什么药",
  },
  {
    category: "legal",
    domains: ["legal"],
    message: "邻居占我车位，我要不要起诉他",
  },
  {
    category: "homework",
    domains: ["education"],
    message: "帮我写一篇关于环保的论文",
  },
  {
    category: "programming",
    domains: ["enterprise_saas", "ai"],
    message: "帮我写个 Python 脚本读取 CSV",
  },
  {
    category: "entertainment",
    domains: ["entertainment"],
    message: "推荐几部好看的电影吧",
  },
];

// 在范围内侧：这些必须一条都不能被判超纲。误伤这里等于砍掉产品核心能力，
// 所以刻意收集了与超纲品类共享关键词的商业问法（餐饮创业 vs 菜谱、
// 旅游行业出海 vs 旅游攻略、医疗投资 vs 就医）。
const inScopeCases: readonly string[] = [
  "我想在日本开一家川菜馆，帮我找找有经验的朋友",
  "我想做一个金融产品，如何进入市场？帮我推荐有相关能力的人脉",
  "日本的 B2B SaaS 市场获客渠道一般有哪些？和中国市场相比有什么不同？",
  "我想参加AI相关的活动，认识做AI产品的人",
  "我这周的日程和该跟进的事有哪些？",
  "周四要和山田千尋见面，帮我做一份会面备忘录",
  "帮我给梁佳怡写一条跟进消息",
  "餐饮行业出海日本的渠道怎么搭？想认识做过的人",
  "我在看医疗健康赛道的投资机会，人脉里有相关的人吗",
  "旅游行业的客户怎么获客，有没有做过的朋友",
  "梁佳怡是谁？她能帮我什么？",
  "第一个活动是什么时候的？值得去吗？",
];

test("service scope classifier flags everyday topics and maps them to pivot domains", () => {
  for (const testCase of outOfScopeCases) {
    const result = classifyOutOfServiceScope(testCase.message);

    assert.ok(
      result,
      `expected out-of-scope classification for: ${testCase.message}`,
    );
    assert.equal(
      result?.category,
      testCase.category,
      `wrong category for: ${testCase.message}`,
    );
    assert.deepEqual(
      [...(result?.domains ?? [])],
      [...testCase.domains],
      `wrong pivot domains for: ${testCase.message}`,
    );
    assert.ok(
      (result?.searchTerms ?? "").trim().length > 0,
      `missing searchTerms for: ${testCase.message}`,
    );
  }
});

test("service scope classifier never flags business relationship requests", () => {
  for (const message of inScopeCases) {
    assert.equal(
      classifyOutOfServiceScope(message),
      null,
      `business request must stay in scope: ${message}`,
    );
  }
});

test("service scope classifier requires both a topic and an ask", () => {
  // 只有品类词、没有求解词 -> 不判超纲（可能是在聊生意）
  assert.equal(classifyOutOfServiceScope("今天中午吃了火锅"), null);
  assert.equal(classifyOutOfServiceScope("他是做旅游的"), null);
  // 只有求解词、没有品类词 -> 不判超纲（正常的产品请求）
  assert.equal(classifyOutOfServiceScope("帮我写一条消息"), null);
  assert.equal(classifyOutOfServiceScope("这个怎么做比较好"), null);
});

test("service scope classifier ignores blank input", () => {
  assert.equal(classifyOutOfServiceScope(""), null);
  assert.equal(classifyOutOfServiceScope("   "), null);
});

test("service scope categories stay in sync with the classifier output", () => {
  const covered = new Set(outOfScopeCases.map((testCase) => testCase.category));

  for (const category of ORBIT_AI_OUT_OF_SCOPE_CATEGORIES) {
    assert.ok(
      covered.has(category),
      `category ${category} has no regression case; add one before shipping it`,
    );
  }
});
