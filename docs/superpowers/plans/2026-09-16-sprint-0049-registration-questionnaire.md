# 0049 报名选择题与连续画像问答实施计划

> 执行者遵循仓库 RULES：一个 Generator、TDD、无独立 Reviewer/Evaluator；不调用用户已禁用的 brainstorming/executing-plans。ROOT 只管理，不实现产品代码。

**Goal:** 普通选择题隐藏输入框，“其他”展开；画像保留已答题，显示真实覆盖度与停止建议。

**Architecture:** 延用现有字符串答案与签名问答 body，不修改服务端协议。选择模式/自定义草稿与覆盖度放到纯 UI view-model；用现有 adaptiveTurns/transcript 渲染历史卡片，当前 question 追加到其后。

**Tech Stack:** TypeScript、Expo/React Native、Next/React、Node test、现有浏览器交互夹具、Simulator。

**Spec:** [唯一中文契约](../../../repos/orbit-app/docs/sprints/0049-registration-questionnaire-progression/PLANNER.md)。

## Global Constraints

- 有选项单选；无选项开放题保留直接输入。其他模式不可作为答案或新 option ID 发送。
- 保留 required/allowedActions、题集 hash/version、签名 questionToken、scope、单飞及晚回包保护。
- 覆盖度统计本活动用户有效回答，八维度去重；核心 targetAttendees/valueOffered 两项与整体覆盖分开。
- 不修改画像算法、模型、后端权限、持久化协议或真实数据库；建议不触发自动模型调用。
- 每个 Sprint 一个 Sol/medium Generator，隔离分支；ROOT 两修复槽/Phone页面锁未释放不启动。
- 原累计 AI/OCR $5 唯一账本不重置；真实问答/默认报名 GET 是可能付费的操作，需 ROOT 精确释放窗口。
- Web源更新必须生产重编译重启，Phone导出更新必须换新静态服务产物；实际同记录 Web/App 回读后才交付。

### Task 1：选择模式与实际覆盖度纯规则

**Files:** Create `repos/orbit-app/src/view-models/event-registration-questionnaire.ts`、`repos/orbit-app/tests/event-registration-questionnaire.test.ts`；必要 Modify `repos/orbit-app/src/view-models/event-registration.ts`。Web Create `repos/orbits/features/mobile/registration-questionnaire-progress.ts`、`repos/orbits/tests/services/registration-questionnaire-progress.test.ts`。

**Interfaces:** App字段类型使用 `EventExperienceQuestionContract['participantProfileField']`；Web使用既有 EVENT_PARTICIPANT_PROFILE_FIELDS/EVENT_PROFILE_CORE_FIELDS。两端纯函数输入仅本活动回答，不接全局画像预填。以下 UI 类型不是 HTTP 契约：

```ts
type Field = EventExperienceQuestionContract['participantProfileField'];
type ChoiceDraft = { mode: 'unanswered' | 'option' | 'other'; option: string | null; customText: string };
type Progress = { answeredCount: number; totalCount: number; coreAnsweredCount: number;
  coreTotalCount: number; canSuggestStop: boolean };
// 产出同名、同语义纯接口；Web Field 来自本端原契约。
declare function registrationQuestionDraft(options: readonly string[], answer: string): ChoiceDraft;
declare function registrationQuestionAnswer(draft: ChoiceDraft): string;
declare function registrationQuestionnaireProgress(answers: readonly { field: string; answer: string }[]): Progress;
```

- [ ] 写完整纯测试，先跑 RED：普通选项 mode=option/answer原值；未知已存文本 mode=other/customText原值；其他空白返回空答案；普通模式不能夹带customText；0回答、同字段重复、未知字段、空白、两核心、全部八维度。通用预填从调用方剔除，不靠 source 字符串猜测授权。

```ts
assert.equal(registrationQuestionDraft(['创业者'], '创业者').mode, 'option');
assert.equal(registrationQuestionDraft(['创业者'], '独立顾问').mode, 'other');
assert.equal(registrationQuestionAnswer({mode:'other', option:null, customText:'  '}), '');
const p = registrationQuestionnaireProgress([
  {field:'targetAttendees', answer:'创业者'}, {field:'targetAttendees', answer:'投资人'},
  {field:'valueOffered', answer:'实操经验'}, {field:'industry', answer:' '},
  {field:'unknown', answer:'不计数'},
]);
assert.deepEqual(p, {answeredCount:2,totalCount:8,coreAnsweredCount:2,coreTotalCount:2,canSuggestStop:true});
```

- [ ] Run App：`cd repos/orbit-app`，`node --test --import tsx tests/event-registration-questionnaire.test.ts`；Web：`cd repos/orbits`，`node --test --import tsx tests/services/registration-questionnaire-progress.test.ts`。未实现接口的 RED 必须保留，不能写空断言或跳过。
- [ ] 对实际待改已有符号 upstream impact，HIGH/CRITICAL通知；UNKNOWN补真实源码调用点。新 helper 最小实现：已知普通值优先、独立其他模式、trim非空；字段白名单与 Set 去重计算，coreSubset计数，canSuggestStop仅在core全部完成。

```ts
const fields = ['positioning','industry','targetAttendees','valueOffered','desiredOutcome',
  'energyStyle','experienceHighlight','followUpPreference'] as const satisfies readonly Field[];
const coreFields = ['targetAttendees','valueOffered'] as const;
export function registrationQuestionnaireProgress(
  answers: readonly {field:string; answer:string}[],
): Progress {
  const allowed = new Set<string>(fields);
  const covered = new Set(answers.filter(a => allowed.has(a.field) && a.answer.trim())
    .map(a => a.field));
  const coreAnsweredCount = coreFields.filter(field => covered.has(field)).length;
  return {answeredCount:covered.size,totalCount:fields.length,coreAnsweredCount,
    coreTotalCount:coreFields.length,canSuggestStop:coreAnsweredCount===coreFields.length};
}
```

App采用上述既有字段类型；Web实现同一Set规则但使用后端既有常量。选择草稿初始化保留原答案字符串，不转译选项。UI保留入口标签先从普通选项列表中识别出来，点击入口只切mode；序列化按mode读取option或customText，不把入口标签写成新答案。

- [ ] 同两个完整文件 GREEN；本步骤不改变报名body、服务端字段或共享副本，不运行全库。

### Task 2：报名选择与连续历史卡片接线

**Files:** Modify `repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx`、完整`tests/event-registration-interactions.test.ts`、必要完整`tests/event-registration-view-model.test.ts`及`tests/event-registration-screen-source.test.ts`；Web Modify `repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx`、完整`repos/orbits/tests/pages/event-registration-workspace.test.tsx`。

**Interfaces:** 复用现有 question.options、字符串 answers、adaptiveTurns/transcript、nextStep.done、questionToken；将真实 turns 传给 RegistrationForm/AdaptiveRegistrationCard，不新建历史存储。其他独立 draft 受原 scope 与题集 reset 管理；已答卡片只读。

- [ ] RED 交互场景：一题三普通选项+其他，四个按钮可见/输入0；点其他输入1，填“独立顾问”后提交 body 原字符串；切普通输入0且 body 普通值；切其他恢复未提交草稿。已有自定义答案回读展开，options=[]仍有输入。已有其他入口不重复。
- [ ] RED 连续链：回答第一题→下一题成功，第一题prompt+原答案仍可见，第二题在其后；回答第二题→第三题成功，历史恰两张。对下一题503重试、双击、返回晚回包、scope切换执行原夹具，不允许重复 turn 或串账号。
- [ ] Run两个完整交互文件观察真正行为失败。App采用已有测试启动方式；Web `node --test --import tsx tests/pages/event-registration-workspace.test.tsx`。浏览器夹具若依赖本地导出，由原文件已有setup运行，不重建第二套服务器/账号。
- [ ] 最小接线：RegistrationQuestion仅在无options或mode=other渲染TextInput；普通onPress只更新当前选中答案；其他onPress改变UI mode并清除作为有效答案的旧普通值。历史按真实turn稳定token/序号key渲染，当前题置末尾；成功处理保持原revision/scope guard，nextStep.done停止新题入口；错误不清空草稿/history。Web复用现有freeTextOpen，不新增自由输入的第二入口。

```tsx
const currentQuestionView = question ? {answer:'',id:question.questionToken ?? question.field,
  field:question.field,options:question.options,prompt:question.prompt} : null;
{turns.map((turn, index) => <View key={turn.questionToken ?? `${index}:${turn.field}`}>
  <Text>{turn.prompt}</Text><Text>{turn.answer}</Text>
</View>)}
{currentQuestionView ? <RegistrationQuestion question={currentQuestionView} answer={answer}
  onChange={onAnswerChange} /> : null}
```

- [ ] 两完整交互文件 GREEN，再跑既有完整App报名view-model与真实直接消费者；CSS/控件保持原设计，轻量滚动使新题可见，键盘和无障碍焦点不强制跳离。

### Task 3：建议、覆盖度与停止提示

**Files:** 同两个UI文件；App Modify `src/i18n/{messages,zh,ja,en}.ts`仅本Sprint键，须先取字典锁；Task1/2对应完整测试补UI特有接线。

**Interfaces:** 消费 registrationQuestionnaireProgress；汇总基本报名用户回答、真实turn及当前有效待提交答案，剔除通用预填，同字段去重。显示填写进度及未保存提示，不把待提交答案算成保存成功，不新增评分字段或提交门槛。

- [ ] RED：0/8及核心0/2；一核心1/8与1/2；重复该field不增；两核心2/8与2/2并显示“可以先生成画像”；8/8不再催问。其他空文本不增加；全局画像预填不增加。截图语言为中文，中日英其他/标签可读、题目选项原文保留。
- [ ] 最小展示：标题下采用GOAL的短提示；文字“核心信息 N/2 · 信息覆盖 M/8”，进度值M、上限8。核心齐全显示可先停止的建议，但沿用原画像/申请动作权限与校验，绝不自动POST。
- [ ] 完整纯规则与交互 GREEN，相关端typecheck各一次；字典源变化复用既有sync脚本一次。实际影响H时本地收口受影响端一次全量，保留旧失败及后续局部修复事实，不假报最终全绿。

### Task 4：真实服务与 Git 闭环

**Files:** 真实run结束才 Create `repos/orbit-app/docs/sprints/0049-registration-questionnaire-progression/REPORT.md`；ROOT统一README/Bridge台账。

**Interfaces:** ROOT给出同账号、同活动、同数据库授权与精确恢复边界/设备锁；沿用formal registration/interview/persona API，不新增QA路由或伪问题。Phone协调者只接固定功能SHA，重export及换32110产物。

- [ ] Generator路径限定stage、detect_changes、source/test commit，交冻结SHA和完整受影响验证。ROOT只消费白名单，merge回chat-agent后精确类型/直接测试，不覆盖其他线或用户改动。
- [ ] Web源码变化由ROOT生产build/restart/health确认；App连接主线Metro8082/准确API origin，Phone导出源冻结、89路由export及静态服务重启，记录版本与脱敏canonical身份。
- [ ] 正式自有可写报名对象执行普通/其他保存回读与连续至少两轮问答，向上查看第一题，停止建议和错误恢复均实测。真实问答付费前ROOT释放唯一窗口并确认原ledger无未结算预留；不能用stub作为实际SC05。已报名不允许更新的目标仅做只读反例，不修改角色/报名期强行写入。
- [ ] REPORT逐SC事实/费用/未完成，报告commit交ROOT；合并树必需SC通过才completed。普通push并独立remote/chat-agent一致；缺真实对象或窗口则如实blocked/partial，不重开Generator，也不绕过恢复确认。
