# Sprint 0049 — 报名选择题与连续画像问答

**Plan revision:** 1；existing-codebase / single-generator。**原需求:** 2026-09-16 用户截图及三项新增要求，关联 R-04/R-09/0014。**目标:** 选择优先、其他展开、已答题留在上方、实际覆盖度与停止建议。目标说明见 [GOAL](GOAL.md)，实施见 [中文计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0049-registration-questionnaire.md)。

**规划基线:** `b461e9a6f2bac95388784d84f5aed5ee3068c1cc`。前序0004报名/0014本地化能力沿用，不重开原run。启动时读取0004 REPORT及0049涉及文件最新diff；Phone PW0012尚在接 canonical 活动模块，必须先核对其实际交付与报名页面锁。当前没有启动本run；状态只登记README。

## 行为与数据边界

1. 有选项题采用单选；“其他”是本地UI模式，不是提交值或新增服务端选项ID。普通选项直接使用既有字符串答案；其他提交实际非空文本，必答题仅选其他但不填写不算已回答。没有选项的开放题保留输入框。已有不在选项内的自定义答案回读后自动显示其他及原文本；普通答案不再显示重复输入框。其他切回普通选项后提交普通值，不夹带隐藏草稿；同题切回其他可恢复未提交自定义草稿。题集显式更换、actor/event/server scope更换按原规则清理草稿。
2. 若服务端已有“其他 / Other / その他”入口，合并为一个展示入口，不添加重复按钮、不改签名问题options或hash。UI模式使用独立key，不靠答案文本冒充sentinel。真实配置的合法普通标签不得误删；“其他”作为保留入口的识别须限定这三种完整标签。
3. 连续列表使用已有adaptiveTurns中的真实prompt/answer以及当前待答question。请求成功才提交一次当前turn，下一题追加到末尾；失败保留当前选择/自定义输入和全部历史，不重复追加。单飞/晚回包/编辑revision/题集版本/资格/签名questionToken保护不削弱。已答卡片先只读，本轮不增加历史重写或重新生成后续题功能。新题可见时轻量滚动，不抢焦点、不遮键盘；老题仍可向上查看。
4. 覆盖度以既有八个合法画像字段去重计数，不以点击数、请求数或生成题数计数。基本报名答案、辅助turn和当前有效待提交答案同字段只计一次；空白、其他空输入、未知字段不计。这是填写进度，不是保存成功证明；当前答案未提交时保持未保存提示。仅用户本次活动的回答计入；通用画像预填只作模型语境，不计作本次主动完成。八字段为positioning/industry/targetAttendees/valueOffered/desiredOutcome/energyStyle/experienceHighlight/followUpPreference；核心字段为targetAttendees/valueOffered。现有核心2题审核约束不变。使用“信息覆盖 N/8”和进度条，明确它不是匹配分或准确率；N=8时停止建议不再催促下一题，服务端提前done也停止，不为凑满八维度继续请求。
5. 提示/停止建议不替代服务端allowedActions、required、done或画像生成校验；达到两项核心仅提供“可以先生成画像”建议，不能自动报名/自动调用模型、不能新增八题强制门槛。生成结果不是保存报名的证明。重新进入只回读已有可信回答快照；当前接口不提供的旧题原文不得伪造，不新建问答持久化协议。

## 文件白名单与排除

- App修改：`src/screens/events/EventRegistrationScreen.tsx`；必要接线`src/view-models/event-registration.ts`。新建`src/view-models/event-registration-questionnaire.ts`（选择模式、草稿及纯覆盖度）和`tests/event-registration-questionnaire.test.ts`。现有完整测试`tests/event-registration-interactions.test.ts`、`tests/event-registration-view-model.test.ts`、`tests/event-registration-screen-source.test.ts`只补真实接线回归，不用源码文字断言替代交互。
- 本地化：App `src/i18n/{messages,zh,ja,en}.ts`仅新增本Sprint其他/建议/进度/历史题标签，先取得字典锁；既有协议副本不手改。App字段类型沿用`src/api/contract/event-experience.ts`。
- Web修改：`repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx`，复用该页既有other输入状态、questionHistory/transcript、双语copy。必要纯覆盖度新建`repos/orbits/features/mobile/registration-questionnaire-progress.ts`，读取既有registration/contract及interview-response-contract常量；新建`repos/orbits/tests/services/registration-questionnaire-progress.test.ts`，修改完整`repos/orbits/tests/pages/event-registration-workspace.test.tsx`。Phone Web是App的Web导出，同一个Generator先完成App，再由Phone协调者接收固定SHA/export，不派第二个实现者。
- 读取：bridge/status.md、bridge/handoffs.md及上述后端字段/签名问答契约；后端本轮只读。
- 排除：修改资格/报名窗口/已报名更新政策、数据库migration、持久问答新协议、AI prompt/provider/model/付费自动追问、画像评分算法、事件详情PW0012模块、共享认证/同步/笔记/通知、真实账号换号/seed/清库或密钥。ROOT只规划、锁与集成，不实现产品代码。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| 0049-01 | 普通单选无输入框，每题仅一个其他入口；其他展开/非空提交/切换草稿/回读兼容/无选项开放题正确 | 完整App问卷纯规则及报名交互、Web报名页面；抓实际请求确认无sentinel/隐藏草稿 |
| 0049-02 | 两个已答题保留原prompt与答案，新题只追加一份；失败重试/双击/旧scope/新题集不能丢失、重复或串账号 | App报名交互和Web页面完成连续两题及失败反例，实际截图可上滚看到第一题 |
| 0049-03 | 建议与覆盖度反映真实去重回答，2核心与8维度区分，0/空其他/重复/通用预填/全部完成正确 | 两端纯进度完整文件，页面0→1→2→8接线测试；核心齐全可选停止，不虚构准确率 |
| 0049-04 | required/allowedActions/done/签名/题集版本、单飞与晚回包保护不变；中日英可读、选项原文不被翻译 | 完整现有报名view-model/交互、Web报名直接消费者及相关types；用现有资格反例，生成/提交权限未绕过 |
| 0049-05 | 实际Web与主8082 Simulator，以及Phone手机Web同冻结源完成普通/其他、连续问答、停止建议、正式答案保存与回读 | ROOT锁定合法自有报名对象与精确恢复边界后真实操作；Web源更新先production build/restart，Phone重新export/服务；固定SHA/截图/HTTP摘要/预算对账 |

## 一次执行、验证、失败与交接

启动先确认当前ROOT两修复槽与Phone页面锁、合法自有测试活动/账号、可恢复操作和服务/device owner；未满足不消耗run。单一Generator GPT-5.6 Sol / medium，隔离worktree，记录Planner SHA256。符号upstream impact；HIGH/CRITICAL先通知，UNKNOWN补源码，不视作无影响。按中文计划TDD沿整条填写链实现，不调用用户禁用的brainstorming/executing-plans，不派Reviewer/Evaluator。

局部纯UI原拟L；实际影响若触及写入保护或HIGH，升H，覆盖直接与传递消费者，本地代码收口仅受影响端一次I全量，保留旧基线失败，修复后不无依据重复全量。完整App上述四文件+两端类型、Web上述两文件+报名直接页面消费者；本地化变化按既有同步检查一次，不为只读后端重跑无关套件。每失败最多两repair，禁止第二Generator。真实下一题/生成画像以及默认报名GET可能调用provider，必须按真实副作用计账，诊断用questions=false；沿用原累计$5唯一账本，ROOT精确释放付费窗口后才执行，不新增预算或按run重置。

规划是D文档检查，不跑产品测试或重启服务。实际run结束才生成REPORT，逐SC注明pass/fail/missing；本线源码测试commit及报告commit→固定SHA交ROOT→安全merge回chat-agent→精确合并树验证→普通push/独立远端核对，缺任何必需SC或未merge不能completed。Phone只消费同功能提交白名单，不混入其整条祖先。不能因局部成功关闭全域离线、历史AI或通知缺项。
