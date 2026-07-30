"use client";

import { Field } from "../../../shared/ui/primitives";
import { useApiProbeForm } from "../../../shared/ui/api-probe-form";

export function ContactDetailEditForm() {
  const { result, submit } = useApiProbeForm();

  return (
    <form
      action="/api/contacts/demo-contact-1"
      aria-label="Mock contact detail tag and status edit form"
      className="control-stack"
      data-api-probe-method="PATCH"
      data-api-probe-state={result.state}
      method="post"
      onSubmit={(event) =>
        void submit(event, {
          action: "/api/contacts/demo-contact-1",
          arrayFields: ["addTags"],
          method: "PATCH",
        })
      }
    >
      <Field label="Status" helper="No live contact store is written.">
        <select name="status" defaultValue="active">
          <option value="active">Active</option>
          <option value="needs_follow_up">Needs follow-up</option>
          <option value="nurture">Nurture</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      <Field label="Add tag" helper="Local fixture tag options only.">
        <select name="addTags" defaultValue="topic:venture-ecosystem">
          <option value="topic:venture-ecosystem">
            topic:venture-ecosystem
          </option>
          <option value="topic:storage-pilots">topic:storage-pilots</option>
          <option value="priority:warm-follow-up">
            priority:warm-follow-up
          </option>
        </select>
      </Field>
      <Field label="Note" helper="Stored only in the deterministic response.">
        <textarea
          name="note"
          defaultValue="Confirmed partner review context before changing status."
          rows={3}
        />
      </Field>
      <button className="primary-action" type="submit">
        Preview mock update
      </button>
      <output aria-live="polite" className="type-caption">
        {result.message}
      </output>
    </form>
  );
}

export function ContactDetailApiProbeForms() {
  const { result, submit } = useApiProbeForm();
  const submitGet = (
    event: Parameters<typeof submit>[0],
  ) =>
    submit(event, {
      action: "/api/contacts/demo-contact-1",
      method: "GET",
    });

  return (
    <>
      <div className="button-row">
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run contact detail API probe"
          method="get"
          onSubmit={(event) => void submitGet(event)}
        >
          <button className="secondary-action" type="submit">
            Run detail probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run empty contact detail API probe"
          method="get"
          onSubmit={(event) => void submitGet(event)}
        >
          <input name="scenario" type="hidden" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run pending contact detail API probe"
          method="get"
          onSubmit={(event) => void submitGet(event)}
        >
          <input name="scenario" type="hidden" value="pending" />
          <button className="secondary-action" type="submit">
            Run pending probe
          </button>
        </form>
        <form
          action="/api/contacts/demo-contact-1"
          aria-label="Run controlled failure contact detail API probe"
          method="get"
          onSubmit={(event) => void submitGet(event)}
        >
          <input name="scenario" type="hidden" value="failure" />
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
      <output aria-live="polite" className="type-caption">
        {result.message}
      </output>
    </>
  );
}
