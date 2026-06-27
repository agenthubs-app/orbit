import { bilingualText } from "../shared/ui/bilingual";

export default function Page() {
  const entryPrinciples = [
    {
      label: bilingualText("来源", "Source"),
      text: bilingualText(
        "在关系变成待办之前，先记录它从哪里开始。",
        "Record where the relationship began before it becomes work.",
      ),
    },
    {
      label: bilingualText("证据", "Evidence"),
      text: bilingualText(
        "把上下文放在足够近的位置，让下一步可以被信任。",
        "Keep context close enough that the next step can be trusted.",
      ),
    },
    {
      label: bilingualText("确认", "Confirmation"),
      text: bilingualText(
        "敏感跟进动作必须等待明确复核。",
        "Hold sensitive follow-up actions for explicit review.",
      ),
    },
  ];
  const relationshipFields = [
    {
      label: bilingualText("人物", "Person"),
      text: bilingualText(
        "记录个人、角色和组织，但不假设这段关系已经活跃。",
        "The individual, role, and organization without pretending the relationship is active yet.",
      ),
    },
    {
      label: bilingualText("起点", "Origin"),
      text: bilingualText(
        "说明连接如何开始的活动、转介绍、二维码扫描、导入或记录。",
        "The event, referral, QR scan, import, or note that explains how the connection began.",
      ),
    },
    {
      label: bilingualText("证据", "Evidence"),
      text: bilingualText(
        "行动发生之前，让上下文可以被复核的来源路径。",
        "The source trail that keeps context reviewable before action is taken.",
      ),
    },
    {
      label: bilingualText("下一步", "Next action"),
      text: bilingualText(
        "有来源支撑的下一步，在任何外部消息发送前等待确认。",
        "The source-backed next step, held for confirmation before any external message is sent.",
      ),
    },
  ];
  const starterFields = [
    {
      label: bilingualText("必须有来源", "Source required"),
      text: bilingualText(
        "选择创建这段连接的活动、转介绍、导入、二维码扫描或手动记录。",
        "Choose the event, referral, import, QR scan, or manual note that created the connection.",
      ),
    },
    {
      label: bilingualText("上下文线索", "Context clue"),
      text: bilingualText(
        "在加入销售或 CRM 框架前，先写下这个人为什么重要。",
        "Capture one reason this person matters before adding any sales or CRM framing.",
      ),
    },
    {
      label: bilingualText("建议下一步", "Suggested next step"),
      text: bilingualText(
        "如果证据仍然准确，指出合理的跟进动作。",
        "Name the follow-up that would make sense if the evidence is still accurate.",
      ),
    },
    {
      label: bilingualText(
        "外部动作前先复核",
        "Review before any external action",
      ),
      text: bilingualText(
        "外联、提醒和敏感消息都必须暂停，等待明确确认。",
        "Keep outreach, reminders, and sensitive messages paused for explicit confirmation.",
      ),
    },
  ];

  return (
    <main aria-label={bilingualText("Orbit 入口", "Orbit entry")} className="orbit-page">
      <section aria-labelledby="orbit-title" className="orbit-shell">
        <div className="orbit-rule" aria-hidden="true" />

        <header className="orbit-entry">
          <p className="orbit-label">
            {bilingualText(
              "以活动为来源的关系工作台",
              "Event-grounded relationship workspace",
            )}
          </p>
          <h1 className="orbit-title" id="orbit-title">Orbit</h1>
          <p className="orbit-copy">
            {bilingualText(
              "一个关系操作系统，用来记住你认识谁、这段连接为什么存在、有哪些证据支撑，以及哪个合理跟进需要确认。",
              "A relationship operating system for remembering who you know, why the connection exists, what evidence supports it, and which sensible follow-up needs confirmation.",
            )}
          </p>
          <a className="orbit-start-link" href="#relationship-starter">
            {bilingualText(
              "开始一条有来源的关系记录",
              "Start a sourced relationship note",
            )}
          </a>
        </header>

        <section
          aria-labelledby="relationship-starter"
          className="orbit-starter"
        >
          <div>
            <p className="orbit-starter-kicker">
              {bilingualText("第一步", "First action")}
            </p>
            <h2 id="relationship-starter">
              {bilingualText(
                "开始一条有来源的关系记录",
                "Start a sourced relationship note",
              )}
            </h2>
          </div>
          <dl className="orbit-starter-list">
            {starterFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-label={bilingualText("关系记录框架", "Relationship record frame")}
          className="orbit-record"
        >
          <p className="orbit-record-kicker">
            {bilingualText(
              "每条关系记录都从这些内容开始",
              "Every relationship record starts with",
            )}
          </p>
          <dl className="orbit-record-list">
            {relationshipFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ul
          aria-label={bilingualText(
            "Orbit 操作原则",
            "Orbit operating principles",
          )}
          className="orbit-principles"
        >
          {entryPrinciples.map((principle) => (
            <li key={principle.label}>
              <span>{principle.label}</span>
              <p>{principle.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
