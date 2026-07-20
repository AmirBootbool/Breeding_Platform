# ADR-0002: Global ObservationVariable Scope

- Status: Accepted
- Date: 2026-07-20

## Context

Observation variables define the trait vocabulary used by observations,
Field Book exchange, trial summaries, and BrAPI observation-variable
resources. They currently have no foreign key to `Program`.

Program-scoped variables would let separate programs define the same name with
different units or ranges. They would also duplicate common wheat traits,
complicate cross-program reporting and BrAPI lookup, and require program
context in every import and observation-variable query.

## Decision

Keep `ObservationVariable` global.

The platform favors a shared, curated trait vocabulary across breeding
programs. A variable name/code should have one agreed meaning, unit, data type,
and validation range. This improves interoperability, makes Field Book headers
and BrAPI identifiers reusable, and supports comparisons across programs.

## Consequences

- Programs share observation-variable definitions.
- Conflicting local meanings must be resolved through vocabulary governance,
  preferably with distinct stable `variable_code` values and explicit names,
  rather than by silently redefining a global trait.
- Breeders with write access can currently manage the shared vocabulary, so
  operational processes should treat variable changes as cross-program
  changes.
- If independent institutional vocabularies become necessary, a future change
  can add a namespace or owner field without making every variable strictly
  program-scoped.

## Alternatives Considered

- Program foreign key: rejected for now because it duplicates common traits
  and weakens cross-program interoperability.
- Many-to-many availability by program: deferred until access control or
  vocabulary visibility requires it.
- Namespace/ontology ownership: compatible with this decision and preferred
  over strict program scoping if conflicts become common.
