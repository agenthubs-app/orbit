"use client";

import { Field } from "../../../shared/ui/primitives";
import { useApiProbeForm } from "../../../shared/ui/api-probe-form";
import { RELATIONSHIP_PROFILE_TYPES } from "../profile-contract";

export function RelationshipProfileEditForm() {
  const { result, submit } = useApiProbeForm();

  return (
    <form
      action="/api/connections/demo-connection-1/profile"
      aria-label="Mock relationship profile form"
      className="control-stack"
      data-api-probe-method="PATCH"
      data-api-probe-state={result.state}
      method="post"
      onSubmit={(event) =>
        void submit(event, {
          action: "/api/connections/demo-connection-1/profile",
          method: "PATCH",
        })
      }
    >
      <Field label="Relationship type" helper="Local profile types only.">
        <select name="relationshipType" defaultValue="customer_candidate">
          {RELATIONSHIP_PROFILE_TYPES.map((relationshipType) => (
            <option key={relationshipType} value={relationshipType}>
              {relationshipType}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Context" helper="No external context source is queried.">
        <textarea
          name="context"
          defaultValue="Kenji asked for a storage pilot operator introduction after the climate founders dinner."
          rows={3}
        />
      </Field>
      <button className="primary-action" type="submit">
        Preview profile update
      </button>
      <output aria-live="polite" className="type-caption">
        {result.message}
      </output>
    </form>
  );
}

export function RelationshipApiProbeForms() {
  const { result, submit } = useApiProbeForm();

  return (
    <>
      <div className="button-row">
        <form
          action="/api/connections/demo-connection-1/stage"
          aria-label="Run relationship stage probe"
          method="post"
          onSubmit={(event) =>
            void submit(event, {
              action: "/api/connections/demo-connection-1/stage",
              method: "PATCH",
            })
          }
        >
          <button className="secondary-action" type="submit">
            Run stage probe
          </button>
        </form>
        <form
          action="/api/connections/demo-connection-1/profile"
          aria-label="Run relationship profile probe"
          method="post"
          onSubmit={(event) =>
            void submit(event, {
              action: "/api/connections/demo-connection-1/profile",
              method: "PATCH",
            })
          }
        >
          <button className="secondary-action" type="submit">
            Run profile probe
          </button>
        </form>
      </div>
      <output aria-live="polite" className="type-caption">
        {result.message}
      </output>
    </>
  );
}
