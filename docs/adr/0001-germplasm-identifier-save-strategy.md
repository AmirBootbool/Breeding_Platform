# ADR-0001: Germplasm Identifier Save Strategy

- Status: Accepted
- Date: 2026-07-20

## Context

`Germplasm.germplasm_db_id` defaults to a human-readable value derived from
the database primary key, such as `G000123`. The primary key is assigned by the
database.

On PostgreSQL, the model reserves the next sequence value before insertion,
sets both identifiers, and performs one ORM insert. SQLite does not expose the
same sequence operation. Its development path inserts once to obtain the
primary key and then issues a direct `UPDATE` for `germplasm_db_id`.

The SQLite follow-up update bypasses model signals for that field and means a
`post_save` receiver for the initial insert can briefly observe a blank
`germplasm_db_id`. Production PostgreSQL does not have that behavior.

## Decision

Retain the current database-specific implementation.

The PostgreSQL production path is the operational priority and already writes
the complete row with one insert. The SQLite behavior is accepted for local
development and tests because the identifier is populated before
`save()` returns, the follow-up write is narrowly scoped, and existing tests
cover generated identifier behavior.

Do not move this logic to a `pre_save` signal. A pre-save receiver runs before
SQLite assigns the auto-incremented primary key, so it cannot derive the
required identifier and would only relocate the problem. A signal-based
solution would also make persistence behavior less visible than the model
method.

## Consequences

- Production PostgreSQL retains its single-insert path.
- SQLite performs an insert followed by a direct update for new records whose
  identifier was omitted.
- Code that depends on `post_save(created=True)` seeing the generated
  identifier is unsupported on SQLite and must be tested against PostgreSQL or
  deferred until after `save()` returns.
- If identical signal semantics across databases become a requirement, the
  identifier format should be decoupled from the database primary key, for
  example by using a UUID or a separate allocation mechanism.

## Alternatives Considered

- `pre_save` signal: rejected because the SQLite primary key is not yet
  available.
- `post_save` signal: rejected because it still requires a second write and
  hides the behavior.
- Database-independent UUID: valid future option, but changes the established
  external identifier format.
