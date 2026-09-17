// Shared verbatim with the existing bounded contacts reader: c/$4/$5 are fixed SQL bindings.
export const CONTACT_ACTOR_AUTHORIZATION_SQL = `(
        c.user_id = $4
        or exists (
          select 1 from orbit_records connection
          where connection.workspace_id = c.workspace_id
            and connection.collection_name = $5
            and connection.lifecycle_state <> 'deleted'
            and (connection.user_id = $4 or connection.payload->>'accountId' = $4)
            and connection.payload->>'contactId' = coalesce(c.payload->>'id', c.record_id)
        )
      )`;
