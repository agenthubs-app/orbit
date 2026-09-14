# 0003 run-01 实施进度

这是未结束执行的进度记录，不是完成报告。原五项SC保持不变，当前仍需两端补全交互及真实注册／Google／双端回读验收。

## 资料判定与生日基础层

- 功能提交：`65c2a8050`。服务端按姓名、合法两级行业、有效生日计算onboarding；原六项completeness仅保留丰富度含义。公司／职位／介绍不成为必填，GET不创建资料。
- 生日按日历字符串保存，仅本人资料返回；省略保留，null清空。非法日期／类型在写入前拒绝，不回显原输入。provider拒绝userId/accountId冲突；公开资料、searchText、AI和人脉总览投影不含生日。
- RED：18个初始行为失败，另2个所有权／总览隐私失败；补三时区不变日用例后，11个完整相关测试文件55/55通过。证据为 `build/harness-logs/sprint-0003-profile-foundation-{red,green,related}.log` 与 `sprint-0003-profile-privacy-projections-red.log`。
- Web全量：exit1，2990 pass／47 fail／168skip；与 `sprint-0023-seed-web-full.log` 比较失败名称，新增0、减少0。沿用专项基线批准，不称全量通过。日志 `sprint-0003-profile-foundation-web-full.log`。
- App首次全量：exit1，2592 pass／1 fail，失败为资料页统计重试断言。原测试只等两帧便取异步状态，独立重跑通过；修订为受控延迟回包、断言pending不伪造零值并等待实际成功状态，保留只GET待办／无写入的断言。
- App完整资料页156/156、最终全量2593/2593，均exit0；日志 `sprint-0003-profile-statistic-related.log`、`sprint-0003-profile-foundation-app-full-after-retry-fix.log`，首次失败日志保留。两端typecheck均exit0；共享类型由sync生成，全量含同步检查。
- 暂存检查：精确15文件、diff check通过，GitNexus LOW／0已识别流程；新增未索引函数及偏移误报已人工核对。未修改用户素材，未推送／部署／连接业务库／调用付费模型。

## 原子保存与幂等回执

- 功能提交：`6082b9961`。
- 提供方新增expectedUpdatedAt与mutationId配对协议；共享PostgreSQL事务内比较版本、合并资料和保存私密回执。同请求返回原回执，不同内容复用ID拒绝；并发首次创建只有一个成功，旧客户端稀疏字段也在事务内合并。序列化失败最多3次尝试，其余存储错误明确失败，不伪造成功。
- 真实临时PostgreSQL验证14项，覆盖两条连接竞争、幂等、回滚、HTTP 400/409、另一账号隔离、配置入口回读和有限重试。它们包含在最终相关75/75及Web全量中，不另加计数。无事务适配器及固定mock不能确认新协议，明确返回失败。
- App全量2593/2593，exit0。Web首次全量3004 pass／48 fail／168skip，新增一项首页源码断言仍强制非事务工厂；定向复现后修订该过时断言，保留其他模块检查，资料配置入口由真实数据库测试覆盖。两份完整文件30/30通过。
- Web最终全量3005 pass／47 fail／168skip，exit1；47个失败名称与资料基础层基线完全一致，新增0／减少0，不称全量通过。Web最终typecheck exit0；App沿用同版本已通过typecheck及全量，未因Web测试修订重跑。日志为 `sprint-0003-profile-cas-{web-full,app-full,home-repro,home-green,web-full-after-home,web-typecheck-home}.log`。
- 最终精确13文件，diff check通过，暂存GitNexus LOW／0已识别流程；新增未索引模块和源码偏移误报已人工核对。没有推送、部署、业务库操作或付费调用。

## 接续动作

本轮临时集群 `/tmp/orbit-profile-cas.TtwU2u` 仅监听同目录Unix socket、listen_addresses为空，不连接现有数据库；验证后已停止，文件保留未删除。该隔离测试不能替代授权账号的SC-05。

继续App／Web补全界面、原始草稿版本绑定及认证后的安全返回。同一功能链合并验证，过程中仅跑定向测试，整批稳定后再做所需全量，不为小步骤重复跑。

累计AI/OCR硬上限仍为$5，历史已记录$0.012780，本阶段新增调用和费用均为0。
