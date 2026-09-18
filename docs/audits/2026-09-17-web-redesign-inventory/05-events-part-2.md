| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 41 | 翻译 en | "Record an encounter" |
| 41 | 翻译 zh | "记录一次真实交流" |
| 42 | 翻译 en | "Only your explicit input is recorded. Check-in and table placement never imply that you talked." |
| 42 | 翻译 zh | "只记录你明确填写的内容；签到或同桌不会被推断为已经交流。" |
| 43 | 属性 aria-label | t({ en: "Did you talk?", zh: "是否聊过" }) |
| 43 | 翻译 en | "Did you talk?" |
| 43 | 翻译 zh | "是否聊过" |
| 43 | 翻译 en | "Yes, we talked" |
| 43 | 翻译 zh | "是，聊过" |
| 43 | 翻译 en | "No" |
| 43 | 翻译 zh | "没有" |
| 43 | 翻译 en | "Not sure" |
| 43 | 翻译 zh | "不确定" |
| 44 | 属性 placeholder | t({ en: "What was actually discussed?", zh: "实际聊了什么？" }) |
| 44 | 属性 aria-label | t({ en: "Encounter note", zh: "交流记录" }) |
| 44 | 翻译 en | "Encounter note" |
| 44 | 翻译 zh | "交流记录" |
| 44 | 翻译 en | "What was actually discussed?" |
| 44 | 翻译 zh | "实际聊了什么？" |
| 45 | 属性 placeholder | t({ en: "One commitment per line", zh: "每行一项承诺" }) |
| 45 | 属性 aria-label | t({ en: "Commitments", zh: "双方承诺" }) |
| 45 | 翻译 en | "Commitments" |
| 45 | 翻译 zh | "双方承诺" |
| 45 | 翻译 en | "One commitment per line" |
| 45 | 翻译 zh | "每行一项承诺" |
| 46 | 属性 placeholder | t({ en: "Concrete next action", zh: "明确的下一步行动" }) |
| 46 | 属性 aria-label | t({ en: "Next step", zh: "下一步" }) |
| 46 | 翻译 en | "Next step" |
| 46 | 翻译 zh | "下一步" |
| 46 | 翻译 en | "Concrete next action" |
| 46 | 翻译 zh | "明确的下一步行动" |
| 47 | 属性 placeholder | t({ en: "Comma-separated tags", zh: "用逗号分隔标签" }) |
| 47 | 属性 aria-label | t({ en: "Tags", zh: "标签" }) |
| 47 | 翻译 en | "Tags" |
| 47 | 翻译 zh | "标签" |
| 47 | 翻译 en | "Comma-separated tags" |
| 47 | 翻译 zh | "用逗号分隔标签" |
| 48 | 翻译 en | "Privacy: private to you. Relationship sharing is not configured." |
| 48 | 翻译 zh | "隐私：仅自己可见；关系共享尚未配置。" |
| 49 | 翻译 en | "Save encounter" |
| 49 | 翻译 zh | "保存交流记录" |
| 50 | 翻译 en | "Saved. Timeline projection is pending." |
| 50 | 翻译 zh | "已保存，正在投影到联系人时间线。" |
| 51 | 翻译 en | "Save failed; no placeholder was created." |
| 51 | 翻译 zh | "保存失败，未创建任何占位记录。" |

## repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx

源码：[orbit-event-matchmaking.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx>)

静态来源入口：`/app/events/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 355 | ParticipantDetailPanel | header |  |  |
| 362 | ParticipantDetailPanel | h3 | detail.displayName | h-section |
| 375 | ParticipantDetailPanel | section | detail.recommendation.icebreakers.length ? ( &lt;p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}&gt; &lt;strong&gt;{t({ en: "Opening", zh: "开场建议" })}：&lt;/strong&gt;{detail.recommendation.icebreakers.join(" · ")} &lt;/p&gt; ) : null | card-flat |
| 392 | ParticipantDetailPanel | section | detail.placements.map((placement) =&gt; ( &lt;div className="card-flat" key={`${placement.roundNumber}-${placement.tableNumber}`} style={{ display: "grid", gap: 6, padding: 12 }}&gt; &lt;div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}&gt; &lt;span className="chip"&gt;{t({ en: `Round ${placement.roundNumber}`, zh: `第 ${placement.r …（完整表达式见源码） |  |
| 409 | ParticipantDetailPanel | section | detail.responses.length ? detail.responses.map((response) =&gt; ( &lt;div key={response.fieldKey} style={{ borderTop: "1px solid var(--border)", paddingTop: 9 }}&gt; &lt;div style={{ color: "var(--text-3)", fontSize: 12 }}&gt;{response.label[language]}&lt;/div&gt; {response.prompt ? &lt;div style={{ color: "var(--text-3)", fontSize: 12, margi …（完整表达式见源码） |  |
| 420 | ParticipantDetailPanel | footer | contact.status === "none" ? ( &lt;button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={busy \|\| !contactRequestsOpen} onClick={() =&gt; void onRequest(detail.participantId, null)} type="button"&gt; {contactRequestsOpen ? t({ en: "Request business card", zh: "申请交换名片" }) : t({ en: "C …（完整表达式见源码） |  |
| 666 | OrbitEventMatchmaking | section | loading ? &lt;p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}&gt;{t({ en: "Loading the published result…", zh: "正在读取已发布结果…" })}&lt;/p&gt; : null unauthorized ? ( &lt;div className="card-flat" style={{ display: "grid", gap: 9, padding: 14 }}&gt; &lt;p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}&gt;{t({ en: "Only c …（完整表达式见源码） | card |
| 669 | OrbitEventMatchmaking | h3 | t({ en: "People worth meeting", zh: "值得认识的人" }) | h-section |
| 727 | OrbitEventMatchmaking | section | directoryOpen && workspace.directory.length ? ( &lt;div className="orbit-attendee-search"&gt; &lt;Icon color="var(--text-3)" name="search" size={17} /&gt; &lt;input aria-label={t({ en: "Search participants", zh: "搜索参会者" })} onChange={(event) =&gt; setDirectoryQuery(event.target.value)} placeholder={t({ en: "Name, company, or what they a …（完整表达式见源码） | card-flat |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 508 | [dialogHost, setDialogHost] = useState&lt;HTMLElement \| null&gt;(null) |
| 513 | [workspace, setWorkspace] = useState&lt;OperationsWorkspace \| null&gt;(null) |
| 514 | [detail, setDetail] = useState&lt;ParticipantDetail \| null&gt;(null) |
| 515 | [directoryOpen, setDirectoryOpen] = useState(false) |
| 516 | [directoryQuery, setDirectoryQuery] = useState("") |
| 517 | [loading, setLoading] = useState(authenticated) |
| 518 | [unauthorized, setUnauthorized] = useState(!authenticated) |
| 519 | [authenticationRequired, setAuthenticationRequired] = useState(!authenticated) |
| 520 | [error, setError] = useState("") |
| 521 | [working, setWorking] = useState&lt;string \| null&gt;(null) |
| 585 | [focusParticipantId] = useState&lt;string \| null&gt;(() =&gt; typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("participant"), ) |
| 590 | [focusConsumed, setFocusConsumed] = useState(false) |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 320 | dialog | t({ en: "Participant detail", zh: "参会者详情" }) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 107 | button/button · CandidateContactAction | Request business card / 申请交换名片 | onclick: () =&gt; void onRequest(participantId, null) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 123 | button/button · CandidateContactAction | Withdraw request / 撤回申请 | onclick: () =&gt; void onWithdraw(request.requestId, request.revision) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 130 | link/a · CandidateContactAction | Open contact / 打开联系人 | request.contactId ? `/app/contacts/${encodeURIComponent(request.contactId)}` : "/app/contacts" | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 146 | button/button · CandidateContactAction | contactRequestsOpen ? undefined : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请交换联系方式" }) | onclick: () =&gt; void onRequest(participantId, request.revision) | {"disabled":"busy \|\| !contactRequestsOpen","renderGateProps":[],"conditions":[]} |
| 320 | callback-control/div · ParticipantDetailPanel | t({ en: "Participant detail", zh: "参会者详情" }) | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 340 | callback-control/article · ParticipantDetailPanel | PUBLISHED EVENT PROFILE / 已发布活动画像 / EVENT PROFILE / 活动画像 {detail.displayName} {[detail.role, detail.company, detail.industry].filter(Boolean).join(" · ")} {&lt;section className="card-flat" style={{ display: "grid", gap: 9, padding: 14 }}&gt; &lt;div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}&gt; &lt;strong&gt;{t({ en: "Why Orbit recommends this person", zh: "Orbit 为什么推荐 TA" })}&lt;/strong&gt; &lt;span className="chip"&gt;{detail.recommendation.score}&lt;/span&gt; &lt;/div&gt; …（完整表达式见源码） | onclick: (event) =&gt; event.stopPropagation() | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 369 | button/button · ParticipantDetailPanel | t({ en: "Close", zh: "关闭" }) | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 422 | button/button · ParticipantDetailPanel | Request business card / 申请交换名片 / Contact requests open when the event starts / 活动开始后可申请交换联系 | onclick: () =&gt; void onRequest(detail.participantId, null) | {"disabled":"busy \|\| !contactRequestsOpen","renderGateProps":[],"conditions":[]} |
| 430 | button/button · ParticipantDetailPanel | Accept / 同意交换 | onclick: () =&gt; void onRespond(contact.requestId!, true, contact.revision!) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 433 | button/button · ParticipantDetailPanel | Decline / 暂不交换 | onclick: () =&gt; void onRespond(contact.requestId!, false, contact.revision!) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 439 | button/button · ParticipantDetailPanel | Withdraw request / 撤回申请 | onclick: () =&gt; void onWithdraw(contact.requestId!, contact.revision!) | {"disabled":"busy","renderGateProps":[],"conditions":[]} |
| 440 | link/a · ParticipantDetailPanel | Open contact / 打开联系人 | contact.contactId ? `/app/contacts/${encodeURIComponent(contact.contactId)}` : "/app/contacts" | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 442 | button/button · ParticipantDetailPanel | Request again / 再次申请 / Contact requests open when the event starts / 活动开始后可再次申请 | onclick: () =&gt; void onRequest(detail.participantId, contact.revision) | {"disabled":"busy \|\| !contactRequestsOpen","renderGateProps":[],"conditions":[]} |
| 677 | link/a · OrbitEventMatchmaking | Complete registration / 完成报名 | `/app/events/${encodeURIComponent(eventId)}/register` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 677 | link/a · OrbitEventMatchmaking | Sign in / 登录 | `/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}`)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 696 | button/button · OrbitEventMatchmaking | t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` }) | onclick: () =&gt; void openParticipant(participant.participantId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 708 | button/button · OrbitEventMatchmaking | View evidence and profile / 查看依据与画像 | onclick: () =&gt; void openParticipant(participant.participantId) | {"disabled":"working === `detail:${participant.participantId}`","renderGateProps":[],"conditions":[]} |
| 742 | button/button · OrbitEventMatchmaking | Collapse / 收起 / Show participants / 展开参会者 | onclick: () =&gt; setDirectoryOpen((open) =&gt; !open) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 756 | field/input · OrbitEventMatchmaking | t({ en: "Search participants", zh: "搜索参会者" }) | onchange: (event) =&gt; setDirectoryQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 803 | button/button · OrbitEventMatchmaking | t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` }) | onclick: () =&gt; void openParticipant(participant.participantId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 848 | callback-control/ParticipantDetailPanel · OrbitEventMatchmaking |  | onclose: () =&gt; setDetail(null) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 536 | OrbitEventMatchmaking | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/operations` |
| 536 | OrbitEventMatchmaking | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations` |
| 618 | openParticipant | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(participantId)}` |
| 618 | openParticipant | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(participantId)}` |
| 633 | mutateContact | 调用 | POST | url |
| 650 | requestContact | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests` |
| 655 | respondContact | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/respond` |
| 660 | withdrawContact | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/withdraw` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 96 | 属性 title | t({ en: "Contact requests open when the event starts", zh: "活动开始后可申请交换联系方式" }) |
| 99 | 翻译 en | "Contact requests open when the event starts" |
| 99 | 翻译 zh | "活动开始后可申请交换联系方式" |
| 102 | 翻译 en | "Opens at start" |
| 102 | 翻译 zh | "活动开始后开放" |
| 114 | 翻译 en | "Request business card" |
| 114 | 翻译 zh | "申请交换名片" |
| 122 | 翻译 en | "Waiting for their consent" |
| 122 | 翻译 zh | "等待对方同意" |
| 123 | 翻译 en | "Withdraw request" |
| 123 | 翻译 zh | "撤回申请" |
| 137 | 翻译 en | "Open contact" |
| 137 | 翻译 zh | "打开联系人" |
| 145 | 翻译 en | "Request withdrawn" |
| 145 | 翻译 zh | "申请已撤回" |
| 146 | 属性 title | contactRequestsOpen ? undefined : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请交换联系方式" }) |
| 146 | 翻译 en | "Contact requests open when the event starts" |
| 146 | 翻译 zh | "活动开始后可再次申请交换联系方式" |
| 146 | 翻译 en | "Request again" |
| 146 | 翻译 zh | "再次申请" |
| 146 | 翻译 en | "Opens at start" |
| 146 | 翻译 zh | "活动开始后开放" |
| 156 | 翻译 en | "Request declined" |
| 156 | 翻译 zh | "对方暂不交换" |
| 320 | 属性 aria-label | t({ en: "Participant detail", zh: "参会者详情" }) |
| 321 | 翻译 en | "Participant detail" |
| 321 | 翻译 zh | "参会者详情" |
| 359 | 翻译 en | "PUBLISHED EVENT PROFILE" |
| 359 | 翻译 zh | "已发布活动画像" |
| 360 | 翻译 en | "EVENT PROFILE" |
| 360 | 翻译 zh | "活动画像" |
| 369 | 属性 aria-label | t({ en: "Close", zh: "关闭" }) |
| 369 | 翻译 en | "Close" |
| 369 | 翻译 zh | "关闭" |
| 377 | 翻译 en | "Why Orbit recommends this person" |
| 377 | 翻译 zh | "Orbit 为什么推荐 TA" |
| 385 | 翻译 en | "Opening" |
| 385 | 翻译 zh | "开场建议" |
| 393 | 翻译 en | "Table and seat" |
| 393 | 翻译 zh | "分桌与座位" |
| 397 | 翻译 en | `Round ${placement.roundNumber}` |
| 397 | 翻译 zh | `第 ${placement.roundNumber} 轮` |
| 398 | 翻译 en | `Table ${placement.tableNumber}` |
| 398 | 翻译 zh | `${placement.tableNumber} 号桌` |
| 399 | 翻译 en | `Seat ${placement.seat}` |
| 399 | 翻译 zh | `座位 ${placement.seat}` |
| 410 | 翻译 en | "Registration profile" |
| 410 | 翻译 zh | "报名画像" |
| 417 | 翻译 en | "No shareable profile answers." |
| 417 | 翻译 zh | "暂无可展示的画像回答。" |
| 424 | 翻译 en | "Request business card" |
| 424 | 翻译 zh | "申请交换名片" |
| 425 | 翻译 en | "Contact requests open when the event starts" |
| 425 | 翻译 zh | "活动开始后可申请交换联系" |
| 431 | 翻译 en | "Accept" |
| 431 | 翻译 zh | "同意交换" |
| 434 | 翻译 en | "Decline" |
| 434 | 翻译 zh | "暂不交换" |
| 438 | 翻译 en | "Waiting for consent. Contact details remain hidden." |
| 438 | 翻译 zh | "等待对方同意，联系方式仍保持隐藏。" |
| 439 | 翻译 en | "Withdraw request" |
| 439 | 翻译 zh | "撤回申请" |
| 440 | 翻译 en | "Open contact" |
| 440 | 翻译 zh | "打开联系人" |
| 441 | 翻译 en | "This request was declined." |
| 441 | 翻译 zh | "这次名片申请已被婉拒。" |
| 442 | 翻译 en | "This request was withdrawn." |
| 442 | 翻译 zh | "这次名片申请已撤回。" |
| 442 | 翻译 en | "Request again" |
| 442 | 翻译 zh | "再次申请" |
| 442 | 翻译 en | "Contact requests open when the event starts" |
| 442 | 翻译 zh | "活动开始后可再次申请" |
| 524 | 翻译 en | "The published event operations data is temporarily unavailable." |
| 525 | 翻译 zh | "当前活动的已发布运营数据暂时不可用。" |
| 668 | JSX文字 | ORBIT MATCH |
| 669 | 翻译 en | "People worth meeting" |
| 669 | 翻译 zh | "值得认识的人" |
| 670 | 翻译 en | "Matched from both sides' registration profiles, with the evidence behind every suggestion." |
| 670 | 翻译 zh | "根据双方报名画像匹配，每条推荐都能查看依据。" |
| 673 | 翻译 en | "Loading the published result…" |
| 673 | 翻译 zh | "正在读取已发布结果…" |
| 676 | 翻译 en | "Only confirmed participants can see event matching." |
| 676 | 翻译 zh | "只有已确认报名的参与者可以查看活动匹配。" |
| 677 | 翻译 en | "Complete registration" |
| 677 | 翻译 zh | "完成报名" |
| 677 | 翻译 en | "Sign in" |
| 677 | 翻译 zh | "登录" |
| 681 | 翻译 en | "Results are not open yet" |
| 681 | 翻译 zh | "匹配结果尚未开放" |
| 681 | 翻译 en | `Available at ${formatGate(workspace.configuration.resultsAvailableAt)}.` |
| 681 | 翻译 zh | `将在 ${formatGate(workspace.configuration.resultsAvailableAt)} 开放。` |
| 682 | 翻译 en | "AI matching is being generated" |
| 682 | 翻译 zh | "AI 匹配正在生成" |
| 682 | 翻译 en | "The organizer has not published a result. No fallback list is shown." |
| 682 | 翻译 zh | "主办方尚未发布结果，因此不会展示备用名单。" |
| 683 | 翻译 en | "Generation failed" |
| 683 | 翻译 zh | "匹配生成失败" |
| 683 | 翻译 en | "The organizer can retry. Orbit will not synthesize a replacement." |
| 683 | 翻译 zh | "主办方可以重试；Orbit 不会合成替代结果。" |
| 684 | 翻译 en | "Matching has not been generated" |
| 684 | 翻译 zh | "尚未生成匹配" |
| 684 | 翻译 en | "Wait for the organizer to run and publish the AI result." |
| 684 | 翻译 zh | "请等待主办方运行并发布 AI 结果。" |
| 696 | 属性 aria-label | t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` }) |
| 696 | 翻译 en | `Open ${participant.displayName}'s profile` |
| 696 | 翻译 zh | `打开 ${participant.displayName} 的画像` |
| 699 | 翻译 en | `Match ${recommendation.score}` |
| 699 | 翻译 zh | `匹配 ${recommendation.score}` |
| 703 | 翻译 en | `+ ${recommendation.reasons.length - 2} more reasons — open the profile for full evidence` |
| 703 | 翻译 zh | `还有 ${recommendation.reasons.length - 2} 条匹配依据，点击查看完整画像` |
| 708 | 翻译 en | "View evidence and profile" |
| 708 | 翻译 zh | "查看依据与画像" |
| 722 | 翻译 en | "The published result contains no recommendation for you." |
| 722 | 翻译 zh | "已发布结果中没有适合你的推荐。" |
| 734 | 翻译 en | `All participants · ${workspace.directory.length}` |
| 734 | 翻译 zh | `全部参会者 · ${workspace.directory.length}` |
| 737 | 翻译 en | "Everyone who has confirmed their registration. Open a card to read what they wrote about themselves." |
| 738 | 翻译 zh | "所有已确认报名的人都在这里。点开卡片可以看到 TA 自己填写的介绍。" |
| 749 | 翻译 en | "Collapse" |
| 749 | 翻译 zh | "收起" |
| 750 | 翻译 en | "Show participants" |
| 750 | 翻译 zh | "展开参会者" |
| 756 | 属性 placeholder | t({ en: "Name, company, or what they are looking for", zh: "姓名、公司，或 TA 想找的事" }) |
| 756 | 属性 aria-label | t({ en: "Search participants", zh: "搜索参会者" }) |
| 757 | 翻译 en | "Search participants" |
| 757 | 翻译 zh | "搜索参会者" |
| 759 | 翻译 en | "Name, company, or what they are looking for" |
| 759 | 翻译 zh | "姓名、公司，或 TA 想找的事" |
| 765 | 翻译 en | `${directoryMatches.length} of ${workspace.directory.length}` |
| 765 | 翻译 zh | `${directoryMatches.length} / ${workspace.directory.length} 人` |
| 774 | 翻译 en | `No participant matches "${directoryQuery.trim()}". Try a company, an industry, or part of a name.` |
| 775 | 翻译 zh | `没有匹配「${directoryQuery.trim()}」的参会者。可以试试公司、行业，或名字的一部分。` |
| 778 | 翻译 en | "No confirmed registration profiles yet." |
| 779 | 翻译 zh | "还没有已确认报名的参会者。" |
| 803 | 属性 aria-label | t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` }) |
| 804 | 翻译 en | `Open ${participant.displayName}'s profile` |
| 804 | 翻译 zh | `打开 ${participant.displayName} 的画像` |
| 816 | 属性 title | participant.displayName |
| 817 | 翻译 en | "You" |
| 817 | 翻译 zh | "你" |
| 819 | 属性 title | role |
| 822 | 属性 title | domain |

## repos/orbits/app/(app)/app/events/[id]/orbit-post-event-center.tsx

源码：[orbit-post-event-center.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-post-event-center.tsx>)

静态来源入口：`/app/events/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 200 | OrbitPostEventCenter | section |  | card-flat |
| 202 | OrbitPostEventCenter | h4 | t({ en: "Post-event center", zh: "会后中心" }) |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 54 | [encounters, setEncounters] = useState(0) |
| 55 | [completedMeetings, setCompletedMeetings] = useState(0) |
| 56 | [aiState, setAiState] = useState&lt;AiArtifactState&gt;("checking") |
| 57 | [aiFailureCode, setAiFailureCode] = useState&lt;string \| null&gt;(null) |
| 58 | [artifact, setArtifact] = useState&lt;ReadyArtifact \| null&gt;(null) |
| 59 | [followups, setFollowups] = useState&lt;readonly ConfirmedFollowupView[]&gt;([]) |
| 60 | [followupState, setFollowupState] = useState&lt;"loading" \| "ready" \| "failed"&gt;("loading") |
| 61 | [confirmingFollowup, setConfirmingFollowup] = useState&lt;string \| null&gt;(null) |
| 62 | [followupDueAt, setFollowupDueAt] = useState("") |
| 63 | [followupError, setFollowupError] = useState&lt;string \| null&gt;(null) |
| 64 | [savingFollowup, setSavingFollowup] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 203 | link/a · OrbitPostEventCenter | View full event report / 查看完整活动报告 | `/app/events/${encodeURIComponent(eventId)}/analytics` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 226 | link/a · OrbitPostEventCenter | {followup.contactDisplayName ?? followup.contactId} | confirmedFollowupContactHref(followup) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 227 | button/button · OrbitPostEventCenter | Repair task or reminder / 补全任务或提醒 / Create follow-up / 创建跟进 | onclick: () =&gt; { setConfirmingFollowup(key); setFollowupDueAt(""); setFollowupError(null); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 229 | link/a · OrbitPostEventCenter | Open task center / 打开任务中心 | followup.taskHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 233 | field/input · OrbitPostEventCenter | Due time (optional; defaults to 3 days from now) / 到期时间（可选；留空则默认三天后） | onchange: (event) =&gt; setFollowupDueAt(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 235 | button/button · OrbitPostEventCenter | Creating… / 正在创建… / Confirm task + in-app reminder / 确认创建任务 + 站内提醒 | onclick: () =&gt; void confirmFollowup(followup) | {"disabled":"savingFollowup","renderGateProps":[],"conditions":[]} |
| 235 | button/button · OrbitPostEventCenter | Cancel / 取消 | onclick: () =&gt; { setConfirmingFollowup(null); setFollowupError(null); } | {"disabled":"savingFollowup","renderGateProps":[],"conditions":[]} |
| 248 | button/button · OrbitPostEventCenter | Record an encounter first / 请先记录真实交流 / Request AI review / 请求 AI 复盘 | onclick: () =&gt; void requestArtifact() | {"disabled":"encounters === 0","renderGateProps":[],"conditions":[]} |
| 258 | button/button · OrbitPostEventCenter | Record an encounter first / 请先记录真实交流 / Retry AI review / 重试 AI 复盘 | onclick: () =&gt; void requestArtifact() | {"disabled":"encounters === 0","renderGateProps":[],"conditions":[]} |
| 268 | button/button · OrbitPostEventCenter | Regenerate AI review / 重新生成 AI 复盘 | onclick: () =&gt; void requestArtifact() | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 102 | requestArtifact | 调用 | POST | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |
| 102 | requestArtifact | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |
| 121 | confirmFollowup | 调用 | POST | `/api/events/${encodeURIComponent(eventId)}/post-event/followups` |
| 121 | confirmFollowup | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/post-event/followups` |
| 145 | OrbitPostEventCenter | 调用 | GET/由封装决定 | `/api/encounters?eventId=${encodeURIComponent(eventId)}` |
| 145 | OrbitPostEventCenter | 路径常量 | 见调用/handler | `/api/encounters?eventId=${encodeURIComponent(eventId)}` |
| 146 | OrbitPostEventCenter | 调用 | GET/由封装决定 | "/api/appointments" |
| 146 | OrbitPostEventCenter | 路径常量 | 见调用/handler | "/api/appointments" |
| 147 | OrbitPostEventCenter | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |
| 147 | OrbitPostEventCenter | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |
| 148 | OrbitPostEventCenter | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/post-event/followups` |
| 148 | OrbitPostEventCenter | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/post-event/followups` |
| 170 | OrbitPostEventCenter | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |
| 170 | OrbitPostEventCenter | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/post-event/artifact` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 120 | 翻译 en | "Choose a valid due time." |
| 120 | 翻译 zh | "请选择有效的到期时间。" |
| 132 | 翻译 en | "Follow-up creation failed." |
| 132 | 翻译 zh | "创建跟进失败。" |
| 138 | 翻译 en | "Follow-up creation failed." |
| 138 | 翻译 zh | "创建跟进失败。" |
| 177 | 翻译 en | "The AI review becomes available after this event ends. There is nothing to retry yet." |
| 177 | 翻译 zh | "活动结束后才会开放 AI 会后复盘，目前无需重试。" |
| 179 | 翻译 en | "No AI review has been requested for your current encounter evidence." |
| 179 | 翻译 zh | "尚未基于你当前的交流证据发起 AI 会后复盘。" |
| 181 | 翻译 en | "The AI provider is not configured. No fallback or generated prose is shown." |
| 181 | 翻译 zh | "AI 服务尚未配置；不会展示备用文案或伪生成内容。" |
| 183 | 翻译 en | "The AI artifact service is temporarily unavailable. No request was submitted and no fallback is shown." |
| 183 | 翻译 zh | "AI 产物服务暂时不可用；本次未提交生成请求，也不会展示备用文案。" |
| 185 | 翻译 en | "Record a confirmed conversation with a note, next step, or commitment before requesting an AI review." |
| 185 | 翻译 zh | "请先记录一段已确认的真实交流，并填写笔记、下一步或承诺，再发起 AI 复盘。" |
| 187 | 翻译 en | "The real AI review is queued. Your evidence remains available while you wait." |
| 187 | 翻译 zh | "真实 AI 复盘正在排队；等待期间交流证据仍可查看。" |
| 189 | 翻译 en | "Real AI generation is running. No draft is exposed before it is stored and ready." |
| 189 | 翻译 zh | "真实 AI 正在生成；产物存储并就绪前不展示草稿。" |
| 191 | 翻译 en | "A provider-generated review is ready from your permitted evidence." |
| 191 | 翻译 zh | "基于你有权访问的证据，真实 AI 复盘已就绪。" |
| 193 | 翻译 en | "Checking AI review state…" |
| 193 | 翻译 zh | "正在检查 AI 复盘状态…" |
| 195 | 翻译 en | "The AI provider rejected or stopped this generation. No fallback was created; retry after the provider issue is resolved." |
| 195 | 翻译 zh | "AI 服务拒绝或中止了本次生成。系统未创建备用内容；请在服务问题解决后重试。" |
| 197 | 翻译 en | "The stored artifact did not pass evidence policy checks and was not shown. No fallback was created." |
| 197 | 翻译 zh | "已存储产物未通过证据策略校验，因此未展示；系统未创建备用内容。" |
| 198 | 翻译 en | "AI generation failed. No fallback or fabricated prose is shown." |
| 198 | 翻译 zh | "AI 生成失败；不会展示备用或虚构文案。" |
| 202 | JSX文字 | POST-EVENT |
| 202 | 翻译 en | "Post-event center" |
| 202 | 翻译 zh | "会后中心" |
| 208 | 翻译 en | "View full event report" |
| 208 | 翻译 zh | "查看完整活动报告" |
| 211 | 翻译 en | "accepted contacts" |
| 211 | 翻译 zh | "已交换名片" |
| 211 | 翻译 en | "encounters" |
| 211 | 翻译 zh | "真实交流记录" |
| 211 | 翻译 en | "completed meetings" |
| 211 | 翻译 zh | "已完成约谈" |
| 212 | 翻译 en | `Evidence progress ${evidenceDone}/3` |
| 212 | 翻译 zh | `证据完成度 ${evidenceDone}/3` |
| 212 | 属性 aria-label | t({ en: "Evidence progress", zh: "证据完成度" }) |
| 212 | 翻译 en | "Evidence progress" |
| 212 | 翻译 zh | "证据完成度" |
| 214 | 翻译 en | "Turn meeting evidence into a follow-up" |
| 214 | 翻译 zh | "把会上证据变成跟进" |
| 214 | 翻译 en | "Choose a next step or commitment that you recorded. Orbit creates a private task and an in-app reminder only after you confirm." |
| 214 | 翻译 zh | "选择你亲自记录的下一步或承诺。只有再次确认后，Orbit 才会创建私有任务和站内提醒。" |
| 215 | 翻译 en | "Loading recorded evidence…" |
| 215 | 翻译 zh | "正在读取已记录证据…" |
| 216 | 翻译 en | "Follow-up evidence is temporarily unavailable. No task was created." |
| 216 | 翻译 zh | "跟进证据暂时不可用，未创建任何任务。" |
| 217 | 翻译 en | "Record an explicit next step or commitment after a real conversation to create a follow-up here." |
| 217 | 翻译 zh | "请在真实交流记录中填写明确的下一步或承诺，随后可在这里创建跟进。" |
| 222 | 翻译 en | "open" |
| 222 | 翻译 zh | "进行中" |
| 222 | 翻译 en | "scheduled" |
| 222 | 翻译 zh | "已排期" |
| 222 | 翻译 en | "completed" |
| 222 | 翻译 zh | "已完成" |
| 222 | 翻译 en | "dismissed" |
| 222 | 翻译 zh | "已忽略" |
| 222 | 翻译 en | "missing" |
| 222 | 翻译 zh | "缺失" |
| 223 | 翻译 en | "pending" |
| 223 | 翻译 zh | "待触发" |
| 223 | 翻译 en | "sent" |
| 223 | 翻译 zh | "已发送" |
| 223 | 翻译 en | "failed" |
| 223 | 翻译 zh | "失败" |
| 223 | 翻译 en | "dismissed" |
| 223 | 翻译 zh | "已忽略" |
| 223 | 翻译 en | "missing" |
| 223 | 翻译 zh | "缺失" |
| 226 | 翻译 en | "NEXT STEP" |
| 226 | 翻译 zh | "下一步" |
| 226 | 翻译 en | "COMMITMENT" |
| 226 | 翻译 zh | "承诺" |
| 227 | 翻译 en | "Created" |
| 227 | 翻译 zh | "已创建" |
| 227 | 翻译 en | "Completed" |
| 227 | 翻译 zh | "已完成" |
| 227 | 翻译 en | "Dismissed" |
| 227 | 翻译 zh | "已忽略" |
| 227 | 翻译 en | "Repair task or reminder" |
| 227 | 翻译 zh | "补全任务或提醒" |
| 227 | 翻译 en | "Create follow-up" |
| 227 | 翻译 zh | "创建跟进" |
| 229 | 翻译 en | `Task ${taskStatusLabel} · in-app reminder ${reminderStatusLabel} · ${followup.dueAt ? new Date(followup.dueAt).toLocaleString() : "due time unavailable"}` |
| 229 | 翻译 zh | `任务${taskStatusLabel} · 站内提醒${reminderStatusLabel} · ${followup.dueAt ? new Date(followup.dueAt).toLocaleString() : "到期时间不可用"}` |
| 229 | 翻译 en | "Open task center" |
| 229 | 翻译 zh | "打开任务中心" |
| 231 | 翻译 en | "Confirm creating a real task and reminder" |
| 231 | 翻译 zh | "确认创建真实任务和提醒" |
| 232 | 翻译 en | "The source text is re-read from your event encounter on the server. This will not message the other attendee or use an external delivery channel." |
| 232 | 翻译 zh | "服务端会重新读取你在本活动中的交流证据；不会给对方发消息，也不会调用外部投递渠道。" |
| 233 | 翻译 en | "Due time (optional; defaults to 3 days from now)" |
| 233 | 翻译 zh | "到期时间（可选；留空则默认三天后）" |
| 235 | 翻译 en | "Creating…" |
| 235 | 翻译 zh | "正在创建…" |
| 235 | 翻译 en | "Confirm task + in-app reminder" |
| 235 | 翻译 zh | "确认创建任务 + 站内提醒" |
| 235 | 翻译 en | "Cancel" |
| 235 | 翻译 zh | "取消" |
| 246 | 翻译 en | "AI review" |
| 246 | 翻译 zh | "AI 会后复盘" |
| 256 | 翻译 en | "Record an encounter first" |
| 256 | 翻译 zh | "请先记录真实交流" |
| 256 | 翻译 en | "Request AI review" |
| 256 | 翻译 zh | "请求 AI 复盘" |
| 266 | 翻译 en | "Record an encounter first" |
| 266 | 翻译 zh | "请先记录真实交流" |
| 266 | 翻译 en | "Retry AI review" |
| 266 | 翻译 zh | "重试 AI 复盘" |
| 268 | 翻译 en | "Message draft" |
| 268 | 翻译 zh | "消息草稿" |
| 268 | 翻译 en | "Regenerate AI review" |
| 268 | 翻译 zh | "重新生成 AI 复盘" |

## repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx

源码：[orbit-real-event-detail.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx>)

静态来源入口：`/app/events/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 346 | EventDetailsExtra | section |  |  |
| 347 | EventDetailsExtra | h3 | t({ en: "About this event", zh: "关于活动" }) |  |
| 359 | EventDetailsExtra | section |  |  |
| 360 | EventDetailsExtra | h3 | t({ en: "Agenda", zh: "活动议程" }) |  |
| 423 | RegistrationPreview | h4 | t({ en: "People matched for you · sample", zh: "为你推荐的人 · 示例" }) |  |
| 435 | RegistrationPreview | h4 | t({ en: "Your seat · sample", zh: "你的座位 · 示例" }) |  |
| 439 | RegistrationPreview | h4 | t({ en: "Opener suggestion · sample", zh: "开场白建议 · 示例" }) |  |
| 486 | EventInfoCard | section | t({ en: "Event information", zh: "活动信息" }) | card cardA |
| 493 | EventInfoCard | h1 | mini.name | h-display a-title |
| 569 | OnsiteCard | section | t({ en: "On-site", zh: "活动现场" }) | cardB |
| 597 | OnsiteCard | h4 | t({ en: "My seat", zh: "我的座位" }) |  |
| 624 | PostEventCard | section | t({ en: "Post-event center", zh: "会后中心" }) | card cardC |
| 626 | PostEventCard | h3 | t({ en: "Post-event center", zh: "会后中心" }) | h-display c-title |
| 708 | OrbitRealEventDetail | main |  |  |
| 721 | OrbitRealEventDetail | aside |  | orbit-detail-rail |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 376 | [nowTick, setNowTick] = useState(() =&gt; Date.now()) |
| 468 | [open, setOpen] = useState(stage === "pre") |
| 566 | [reviewOpen, setReviewOpen] = useState(false) |
| 664 | [summary, setSummary] = useState&lt;EventMatchmakingSummary \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 138 | button/button · BackButton | t({ en: "Back to previous page", zh: "返回上一页" }) | onclick: goBack | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 160 | button/button · ActionButton | {children} | onclick: href && !disabled ? () =&gt; { onBeforeNavigate?.(); window.location.href = href; } : undefined | {"disabled":"disabled","renderGateProps":[],"conditions":[]} |
| 277 | link/a · OrganizerRailCard | {body} | productHref(`/o/${slug}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 496 | button/button · EventInfoCard | Event details / 活动详情 | onclick: () =&gt; setOpen((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[{"propName":"stage","value":"pre","matches":false}]} |
| 540 | button/button · EventInfoCard | Collapse details / 收起详情 | onclick: () =&gt; setOpen(false) | {"disabled":null,"renderGateProps":[],"conditions":[{"propName":"stage","value":"pre","matches":false}]} |
| 575 | button/button · OnsiteCard | Review the event floor / 回顾现场内容 | onclick: () =&gt; setReviewOpen((value) =&gt; !value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 677 | link/a · EventDetailPanel | t({ en: "Ask iOrbit about this event", zh: "向 iOrbit 询问这场活动" }) | askAgentHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 文案/数据常量 en | "Register and answer 2 questions" |
| 26 | 文案/数据常量 zh | "报名并回答 2 题" |
| 27 | 文案/数据常量 en | "Complete your event profile" |
| 27 | 文案/数据常量 zh | "完成活动画像" |
| 28 | 文案/数据常量 en | "View matches and seating" |
| 28 | 文案/数据常量 zh | "查看匹配与座位" |
| 29 | 文案/数据常量 en | "Exchange business cards" |
| 29 | 文案/数据常量 zh | "现场交换名片" |
| 30 | 文案/数据常量 en | "Review and follow up" |
| 30 | 文案/数据常量 zh | "会后复盘与跟进" |
| 35 | 文案/数据常量 en | "Takuya Yamada" |
| 35 | 文案/数据常量 zh | "山田 拓也" |
| 36 | 文案/数据常量 en | "Cross-border logistics · BD lead" |
| 36 | 文案/数据常量 zh | "跨境物流 · 商务负责人" |
| 37 | 文案/数据常量 en | "Looking for overseas-warehouse partners — complementary to a channel-seeking goal." |
| 37 | 文案/数据常量 zh | "他在为日本中小卖家找海外仓伙伴，与你的「找渠道」目标互补。" |
| 41 | 文案/数据常量 en | "Jing Chen" |
| 41 | 文案/数据常量 zh | "陈 静" |
| 42 | 文案/数据常量 en | "DTC brand founder" |
| 42 | 文案/数据常量 zh | "DTC 品牌创始人" |
| 43 | 文案/数据常量 en | "Preparing to enter Kansai and wants to meet local channels." |
| 43 | 文案/数据常量 zh | "正在筹备进入关西市场，想认识本地渠道。" |
| 47 | 文案/数据常量 en | "Jiwon Kim" |
| 47 | 文案/数据常量 zh | "金 志源" |
| 48 | 文案/数据常量 en | "Cross-border payments BD" |
| 48 | 文案/数据常量 zh | "跨境支付 BD" |
| 49 | 文案/数据常量 en | "Can address the JPY settlement problem mentioned in the profile." |
| 49 | 文案/数据常量 zh | "能解决画像中提到的日元结算问题，双方目标匹配度高。" |
| 54 | 文案/数据常量 en | "Calendar synced" |
| 54 | 文案/数据常量 zh | "日历已同步" |
| 55 | 文案/数据常量 en | "Confirmed" |
| 55 | 文案/数据常量 zh | "已确认" |
| 56 | 文案/数据常量 en | "Event import" |
| 56 | 文案/数据常量 zh | "活动导入" |
| 57 | 文案/数据常量 en | "Invite only" |
| 57 | 文案/数据常量 zh | "仅限邀请" |
| 58 | 文案/数据常量 en | "In person" |
| 58 | 文案/数据常量 zh | "线下活动" |
| 59 | 文案/数据常量 en | "Online" |
| 59 | 文案/数据常量 zh | "线上活动" |
| 60 | 文案/数据常量 en | "Partners" |
| 60 | 文案/数据常量 zh | "合作伙伴" |
| 61 | 文案/数据常量 en | "Relationship building" |
| 61 | 文案/数据常量 zh | "关系建立" |
| 85 | 翻译 en | "Time TBD" |
| 85 | 翻译 zh | "时间待定" |
| 88 | 翻译 en | "Start time TBD" |
| 88 | 翻译 zh | "开始时间待定" |
| 110 | 翻译 en | "End time TBD" |
| 110 | 翻译 zh | "结束时间待确认" |
| 138 | 属性 aria-label | t({ en: "Back to previous page", zh: "返回上一页" }) |
| 138 | 翻译 en | "Back to previous page" |
| 138 | 翻译 zh | "返回上一页" |
| 139 | 翻译 en | "Back" |
| 139 | 翻译 zh | "返回" |
| 181 | 属性 title | sub |
| 197 | 翻译 en | "Registered" |
| 197 | 翻译 zh | "已报名" |
| 201 | 翻译 en | "Manage registration" |
| 201 | 翻译 zh | "管理报名" |
| 206 | 翻译 en | "Registration closed" |
| 206 | 翻译 zh | "报名已结束" |
| 214 | 翻译 en | "Register again" |
| 214 | 翻译 zh | "重新报名" |
| 220 | 翻译 en | "Register" |
| 220 | 翻译 zh | "报名" |
| 228 | 翻译 en | "Replay event workspace" |
| 228 | 翻译 zh | "回看活动工作台" |
| 230 | 翻译 en | "View event preparation" |
| 230 | 翻译 zh | "查看活动准备" |
| 231 | 翻译 en | "Enter event" |
| 231 | 翻译 zh | "进入活动" |
| 251 | 翻译 en | "Organizer" |
| 251 | 翻译 zh | "主办方" |
| 255 | 翻译 en | "Organizer pending" |
| 255 | 翻译 zh | "主办方待确认" |
| 256 | 翻译 en | "Organizer information is not yet available." |
| 256 | 翻译 zh | "活动来源暂未提供主办方信息。" |
| 268 | 翻译 en | `Multiple events hosted · ${event.host}` |
| 268 | 翻译 zh | `已举办多场 · ${event.host}` |
| 276 | 翻译 en | "Organizer" |
| 276 | 翻译 zh | "主办方" |
| 288 | 翻译 en | "My journey" |
| 288 | 翻译 zh | "我的旅程" |
| 347 | 翻译 en | "About this event" |
| 347 | 翻译 zh | "关于活动" |
| 360 | 翻译 en | "Agenda" |
| 360 | 翻译 zh | "活动议程" |
| 386 | 属性 aria-label | t({ en: "Event progress", zh: "活动进程" }) |
| 386 | 翻译 en | "Event progress" |
| 386 | 翻译 zh | "活动进程" |
| 419 | 翻译 en | "After you register, this becomes your on-site workspace. The content below is a sample:" |
| 419 | 翻译 zh | "报名后，这里会变成你的现场工作台。下面是它为参会者生成的内容（示例）：" |
| 423 | 翻译 en | "People matched for you · sample" |
| 423 | 翻译 zh | "为你推荐的人 · 示例" |
| 435 | 翻译 en | "Your seat · sample" |
| 435 | 翻译 zh | "你的座位 · 示例" |
| 436 | 翻译 en | "Table 5" |
| 436 | 翻译 zh | "5 桌" |
| 436 | 翻译 en | "Round 2 · table of 6, grouped around market-entry goals" |
| 436 | 翻译 zh | "第 2 轮 · 6 人桌，围绕「市场进入」目标组桌" |
| 439 | 翻译 en | "Opener suggestion · sample" |
| 439 | 翻译 zh | "开场白建议 · 示例" |
| 440 | 翻译 en | "“I hear you run overseas warehouses for Japanese sellers — do you have capacity in Kansai?”" |
| 440 | 翻译 zh | "「听说你们在帮日本卖家做海外仓，我们正好在选仓——你们在关西有点位吗？」" |
| 445 | 翻译 en | "Sample only · real results use your two registration answers" |
| 445 | 翻译 zh | "以上为示例效果，实际内容基于你的两项报名回答生成" |
| 476 | 翻译 en | "Ended" |
| 476 | 翻译 zh | "已结束" |
| 478 | 翻译 en | "Registered" |
| 478 | 翻译 zh | "已报名" |
| 481 | 翻译 en | `Registration open · ${remainingSeats} seats left` |
| 481 | 翻译 zh | `报名中 · 剩 ${remainingSeats} 席` |
| 483 | 翻译 en | "Registration closed" |
| 483 | 翻译 zh | "报名已结束" |
| 486 | 属性 aria-label | t({ en: "Event information", zh: "活动信息" }) |
| 486 | 翻译 en | "Event information" |
| 486 | 翻译 zh | "活动信息" |
| 497 | 翻译 en | "Event details" |
| 497 | 翻译 zh | "活动详情" |
| 513 | JSX文字 | Orbit × |
| 513 | 翻译 en | "co-hosted" |
| 513 | 翻译 zh | "联合主办" |
| 516 | 翻译 en | `Capacity ${event.cap}` |
| 516 | 翻译 zh | `限 ${event.cap} 人` |
| 521 | 属性 title | `${mini.timeDate} ${mini.timeTime}` |
| 522 | 属性 title | mini.venue |
| 522 | 翻译 en | "Address to be announced" |
| 522 | 翻译 zh | "详细地址待主办方公布" |
| 523 | 属性 title | `${t({ en: "Registered", zh: "已报名" })} ${event.stats.count}${event.cap ? ` / ${event.cap}` : ""} ${t({ en: "people", zh: "人" })}` |
| 523 | 翻译 en | "Registered" |
| 523 | 翻译 zh | "已报名" |
| 523 | 翻译 en | "people" |
| 523 | 翻译 zh | "人" |
| 524 | 属性 title | event.feeLabel |
| 524 | 翻译 en | "Matched and seated by Orbit" |
| 524 | 翻译 zh | "由 Orbit 匹配与分桌" |
| 535 | 翻译 en | "Just 2 questions · your first match direction appears right after" |
| 535 | 翻译 zh | "只需 2 个问题 · 报名后立即看到你的初步匹配方向" |
| 540 | 翻译 en | "Collapse details" |
| 540 | 翻译 zh | "收起详情" |
| 569 | 属性 aria-label | t({ en: "On-site", zh: "活动现场" }) |
| 569 | 翻译 en | "On-site" |
| 569 | 翻译 zh | "活动现场" |
| 571 | 翻译 en | "On-site" |
| 571 | 翻译 zh | "现场阶段" |
| 571 | 翻译 en | "Event floor" |
| 571 | 翻译 zh | "活动现场" |
| 572 | JSX文字 | LIVE · |
| 572 | 翻译 en | "In progress" |
| 572 | 翻译 zh | "进行中" |
| 573 | 翻译 en | "Feature sample" |
| 573 | 翻译 zh | "功能示例" |
| 576 | 翻译 en | "Review the event floor" |
| 576 | 翻译 zh | "回顾现场内容" |
| 585 | 翻译 en | "Event ended" |
| 585 | 翻译 zh | "活动已结束" |
| 585 | 翻译 en | "Cards exchanged" |
| 585 | 翻译 zh | "交换名片" |
| 586 | 翻译 en | "This event has ended. Private participant records are only available to confirmed attendees." |
| 586 | 翻译 zh | "活动已结束；私人现场记录仅向已确认参会者开放。" |
| 597 | 翻译 en | "My seat" |
| 597 | 翻译 zh | "我的座位" |
| 600 | 翻译 en | `Round ${index + 1} · Table ${table.tableNumber}` |
| 600 | 翻译 zh | `第 ${index + 1} 轮 · ${table.tableNumber} 号桌` |
| 600 | 翻译 en | `Seat ${table.seat}` |
| 600 | 翻译 zh | `座位 ${table.seat}` |
| 624 | 属性 aria-label | t({ en: "Post-event center", zh: "会后中心" }) |
| 624 | 翻译 en | "Post-event center" |
| 624 | 翻译 zh | "会后中心" |
| 626 | 翻译 en | "Post-Event" |
| 626 | 翻译 zh | "会后阶段" |
| 626 | 翻译 en | "Post-event center" |
| 626 | 翻译 zh | "会后中心" |
| 627 | 翻译 en | "Generated by iOrbit" |
| 627 | 翻译 zh | "iOrbit 生成" |
| 627 | 翻译 en | "Feature sample" |
| 627 | 翻译 zh | "功能示例" |
| 635 | 翻译 en | "You did not register for this event, so there is no private debrief. Browse Events to start a new journey." |
| 635 | 翻译 zh | "你没有报名本场活动，因此没有私人会后复盘。可返回活动列表开始新的旅程。" |
| 639 | 翻译 en | "After the event, a debrief like this lands here" |
| 639 | 翻译 zh | "活动结束后，你会在这里收到一份这样的复盘" |
| 640 | 翻译 en | "Who exchanged cards with you, what you discussed, what each person can bring, and the next follow-up — organized into an actionable list." |
| 640 | 翻译 zh | "谁和你交换了名片、聊了什么、这些人分别能给你带来什么、下一步该找谁聊什么——全部整理成可执行的跟进清单。" |
| 642 | JSX文字 | 4 |
| 642 | 翻译 en | "Cards exchanged" |
| 642 | 翻译 zh | "已交换名片" |
| 643 | JSX文字 | 2 |
| 643 | 翻译 en | "Follow-ups agreed" |
| 643 | 翻译 zh | "约定的跟进" |
| 644 | JSX文字 | 1 |
| 644 | 翻译 en | "Potential deals" |
| 644 | 翻译 zh | "潜在渠道合作" |
| 646 | 翻译 en | "Generated after the event · numbers above are samples" |
| 646 | 翻译 zh | "活动结束后自动生成 · 以上为示例数据" |
| 646 | 翻译 en | "Sample data · register and attend for your real debrief" |
| 646 | 翻译 zh | "示例数据 · 报名并参加活动后生成你的真实复盘" |
| 677 | 属性 title | t({ en: "Ask iOrbit", zh: "问 iOrbit" }) |
| 677 | 属性 aria-label | t({ en: "Ask iOrbit about this event", zh: "向 iOrbit 询问这场活动" }) |
| 677 | 翻译 en | "Ask iOrbit about this event" |
| 677 | 翻译 zh | "向 iOrbit 询问这场活动" |
| 677 | 翻译 en | "Ask iOrbit" |
| 677 | 翻译 zh | "问 iOrbit" |
| 692 | 翻译 en | "Event" |
| 692 | 翻译 zh | "活动" |
| 696 | 翻译 en | "Ended" |
| 696 | 翻译 zh | "已结束" |
| 696 | 翻译 en | "In progress" |
| 696 | 翻译 zh | "进行中" |
| 696 | 翻译 en | "Upcoming" |
| 696 | 翻译 zh | "即将开始" |
| 702 | 翻译 en | "Venue TBD" |
| 702 | 翻译 zh | "地点待定" |
| 726 | 翻译 en | "Ended" |
| 726 | 翻译 zh | "已结束" |
| 728 | 翻译 en | "Registered" |
| 728 | 翻译 zh | "已报名" |
| 731 | 翻译 en | "Registration closed" |
| 731 | 翻译 zh | "报名已结束" |

## repos/orbits/app/(app)/app/events/[id]/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/page.tsx>)

静态来源入口：`/app/events/[id]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 75 | EventDetailRouteStateView | main |  | orbit-page |
| 80 | EventDetailRouteStateView | h1 | routeModel.title |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 91 | 属性 title | routeModel.title |
| 153 | 文案/数据常量 description | "Canonical Event Core is temporarily unavailable. No legacy event catalogue was used." |
| 155 | 文案/数据常量 nextStep | "Retry after the event service is restored." |
| 156 | 文案/数据常量 label | "Retry current event" |
| 158 | 文案/数据常量 title | "Event detail temporarily unavailable" |
| 203 | 文案/数据常量 description | "This event is not available to the authenticated account." |
| 209 | 文案/数据常量 nextStep | "Return to Events and choose an event available to this account." |
| 210 | 文案/数据常量 label | "Return to events" |
| 212 | 文案/数据常量 title | "Event not found" |

