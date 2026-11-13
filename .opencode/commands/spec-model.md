---
description: Annotate OpenSpec Requirements with Alloy model blocks, such that a spec.md is a complete model of the system
agent: build
subtask: true
---

Annotate each section of the recent spec.md file with Alloy model code blocks that describe the system,
preconditions, postconditions, and invariants. Model failure modes.  Show liveness and safety properties.

Examples of specs with Alloy model blocks:
 * https://raw.githubusercontent.com/ohpauleez/spec-check/refs/heads/main/openspec/specs/claim-graph-and-coverage/spec.md
 * https://raw.githubusercontent.com/ohpauleez/spec-check/refs/heads/main/openspec/specs/formalization-and-logic-analysis/spec.md

If the spec.md file already contains Alloy blocks, ensure those blocks still accurately capture the details of the specification,
and add any new or missing precondition/postconditions, invariants, failure modes, or liveness/safety properties.

All state machines and failure modes described in the specification should be modeled.


Ask clarifying questions.
$ARGUMENTS
