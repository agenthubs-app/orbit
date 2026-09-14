# 0003 run-01 实施进度

这是未结束执行的进度记录，不是完成报告。原五项SC保持不变，当前仍需并发保存、两端补全交互及真实注册／Google／双端回读验收。

## 资料判定与生日基础层

- 功能提交：`65c2a8050`。服务端按姓名、合法两级行业、有效生日计算onboarding；原六项completeness仅保留丰富度含义。公司／职位／介绍不成为必填，GET不创建资料。
- 生日按日历字符串保存，仅本人资料返回；省略保留，null清空。非法日期／类型在写入前拒绝，不回显原输入。provider拒绝userId/accountId冲突；公开资料、searchText、AI和人脉总览投影不含生日。
- RED：18个初始行为失败，另2个所有权／总览隐私失败；补三时区不变日用例后，11个完整相关测试文件55/55通过。证据为 `build/harness-logs/sprint-0003-profile-foundation-{red,green,related}.log` 与 `sprint-0003-profile-privacy-projections-red.log`。
- Web全量：exit1，2990 pass／47 fail／168skip；与 `sprint-0023-seed-web-full.log` 比较失败名称，新增0、减少0。沿用专项基线批准，不称全量通过。日志 `sprint-0003-profile-foundation-web-full.log`。
- App首次全量：exit1，2592 pass／1 fail，失败为资料页统计重试断言。原测试只等两帧便取异步状态，独立重跑通过；修订为受控延迟回包、断言pending不伪造零值并等待实际成功状态，保留只GET待办／无写入的断言。
- App完整资料页156/156、最终全量2593/2593，均exit0；日志 `sprint-0003-profile-statistic-related.log`、`sprint-0003-profile-foundation-app-full-after-retry-fix.log`，首次失败日志保留。两端typecheck均exit0；共享类型由sync生成，全量含同步检查。
- 暂存检查：精确15文件、diff check通过，GitNexus LOW／0已识别流程；新增未索引函数及偏移误报已人工核对。未修改用户素材，未推送／部署／连接业务库／调用付费模型。

## 接续动作

事务保存将复用现有PostgreSQL事务与记录设施。已发现本机有PostgreSQL工具；仅为本轮创建临时集群 `/tmp/orbit-profile-cas.TtwU2u`，监听同目录Unix socket、listen_addresses为空，不连接现有数据库。将用两条实际连接验证同版本竞争、首次创建、幂等回执和回滚；该隔离测试不能替代授权账号的SC-05。验证后停止临时实例，不删除已有数据。

累计AI/OCR硬上限仍为$5，历史已记录$0.012780，本阶段新增调用和费用均为0。
