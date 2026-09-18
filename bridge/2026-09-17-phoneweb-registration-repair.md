# BR-030 — 活动报名配置与 Web 取消确认

2026-09-17；ROOT管理/集成/真实QA，B0064和A0065各唯一Generator/run-01。用户“去做吧”授权准确Phone展示域13活动配置与已批准的报名、取消、重报目标，不是所有数据库或其他未批准协议。

## 固定交付与数据

Web工具8daf13a8（首提交796d保留），App d0e141cc；均已合chat-agent并普通push，独立远端7b1b3de289eba6e550a4702954df6056eddc664e一致。管理文档收口后的最终远端记录在ROOT checkpoint。

精确本机127.0.0.1:5432/orbit_phoneweb_20260916/workspace:phoneweb-demo，event01～10/signup01～03。12缺配置、signup01旧八月截止与十月日期冲突；工具单事务版本化13配置/head/audit，不改活动日期/主办方/旧配置。首次真实dry-run拒绝ROOT错误的全QA主办方假设；核原snapshot后同run严格修正逐ID映射，原失败保留。实际apply13/audit13，同plan重放alreadyApplied，新预览changes0，配置前后六受保护表count/digest全原。

正常UI仅新自建signup02 QAcase：报名→详情拒绝/确认取消→重新报名→资料页拒绝/确认取消。4次正式业务POST逐项CAS/receipt/独立GET一致；两次拒绝0写，同registration/profile ID与两答案保留，最终cancelled/member4/profile1。新业务delta为4membership历史/1head/1profile/1head/2responses；排除仅原不存在的新case后原六表count/digest全原。未删除新历史，不能把配置0delta误称整轮QA0写。

## 共享行为与Phone运行时

RNW Alert空实现导致原两取消不弹窗/不提交；本域helper Web真实浏览器confirm、原生原Alert两按钮；missing/throws明确错误不写。actor/origin/event/allowedActions/version、单飞与独立回读不变，无新API/schema/CAS协议或全局Alert修改。

Phone消费固定d0e增量到519230b7/TREEf082d977。三产品及两测试全字节固定、四字典仅1key保私有；canonical测试保Phone基线+固定patch，不伪称整文件等Main。Main-only三legacy-owner/privacy cases与历史行为差异仍未消费，不扩产品范围。

新不可变release0065前台fresh Expo export；后台subtree字节相同，明确复用64真实BUILD6cy0j8e-CXA8xaVz4VdAm/旧b957与TREE54。entry875fe518实际公网SHA1afd800644e786cc255f5438ca49748a6f7c21f7b7556a7cfe42bb9ed8db1399与冻结资产相同，HTML引用新entry，health200/live。

原43205/6/7正常IPC停，PUBLIC87138/87139/87140同32100/32110、零restart；原ngrok26690/27063与地址不变，完整0063回退保留。PUBLIC只原预算guard，不加preview no-paid或关闭投资人AI。owned previews64/65与PG35434已精确正常停止，资产、数据、57测试schema保留；MAIN3000/Metro8082/Native未停。

13正式GET questions=false、preview及公网逐页正确enabled/旧“暂不可操作”消失，公共业务POST0；另实际公网正常登录页面→signup02 canonical模块、已取消/重新报名可见。真实PNG已目检。证据在ROOT ignored build/harness-state/evidence/sprint-0064/run-01：phone-repair-real-verification、registration-lifecycle-final、original-data-after-final-cancellation、public65-served-verification、all13-public65-page-check、public65-normal-ui-login。

## 测试与未完成范围

64完整局部pure18/真实隔离PG11/CLI9=38pass/types0；Phone98pass/types0；ROOT主线完整受影响81pass/skip0/guards0。Main整个Web subtree等固定64，App类型相关源等固定65，仅Markdown不同，复用同源完整types。

唯一WebI3868/3591pass/64fail/213skip：59旧fail、5缺浏览器完整文件环境修正后5pass，7额外skip为已合0033PhaseA缺专用URL，不冒称通过。唯一AppI3316/3298pass/18fail：旧/+html视觉1、16缺Web依赖同hook、1inbox字体timeout；零安装补既有依赖后原两完整文件31pass，无产品/断言修改，原I不改记全绿，inbox未复现但原因未确定。无第二I。

隔离preview正常deterministic题集fallback/只读no-paid外层、原预算内层，唯一累计$5账本493f字节不变；不是真实AI provider验收。本轮Native仅确认fixture与既有保护，未做真实Simulator取消，不关闭0050 Native或项目全功能验收。推荐模块实见数据版本不识别仍TODO；0033PhaseB/C/D、OAuth、Push、全域离线旧缺项未因此批准或关闭。

## 用户要求的后续重新构建与运行验证

用户追加“做完之后重建phoneweb以及app simulator”，本轮是同一已交付产品源的运行构建，不新开Sprint/Generator或重复全量测试。Phone固定519230b7/f082的新不可变目录 `release-0065-rebuild-20260917T062757Z` 实际fresh Next build与fresh Expo export均exit0；不复用旧后台构建，新BUILD为 `Mh8CRhvDjpNWmXZo4wex1`，相同源新导出仍得到entry875/raw1afd。ROOT独立预览核验后释放精确PUBLIC窗口，旧87138/9/40正常IPC退出，新93152/93153/93154同32100/32110 healthy/零restart，ngrok同域保持。旧0065及0063完整回退保留，新临时preview92862/3/4精确正常IPC停，数据资产未删。

ROOT独立公网实际health200/live、HTML引用及served entry SHA1afd匹配，普通UI登录后逐13活动页正确enabled/旧灰态消失/业务POST0。证据为当前run `all13-public-rebuild-20260917-normal-login.json/png`，新private不可变目录 `root-preview-verified.json`、`public-swap.json`、`root-public-rebuild-verification.json`、`post-publish-preview-stop.json`。首次预览启动因Unix socket路径长度失败，保留原helper/failure，机械缩短state目录后成功；没有修改业务源码、依赖、数据库或公开环境。

Simulator使用Main `2f69b3f7e85d72c6948e1173153a91a975d8408b` 产品源，DA432E9E目标实际xcodebuild Debug/RCT_METRO_PORT8082 exit0，保留构建阶段及require-cycle警告；没有prebuild/pod install、uninstall、清账号/密钥/本地库。覆盖安装与launch exit0，当前进程92537；构建及实际安装executable SHA均 `40d58a961d9de417d5903a0f271ea7e91df2784edc91d217a51c45fd1efa4975`。Metro69917实际cwd为主线repos/orbit-app，App实际TCP8082连接及Hermes调试scriptParsed观察到 `http://127.0.0.1:8082/node_modules/expo-router/entry.bundle`，getScriptSource实际SHA `daf8df2107355e3f482bc43a99a221d28e23a4baae40e8ca728fcad82c5fe1e0`。这不是原生包哈希替代JS证据。

真实Simulator冷启动有数据首页→点击“所有笔记”→历史列表已加载1/共1→返回首页通过，实际PNG已目检；证据 `simulator-rebuild-20260917-home.png`、`simulator-rebuild-20260917-notes.png` 和外置缓存重建目录 `orbit-phone-app-rebuild-20260917.QTVK2m/native-build.log`、`metro-actual-observation.json`。截图外置盘写入受限后改项目ignored证据目录；首次调试连接缺同源Origin被拒，补明确本地同源Origin后成功，不改Metro安全规则。两端各自原账号与数据域保留，不宣称已经做Native取消闭环、全部功能、真实AI或全域离线验收；唯一$5账本493f字节未变。最终运行交接commit/push事实由ROOT checkpoint记录。
