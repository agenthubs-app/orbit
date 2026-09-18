# Sprint0055 — 实际预览失败与修复边界

2026-09-17 JST，Phone固定消费0052源83232f5aec1a9e25e3e77fdbcb8191fbd955ff7f，新独立构建和只读预览成功，但尚未发布；公网仍保留原f4组合。ROOT已读原private prepublication-receipt.json，并核实际当前criteria.ts/scoring.ts/service.ts及冻结0052契约。

原需求为“我现在在做餐厅AI点单系统，想认识一些合作方。”，实际条件只有scenario:restaurant、capability:delivery、collaboration:implementation、keyword:ai，未识别scenario:ordering。现有ordering别名缺点单/點單，不是业务数据需要重写。

四个真实结果获100分，合作项baseWeight20/归一22.22222222222222全部获得。匿名化原依据为“某机构的门店经营者。本次关注『日本落地可信赖的税务与设立顾问』，可提供『关西合作渠道介绍』。”。criterionMatch仅对整段资料做包含别名判断，implementation别名含“落地”；没有区分自身诉求与相关实施事实，所以把该词记为direct依据。0052原规范要求的是明确合作/实施经历，当前证据未满足。

证据保留在/Volumes/ORICO/Dev/phoneweb-runtime-20260916/private/release-0052/的prepublication-receipt.json、anonymized-scoring-failure.json、preview-matrix.json；原文及完整API仅private，不复制姓名/机构/联系人ID到公开文档。六场Chromium/WebKit语言渲染只读通过，其中ja/en是明确标记的controlled-display，非持久语言偏好验证；profile.profile、contacts.contacts及原goal/version/dataVersion保持，业务写0/模型0/预算SHA不变。原动态collectedAt整体hash失败与后续本体对比说明保留。

服务每次getMatches读取profile→contacts→profile并重新评分，保留两次profile一致性检查，没有持久评分缓存写入。修复属于现有v2语义纠错，wire shape/算法族标记不变，真实构建SHA区分修复前后；不得伪称dataVersion变化或扩大成新推荐引擎。

0052唯一run已正式closed，不能重开A。0055只承接两个实际失败，不复制整个0052、不动字典/契约/账户/关系价值/AI分析。Phone publication暂停绑定这两项评分语义，其他获准只读/个人日程修复可以继续。
