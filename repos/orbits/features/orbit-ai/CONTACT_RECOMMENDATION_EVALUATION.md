# Orbit AI Contact Recommendation Evaluation

Sprint 86 adds goal-based contact discovery for `/app/agent`. The current implementation is deterministic and local: it ranks existing Orbit contacts from source-backed relationship evidence and never performs vector search, live CRM sync, external network discovery, writes, notifications, email sends, or calendar mutations.

## Design -> Evaluation -> Analysis Loop

1. Design the candidate signal model around five auditable signal families: profile, relationship, event, conversation, and follow-up.
2. Evaluate every ranking change against ten named cases: industry fit, market-entry help, investor search, organizer intro, weak-tie relevance, negative match filtering, ambiguous goals, Chinese input, English input, and privacy-limited data.
3. Analyze failures by checking the top ranked contact, evidence snippets, rejected high-profile irrelevant contacts, and the readiness state before exposing results in `/app/agent`.

The minimum ready score threshold is `72`. The UI may present recommendations as ready only when at least one contact has a score greater than or equal to `72` and carries source-backed evidence snippets. Ambiguous or low-evidence goals must render as not ready.

The `/app/agent` entry must make contact discovery visible before the first turn: users need a goal prompt, a visible submit action, and example goals such as finding a PoC buyer or investor intro. Recommendation result cards still need why-this-person copy, confidence, evidence snippets, and contact detail links before the UI treats them as usable.

## Current Mock Boundary

`features/orbit-ai/contact-recommendation-service.ts` owns the local scoring rules and the evaluation cases. `features/orbit-ai/contact-recommendation-artifact-service.ts` maps ready recommendations into the existing `contact_recommendations` artifact contract, including confidence labels, why-this-person copy, evidence snippets, and contact detail links.

关系搜索路径（`rules_v1` 走 `contact-recommendation-search.ts`）的候选 `relationshipPath` / `matchReasons` 直接来自 mock/live fixture，里面混着三语 `profileSnippet`（`日本語 / 中文 / English`）、下划线原始标识（`cross_border_ecommerce`）和英文诊断串。卡片是面向用户的展示层，因此 `candidateItemFor` 在生成 view model 前做本地化清洗：`localizeRecommendationContext` 按当前语言从 `/` 分隔的三语片段中挑选单一语言并去标识化；`localizeMatchReason` 去掉英文诊断串、把 `<name> matches <topic> through <path>` 模板改写成当前语言的一句推荐理由；`localizeSourceLabel` 把已知英文来源标签换成可读文案。清洗只在展示层做，不改动 Search/fixtures 的底层数据。

## Multilingual Retrieval (translate-on-ingest + query-side extraction)

底层关系搜索后端做子串匹配，会剥离中日文分词，因此中文/日文只有先归一到英文才能被检索命中。当前策略是"understanding in model, deterministic retrieval in code"，分两侧，都通过 `features/orbit-ai/language-normalization-service.ts`（复用现有 provider：`ORBIT_AGENT_PROVIDER` / `DEEPSEEK_API_KEY` 等）实现，且全部 fail-closed：

- **查询侧（extractSearchTerms）**：任意语言 query → 英文检索关键词，作为 `toolArguments.searchTerms` 注入。`contact-recommendation-search.ts` 的 `extractRuleCriteria` 优先用它当 `searchQuery`，正则领域词表仅作回退。live 路径由 `live-artifact-task-service.ts` 注入 `normalizationService`；缺 key 时抽词返回空，自动回退正则词表（餐饮/旅游/电商等中文词已覆盖）。
- **录入侧（translateToEnglish + composeBilingualSearchText）**：手动录入的中文/日文 note 翻成英文，合成 `原文 / English` 双语可搜索文本后落库（`relationshipContext` / evidence `excerpt`），英文子串因此可命中，中文原文仍保留供展示。接入点在 `features/acquisition/live-manual-service.ts`（已是全异步），由 `features/acquisition/service-factory.ts` 的 live 分支注入。已是英文的文本跳过翻译；缺 key 或翻译失败时只存原文，绝不阻塞写入。

种子数据本身已是三语（`日本語 / 中文 / English`），不依赖此路径。这是 MVP；后期可迁移到多语言 embedding 替换掉子串匹配。相关测试：`tests/capabilities/orbit-ai-language-normalization.test.ts`、`tests/capabilities/manual-contact-creation-live-store.test.ts`（"stores bilingual searchable note when translation is enabled"）。

`features/orbit-ai/conversation-preview-service.ts` owns the server-seeded GET preview used by `/app/agent?q=...`. It prepares the same deterministic conversation artifact for the first rendered page state so browser evidence can see the submitted goal, ranked cards, confidence, evidence snippets, and contact links without waiting for a client-side fetch. Normal typed turns still go through `/api/ai/conversations`.

The implementation uses existing Orbit data semantics but does not read live providers. It is intentionally replaceable through the same artifact/service boundary already used by Orbit AI.

## Mock To Live Replacement

Live service/provider files:

- `features/orbit-ai/live-service.ts`
- `features/orbit-ai/provider.ts`
- `features/orbit-ai/mappers.ts`
- `features/orbit-ai/validators.ts`
- `features/orbit-ai/conversation-preview-service.ts`
- `features/orbit-ai/contact-recommendation-service.ts`
- `features/orbit-ai/contact-recommendation-artifact-service.ts`

Switch from mock to live:

- Keep callers on `createOrbitAgentContactRecommendationArtifactService()` or the Orbit AI service factory.
- Keep `/app/agent` GET previews on `createOrbitAgentConversationPreviewService()` so SSR does not import live provider modules just to render deterministic recommendation evidence.
- Use `ORBIT_MODULE_MODE`, `ORBIT_AGENT_CONVERSATION_MODE`, or an explicit test setup to choose mock, hybrid, or live behavior.
- Missing live providers must fail closed with the shared service-resolution shape rather than silently falling back to undeclared network discovery.

Required env vars or permissions for live replacement:

- A configured Orbit live relationship/contact store.
- Explicit permission for reading relationship, conversation, event, and follow-up records.
- No external sends, notifications, CRM writes, or calendar writes without a later sprint that changes the safety contract.

Privacy and provenance constraints:

- Every recommendation must include source-backed evidence IDs and short snippets.
- Privacy-limited mode must exclude private conversation and follow-up snippets.
- High-profile contacts with insufficient goal evidence must be rejected even when their profile prominence is high.
- Contact detail links may point to `/app/contacts/{contactId}`, but outreach actions remain review-only.

Replacement tests:

- `tests/capabilities/orbit-ai-contact-recommendation-evaluation.test.ts`
- `tests/pages/app-agent-contact-recommendations.test.tsx`

Live replacement should keep these tests and add live-store variants that assert provider mappers return the same DTO shape, threshold behavior, privacy filtering, and rejected irrelevant high-profile contacts.
