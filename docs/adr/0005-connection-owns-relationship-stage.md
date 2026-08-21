# Connection owns actor-scoped relationship stage

Orbit stores relationship stage on the current actor's Relationship Connection, not on Contact, Contact Draft, Task, or ContactActorLink. Contact Draft owns only acquisition review state, each actor owns a separate Confirmed Contact for the same real person, and dated Tasks describe actions without redefining the relationship stage; this prevents cross-account state leakage and keeps AI suggestions separate from user-confirmed relationship facts.
