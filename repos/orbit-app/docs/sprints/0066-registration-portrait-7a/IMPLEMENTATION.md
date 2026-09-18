# 0066 实施方案：三视图与独立画像

**Goal:** 在真实报名规则不变的前提下实现7a三视图、历史草稿编辑及本人/有权主办方可读的独立持久画像。

**Architecture:** App与Web各有本域session/view-model，通过HTTP消费一个画像DTO；后端在现有orbit_records上以单物理事务完成版本CAS与receipt，生成预览与保存分离。权限、回答证明和生成来源由服务端核对，不用客户端缓存或按钮隐藏替代。

**TechStack:** 现有Node22、TypeScript、Next/React、Expo/React Native、PostgreSQL/pg、zod；不新增依赖或provider。

**Spec:** 同目录GOAL.md、DESIGN.md、PLANNER.md；唯一Generator内串行实施，禁止subagent-driven-development/执行技能再派代理，按RULES复用批准与最小TDD验证。

本方案依据已批准 GOAL/DESIGN/PLANNER。产品基线 `29efb4c9d460b97ef526578d051e824592f52555`，PLANNER SHA256 `a11c73124222beb76e383d9c7a989a2769e57be08ac102e73f98ad0cb9a14bc4`。准备阶段 run_count=0，仅调查和本文件；产品编辑仍等待 ROOT 的索引与启动锁释放。无第二 Generator、Reviewer/Evaluator，不调用已禁止的 executing-plans，不另建 prototype。

## 已核对的源码事实

现有 `adaptive-handlers.ts` 的 persona POST 直接使用客户端 transcript 生成，只返回 `{ persona }`；未保存。App persona 只在 screen state，Web `runGeneration` 先写报名再生成，不能接到独立画像保存按钮。

`interview-question-token.server.ts` 的 v1 HMAC 绑定 actor/event/question/原题干/选项/模型来源，默认有效期48小时。验证签名回答会形成 event_attendees 快照，仅可信真实 AI 问题可走原 signAdaptiveInterviewQuestion。不能把 legacy question=null 伪装成 AI，不能让客户端声明题干换签，也不能追溯修改旧可见性。

`orbit_records` 已支持工作区、collection、recordId、userId、target和JSON payload；`transactional-postgres.ts` 有单物理连接 SERIALIZABLE 事务。account-language provider 已使用同事务的 live-record store、advisory lock、CAS和私有 mutation receipt。独立画像沿用此模式，不新增数据库表/DDL/迁移，不使用裸 upsert 冒充并发安全。

event-access 权限由 Event Core 当前 owner 与 active role 推导；现有 `operations.read_sensitive` 仅 owner/active operations，check_in/reviewer/read_only_analyst 无此权限。图片中的“仅主办方可见”解释为本人及具此当前敏感读取权限的主办方工作人员，不等于所有参会者，也不凭旧 organizer 文本授权。接口每次重新授权，不缓存旧角色为长期授权。

已实际查看三张7a PNG与HTML的7a三段及示例字段；不运行support.js、不复制样例题/答案/人名/头像。Product Design技能与必需参考已读，user-context只读preflight经现有uv环境执行；保存的Todo Agent来源不适用于Orbit。视觉使用已有字体/图标，不改全局主题；真实Safe Area代替模拟设备外壳。

GitNexus准备查询没有结果且缺FTS，不能当有效调用图；ROOT独占刷新。启动后按实际待改符号批量upstream impact，UNKNOWN用新树真实调用链补查；HIGH/CRITICAL先告警。

## 精确接口与版本

保留现有报名GET/POST和取消、再次报名的intent/CAS/receipt/独立GET。画像接口使用既有认证actor和API envelope，actor/workspace从服务端解析，客户端不得声明owner/权限/模型来源。

```ts
type PortraitAnswerProof =
  | { kind: "signed_question"; questionToken: string; portraitAdaptiveToken: string; answer: string }
  | { kind: "registration_question"; portraitQuestionToken: string; answer: string }
  | { kind: "stored_response"; source: "registration" | "portrait";
      responseId: string; sourceVersion: string; answer: string };
type PortraitSaveBody = {
  mutationId: string;
  expectedPortraitVersion: number | null;
  generationToken: string;
};
type PortraitReadQuery = { actorId?: string }; // 省略即本人，指定他人必须当前敏感读取权
type PortraitReceipt = {
  mutationId: string; portraitId: string; eventId: string; actorId: string;
  portraitVersion: number; answersVersion: string; updatedAt: string;
};
```

`GET /api/events/:id/registration/portrait[?actorId=...]` 返回 `{ portrait: SavedPortrait | null, registrationSource?: { actorId, eventId, sourceVersion, answers } | null }`。本人读取在同一事务内读取当前 canonical membership/profile，并返回限定当前 actor/event 的 opaque physical sourceVersion 与规范回答；读取他人时不返回 registrationSource。SavedPortrait含id/eventId/actorId、递增整数version、updatedAt、来源回答的规范SHA256 answersVersion、sourceRegistrationVersion、真实生成时间/provenance、persona和可复核sourceAnswers（field/label/answer/可信可获得question snapshot/source）。GET不生成、不签题、不初始化写入、不返回保存或题目token。主办方读取他人的结果不获写权限。

`POST /api/events/:id/registration/portrait` 接收PortraitSaveBody，只保存服务端已签名的生成结果与对应回答快照，不接收任意persona/provenance。首次expectedPortraitVersion=null，已有值必须完全匹配；版本从1递增。同mutationId同规范指纹重放返回原receipt，不新增版本；同ID异内容409。响应 `{ portrait, receipt }`，客户端再独立GET，核对event/actor/id/version/answersVersion，才显示已完成。读失败保留“保存待确认”和相同mutation，不重新生成或假报失败回滚。

现有 `POST .../registration/persona` 新增明确 `mode:"portrait-preview"` 和 `responses: PortraitAnswerProof[]`，保留旧请求/响应兼容。新模式服务端解析正式题目或已存response，不信任客户端prompt/field；规范答案去重、长度/八字段上限及核心必答校验后，调用原generateEventPersona，不改provider/prompt。返回 `{ persona, generationToken, answersVersion, sourceRegistrationVersion }`。新增domain-separated HMAC token绑定workspace/actor/event/规范回答/真实persona与provenance/生成时间/来源版本/到期时间（48h）；保存时完整验签。不把persona API 200当已保存。

在原受认证 `POST .../registration/interview` 增加 `mode:"renew-stored-question"`、`responseId`、`sourceVersion`、`source:"registration"|"portrait"`。服务端独立读取本人当前版本，核对精确response，使用数据库可信question snapshot返回 `{ source, sourceVersion, responseId, field, answer, question, generation }` 的可编辑快照；不发多余编辑token。这里renew是重新获取当前存储事实，不延长原AI token。提交使用stored_response，后端再次按actor/event/source/version独立读取并验证，DB事实已经是证明。可信旧AI保留原provenance，legacy缺原题question=null，只返回字段标签/原答案与开放编辑标记，不编造原题。

stored_response分支补足明确来源字段：`{ kind:"stored_response", source:"registration"|"portrait", responseId, sourceVersion, answer }`；registration的sourceVersion只取本人画像 GET 的可信 registrationSource opaque 摘要，portrait为GET返回的整数version的十进制文本。已报名且没有可信源时，新画像读取/生成明确失败，绝不 fallback ISO 构造可用证明；原报名独立读取和操作仍可继续。旧 SavedPortrait 读取保持兼容，但不赋予旧 registration proof 新生成权。该本域引用不是questionToken，admission/apply不接受；两条协议不互相消费、不能把legacy提权为签名AI题。

对仍有效的未保存AI questionToken直接沿用原验证；过期且没有可信已存快照的token拒绝，提示重新追问，不给任意旧客户端题目续期。stored_response proof由后端按actor/event/sourceVersion读取验证并形成规范回答，不由UI自己确认。

未报名者的两项核心题来自正式registration GET questionSet，可能不是adaptive签名题，不能要求先报名才能生成。补充 `GET .../registration?portraitProofs=true` 的明确可选入口：对服务端刚生成/正式发布的原题快照签名 `portraitQuestionToken`，绑定workspace/actor/event/question完整字段/provenance/正式题集hash与version/当前源版本/48h有效期；不截题干、不增加模型调用、不信任客户端题目声明。新registration_question分支验本域签名及当前正式题集版本，不提升为AI来源，也不能用于admission/apply。普通GET与questions=false不发proof；已有App报名读取本就cachePolicy=network-only，保留它，不改通用hook。Web消费者使用同正式题目证明获取路径，不把仅组件props/示例数据当证明。独立portrait GET仍完全没有token，proof不能进离线快照。

必要白名单补充：Web既有 `app/api/events/[id]/registration/route-handlers.ts`、`features/events/registration/contract.ts`（question DTO可选本域proof）；App `src/view-models/event-registration.ts`映射该可选字段并保原questionSet hash/version；Web注册页 `app/(app)/app/events/[id]/register/page.tsx`如需正式问题证明接线，仅本域登记。新签名helper `signPortraitRegistrationQuestion` / `verifyPortraitRegistrationQuestion`放在本域generation-token.server.ts，题集和source版本校验归readPortraitAnswerProofs。完整API回归覆盖旧客户端GET shape不变、questions=false零签名/生成、未报名两题直接生成后membership仍空、proof actor/event/hash/version篡改拒绝、deterministic题保留真实provenance、core proof无法进入准入申请。

错误沿用envelope：401未认证；403权限拒绝；404无合法活动；422输入/证明非法；409版本、source或mutation碰撞；503存储/生成不可用。错误details细分 `PORTRAIT_VERSION_CONFLICT`、`PORTRAIT_SOURCE_CHANGED`、`PORTRAIT_MUTATION_REUSED`、`PORTRAIT_GENERATION_EXPIRED`，UI保留草稿并显示明确恢复入口。

## 保存事务与权限

新本域collection：`event_registration_portraits` 保存当前实体，`event_registration_portrait_mutations` 保存私有receipt。recordId以domain+workspace+event+actor散列；receipt另加mutationId。searchText为空，不把画像/答案开放给工作区搜索。collection读写只在本域授权后执行；不改现有公开报名资料投影。

SERIALIZABLE事务按workspace/event/actor的本域advisory key串行；同事务查询receipt→当前portrait→正式event/source/profile版本→验证token源→原子写portrait+receipt，失败全回滚。现有transactional client/transaction-bound live-record store只读复用。40001/40P01最多三次全事务重试（初次+两次），从原请求CAS重核，不漂移成新期望版本；耗尽503。不在模型调用期间持有事务/锁，不加载.env、bootstrap或迁移。

回答版本为服务端规范化、有序、可信字段/问题/答案/来源的SHA256，不用时间戳或UI点击数。生成源版本到保存时已变化则409，先重新回读/生成。新实体只写自身collections，不调用register/update/cancel/reactivate，不触membership/profile heads、event revision、人数或通知；隔离PG及ROOT真实摘要共同证明。

报名来源额外绑定新 portrait 域的 `sourceRegistrationFingerprint`：服务器从同一事务读取 canonical membership head 的 `membership_version`、`profile_version` 及 participant/scope，保留整数原文并 SHA256；generation HMAC 与正式题 proof 均绑定该摘要，save/正式题验证重新读取当前 head 精确比对。实际 canonical 已报名 snapshot 必有非空摘要，旧缺摘要的 generation/proof 在该来源下拒绝，不能按相同 updated_at 放行。DTO 为兼容读取旧画像允许字段缺省，但这不授予新保存权。原报名外部 ISO `sourceRegistrationVersion`、writer CAS、准入签名域与数据库结构均不改。隔离 PG 已构造 updated_at 完全不变而 physical membership/profile 版本递增的旧 preview save 负例；验证 409、画像/receipt 不前进且原 canonical 表无服务写入。

本人读取仍需合法同工作区event；他人读取先核对当前event-access `operations.read_sensitive`，禁止把全工作区list结果取出再前端过滤。撤权/owner转移后新GET立刻拒绝。源/权限读与画像读要处于同一数据库快照/受控executor，不组合两个不同时间的授权事实冒称原子安全。

## 历史编辑与三视图session

App新纯view-model使用一个origin+canonical actor+event+scopeEpoch session：registration / interview / result / review-all / edit-history；本域视图切换不发自动生成或保存。沿用AbortController、request单飞、editRevision和currentScope守卫；晚回包不得覆盖新编辑、异scope不得写入或带出草稿。不另造localStorage/offline旁路。

历史“改”打开独立edit buffer；取消丢buffer保原值，确认才更新草稿。无变化不失效；实质变化清除当前依赖题、删除依赖该答案的后续动态turn/proof，画像预览标过期、保存禁用，保留修改之前的有效前缀；明确“重新追问/重新生成”。原已存报名的核心资料仍按allowedActions/update禁写，不通过新画像接口修改profile；私有画像历史编辑只更新独立画像草稿。

原snapshot可信题干完整保留，legacy显示真实字段标签而非编造题干。全部历史使用完整滚动复核；当前题突出、过去回答紧凑表格。其他选项只有一个，只有选中其他/开放题显示底线输入，不向服务端发送sentinel。进度沿用八合法字段去重、核心两项停止建议，服务端done决定停止；未知题数不写共8题。跳过只返回registration保session，零提交/生成/下一题。

结果呈现真实persona字段及sourceAnswers，不拼设计样例摘要。保存按钮独立在线写入，已保存+GET确认才入口显示已完成；本地变更后需更新。推荐只消费现有授权真实结果及原详情路由；缺结果为空、失败可见重试，不造3人，不扩大推荐schema修复。

## 路径补充与串行实施顺序

除冻结Planner路径，必要新增/修改如下，均服务原SC，不改变目标：

- Web新增 `shared/contract/event-registration-portrait.ts`（零import纯DTO）、`shared/api-schema/event-registration-portrait.ts`（严格验证），经现有sync生成App副本，不扩同步白名单。
- Web新增 `features/events/registration/portrait/{contract,service,repository,runtime,generation-token.server}.ts`，本域职责分别为解析、行为、事务存储、配置接线、签名；必要拆出的回答proof保留本域。新 `app/api/events/[id]/registration/portrait/{route,route-handlers}.ts`，修改原adaptive-handlers.ts的明确新mode，不改旧生成签名默认。
- App修改 `src/api/endpoints.ts`（现有interview/persona helper分别在534/538行）及既有offline `src/data/offline-read/route-domain-inventory.ts`，登记portrait GET/POST和实际消费者，domain沿用registrations，不扩大authority scope。token不进GET/snapshot。既有inventory默认durable_normalized不能自动作为敏感画像的缓存许可；本域入口需明确授权快照/在线限制，不改所有老表面的默认值。
- Web/App本域文档说明独立保存、权限、来源和失败边界，证据仍在ignored根build。所有实际路径在run启动checkpoint精确登记，不编辑Main/Bridge/README。

- [ ] 操作链1：Web画像契约、签名生成/存储proof、独立保存/GET。先API/服务行为RED：正常版本、伪造persona/actor/source、重放/碰撞、第三方/撤权拒绝；最小实现后完整相关文件GREEN。
- [ ] 操作链2：隔离PG双连接CAS、receipt注入失败整批回滚、原报名/人数摘要不变。ROOT明确提供实例/schema/marker后才执行；无PG窗口可先推进UI纯测试，不以未跑PG为通过。
- [ ] 操作链3：App三视图/session、历史编辑/取消/失效suffix、过期token恢复、独立保存回读。先真实渲染/交互RED→最小接线→完整直接消费者GREEN。
- [ ] 操作链4：Web同语义，拆开原先报名再生成；其他输入、复核、独立保存、scope晚回包。共享DTO只sync生成。
- [ ] 收口：完整受影响文件、两端types、contract/schema同步和offline-read audit；各端唯一I，保原失败/skip、不逐helper重复I。ROOT固定源构建/重启、Phone消费/export、8082 Simulator真实链及权限正反例后，才最终REPORT/提交/集成。

主定向文件：Planner列App的interactions/view-model/questionnaire与新7a/portrait测试，Webworkspace与新portrait API/service/PG测试；另新增generation-token.test.ts覆盖HMAC scope/到期/篡改与renew-stored proof，原interview token/adaptive routes测试覆盖旧兼容及不能提升legacy来源。若提取共享helper，完整直接使用者同批收口，不跑无关profile/auth目录。

### 最小行为例子与准确命令

新增路径明确为Web `tests/services/event-registration-portrait-generation-token.test.ts` 与 `tests/services/fixtures/event-registration-portrait-fixture.ts`；fixture以合成event/source/role事实、真实本域service/repository/capability policy和本地memory store组成，不mock“授权成功”或“保存成功”。fixture中的模型runner只返回合成合规persona，明确不是provider验证。其接口如下，返回结果使用原API envelope：

```ts
type PortraitFixture = {
  preview(actorId: string): Promise<{ generationToken: string }>;
  save(actorId: string, body: PortraitSaveBody): Promise<{
    success: boolean; data?: { receipt: PortraitReceipt }; error?: { code: string }
  }>;
  read(actorId: string, subjectId?: string): Promise<{ success: boolean }>;
  revokeOperations(actorId: string): void;
  registrationDigest(): string;
};
// createPortraitFixture seed: owner-1 / operations-1(active operations) /
// participant-1(self) / participant-2(no role), published event-1；
// core两项可信stored_response，问答来源legacy保持legacy。
```

操作链1在 `tests/services/event-registration-portrait.test.ts` 的首个有效RED/GREEN用例（fixture返回真实生产service结果，不自行拼receipt）：

```ts
test("saving a portrait preserves registration and replay has one version", async () => {
  const f = createPortraitFixture();
  const before = f.registrationDigest();
  const { generationToken } = await f.preview("participant-1");
  const body = { mutationId: "portrait-save-1", expectedPortraitVersion: null, generationToken };
  const first = await f.save("participant-1", body);
  assert.equal(first.success, true);
  assert.equal(first.data!.receipt.portraitVersion, 1);
  assert.deepEqual(await f.save("participant-1", body), first);
  assert.equal(f.registrationDigest(), before);
  assert.equal((await f.read("participant-1")).success, true);
});
test("current sensitive role is required to read another portrait", async () => {
  const f = createPortraitFixture();
  const { generationToken } = await f.preview("participant-1");
  await f.save("participant-1", { mutationId: "portrait-save-1", expectedPortraitVersion: null, generationToken });
  assert.equal((await f.read("owner-1", "participant-1")).success, true);
  assert.equal((await f.read("operations-1", "participant-1")).success, true);
  assert.equal((await f.read("participant-2", "participant-1")).success, false);
  f.revokeOperations("operations-1");
  assert.equal((await f.read("operations-1", "participant-1")).success, false);
});
```

同文件反例：同mutation换generationToken为409；旧expectedVersion并发只一项成功；token主体/活动篡改422、源更新409、保存/receipt异常503且无部分写。API完整文件使用正式Request/Response+authenticated actor resolver和真实service验证401/403/422/409，不把resolver当权限规则。

操作链2新PG完整文件 `tests/services/event-registration-portrait-postgres.test.ts`：两独立物理连接以同expectedVersion保存，断言成功数量1、最终version1、receipt数量1；在receipt插入注入异常后独立连接读portrait仍为原版本，原event/member/profile/人数digest相等。重放不得追加receipt/画像版本。隔离实例必须ROOT提供身份marker，不自动沿用0064已停止实例；未提供不能将该文件skip算过。

操作链3新 `src/view-models/event-registration-portrait.ts` 定义纯 `editPortraitHistory(session,index,answer)`，消费者为App screen，session具turns/currentQuestion/preview/previewStale/editRevision；编辑函数不做网络写入。新 `tests/event-registration-portrait.test.ts` 例子：

```ts
test("changed historical answer removes dependent suffix and expires preview", () => {
  const source = portraitSessionFixture({ answers: ["A", "B", "C"], savedPreview: true });
  const changed = editPortraitHistory(source, 1, "new B");
  assert.deepEqual(changed.turns.map(t => t.answer), ["A", "new B"]);
  assert.equal(changed.currentQuestion, null);
  assert.equal(changed.previewStale, true);
  assert.equal(changed.editRevision, source.editRevision + 1);
  assert.deepEqual(source.turns.map(t => t.answer), ["A", "B", "C"]);
});
```

portraitSessionFixture只构造本域typed session，不产生业务回执。原interactions实际render/HTTP fixture补两连续问题→全部历史→编辑buffer取消/确认→返回；assert拒绝/跳过无POST，错误保存GET/错version不显示已完成，旧held persona/save回包不覆盖新revision，切actor/event/origin草稿不串。新7a渲染文件检验普通选项无input、其他单一底线input、真实长题自然换行、结果CTA与状态，不用源码字符串代替树。

操作链4扩Web `tests/pages/event-registration-workspace.test.tsx`：点生成只请求persona新mode、不请求registration/admission；点保存仅portrait POST+GET；portrait GET version不一致显示保存待确认；两连续问答复核及历史取消编辑保值；关闭update资格不开放已存核心报名写入。保留原cancel/reactivate/CAS等完整用例。

以下命令仅在ROOT登记run-01/释放产品锁之后执行。两端cwd分别为新树的repos/orbits与repos/orbit-app。固定Node22路径：`/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`。每次经env-i和ROOT批准的零出站/保护preload运行，完整读preload后复用，不读.env；实际PG只额外传明确隔离URL和marker，不传生产凭据。Node别名只用于计划表达：

```sh
node66=/Volumes/ORICO/Dev/cache/npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node
# Web定向首RED / 完整GREEN；先新增有效行为测试后运行，预期exit1行为差异，
# 不把缺模块/导入错误当有效RED；最小实现后同完整文件exit0、无skip。
"$node66" --test --import tsx tests/services/event-registration-portrait.test.ts tests/api/event-registration-portrait.test.ts tests/services/event-registration-portrait-generation-token.test.ts
# Web共享接口兼容及实际页面完整收口，预期exit0；旧专用PG缺项另列。
"$node66" --test --import tsx tests/api/event-registration-adaptive-auth.test.ts tests/capabilities/event-interview-question-token.test.ts tests/api/event-registration-routes.test.ts tests/pages/event-registration-workspace.test.tsx
# ROOT隔离PG前置就绪后完整文件，必须实际事务行为pass，不接受默认skip。
"$node66" --test --import tsx tests/services/event-registration-portrait-postgres.test.ts
# App上述纯session RED/GREEN及实际渲染完整文件；预期行为RED exit1→GREEN exit0。
"$node66" --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/event-registration-portrait.test.ts tests/event-registration-7a.test.tsx tests/event-registration-interactions.test.ts tests/event-registration-view-model.test.ts tests/event-registration-questionnaire.test.ts
# App契约副本由既有脚本生成；再完整严格同步/读取表面行为测试。
"$node66" scripts/sync-contract.mjs
"$node66" --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts tests/offline-read-inventory.test.ts tests/offline-read-session.test.ts
"$node66" --import tsx scripts/audit-offline-read-surfaces.ts
# 两端各一次类型检查：App命令 / Web命令。
"$node66" node_modules/typescript/bin/tsc --noEmit
"$node66" node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
# 最终唯一I：App / Web，输出和actual退出原样保存，不能用定向GREEN改写I。
"$node66" --test --test-concurrency=2 --import tsx --import ./tests/helpers/register-render-hooks.mjs "tests/**/*.test.ts" "tests/**/*.test.tsx"
"$node66" --test --test-concurrency=2 --import tsx "tests/**/*.test.ts" "tests/**/*.test.tsx"
```

env-i外围必须保留NODE_OPTIONS的零出站与端口保护，不能直接照摘裸命令访问真实环境。实际App/Web唯一I运行前冻结两端源码，不修改被测树或起重复进程；ROOT真实视觉/PG/provider窗口另记，不由以上合成用例代替。

实际核对Web现有run-node-tests.mjs仅spawn process.execPath的Node test；上述显式两glob与相同完整测试集合对应并设concurrency=2。App I已包含三同步测试，有同源有效I结果时不再重复单跑同步。sync-contract.mjs会重建仅三个批准副本目录，运行前核验这些目录无用户dirty；如有重叠先保留并交ROOT处理，不覆盖未提交工作。

## 离线与真实验收缺项

新画像GET登记既有全域读取表面和严格schema，仅有效可信grant/authorizationEpoch下的加密TTL快照允许离线读；不得放入普通旧GET SQLite缓存绕过授权。没有现有全域runtime可信grant接线时，本域明确在线读取、离线不可用，不偷造grant，也不借本轮关闭0033～0036；ROOT审计实际表面必须显示缺项。全部生成/保存需在线写资格。

ROOT后续选择可识别自有活动/本人/主办方及第三方，核对报名status/version/member/profile/人数前后不变、独立GET/重开/两端同版本回读、撤权拒绝。视觉同390逻辑宽/相同状态对照，记录真实题干换行/动态进度与样稿的有意差异；键盘/大字号/末行距底栏16及二级无Tab都需真实证据。模型生成只能在ROOT费用窗口下实际执行，合成runner测试不冒称provider成功；无真实模型证据保持SC缺项。

当前可执行：完善本方案与调用链；待ROOT释放：新符号impact及run-01登记/产品编辑；待明确环境：隔离PG及真实账号/服务/模型QA。索引仅阻塞impact后的产品编辑，不阻塞本次只读调查。

## run-01 隔离证明补足（ROOT审计后，同一SC/已批准范围）

ROOT已释放唯一run-01及新29ef隔离树产品锁；本补足不重开run、不重新审批相同设计。旧adaptive v1签名没有workspace，数据库PK却包含workspace且环境secret可共享，因此不能证明同actor/event跨工作区不可重放。

新画像回答的signed_question强制同时提供原questionToken及portraitAdaptiveToken。原interview POST新增显式mode:"portrait-interview"，复用原模型调用一次，返回signedQuestion原question/questionToken，并额外返回portraitAdaptiveToken；普通interview返回形状、旧v1签名及admission只消费原questionToken均保持。wrapper位于新本域adaptive-question-token.server.ts，使用独立HMAC域，绑定workspace/actor/event、原token字节SHA256及原issuedAt/expiresAt。signer先验原v1 HMAC与主体/时间；wrapper的到期时间严格等于原值，不以换签时间续期。persona portrait-preview验wrapper当前scope及原token再重建可信题目；缺wrapper/跨工作区/异原token/过期422。未保存且只有旧v1 token不能客户端补证明，应明确重新追问；已存可信response仍走存储来源，不给任意客户端题干签名。

独立generation与SavedPortrait补充sourceEventVersion（精确event-core-postgres:${eventId}:v${event_ops_events.event_version}）、sourceQuestionSetHash及sourceQuestionSetVersion（无发布题集时null）。源事务读取event_version，并在模型调用前核先前EventRecord.sourceMetadata.id精确一致；held旧V1 context遇事务当前V2须409/模型0/无写，不能用updatedAt掩盖旧内容。生成在源事务结束后调用模型；HMAC绑定以上全部来源。保存每种来源均核当前EventCore上下文版本、当前正式题集hash/version、sourceRegistrationVersion及引用的portrait版本；任一变更409，不能仅靠registration_question的sourceVersion保护其他来源。注册窗口/容量配置不是模型输入，其单独变化不写报名、不改变画像生成语义；事件上下文或正式题集/源回答变更仍拒绝。若调查发现其他实际模型输入版本，补入同域guard，不假设笼统config已覆盖。

补充TDD：同secret/同actor/event、两合法workspace用同adaptive原token+workspace-A wrapper请求workspace-B persona须422；缺wrapper、wrapper对应另原token、旧过期不得延长期限；普通interview/admission兼容完整文件；stored/signed/portrait来源生成后事件/正式题集版本改变也须409，registration-only窗口变化不得偷偷报名。新增符号逐项root-bound upstream impact，UNKNOWN补真实本域consumer检查；App/Web消费新wrapper并按正式sync生成副本，UI sentinel/token不得落离线快照。
