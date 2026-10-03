# Sprint 0140 — 大图先压缩，扫描与手动添加更清楚 · 执行报告

## 目标实现情况
- 超过上传上限的名片照片会先在手机上压缩，上传的就是压缩后的副本。压缩策略是写在代码里的固定顺序：4096/0.85 → 3200/0.80 → 2560/0.75 → 2048/0.70，输出 JPEG。
  - 正面、反面、补拍、替换、批量、直接扫描都走 `prepareBatchImage`，规则相同。
  - 小图不压缩。压缩失败、取消或压缩后仍超限时，显示可恢复的错误，不上传。
  - 直接扫描的目标是 7 MiB：实测 JSON 请求体超过 10,485,760 B 就会被 API 代理截断，对应原图约 7.49 MiB。
- 人脉页分别进入 `/contacts/new/scan`（方案 C 黑白版，只有「拍一张名片」和「从相册选择」）和 `/contacts/new/manual`（姓名先行）。原来的 `/contacts/new` 改为「更多添加方式」：QR、批量导入（含正反面）、外部导入、引荐、待确认候选、重复检查。
- 两条路径都是先核对，再明确点「保存到人脉」，然后显示「已保存到人脉」，只建一人。
- 服务端的手动添加关系备注改为可选：只有姓名也能建草稿；没有备注时不存备注、不生成任何替代文字；带备注的请求行为不变。
- 仍不能完成的：实体 iPhone 的拍照、正反面回读和 OCR 复核（设备不可用，pending）。

## 运行记录
- run-01；基线为 `1a366117c` 加开始提交 `9ccc9ad7e`。
- PLANNER.md 的 SHA256：`dad60f1838a49d54ffa4d92773ff8b73180d879815b1518264ceeb49987ba593`；GOAL.md：`3887d2710247e7341cb549e89a93a92cbec028184eff7c6c2f19bed2aca3b39e`。
- 功能提交：`b681126c9`（App）、`2b9b51826`（服务端备注可选）。被验收的 HEAD 是 `2b9b51826`。
- 设备：Simulator「Orbit Sprint0140 Isolated」（9FC8EB08），iOS 26.4，新编译的 Debug 包（含 expo-image-manipulator），钥匙串正常。本地栈 3100 连本机 `orbit_events` 库，账号 `qa@orbit.test`。

## SC → 证据
| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0140-01 | 本地通过；实体 iPhone pending | 单元测试 10/10（先失败后通过）；浏览器用真实超过 10 MiB 的样本测过；原生 Simulator 上上传字节、清单 rawSize 和摘要完全一致（3,982,923 B / `5cf7b417…`，3,989,566 B / `c968ff50…`）；替换为 9.8 MB 的图不重压；实测请求体上限 7.49 MiB 能过、7.5 MiB 返回 500 |
| SC-0140-02 | 通过 | 路由与渲染测试；Simulator 截图；打开扫描页不请求权限，拒绝相机后可恢复且没有写入 |
| SC-0140-03 | 通过 | 1 次真实 OCR 五个字段全对；保存前人脉 97、保存后 98；识别失败可回到选择页 |
| SC-0140-04 | 通过 | App 交互测试 5/5；服务端真实 Postgres 路由测试 4/4（先失败后通过）；Simulator 上只填姓名 → 核对 → 保存，人脉 94→95，没有备注提示；API 读回 200 |
| SC-0140-05 | 通过 | 回归测试；中日英、深色、2 倍字号无溢出；其他来源都还在「更多添加方式」里 |

## 验证
- App 全量 4062/4062；orbits 全量 4774 通过 / 0 失败 / 625 跳过。
- 两轮全量各出现过一次审计失败，都是「文件:行号」锚点随代码行移动而漂移；修复后整套重跑，最终 0 失败。
- Postgres 逐个文件串行：optional-note 4/4、manual live 12/12、manual mock 6/6、draft live 7/7、draft pipeline 5/5、scan live 15/15、review live 11/11、ingest-v2 repository 22/22、ingest-v2 routes 6/6。
- typecheck（orbits、orbits app、App）与 lint 均 exit 0；读取上限 ratchet 没有增加。
- GitNexus：
  - `createLiveManualContactCreationService` CRITICAL（13 处）、mock 服务 HIGH（3 处）。只改了「没有备注」分支，带备注的行为有回归测试锁定。
  - 其余符号 LOW；索引里调用方为 0 的已用文本搜索补查。
  - 提交前 staged detect-changes：App 提交 medium（受影响 2 条流程，都经过 ContactAcquisitionScreen），服务端提交 low（0 条）。

## 付费调用
- 2026-10-03T18:41:19Z 至 18:42:59Z：真实 OCR 扫描 1 次（DeepSeek vision 和 text 各 1 次请求），估算不超过 0.002 美元。没有其他付费 AI 调用。

## 设计取舍
- 新增原生依赖 `expo-image-manipulator ~57.0.20`。
- 直接扫描改为取原图（quality 1，取原始格式），只由代码里的固定策略重新编码。
- 扫描核对页去掉了「我已核对所有字段」勾选框，改由明确点击「保存到人脉」作为确认；OCR 风险项仍需逐项勾选；后台确认请求 `confirmed:true` 不变。
- 手动添加保留了旧服务端的回退提示：遇到 `MANUAL_CONTACT_NOTE_REQUIRED` 时展开备注区并提示，不创建联系人。
- 服务端没有姓名也没有备注时仍然拒绝，错误码不变。

## 清理
- QA 数据全部删除，回到基线（人脉 94、草稿 3）；账号语言改回「跟随设备」。
- Simulator 服务器设置改回 `http://127.0.0.1:3000`；进程都已停止；3000 端口服务没有碰过。
- DerivedData 已删除。

## 交接与未完成
- 上线前要做：发布包含 expo-image-manipulator 的原生包；服务端改动随 Web 部署生效。
- 实体 iPhone 验收（SC-01 和 0007）仍 pending。
- 已有问题：没填公司时联系人公司被写成 "Unknown organization"（早就存在的默认值）；系统相机授权弹窗文案仍写「候选」，需要重新编译原生包才能改。
- 等协调者合并 `chat-agent` 并复核合并树。
- 证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0140/run-01/`；日志目录：`repos/orbit-app/build/harness-logs/sprint-0140-*`。

## 协调者复核与决定

- **决定**（按用户 2026-09-28 的授权）：手动添加以用户批准的设计为准，只要求填姓名。服务端的关系备注改为可选，向后兼容；App 保留连接旧服务端时的兜底提示。
- **复核**：0140 合并到 `chat-agent`（合并提交 `b15b39c9d`）后，在主检出跑两端全量：orbits 5399 条，4774 通过，**0 失败**，625 跳过；App 4062/4062 通过。
- **未完成**：SC-01 的实体 iPhone 验收（大图拍摄、正反面回读、OCR 复核）仍是 pending，等有真机时补做。
- **付费调用**：本 Sprint 共 1 次真实名片识别（OCR），约 $0.002。
