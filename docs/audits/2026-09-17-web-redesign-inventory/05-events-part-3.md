## repos/orbits/app/(app)/app/events/[id]/register/event-admission-status-card.tsx

源码：[event-admission-status-card.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/event-admission-status-card.tsx>)

静态来源入口：`/app/events/[id]/register`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 86 | EventAdmissionStatusCard | section |  |  |
| 112 | EventAdmissionStatusCard | h2 | localized.title |  |
| 132 | EventAdmissionStatusCard | details |  |  |
| 133 | EventAdmissionStatusCard | summary | language === "en" ? `All submitted answers (${answeredFields.length})` : `本次提交的全部回答（${answeredFields.length}）` |  |
| 165 | EventAdmissionStatusCard | footer | canWithdraw ? ( &lt;button className="reg-ghost-btn" data-admission-withdraw disabled={pendingWithdraw} onClick={onWithdraw} style={{ background: "transparent", border: 0, color: "var(--danger, #C2410C)", cursor: pendingWithdraw ? "wait" : "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 650, }} type="button" …（完整表达式见源码） |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 133 | disclosure/summary · EventAdmissionStatusCard | {`All submitted answers (${answeredFields.length})`} / {`本次提交的全部回答（${answeredFields.length}）`} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 178 | button/button · EventAdmissionStatusCard | Withdrawing… / 正在撤回… / Withdraw application / 撤回申请 | onclick: onWithdraw | {"disabled":"pendingWithdraw","renderGateProps":[],"conditions":[]} |
| 205 | link/a · EventAdmissionStatusCard | Back to event / 返回活动页 | eventHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 11 | 文案/数据常量 description | "The organizer is reviewing your event profile. You are not counted as an attendee until the application is approved." |
| 13 | 文案/数据常量 eyebrow | "Application submitted" |
| 14 | 文案/数据常量 title | "Waiting for organizer review" |
| 17 | 文案/数据常量 description | "主办方正在审核你的本场画像。审核通过前，你不会计入参会者名单。" |
| 18 | 文案/数据常量 eyebrow | "申请已提交" |
| 19 | 文案/数据常量 title | "等待主办方审核" |
| 24 | 文案/数据常量 description | "Your application is eligible, but the event is currently full. A place is assigned automatically in submission order when capacity opens." |
| 26 | 文案/数据常量 eyebrow | "Waitlist" |
| 27 | 文案/数据常量 title | "You are on the waitlist" |
| 30 | 文案/数据常量 description | "你的申请符合条件，但当前名额已满。有空位时会按提交顺序自动递补。" |
| 31 | 文案/数据常量 eyebrow | "候补中" |
| 32 | 文案/数据常量 title | "你已进入候补名单" |
| 37 | 文案/数据常量 description | "The organizer did not admit this application. No attendee membership or event contact access was created." |
| 39 | 文案/数据常量 eyebrow | "Decision complete" |
| 40 | 文案/数据常量 title | "Application not admitted" |
| 43 | 文案/数据常量 description | "主办方未通过本次申请；系统没有创建参会资格，也没有开放活动联系人信息。" |
| 44 | 文案/数据常量 eyebrow | "审核已完成" |
| 45 | 文案/数据常量 title | "本次申请未通过" |
| 50 | 文案/数据常量 description | "This application has been withdrawn. If it was previously admitted, the attendee membership was cancelled in the same transaction." |
| 52 | 文案/数据常量 eyebrow | "Application withdrawn" |
| 53 | 文案/数据常量 title | "You are no longer joining this event" |
| 56 | 文案/数据常量 description | "这份申请已撤回；如果此前已通过，参会资格也已在同一事务中取消。" |
| 57 | 文案/数据常量 eyebrow | "申请已撤回" |
| 58 | 文案/数据常量 title | "你将不再参加这场活动" |

## repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx

源码：[event-registration-workspace.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx>)

静态来源入口：`/app/events/[id]/register`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 837 | EventRegistrationWorkspace | main |  |  |
| 887 | EventRegistrationWorkspace | section | isStatusCardApplication(admissionApplication) && stage === admissionApplication.status ? ( &lt;EventAdmissionStatusCard application={admissionApplication} eventHref={eventHref} language={language} onWithdraw={() =&gt; { setError(null); setConfirmingCancel(true); }} pendingWithdraw={pendingCancel} /&gt; ) : null stage === "inter …（完整表达式见源码） |  |
| 897 | EventRegistrationWorkspace | header | status === "rsvped" \|\| status === "admitted" ? ( &lt;span style={{ alignItems: "center", background: "var(--live-soft, var(--accent-soft))", borderRadius: "var(--r-pill)", color: "var(--live, var(--accent))", display: "inline-flex", flexShrink: 0, fontSize: 12, fontWeight: 700, gap: 6, padding: "6px 13px" }}&gt; &lt;span style= …（完整表达式见源码） | reg-page-header |
| 903 | EventRegistrationWorkspace | h1 | event.title |  |
| 1047 | EventRegistrationWorkspace | h2 | question.prompt |  |
| 1171 | EventRegistrationWorkspace | footer |  | reg-question-footer |
| 1193 | EventRegistrationWorkspace | section |  |  |
| 1208 | EventRegistrationWorkspace | h2 | copy(language, { en: "Your event-scoped answers are stored.", zh: "你的本场回答已可靠保存", }) |  |
| 1248 | EventRegistrationWorkspace | footer |  |  |
| 1290 | EventRegistrationWorkspace | section | transcript.length &gt; 0 ? ( &lt;details&gt; &lt;summary style={{ color: "var(--text-2)", cursor: "pointer", fontSize: 14, fontWeight: 650 }}&gt; {copy(language, { en: "Review previously saved answers", zh: "查看此前保存的回答" })} &lt;/summary&gt; &lt;dl style={{ display: "grid", gap: 8, margin: "12px 0 0" }}&gt; {transcript.map((turn) =&gt; ( &lt;div key={tu …（完整表达式见源码） |  |
| 1305 | EventRegistrationWorkspace | h2 | copy(language, { en: "You are no longer registered for this event.", zh: "你已不再参加这场活动", }) |  |
| 1318 | EventRegistrationWorkspace | details |  |  |
| 1319 | EventRegistrationWorkspace | summary | copy(language, { en: "Review previously saved answers", zh: "查看此前保存的回答" }) |  |
| 1473 | EventRegistrationWorkspace | h2 | persona.tagline |  |
| 1571 | EventRegistrationWorkspace | footer |  |  |
| 1627 | EventRegistrationWorkspace | section/alertdialog | error ? ( &lt;div className="orbit-alert error" role="alert"&gt; {error} &lt;/div&gt; ) : null |  |
| 1643 | EventRegistrationWorkspace | h2 | admissionControlled ? copy(language, { en: "Withdraw from this event?", zh: "确认撤回本次活动申请？", }) : copy(language, { en: "Cancel this event registration?", zh: "确认取消这次活动报名？", }) |  |
| 1713 | EventRegistrationWorkspace | section | error ? ( &lt;div className="orbit-alert error" role="alert"&gt; {error} &lt;/div&gt; ) : null registrationAnswersComplete ? ( &lt;div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}&gt; &lt;button className="btn btn-primary" data-registration-complete-anyway disabled={thinking} onClick={() =&gt; void runGeneratio …（完整表达式见源码） |  |
| 1729 | EventRegistrationWorkspace | h2 | registrationAnswersComplete ? copy(language, { en: "Registration has not been submitted yet", zh: "报名尚未提交完成", }) : transcript.length &gt; 0 ? copy(language, { en: "The next AI question is temporarily unavailable", zh: "下一道 AI 问题暂时未生成", }) : copy(language, { en: "The AI interview is temporarily unavailable", zh: "AI 访谈暂时未生 …（完整表达式见源码） |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 164 | [stage, setStage] = useState&lt;Stage&gt;( initialAdmissionApplication?.status === "admitted" ? "registered" : initialAdmissionApplication?.status ?? (initialRegistration?.status === "rsvped" ? "registered" : initialRegistration?.status === "cancelled" ? "cancelled" : "interview"), ) |
| 174 | [admissionApplication, setAdmissionApplication] = useState( initialAdmissionApplication, ) |
| 177 | [registration, setRegistration] = useState(initialRegistration) |
| 202 | [transcript, setTranscript] = useState&lt;AdaptiveInterviewTurn[]&gt;(seededTranscript) |
| 203 | [question, setQuestion] = useState&lt;AdaptiveNextQuestion \| null&gt;( () =&gt; (initialQuestionUsable ? initialSignedQuestion.question : null), ) |
| 206 | [questionToken, setQuestionToken] = useState&lt;string \| null&gt;( () =&gt; (initialQuestionUsable ? initialSignedQuestion.questionToken : null), ) |
| 209 | [questionHistory, setQuestionHistory] = useState&lt;AdaptiveNextQuestion[]&gt;([]) |
| 210 | [questionTokenHistory, setQuestionTokenHistory] = useState&lt;string[]&gt;([]) |
| 211 | [responses, setResponses] = useState&lt;EventInterviewResponseSubmission[]&gt;([]) |
| 212 | [thinking, setThinking] = useState(false) |
| 213 | [freeTextOpen, setFreeTextOpen] = useState(false) |
| 214 | [freeText, setFreeText] = useState("") |
| 215 | [selectedOption, setSelectedOption] = useState&lt;string \| null&gt;(null) |
| 216 | [generatingStep, setGeneratingStep] = useState(0) |
| 217 | [persona, setPersona] = useState&lt;EventPersona \| null&gt;(null) |
| 218 | [error, setError] = useState&lt;string \| null&gt;( initialRegistration \|\| initialAdmissionApplication \|\| initialSignedQuestion ? null : copy(language, { en: "The AI interview could not start. Retry when the model is available.", zh: "AI 访谈暂时无法开始，请在模型恢复后重试。", }), ) |
| 226 | [pendingCancel, setPendingCancel] = useState(false) |
| 227 | [confirmingCancel, setConfirmingCancel] = useState(false) |
| 229 | [interviewEpoch, setInterviewEpoch] = useState(0) |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 1627 | alertdialog | Withdraw from this event? / 确认撤回本次活动申请？ / Cancel this event registration? / 确认取消这次活动报名？ The application becomes final and you will leave attendee matching. If already admitted, your attendee membership is cancelled atomically and the next waitlisted person may be promoted. / 撤回后申请将进入最终状态，并退出本场活动撮合；若此前已通过，参会资格会原子取消，并可能自动递补下一位候补者。 / You will leave attendee matching. Your saved answers remain attached to this registration so you can reactivate the s …（完整表达式见源码） |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 888 | link/a · EventRegistrationWorkspace | Back to event / 返回活动页 | eventHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1023 | link/a · EventRegistrationWorkspace | Edit profile / 改通用画像 | /app/profile | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1079 | button/button · EventRegistrationWorkspace | {OPTION_KEYS[optionIndex]} {option} | onclick: () =&gt; void submitAnswer(option) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1128 | form-submit-boundary/form · EventRegistrationWorkspace | Next / 继续 ⏎ | onsubmit: (formEvent) =&gt; { formEvent.preventDefault(); void submitAnswer(freeText); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1135 | field/input · EventRegistrationWorkspace | copy(language, { en: "Your own answer", zh: "你的回答" }) | onchange: (changeEvent) =&gt; setFreeText(changeEvent.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1145 | button/button · EventRegistrationWorkspace | Next / 继续 ⏎ |  | {"disabled":"!freeText.trim()","renderGateProps":[],"conditions":[]} |
| 1151 | button/button · EventRegistrationWorkspace | I'd rather write my own / 选项不合适?用自己的话说 | onclick: () =&gt; setFreeTextOpen(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1172 | button/button · EventRegistrationWorkspace | Previous / 上一题 | onclick: goBack | {"disabled":"questionHistory.length === 0 \|\| thinking","renderGateProps":[],"conditions":[]} |
| 1250 | button/button · EventRegistrationWorkspace | Generate event persona / 生成活动画像 | onclick: () =&gt; void runGeneration(transcript, responses) | {"disabled":"transcript.length === 0","renderGateProps":[],"conditions":[]} |
| 1259 | button/button · EventRegistrationWorkspace | Edit answers / 修改回答 | onclick: restartInterview | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1268 | button/button · EventRegistrationWorkspace | Withdraw from event / 撤回参会资格 / Cancel registration / 取消报名 | onclick: () =&gt; { setError(null); setConfirmingCancel(true); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1282 | link/a · EventRegistrationWorkspace | Back to event / 返回活动页 | eventHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1319 | disclosure/summary · EventRegistrationWorkspace | Review previously saved answers / 查看此前保存的回答 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1342 | button/button · EventRegistrationWorkspace | Register again / 重新报名 | onclick: restartInterview | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1345 | link/a · EventRegistrationWorkspace | Back to event / 返回活动页 | eventHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1574 | button/button · EventRegistrationWorkspace | Redo the interview / 重新回答 | onclick: restartInterview | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1585 | button/button · EventRegistrationWorkspace | Withdraw from event / 撤回参会资格 / Cancel registration / 取消报名 | onclick: () =&gt; { setError(null); setConfirmingCancel(true); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1600 | link/a · EventRegistrationWorkspace | Back to event / 返回活动页 | eventHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1674 | button/button · EventRegistrationWorkspace | Keep application / 保留申请 / Keep registration / 保留报名 | onclick: () =&gt; { setError(null); setConfirmingCancel(false); } | {"disabled":"pendingCancel","renderGateProps":[],"conditions":[]} |
| 1688 | button/button · EventRegistrationWorkspace | Cancelling… / 取消中… / Confirm withdrawal / 确认撤回申请 / Confirm cancellation / 确认取消报名 | onclick: () =&gt; void cancelRegistration() | {"disabled":"pendingCancel","renderGateProps":[],"conditions":[]} |
| 1769 | button/button · EventRegistrationWorkspace | Finish registration / 完成报名 | onclick: () =&gt; void runGeneration(transcript, responses) | {"disabled":"thinking","renderGateProps":[],"conditions":[]} |
| 1782 | button/button · EventRegistrationWorkspace | Generating… / 正在生成… / Retry AI interview / 重试 AI 访谈 | onclick: () =&gt; void retryInterviewStart() | {"disabled":"thinking","renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 359 | EventRegistrationWorkspace | 调用 | POST | `/api/events/${encodeURIComponent(event.id)}/registration/interview` |
| 360 | EventRegistrationWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/registration/interview` |
| 446 | EventRegistrationWorkspace | 调用 | POST | admissionControlled ? `/api/events/${encodeURIComponent(event.id)}/admission/application` : `/api/events/${encodeURIComponent(event.id)}/registration` |
| 448 | EventRegistrationWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/admission/application` |
| 449 | EventRegistrationWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/registration` |
| 504 | EventRegistrationWorkspace | 调用 | POST | `/api/events/${encodeURIComponent(event.id)}/registration/persona` |
| 505 | EventRegistrationWorkspace | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/registration/persona` |
| 778 | cancelRegistration | 调用 | GET/由封装决定 | admissionControlled ? `/api/events/${encodeURIComponent(event.id)}/admission/application` : `/api/events/${encodeURIComponent(event.id)}/registration/cancel` |
| 780 | cancelRegistration | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/admission/application` |
| 781 | cancelRegistration | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(event.id)}/registration/cancel` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 102 | 文案/数据常量 en | "Outcome" |
| 102 | 文案/数据常量 zh | "期待结果" |
| 103 | 文案/数据常量 en | "Social energy" |
| 103 | 文案/数据常量 zh | "社交能量" |
| 104 | 文案/数据常量 en | "Experience" |
| 104 | 文案/数据常量 zh | "经验亮点" |
| 105 | 文案/数据常量 en | "Follow-up" |
| 105 | 文案/数据常量 zh | "后续方式" |
| 106 | 文案/数据常量 en | "Industry" |
| 106 | 文案/数据常量 zh | "行业" |
| 107 | 文案/数据常量 en | "Positioning" |
| 107 | 文案/数据常量 zh | "定位" |
| 108 | 文案/数据常量 en | "Who to meet" |
| 108 | 文案/数据常量 zh | "想认识" |
| 109 | 文案/数据常量 en | "What you offer" |
| 109 | 文案/数据常量 zh | "能提供" |
| 191 | 翻译 en | "Your positioning (brought in from your universal profile)" |
| 192 | 翻译 zh | "你的定位（来自通用画像）" |
| 222 | 翻译 en | "The AI interview could not start. Retry when the model is available." |
| 223 | 翻译 zh | "AI 访谈暂时无法开始，请在模型恢复后重试。" |
| 285 | 翻译 en | "Who you want to meet (brought in from your quick answer)" |
| 286 | 翻译 zh | "这场你想认识谁（来自详情页速答）" |
| 295 | 翻译 en | "What you can offer (brought in from your quick answer)" |
| 296 | 翻译 zh | "你能提供什么（来自详情页速答）" |
| 336 | 翻译 en | "The AI interview could not start. Please retry." |
| 337 | 翻译 zh | "AI 访谈暂时无法开始，请重试。" |
| 378 | 翻译 en | "Could not load the next AI question. Your answers were kept; retry this step." |
| 379 | 翻译 zh | "下一道 AI 问题生成失败，已保留当前回答，请重试。" |
| 399 | 翻译 en | "The AI interview returned no verified question. Please retry." |
| 400 | 翻译 zh | "AI 访谈未返回可核验的问题，请重试。" |
| 411 | 翻译 en | "The AI interview could not start. Please retry." |
| 412 | 翻译 zh | "AI 访谈暂时无法开始，请重试。" |
| 480 | 翻译 en | "Your registration answers could not be saved." |
| 481 | 翻译 zh | "报名回答未能保存，请重试。" |
| 524 | 翻译 en | "Your registration was saved, but the event persona could not be generated." |
| 525 | 翻译 zh | "报名已保存，但活动画像生成失败。" |
| 547 | 翻译 en | "Something went wrong." |
| 547 | 翻译 zh | "出错了,请重试。" |
| 639 | 翻译 en | "Something went wrong." |
| 639 | 翻译 zh | "出错了,请重试。" |
| 766 | 翻译 en | "The AI interview could not start. Retry when the model is available." |
| 767 | 翻译 zh | "AI 访谈暂时无法开始，请在模型恢复后重试。" |
| 807 | 翻译 en | "Registration could not be cancelled." |
| 807 | 翻译 zh | "暂时无法取消预约。" |
| 823 | 翻译 en | "Registration could not be cancelled." |
| 823 | 翻译 zh | "暂时无法取消预约。" |
| 831 | 翻译 en | "Reading your answers" |
| 831 | 翻译 zh | "正在解读你的回答" |
| 832 | 翻译 en | "Aligning with the event" |
| 832 | 翻译 zh | "正在对齐活动语境" |
| 833 | 翻译 en | "Composing your persona" |
| 833 | 翻译 zh | "正在生成你的活动画像" |
| 894 | 翻译 en | "Back to event" |
| 894 | 翻译 zh | "返回活动页" |
| 901 | 翻译 en | "Event persona" |
| 901 | 翻译 zh | "活动个人画像" |
| 918 | 翻译 en | "Registered" |
| 918 | 翻译 zh | "已报名" |
| 923 | 翻译 en | "Application withdrawn" |
| 923 | 翻译 zh | "申请已撤回" |
| 924 | 翻译 en | "Registration cancelled" |
| 924 | 翻译 zh | "报名已取消" |
| 929 | 翻译 en | "Pending review" |
| 929 | 翻译 zh | "待审核" |
| 931 | 翻译 en | "Waitlisted" |
| 931 | 翻译 zh | "候补中" |
| 932 | 翻译 en | "Not admitted" |
| 932 | 翻译 zh | "未通过" |
| 965 | 属性 aria-label | copy(language, { en: "Registration progress", zh: "报名进度" }) |
| 966 | 翻译 en | "Registration progress" |
| 966 | 翻译 zh | "报名进度" |
| 1020 | 翻译 en | "Positioning from your profile: " |
| 1020 | 翻译 zh | "定位已从通用画像带入：" |
| 1024 | 翻译 en | "Edit profile" |
| 1024 | 翻译 zh | "改通用画像" |
| 1072 | 翻译 en | "Thinking about what to ask next…" |
| 1072 | 翻译 zh | "正在根据你的回答想下一个问题…" |
| 1135 | 属性 placeholder | copy(language, { en: "Write your own answer…", zh: "用自己的话说…" }) |
| 1135 | 属性 aria-label | copy(language, { en: "Your own answer", zh: "你的回答" }) |
| 1136 | 翻译 en | "Your own answer" |
| 1136 | 翻译 zh | "你的回答" |
| 1141 | 翻译 en | "Write your own answer…" |
| 1141 | 翻译 zh | "用自己的话说…" |
| 1146 | 翻译 en | "Next" |
| 1146 | 翻译 zh | "继续" |
| 1158 | 翻译 en | "I'd rather write my own" |
| 1158 | 翻译 zh | "选项不合适?用自己的话说" |
| 1180 | 翻译 en | "Previous" |
| 1180 | 翻译 zh | "上一题" |
| 1184 | 翻译 en | `${missingCoreFields.length} question(s) left before registration. Answers stay scoped to this event.` |
| 1185 | 翻译 zh | `还需完成 ${missingCoreFields.length} 个问题即可报名；回答只用于本次活动。` |
| 1206 | 翻译 en | "Registration saved" |
| 1206 | 翻译 zh | "报名已保存" |
| 1210 | 翻译 en | "Your event-scoped answers are stored." |
| 1211 | 翻译 zh | "你的本场回答已可靠保存" |
| 1216 | 翻译 en | "These exact answers remain after refresh or sign-in. The AI persona is a derived preview and is regenerated only when you request it." |
| 1217 | 翻译 zh | "下列原始回答在刷新或重新登录后仍会保留。AI 活动画像属于派生预览，只会在你主动要求时重新生成。" |
| 1256 | 翻译 en | "Generate event persona" |
| 1256 | 翻译 zh | "生成活动画像" |
| 1265 | 翻译 en | "Edit answers" |
| 1265 | 翻译 zh | "修改回答" |
| 1278 | 翻译 en | "Withdraw from event" |
| 1278 | 翻译 zh | "撤回参会资格" |
| 1279 | 翻译 en | "Cancel registration" |
| 1279 | 翻译 zh | "取消报名" |
| 1283 | 翻译 en | "Back to event" |
| 1283 | 翻译 zh | "返回活动页" |
| 1303 | 翻译 en | "Registration cancelled" |
| 1303 | 翻译 zh | "报名已取消" |
| 1307 | 翻译 en | "You are no longer registered for this event." |
| 1308 | 翻译 zh | "你已不再参加这场活动" |
| 1313 | 翻译 en | "No email, organizer message, calendar update, or refund was triggered. You can reactivate the same registration record by answering again." |
| 1314 | 翻译 zh | "本次取消不会发送邮件、联系主办方、修改日历或发起退款。再次回答时会重新激活同一条报名记录，不会创建重复记录。" |
| 1320 | 翻译 en | "Review previously saved answers" |
| 1320 | 翻译 zh | "查看此前保存的回答" |
| 1343 | 翻译 en | "Register again" |
| 1343 | 翻译 zh | "重新报名" |
| 1346 | 翻译 en | "Back to event" |
| 1346 | 翻译 zh | "返回活动页" |
| 1460 | 翻译 en | "Your persona for this event" |
| 1460 | 翻译 zh | "你的本场活动画像" |
| 1465 | 翻译 en | "Admission confirmed" |
| 1465 | 翻译 zh | "参会资格已确认" |
| 1467 | 翻译 en | "Application saved · pending organizer review" |
| 1467 | 翻译 zh | "申请已保存 · 等待主办方审核" |
| 1469 | 翻译 en | "Application saved · waitlisted" |
| 1469 | 翻译 zh | "申请已保存 · 当前候补中" |
| 1470 | 翻译 en | "Application state updated" |
| 1470 | 翻译 zh | "申请状态已更新" |
| 1517 | 翻译 en | "Wants to meet" |
| 1517 | 翻译 zh | "想认识" |
| 1522 | 翻译 en | "Can offer" |
| 1522 | 翻译 zh | "能提供" |
| 1527 | 翻译 en | "Social energy" |
| 1527 | 翻译 zh | "社交能量" |
| 1545 | 翻译 en | "Conversation openers" |
| 1545 | 翻译 zh | "开场话题" |
| 1562 | 翻译 en | "Composed by Orbit AI" |
| 1562 | 翻译 zh | "由 Orbit AI 生成" |
| 1563 | 翻译 en | "Composed from your answers" |
| 1563 | 翻译 zh | "由你的回答直接生成" |
| 1566 | 翻译 en | "Scoped to this event only." |
| 1566 | 翻译 zh | "仅用于本次活动。" |
| 1581 | 翻译 en | "Redo the interview" |
| 1581 | 翻译 zh | "重新回答" |
| 1595 | 翻译 en | "Withdraw from event" |
| 1595 | 翻译 zh | "撤回参会资格" |
| 1596 | 翻译 en | "Cancel registration" |
| 1596 | 翻译 zh | "取消报名" |
| 1601 | 翻译 en | "Back to event" |
| 1601 | 翻译 zh | "返回活动页" |
| 1649 | 翻译 en | "Withdraw from this event?" |
| 1650 | 翻译 zh | "确认撤回本次活动申请？" |
| 1653 | 翻译 en | "Cancel this event registration?" |
| 1654 | 翻译 zh | "确认取消这次活动报名？" |
| 1660 | 翻译 en | "The application becomes final and you will leave attendee matching. If already admitted, your attendee membership is cancelled atomically and the next waitlisted person may be promoted." |
| 1661 | 翻译 zh | "撤回后申请将进入最终状态，并退出本场活动撮合；若此前已通过，参会资格会原子取消，并可能自动递补下一位候补者。" |
| 1664 | 翻译 en | "You will leave attendee matching. Your saved answers remain attached to this registration so you can reactivate the same record later." |
| 1665 | 翻译 zh | "取消后你将退出本场活动撮合。已保存的回答仍归属于这条报名记录，之后可重新激活同一记录。" |
| 1685 | 翻译 en | "Keep application" |
| 1685 | 翻译 zh | "保留申请" |
| 1686 | 翻译 en | "Keep registration" |
| 1686 | 翻译 zh | "保留报名" |
| 1696 | 翻译 en | "Cancelling…" |
| 1696 | 翻译 zh | "取消中…" |
| 1699 | 翻译 en | "Confirm withdrawal" |
| 1700 | 翻译 zh | "确认撤回申请" |
| 1703 | 翻译 en | "Confirm cancellation" |
| 1704 | 翻译 zh | "确认取消报名" |
| 1732 | 翻译 en | "Registration has not been submitted yet" |
| 1733 | 翻译 zh | "报名尚未提交完成" |
| 1737 | 翻译 en | "The next AI question is temporarily unavailable" |
| 1738 | 翻译 zh | "下一道 AI 问题暂时未生成" |
| 1741 | 翻译 en | "The AI interview is temporarily unavailable" |
| 1742 | 翻译 zh | "AI 访谈暂时未生成" |
| 1748 | 翻译 en | "Your two answers are kept. Retry to finish registration without answering anything else." |
| 1749 | 翻译 zh | "两项回答都已保留，无需再回答其它问题；请重试完成报名。" |
| 1753 | 翻译 en | "Your answers so far are kept. No substitute question was used." |
| 1754 | 翻译 zh | "已完成的回答都已保留，系统没有使用替代问题。" |
| 1757 | 翻译 en | "No substitute question was used and no answer was saved. Retry the real AI generation here." |
| 1758 | 翻译 zh | "系统没有使用替代问题，也没有保存任何回答。你可以在这里重新请求真实 AI 生成。" |
| 1777 | 翻译 en | "Finish registration" |
| 1777 | 翻译 zh | "完成报名" |
| 1791 | 翻译 en | "Generating…" |
| 1791 | 翻译 zh | "正在生成…" |
| 1792 | 翻译 en | "Retry AI interview" |
| 1792 | 翻译 zh | "重试 AI 访谈" |

## repos/orbits/app/(app)/app/events/[id]/register/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/register/page.tsx>)

静态来源入口：`/app/events/[id]/register`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 146 | AppEventRegistrationGuidePage | main |  | orbit-page |
| 280 | AppEventRegistrationGuidePage | main |  | orbit-page |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 147 | 属性 title | language === "en" ? "Admission temporarily unavailable" : "准入服务暂不可用" |
| 281 | 属性 title | registrationClosed ? language === "en" ? "Registration closed" : "报名已结束" : language === "en" ? "Registration unavailable" : "报名暂不可用" |

## repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts

源码：[events-view-model-adapter.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts>)

静态来源入口：`/app/agent`、`/app/home/events`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 58 | 文案/数据常量 label | "Relationship context" |
| 63 | 文案/数据常量 label | "Next action" |
| 71 | 文案/数据常量 label | "Readiness" |

## repos/orbits/app/(app)/app/events/orbit-event-cover.tsx

源码：[orbit-event-cover.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/orbit-event-cover.tsx>)

静态来源入口：`/app/admin`、`/app/admin/events`、`/app/agent`、`/app/events`、`/app/events/[id]`、`/app/home/events`、`/app/o/[slug]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 50 | 属性 alt | imageAlt |

## repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx

源码：[orbit-real-explore-client.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx>)

静态来源入口：`/app/events`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 279 | EventModuleCard | h2 | mapped.name |  |
| 368 | MapEventCard | h3 | item.name | h-section |
| 413 | MobileExploreCard | h3 | item.name | h-section |
| 440 | EventsEmptyState | section | filteredView ? ( &lt;button className="btn btn-primary" onClick={onReset} style={{ marginTop: 18 }} type="button"&gt; {registeredView ? t({ en: "Browse all events", zh: "浏览全部活动" }) : t({ en: "Clear filters", zh: "清除筛选" })} &lt;/button&gt; ) : null | card |
| 467 | EventsEmptyState | h2 | registeredView ? t({ en: "No registered events yet", zh: "还没有已报名活动" }) : filteredView ? t({ en: "No events match these filters", zh: "没有符合当前筛选的活动" }) : t({ en: "New events are on the way", zh: "新的活动正在筹备中" }) | h-title |
| 598 | OrbitRealExploreClient | main | effMode === "modules" && filtered.length &gt; 0 ? &lt;EventModuleGrid events={filtered} registrationAvailabilityByEventId={registrationAvailabilityByEventId} /&gt; : null filtered.length === 0 ? ( &lt;EventsEmptyState filteredView={filteredView} onReset={resetFilters} registeredView={status === "registered"} /&gt; ) : null effMode == …（完整表达式见源码） | orbit-main |
| 600 | OrbitRealExploreClient | h1 | t({ en: "Discover events", zh: "发现活动" }) | h-display |
| 626 | OrbitRealExploreClient | section |  | orbit-map-shell |
| 628 | OrbitRealExploreClient | h2 | t({ en: "Discover events", zh: "发现活动" }) | h-title |
| 657 | OrbitRealExploreClient | h1 | t({ en: "Discover events", zh: "发现活动" }) | h-display |
| 674 | OrbitRealExploreClient | section |  | card |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 515 | [query, setQuery] = useState("") |
| 516 | [status, setStatus] = useState&lt;EventScope&gt;(initialScope) |
| 517 | [topic, setTopic] = useState("all") |
| 518 | [mode, setMode] = useState("modules") |
| 519 | [selectedId, setSelectedId] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 253 | link/a · EventModuleCard | t({ en: `View ${mapped.name} details`, zh: `查看${mapped.name}详情` }) | preserveHref(productHref(`/events/${event.code}`)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 298 | link/a · EventModuleCard | {&lt;small&gt;{action.badgeLabel} · &lt;/small&gt;} / {null} {action.label} | preserveHref(action.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 326 | button/button · MapCanvas | t({ en: `Show ${item.name} event`, zh: `查看活动：${item.name}` }) | onclick: () =&gt; onSelect(item) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 380 | link/a · MapEventCard | {`${action.badgeLabel} · `} {action.label} | preserveHref(action.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 400 | link/a · MobileExploreCard | t({ en: `View ${item.name} details`, zh: `查看${item.name}详情` }) | preserveHref(productHref(`/events/${item.code}`)) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 421 | link/a · MobileExploreCard | {`${action.badgeLabel} · `} {action.label} | preserveHref(action.href) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 492 | button/button · EventsEmptyState | Browse all events / 浏览全部活动 / Clear filters / 清除筛选 | onclick: onReset | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 603 | button/button · OrbitRealExploreClient | Events / 内容 | onclick: () =&gt; setMode("modules") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 604 | button/button · OrbitRealExploreClient | Map / 地图 | onclick: () =&gt; setMode("map") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 608 | field/input · OrbitRealExploreClient | t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 613 | button/button · OrbitRealExploreClient | {statusLabels[key]} | onclick: () =&gt; setEventScope(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 614 | button/button · OrbitRealExploreClient | {topicLabel(item, language)} | onclick: () =&gt; setTopic(topic === item ? "all" : item) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 633 | button/button · OrbitRealExploreClient | {item.name} {[item.day ? `${item.month}${language === "zh" ? `${item.day}日` : ` ${item.day}`}` : item.time, item.place].filter(Boolean).join(" · ")} | onclick: () =&gt; setSelectedId(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 646 | callback-control/MapCanvas · OrbitRealExploreClient |  | onselect: (item) =&gt; setSelectedId(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 658 | button/button · OrbitRealExploreClient | Map / 地图 | onclick: () =&gt; canShowMap && setMode(mode === "map" ? "modules" : "map") | {"disabled":"!canShowMap","renderGateProps":[],"conditions":[]} |
| 662 | field/input · OrbitRealExploreClient | t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" }) | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 665 | button/button · OrbitRealExploreClient | {statusLabels[key]} | onclick: () =&gt; setEventScope(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 667 | button/button · OrbitRealExploreClient | {topicLabel(item, language)} | onclick: () =&gt; setTopic(topic === item ? "all" : item) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 674 | callback-control/MapCanvas · OrbitRealExploreClient |  | onselect: (item) =&gt; setSelectedId(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 184 | 翻译 en | "View event" |
| 184 | 翻译 zh | "查看活动" |
| 185 | 翻译 en | "Register" |
| 185 | 翻译 zh | "报名" |
| 190 | 翻译 en | "Registered" |
| 190 | 翻译 zh | "已报名" |
| 192 | 翻译 en | "Enter event" |
| 192 | 翻译 zh | "进入现场" |
| 196 | 翻译 en | "Registered" |
| 196 | 翻译 zh | "已报名" |
| 200 | 翻译 en | "Manage registration" |
| 200 | 翻译 zh | "管理报名" |
| 201 | 翻译 en | "View event" |
| 201 | 翻译 zh | "查看活动" |
| 253 | 属性 aria-label | t({ en: `View ${mapped.name} details`, zh: `查看${mapped.name}详情` }) |
| 254 | 翻译 en | `View ${mapped.name} details` |
| 254 | 翻译 zh | `查看${mapped.name}详情` |
| 292 | 翻译 en | `${mapped.people} registered` |
| 292 | 翻译 zh | `${mapped.people} 人已报名` |
| 296 | 翻译 en | "Tap to revisit details" |
| 296 | 翻译 zh | "点击回看活动详情" |
| 296 | 翻译 en | "Tap to view details" |
| 296 | 翻译 zh | "点击查看活动详情" |
| 326 | 属性 aria-label | t({ en: `Show ${item.name} event`, zh: `查看活动：${item.name}` }) |
| 326 | 翻译 en | `Show ${item.name} event` |
| 326 | 翻译 zh | `查看活动：${item.name}` |
| 338 | 翻译 en | "Tokyo" |
| 338 | 翻译 zh | "东京 · Tokyo" |
| 375 | 翻译 en | `${item.people} people` |
| 375 | 翻译 zh | `${item.people} 人` |
| 400 | 属性 aria-label | t({ en: `View ${item.name} details`, zh: `查看${item.name}详情` }) |
| 401 | 翻译 en | `View ${item.name} details` |
| 401 | 翻译 zh | `查看${item.name}详情` |
| 420 | 翻译 en | `${item.people} people` |
| 420 | 翻译 zh | `${item.people} 人` |
| 469 | 翻译 en | "No registered events yet" |
| 469 | 翻译 zh | "还没有已报名活动" |
| 471 | 翻译 en | "No events match these filters" |
| 471 | 翻译 zh | "没有符合当前筛选的活动" |
| 472 | 翻译 en | "New events are on the way" |
| 472 | 翻译 zh | "新的活动正在筹备中" |
| 477 | 翻译 en | "Events you register for will appear here. Browse the full catalogue to find your next gathering." |
| 478 | 翻译 zh | "报名成功的活动会出现在这里。浏览全部活动，找到下一场适合你的聚会。" |
| 482 | 翻译 en | "Clear the search and filters to return to the full event catalogue." |
| 483 | 翻译 zh | "清除搜索和筛选，即可返回完整活动目录。" |
| 486 | 翻译 en | "There are no published events right now. Check back soon for the next gathering." |
| 487 | 翻译 zh | "目前还没有已发布的活动，下一场聚会开放后会出现在这里。" |
| 494 | 翻译 en | "Browse all events" |
| 494 | 翻译 zh | "浏览全部活动" |
| 495 | 翻译 en | "Clear filters" |
| 495 | 翻译 zh | "清除筛选" |
| 548 | 翻译 en | "No matching open events." |
| 548 | 翻译 zh | "没有匹配的开放活动。" |
| 548 | 翻译 en | `${filtered.length} events` |
| 548 | 翻译 zh | `${filtered.length} 场活动` |
| 550 | 翻译 en | "Live" |
| 550 | 翻译 zh | "进行中" |
| 551 | 翻译 en | "All" |
| 551 | 翻译 zh | "全部" |
| 552 | 翻译 en | "Ended" |
| 552 | 翻译 zh | "已结束" |
| 553 | 翻译 en | "Registered" |
| 553 | 翻译 zh | "已报名" |
| 554 | 翻译 en | "Upcoming" |
| 554 | 翻译 zh | "即将开始" |
| 600 | 翻译 en | "EXPLORE · Tokyo" |
| 600 | 翻译 zh | "EXPLORE · 东京" |
| 600 | 翻译 en | "Discover events" |
| 600 | 翻译 zh | "发现活动" |
| 602 | 属性 aria-label | t({ en: "Event view", zh: "活动视图" }) |
| 602 | 翻译 en | "Event view" |
| 602 | 翻译 zh | "活动视图" |
| 603 | 翻译 en | "Events" |
| 603 | 翻译 zh | "内容" |
| 604 | 翻译 en | "Map" |
| 604 | 翻译 zh | "地图" |
| 608 | 属性 placeholder | t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" }) |
| 608 | 翻译 en | "Search event name, code, or topic" |
| 608 | 翻译 zh | "搜索活动名称、编号或主题" |
| 628 | 翻译 en | "Discover events" |
| 628 | 翻译 zh | "发现活动" |
| 628 | 翻译 en | `${located.length} locations` |
| 628 | 翻译 zh | `${located.length} 个位置` |
| 657 | JSX文字 | EXPLORE |
| 657 | 翻译 en | "Discover events" |
| 657 | 翻译 zh | "发现活动" |
| 658 | 翻译 en | "Map" |
| 658 | 翻译 zh | "地图" |
| 662 | 属性 placeholder | t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" }) |
| 662 | 翻译 en | "Search event name, code, or topic" |
| 662 | 翻译 zh | "搜索活动名称、编号或主题" |

## repos/orbits/app/(app)/app/o/[slug]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/[slug]/page.tsx>)

静态来源入口：`/app/o/[slug]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 41 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts

源码：[organizer-public-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts>)

静态来源入口：`/app/o/[slug]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 66 | 文案/数据常量 description | "No canonical public organizer events are available for this page." |
| 68 | 文案/数据常量 emptyState | "The public organizer page has no published events to display." |
| 70 | 文案/数据常量 eyebrow | "Organizer" |
| 71 | 文案/数据常量 guardrail | "This route reads only canonical public Event Core records. It does not create registrations, notify attendees, write calendars, or contact outside providers." |
| 73 | 文案/数据常量 nextStep | "Return to events and open an organizer from a published event." |
| 74 | 文案/数据常量 purpose | "Keep public organizer pages tied to published canonical event ownership." |
| 76 | 文案/数据常量 title | "Organizer page is empty" |
| 79 | 文案/数据常量 description | "这个公开主办方页面暂时没有可展示的 canonical 活动。" |
| 80 | 文案/数据常量 emptyState | "目前没有已发布的主办方活动可供展示。" |
| 81 | 文案/数据常量 eyebrow | "主办方" |
| 82 | 文案/数据常量 guardrail | "该页面只读取 Event Core 的公开活动记录，不会创建报名、通知参会者、写入日历或联系外部服务。" |
| 84 | 文案/数据常量 nextStep | "返回活动目录，从已发布活动进入主办方页面。" |
| 85 | 文案/数据常量 purpose | "公开主办方页面只展示已发布活动的 canonical 归属。" |
| 86 | 文案/数据常量 title | "主办方页面暂无活动" |
| 91 | 文案/数据常量 description | "Organizer page could not load canonical Event Core context." |
| 92 | 文案/数据常量 emptyState | "No organizer page was generated from a legacy catalogue or mock data." |
| 94 | 文案/数据常量 eyebrow | "Organizer" |
| 95 | 文案/数据常量 guardrail | "The failed route state stops before registration writes, notifications, calendar, email, AI, or outside network work." |
| 97 | 文案/数据常量 nextStep | "Confirm the canonical Event Core public catalogue is configured, then retry the organizer page." |
| 99 | 文案/数据常量 purpose | "Show a recoverable public organizer boundary without falling back to legacy landing data." |
| 101 | 文案/数据常量 title | "Organizer page could not load" |
| 104 | 文案/数据常量 description | "主办方页面暂时无法读取 Event Core 的 canonical 活动上下文。" |
| 105 | 文案/数据常量 emptyState | "页面没有使用旧目录或模拟数据生成主办方信息。" |
| 106 | 文案/数据常量 eyebrow | "主办方" |
| 107 | 文案/数据常量 guardrail | "失败状态会在报名写入、通知、日历、邮件、AI 或外部网络操作之前停止。" |
| 109 | 文案/数据常量 nextStep | "确认 Event Core 公开目录已配置后，再重试主办方页面。" |
| 110 | 文案/数据常量 purpose | "在不回退旧版或模拟数据的前提下提供可恢复边界。" |
| 111 | 文案/数据常量 title | "主办方页面暂时无法加载" |
| 116 | 文案/数据常量 description | "This public organizer identifier does not match a published canonical event." |
| 118 | 文案/数据常量 emptyState | "No first event, private event, legacy catalogue, or mock organizer was used as a fallback." |
| 120 | 文案/数据常量 eyebrow | "Organizer" |
| 121 | 文案/数据常量 guardrail | "This boundary reads only the canonical public catalogue. It does not read private events, create registrations, or trigger outside work." |
| 123 | 文案/数据常量 nextStep | "Return to events and open an organizer from a published event." |
| 124 | 文案/数据常量 purpose | "Keep public organizer identity bound to an exact published canonical event owner." |
| 126 | 文案/数据常量 title | "Organizer not found" |
| 129 | 文案/数据常量 description | "这个公开主办方标识没有匹配到已发布的 canonical 活动。" |
| 130 | 文案/数据常量 emptyState | "页面没有用首场活动、私有活动、旧目录或模拟主办方作为兜底。" |
| 131 | 文案/数据常量 eyebrow | "主办方" |
| 132 | 文案/数据常量 guardrail | "该边界只读取 canonical 公共活动目录，不会读取私有活动、创建报名或触发外部操作。" |
| 134 | 文案/数据常量 nextStep | "返回活动目录，从已发布活动进入主办方页面。" |
| 135 | 文案/数据常量 purpose | "公开主办方身份必须精确绑定到已发布活动的 canonical owner。" |
| 136 | 文案/数据常量 title | "未找到该主办方" |
| 143 | 文案/数据常量 label | "Return to events" |
| 144 | 文案/数据常量 recoveryCopy | "Open an event with published canonical context before retrying the organizer page." |
| 148 | 文案/数据常量 label | "返回活动" |
| 149 | 文案/数据常量 recoveryCopy | "从已发布活动进入主办方页面后再重试。" |

## repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx

源码：[orbit-real-organizer-public.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx>)

静态来源入口：`/app/o/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 62 | EventCard | h3 | name | h-section |
| 102 | OrbitRealOrganizerPublic | main |  |  |
| 112 | OrbitRealOrganizerPublic | h1 | viewModel.name | h-display |
| 122 | OrbitRealOrganizerPublic | h2 | t({ en: "Their events", zh: "TA 的活动" }) | h-section |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 51 | link/a · EventCard | {date.month} {&lt;div style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 19, fontWeight: 600, lineHeight: 1 }}&gt;{date.day}&lt;/div&gt;} / {null} {name} {&lt;div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}&gt;{[event.theme, event.host].filter(Boolean).join(" · ")}&lt;/div&gt;} / {null} {date.time} {&lt;div style={{ alignItems: "center", display: "flex", gap: 8 }}&gt;&lt;Icon color="var(--text-3)" name="pin" size={15} /&gt;{event.place}&lt;/div&gt;} / {null} {t({ en: `${event. …（完整表达式见源码） | productHref(`/events/${event.code}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 106 | link/a · OrbitRealOrganizerPublic | t({ en: "Back to events", zh: "返回活动" }) | /app/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 30 | 翻译 en | "TBD" |
| 30 | 翻译 zh | "待定" |
| 30 | 翻译 en | "Time TBD" |
| 30 | 翻译 zh | "时间待定" |
| 48 | 翻译 en | "RSVP" |
| 48 | 翻译 zh | "报名" |
| 48 | 翻译 en | "View" |
| 48 | 翻译 zh | "查看" |
| 71 | 翻译 en | `${event.participantCount} going` |
| 71 | 翻译 zh | `${event.participantCount} 人已报名` |
| 88 | 翻译 en | "Events hosted" |
| 88 | 翻译 zh | "举办活动" |
| 94 | 翻译 en | "Total attendees" |
| 94 | 翻译 zh | "累计参会" |
| 106 | 属性 aria-label | t({ en: "Back to events", zh: "返回活动" }) |
| 106 | 翻译 en | "Back to events" |
| 106 | 翻译 zh | "返回活动" |
| 106 | 翻译 en | "Back" |
| 106 | 翻译 zh | "返回" |
| 115 | 翻译 en | "Canonical organizer" |
| 115 | 翻译 zh | "已记录主办方" |
| 122 | 翻译 en | "Their events" |
| 122 | 翻译 zh | "TA 的活动" |

## repos/orbits/app/(app)/app/party/checkin/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/checkin/page.tsx>)

静态来源入口：`/app/party/checkin`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 51 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts

源码：[party-route-view-model.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts>)

静态来源入口：`/app/party`、`/app/party/checkin`、`/app/party/graph`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 151 | 翻译 en | "The selected event is available, but no reviewed attendee or recommendation context is ready for Party mode." |
| 152 | 翻译 zh | "已找到所选活动，但还没有可供 Party 模式使用的已复核参会者或推荐上下文。" |
| 155 | 翻译 en | "No event has been selected for Party mode." |
| 156 | 翻译 zh | "尚未选择要进入 Party 模式的活动。" |
| 160 | 翻译 en | "The Party screen stays hidden until this event has source-backed people context." |
| 161 | 翻译 zh | "在这场活动具备有来源的人物上下文前，Party 界面会保持隐藏。" |
| 164 | 翻译 en | "The Party screen stays hidden until an event with source-backed people context is selected." |
| 165 | 翻译 zh | "在选择具备有来源人物上下文的活动前，Party 界面会保持隐藏。" |
| 169 | 翻译 en | "Review or import attendee context for this event before retrying Party mode." |
| 170 | 翻译 zh | "先复核或导入这场活动的参会者上下文，再重试 Party 模式。" |
| 173 | 翻译 en | "Open an event with reviewed attendee context before entering Party mode." |
| 174 | 翻译 zh | "先打开一场具备已复核参会者上下文的活动，再进入 Party 模式。" |
| 180 | 文案/数据常量 eyebrow | "Party" |
