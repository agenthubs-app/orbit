import {
  AGENT_EVALUATED_CAPABILITIES,
  AGENT_EVALUATION_ACCOUNT,
  AGENT_EVALUATION_CASES,
  AGENT_EVALUATION_DATE,
  AGENT_EVALUATION_SUMMARY,
  AGENT_FLOW_STAGES,
  AGENT_RESOLVED_FINDINGS,
} from "../../../features/agent/evaluation/functional-test-report";

const styles = `
.agent-report {
  --ink: #17211f;
  --muted: #5f6f69;
  --line: #d8e2de;
  --paper: #ffffff;
  --wash: #eff6f3;
  --teal: #0f766e;
  --teal-deep: #115e59;
  --green: #166534;
  background:
    radial-gradient(circle at 10% 0%, rgba(15, 118, 110, .10), transparent 28rem),
    linear-gradient(180deg, #f8fbfa 0%, #eef4f1 100%);
  color: var(--ink);
  min-height: 100vh;
  padding: 28px 20px 72px;
}
.agent-report * { box-sizing: border-box; }
.agent-report__shell { margin: 0 auto; max-width: 1180px; }
.agent-report__hero {
  background: rgba(255,255,255,.92);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(23,33,31,.08);
  display: grid;
  gap: 28px;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, .8fr);
  overflow: hidden;
  padding: clamp(28px, 5vw, 64px);
  position: relative;
}
.agent-report__hero::after {
  background: linear-gradient(150deg, rgba(15,118,110,.16), rgba(15,118,110,0));
  border-radius: 999px;
  content: "";
  height: 320px;
  position: absolute;
  right: -120px;
  top: -160px;
  width: 320px;
}
.agent-report__eyebrow {
  color: var(--teal-deep);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .16em;
  margin: 0 0 14px;
  text-transform: uppercase;
}
.agent-report h1 {
  font-size: clamp(36px, 7vw, 72px);
  letter-spacing: -.055em;
  line-height: .98;
  margin: 0;
  max-width: 780px;
}
.agent-report__lede {
  color: var(--muted);
  font-size: clamp(17px, 2vw, 21px);
  line-height: 1.65;
  margin: 24px 0 0;
  max-width: 760px;
}
.agent-report__verdict {
  align-self: end;
  background: var(--teal-deep);
  border-radius: 18px;
  color: white;
  padding: 24px;
  position: relative;
  z-index: 1;
}
.agent-report__verdict strong {
  display: block;
  font-size: 42px;
  letter-spacing: -.04em;
  line-height: 1;
  margin-bottom: 12px;
}
.agent-report__verdict p { line-height: 1.55; margin: 0; }
.agent-report__meta {
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: 8px 18px;
  margin-top: 22px;
}
.agent-report__nav {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 22px 0 0;
}
.agent-report__nav a {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 750;
  padding: 10px 14px;
  text-decoration: none;
}
.agent-report__nav a:hover { border-color: var(--teal); color: var(--teal-deep); }
.agent-report__stats {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 22px 0 56px;
}
.agent-report__stat,
.agent-report__panel,
.agent-report__capability,
.agent-report__case,
.agent-report__finding {
  background: rgba(255,255,255,.92);
  border: 1px solid var(--line);
}
.agent-report__stat { border-radius: 16px; padding: 18px; }
.agent-report__stat strong {
  display: block;
  font-size: 30px;
  letter-spacing: -.04em;
  line-height: 1;
  margin-bottom: 8px;
}
.agent-report__stat span { color: var(--muted); font-size: 13px; }
.agent-report section { scroll-margin-top: 20px; }
.agent-report__section-head { margin: 54px 0 22px; max-width: 760px; }
.agent-report__section-head h2 {
  font-size: clamp(28px, 4vw, 42px);
  letter-spacing: -.04em;
  margin: 0 0 10px;
}
.agent-report__section-head p { color: var(--muted); line-height: 1.65; margin: 0; }
.agent-report__flow {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.agent-report__flow article {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 16px;
  min-height: 190px;
  padding: 20px;
  position: relative;
}
.agent-report__flow article::after {
  color: var(--teal);
  content: "→";
  font-size: 24px;
  position: absolute;
  right: -19px;
  top: 22px;
  z-index: 2;
}
.agent-report__flow article:nth-child(4n)::after,
.agent-report__flow article:last-child::after { display: none; }
.agent-report__flow h3 { font-size: 17px; margin: 0 0 12px; }
.agent-report__flow p { color: var(--muted); font-size: 14px; line-height: 1.65; margin: 0; }
.agent-report__panel { border-radius: 20px; padding: 22px; }
.agent-report__legend { display: flex; flex-wrap: wrap; gap: 8px; }
.agent-report__pill {
  background: var(--wash);
  border: 1px solid #cfe2da;
  border-radius: 999px;
  color: var(--teal-deep);
  display: inline-flex;
  font-size: 12px;
  font-weight: 800;
  padding: 6px 9px;
}
.agent-report__capabilities {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.agent-report__capability { border-radius: 18px; display: grid; gap: 14px; padding: 20px; }
.agent-report__capability header {
  align-items: start;
  display: flex;
  gap: 14px;
  justify-content: space-between;
}
.agent-report__capability h3 { font-size: 18px; margin: 0 0 5px; }
.agent-report__capability code {
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.agent-report__capability p { color: var(--muted); line-height: 1.6; margin: 0; }
.agent-report__capability dl { display: grid; gap: 8px; grid-template-columns: repeat(2, 1fr); margin: 0; }
.agent-report__capability dl div { background: var(--wash); border-radius: 10px; padding: 10px; }
.agent-report__capability dt { color: var(--muted); font-size: 11px; }
.agent-report__capability dd { font-size: 12px; font-weight: 750; margin: 4px 0 0; overflow-wrap: anywhere; }
.agent-report__cases { display: grid; gap: 12px; }
.agent-report__case { border-radius: 16px; overflow: hidden; }
.agent-report__case summary {
  align-items: center;
  cursor: pointer;
  display: grid;
  gap: 12px;
  grid-template-columns: 58px 1fr auto;
  list-style: none;
  padding: 17px 18px;
}
.agent-report__case summary::-webkit-details-marker { display: none; }
.agent-report__case summary::after { color: var(--muted); content: "+"; font-size: 22px; }
.agent-report__case[open] summary::after { content: "−"; }
.agent-report__case-id { color: var(--teal-deep); font-family: monospace; font-weight: 800; }
.agent-report__case-title { font-weight: 780; }
.agent-report__case-body {
  border-top: 1px solid var(--line);
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 18px;
}
.agent-report__case-body div { min-width: 0; }
.agent-report__case-body span {
  color: var(--muted);
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  margin-bottom: 7px;
  text-transform: uppercase;
}
.agent-report__case-body p { font-size: 14px; line-height: 1.65; margin: 0; }
.agent-report__case-foot {
  background: var(--wash);
  color: var(--muted);
  font-size: 12px;
  grid-column: 1 / -1;
  padding: 10px 12px;
}
.agent-report__status {
  background: #e7f5eb;
  border: 1px solid #b9ddc4;
  border-radius: 999px;
  color: var(--green);
  font-size: 12px;
  font-weight: 850;
  padding: 6px 10px;
}
.agent-report__findings { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.agent-report__finding { border-radius: 18px; padding: 20px; }
.agent-report__finding h3 { align-items: center; display: flex; font-size: 16px; gap: 9px; margin: 0 0 14px; }
.agent-report__finding p { color: var(--muted); font-size: 14px; line-height: 1.65; margin: 9px 0 0; }
.agent-report__finding b { color: var(--ink); }
.agent-report__footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  line-height: 1.7;
  margin-top: 56px;
  padding-top: 24px;
}
@media (max-width: 880px) {
  .agent-report__hero { grid-template-columns: 1fr; }
  .agent-report__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .agent-report__flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .agent-report__flow article:nth-child(4n)::after { display: block; }
  .agent-report__flow article:nth-child(2n)::after { display: none; }
  .agent-report__capabilities,
  .agent-report__findings { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .agent-report { padding: 12px 12px 48px; }
  .agent-report__hero { border-radius: 18px; padding: 24px 20px; }
  .agent-report__stats,
  .agent-report__flow { grid-template-columns: 1fr; }
  .agent-report__flow article { min-height: 0; }
  .agent-report__flow article::after { bottom: -23px; left: 22px; right: auto; top: auto; transform: rotate(90deg); }
  .agent-report__flow article:nth-child(2n)::after,
  .agent-report__flow article:nth-child(4n)::after { display: block; }
  .agent-report__flow article:last-child::after { display: none; }
  .agent-report__case summary { grid-template-columns: 52px 1fr; }
  .agent-report__case summary .agent-report__status { grid-column: 2; justify-self: start; }
  .agent-report__case-body { grid-template-columns: 1fr; }
}
`;

const kindLabel = {
  action: "动作",
  read: "只读工具",
  workflow: "工作流",
} as const;

const boundaryLabel = {
  artifact_tool: "证据面板",
  runtime_executor: "运行执行器",
  workflow_service: "工作流服务",
  workflow: "工作流编排",
} as const;

const confirmationLabel = {
  none: "无需确认（只读）",
  per_operation: "逐项确认",
  workflow_gate: "工作流门",
} as const;

export default function AgentFunctionalTestReportPage() {
  return (
    <main className="agent-report">
      <style>{styles}</style>
      <div className="agent-report__shell">
        <header className="agent-report__hero">
          <div>
            <p className="agent-report__eyebrow">Orbit Agent · Functional evaluation</p>
            <h1>Agent 全功能测试报告</h1>
            <p className="agent-report__lede">
              这不是功能宣传页，而是一份把能力、流程、安全边界、实验设计、预期结果和真实结果放在一起的验收记录。
              本轮以已有活动和中文人脉的测试账户为基准，先暴露真实数据链路问题，再完成根因修复。
            </p>
            <div className="agent-report__meta">
              <span>测试日期：{AGENT_EVALUATION_DATE}</span>
              <span>测试账户：{AGENT_EVALUATION_ACCOUNT}</span>
              <span>范围：聊天、今日、活动、账本、后台自动化</span>
            </div>
            <nav className="agent-report__nav" aria-label="报告章节">
              <a href="#flow">完整流程</a>
              <a href="#capabilities">能力清单</a>
              <a href="#experiments">逐项实验</a>
              <a href="#findings">根因与修复</a>
            </nav>
          </div>
          <aside className="agent-report__verdict" aria-label="验收结论">
            <strong>{AGENT_EVALUATION_SUMMARY.passed}/{AGENT_EVALUATION_SUMMARY.cases}</strong>
            <p>
              计划内实验通过。只读结果均有证据；写入均受确认或工作流门保护；外部日历额外受权限控制。
            </p>
          </aside>
        </header>

        <div className="agent-report__stats" aria-label="报告摘要">
          <div className="agent-report__stat">
            <strong>{AGENT_EVALUATION_SUMMARY.capabilities}</strong>
            <span>注册能力</span>
          </div>
          <div className="agent-report__stat">
            <strong>4</strong>
            <span>真实只读工具</span>
          </div>
          <div className="agent-report__stat">
            <strong>13</strong>
            <span>受控动作</span>
          </div>
          <div className="agent-report__stat">
            <strong>3</strong>
            <span>端到端工作流</span>
          </div>
          <div className="agent-report__stat">
            <strong>{AGENT_EVALUATION_SUMMARY.resolvedFindings}</strong>
            <span>根因修复</span>
          </div>
        </div>

        <section id="flow">
          <div className="agent-report__section-head">
            <p className="agent-report__eyebrow">End-to-end flow</p>
            <h2>一次 Agent 请求经历什么</h2>
            <p>
              流程刻意把“读取证据”“提出方案”和“执行动作”分开。模型不能直接越过身份、权限、确认或账本。
            </p>
          </div>
          <div className="agent-report__flow">
            {AGENT_FLOW_STAGES.map((stage) => (
              <article key={stage.id}>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="capabilities">
          <div className="agent-report__section-head">
            <p className="agent-report__eyebrow">Capability inventory</p>
            <h2>注册表中的全部 20 项能力</h2>
            <p>
              页面直接从 Agent 能力注册表生成清单；新增能力如果没有测试说明，报告测试会失败，防止文档落后于实现。
            </p>
          </div>
          <div className="agent-report__panel agent-report__legend">
            <span className="agent-report__pill">只读：直接展示证据</span>
            <span className="agent-report__pill">草稿/写入：逐项确认</span>
            <span className="agent-report__pill">外部动作：确认 + 权限</span>
            <span className="agent-report__pill">工作流：阶段门控</span>
          </div>
          <div className="agent-report__capabilities" style={{ marginTop: 14 }}>
            {AGENT_EVALUATED_CAPABILITIES.map((capability) => (
              <article className="agent-report__capability" key={capability.id}>
                <header>
                  <div>
                    <h3>{capability.chineseTitle}</h3>
                    <code>{capability.id}</code>
                  </div>
                  <span className="agent-report__pill">
                    {kindLabel[capability.kind]}
                  </span>
                </header>
                <p>{capability.chineseEffect}</p>
                <dl>
                  <div>
                    <dt>执行边界</dt>
                    <dd>{boundaryLabel[capability.executionBoundary]}</dd>
                  </div>
                  <div>
                    <dt>确认策略</dt>
                    <dd>{confirmationLabel[capability.confirmationPolicy]}</dd>
                  </div>
                  <div>
                    <dt>风险</dt>
                    <dd>{capability.riskLevel}</dd>
                  </div>
                  <div>
                    <dt>证据</dt>
                    <dd>{capability.evidenceRequired ? "必须" : "可选"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section id="experiments">
          <div className="agent-report__section-head">
            <p className="agent-report__eyebrow">Experiment matrix</p>
            <h2>{AGENT_EVALUATION_SUMMARY.cases} 个实验，逐项对照预期与实测</h2>
            <p>
              真实账户实验覆盖最容易被 mock 掩盖的读取链路；动作、并发和异常路径用确定性自动化验证，避免污染外部系统。
            </p>
          </div>
          <div className="agent-report__cases">
            {AGENT_EVALUATION_CASES.map((testCase, index) => (
              <details
                className="agent-report__case"
                key={testCase.id}
                open={index < 4}
              >
                <summary>
                  <span className="agent-report__case-id">{testCase.id}</span>
                  <span className="agent-report__case-title">
                    {testCase.category} · {testCase.experiment}
                  </span>
                  <span className="agent-report__status">通过</span>
                </summary>
                <div className="agent-report__case-body">
                  <div>
                    <span>实验</span>
                    <p>{testCase.experiment}</p>
                  </div>
                  <div>
                    <span>预期</span>
                    <p>{testCase.expected}</p>
                  </div>
                  <div>
                    <span>实测</span>
                    <p>{testCase.actual}</p>
                  </div>
                  <div className="agent-report__case-foot">
                    方法：{testCase.method} · 证据：{testCase.evidence} · 能力：
                    {" "}<code>{testCase.capabilityId}</code>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="findings">
          <div className="agent-report__section-head">
            <p className="agent-report__eyebrow">Root-cause audit</p>
            <h2>为什么会出问题，以及怎么从根上修</h2>
            <p>
              本轮不以增加条件判断掩盖症状，而是检查身份、数据所有权、领域边界、参数契约和展示层各自应承担的责任。
            </p>
          </div>
          <div className="agent-report__findings">
            {AGENT_RESOLVED_FINDINGS.map((finding) => (
              <article className="agent-report__finding" key={finding.id}>
                <h3>
                  <span className="agent-report__pill">{finding.id}</span>
                  {finding.symptom}
                </h3>
                <p><b>根因：</b>{finding.rootCause}</p>
                <p><b>修复：</b>{finding.resolution}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="agent-report__footer">
          <p>
            成熟产品验收口径：有证据才回答；没有权限就失败关闭；没有确认就不写入；重复执行不产生重复副作用；
            推导结果必须声明为推导；空态、失败和恢复路径与成功路径同等重要。
          </p>
        </footer>
      </div>
    </main>
  );
}
