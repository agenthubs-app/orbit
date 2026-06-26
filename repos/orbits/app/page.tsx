export default function Page() {
  const entryPrinciples = [
    {
      label: "Source",
      text: "Record where the relationship began before it becomes work.",
    },
    {
      label: "Evidence",
      text: "Keep context close enough that the next step can be trusted.",
    },
    {
      label: "Confirmation",
      text: "Hold sensitive follow-up actions for explicit review.",
    },
  ];
  const relationshipFields = [
    {
      label: "Person",
      text: "The individual, role, and organization without pretending the relationship is active yet.",
    },
    {
      label: "Origin",
      text: "The event, referral, QR scan, import, or note that explains how the connection began.",
    },
    {
      label: "Evidence",
      text: "The source trail that keeps context reviewable before action is taken.",
    },
    {
      label: "Next action",
      text: "The source-backed next step, held for confirmation before any external message is sent.",
    },
  ];
  const starterFields = [
    {
      label: "Source required",
      text: "Choose the event, referral, import, QR scan, or manual note that created the connection.",
    },
    {
      label: "Context clue",
      text: "Capture one reason this person matters before adding any sales or CRM framing.",
    },
    {
      label: "Suggested next step",
      text: "Name the follow-up that would make sense if the evidence is still accurate.",
    },
    {
      label: "Review before any external action",
      text: "Keep outreach, reminders, and sensitive messages paused for explicit confirmation.",
    },
  ];

  return (
    <main aria-label="Orbit entry" className="orbit-page">
      <section aria-labelledby="orbit-title" className="orbit-shell">
        <div className="orbit-rule" aria-hidden="true" />

        <header className="orbit-entry">
          <p className="orbit-label">Event-grounded relationship workspace</p>
          <h1 className="orbit-title" id="orbit-title">Orbit</h1>
          <p className="orbit-copy">
            A relationship operating system for remembering who you know, why
            the connection exists, what evidence supports it, and which
            sensible follow-up needs confirmation.
          </p>
          <a className="orbit-start-link" href="#relationship-starter">
            Start a sourced relationship note
          </a>
        </header>

        <section
          aria-labelledby="relationship-starter"
          className="orbit-starter"
        >
          <div>
            <p className="orbit-starter-kicker">First action</p>
            <h2 id="relationship-starter">
              Start a sourced relationship note
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

        <section aria-label="Relationship record frame" className="orbit-record">
          <p className="orbit-record-kicker">
            Every relationship record starts with
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

        <ul aria-label="Orbit operating principles" className="orbit-principles">
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
