# App 新用户引导与活动现场设计稿（0106、0107）

**状态：用户已批准（2026-09-27，原话「可以的，按照你现在推荐去做」）。** 在线画布：https://claude.ai/artifact/B856DzzuzxbjT5y1kVSNfQ（私有）。本目录保存画布源文件的副本：`canvas.json` 是画布索引，每个 `*.dc.html` 是一块 390×844 的手机画板。

第一版用蓝色做主色，被用户指出与 App 现有的黑白风格不一致，已经整套重做。以下视觉规范取自 App 源码，实施时直接按这些数值做，不要自己估：

## 视觉规范（来源：`repos/orbit-app/src/design/controls.ts`、`tokens.ts`，以及真实界面截图）

| 元素 | 规范 |
| --- | --- |
| 主按钮 | `controls.primaryButton`：黑底 `colors.ink` #0B1220，白字，圆角 12，最小高度 50，文字 15/700 |
| 次按钮 | `controls.secondaryButton`：白底，1px `ink` 描边，最小高度 46，文字 15/600 |
| 输入框 | `controls.input`：白底，`borderStrong` #B9BDC4 描边，圆角 12，最小高度 44，文字 15 |
| 选择标签（目标、话题等） | `controls.chip`：`surface2` #F5F7FA 底，圆角 12，最小高度 44，文字 13/600 `text2`；选中时 `selectedChip` 黑底白字 |
| 页标题 | 30/38，字重 900，字距 −0.6（与活动页、人脉页标题相同） |
| 分组标题 | `rowRoleStyles.groupHeading`：12/600，字距 0.96，`text3` 灰 |
| 字段标签 | `rowRoleStyles.fieldLabel`：13/500 |
| 列表 | 用 `hairline` #EEF0F4 细分隔线分隔，行高至少 44；不堆卡片 |
| 标签页 | 与活动页 `catalogueTabs` 相同：文字 14，选中为 800 加 2px `ink` 下划线，整排下方 1px `border` |
| 蓝色 `accent` #0A5CFF | 只用于文字链接、返回按钮、计数；不用于按钮底色 |
| 状态色 | 已签到、现场、已交换用 `live` #437563（背景 `liveSoft`）；断网、提醒用 `amber`/`amberSoft`；失败用 `rose`/`roseSoft` |
| 字体 | 系统字体栈（与活动页、人脉页的 `eventFont`/`mainContactFont` 相同） |
| 大数字 | 现场页的「3 号桌」沿用首页「9.27」的超大粗体写法（64/70，字重 900） |

## 画板清单

- 0106（新用户引导）：`Main`（欢迎）、`OnbProfile`（你是谁）、`OnbGoals`（最近想推进什么）、`OnbPersona`（提供与寻找）、`OnbIntro`（AI 自我介绍）、`OnbImport`（带入人脉）、`OnbStates`（失败与中途退出）。
- 0107（活动现场）：`LiveEntry`（活动详情入口）、`LiveHome`（现场首页）、`LiveRec`（为你推荐）、`LiveAll`（全部参会者）、`LiveGroup`（我的分组）、`LivePerson`（对方资料与操作面板）、`LiveAgenda`（议程与关系图）、`LiveDenied`（未报名、断网、结果未发布、不在签到时间）。

画板中用方括号标出的内容（如 `[匹配理由]`、`[活动介绍]`）来自真实数据，实施时按接口返回显示，不写死。人名来自产品落地页的示例。
