# Verification Plan Reference

The final `## Verification Plan` must be tailored to the captured design. Do not emit a generic checklist. Map recommendations directly to the claims, assumptions, invariants, state machines, algorithmic and data-structure choices, failure modes, quality attributes, and Alloy findings already present in `sketch.md`.

Use `.opencode/steering/lfm.md` as the source of truth.

## Required Sections

### Claims, Assumptions, Bounds, And Invariants

List the critical claims that must be true for the design to be dependable.

For each claim, include:

- Claim.
- Assumptions.
- Bounds or scope.
- Related invariant or state-machine rule.
- Failure mode it prevents or detects.
- Evidence planned.
- Whether the property is stated at the right level of abstraction to remain meaningful as representations and implementations evolve.

For algorithmic or data-structure claims, include explicit input-size bounds, runtime complexity in Big-O notation, space complexity in Big-O notation, and the evidence that confirms those assumptions.

### Failure-Mode Evidence Mapping

Every failure mode in `## Failure Modes` must map to at least one evidence type. Do not leave a failure mode without evidence or an explicit rationale for why no mechanical check is planned yet.

For each failure mode, record one or more suitable forms of evidence:

- unit test;
- property test;
- metamorphic test;
- Alloy check;
- deductive verification;
- contract or boundary check;
- trace or simulation check;
- fault-injection case;
- regression test or artifact;
- an explicit rationale for why no mechanical check is planned yet.

Where tractable, model the failure mode in Alloy to collect early design evidence during kickoff. Pair each modeled failure mode with a witness that shows the failure can occur without the mitigation and a check that shows the mitigation prevents, rejects, or contains it. Where Alloy is not the right tool, record why and map the failure mode to another evidence type.

### V1 Guarantees And Accepted Risks

Separate what the first version guarantees from what it accepts as a known risk.

- `V1 Guarantees`: invariants and behaviors the first version must uphold, each with planned evidence.
- `Accepted Risks`: risks the first version does not fully mitigate. Each accepted risk must have one of: a mitigation, a warning contract, a future fitness function, or an explicit non-goal. An accepted risk without one of these is not acceptable.

### Checkable Artifact

Choose the smallest checkable artifact that makes the critical behavior explicit. Use a small model when the system has a compact semantic core. Use a protocol model, contract, trace checker, simulation checker, or executable boundary scenario when the property lives across components or system boundaries.

Options include:

- the Alloy fragments in `sketch.md`;
- a small executable reference model in the implementation language;
- a deterministic state-machine model;
- a protocol model for interaction boundaries;
- an interface, schema, or protocol contract;
- an executable boundary scenario;
- a trace or simulation checker;
- an implementation-shaped core for deductive verification.

When an executable reference model is independently derived and connected to observable implementation behavior, it can serve as an oracle for later checking.

Executable models and deductive verification are complementary. A model makes behavior explicit and can provide an independent oracle. Deductive verification proves stated properties of supported code. Use both when they provide different evidence.

### Model Checking Or Deductive Verification

Describe what Alloy should check and with what bounds.

For a critical property in a tractable core supported by the verifier, plan deductive verification early. Use proof obligations and counterexamples to refine the specification, design, and planned implementation.

Recommend language-specific tools only when the implementation language is known:

- Java: OpenJML for contracts, preconditions, postconditions, frame conditions, and local invariants.
- TypeScript: LemmaScript for contracts and deductive verification of the supported deterministic core.

### Algorithmic Complexity And Data-Structure Evidence

Use this section when the sketch includes `## Algorithmic Core And Data Structures` content beyond "not applicable".

For each algorithm or data-structure choice, record:

- Operation or decision point.
- Explicit input-size variables and hard bounds.
- Expected-case runtime complexity in Big-O notation.
- Worst-case runtime complexity in Big-O notation.
- Space complexity in Big-O notation.
- Data structures, indexes, caches, or batching strategy used.
- Invariants that keep derived data, indexes, or caches correct.
- Evidence planned, such as property-based tests, metamorphic tests, benchmarks, back-of-the-envelope analysis, simulation, model checking, or regression thresholds.

Do not accept algorithmic or data-structure design without Big-O runtime, Big-O space, and explicit bounds.

### Differential Testing

Use differential testing when an independent model and comparable observations exist.

When it applies, include:

- operations or histories to generate;
- observations to compare;
- nondeterminism to control;
- the model and implementation boundary;
- why the model is independent and easier to trust than production code.

When direct comparison is unsuitable, plan compatibility checks, executable boundary claims, trace validation, simulation checks, or end-to-end invariant checks. Select the method based on whether the relevant behavior can be controlled and observed reliably.

### Property-Based Tests

Specify generated histories, sequences, state-machine paths, failure modes, and edge cases.

Language-specific defaults:

- Java: jqwik.
- TypeScript: fast-check.

### Metamorphic Tests

Add metamorphic relations that tie invariants together.

Examples:

- Reordering independent operations should not change the final observable state.
- Retrying an idempotent command should not duplicate effects.
- Adding irrelevant data should not change authorization or eligibility decisions.
- Splitting a batch into single operations should match the batch result when the domain says they are equivalent.
- Serializing and deserializing valid state should preserve invariants.
- Reordering independent inputs should not change the result when the algorithm claims order independence.
- Splitting or merging batches should preserve results when batching is an implementation detail.
- Adding irrelevant records should not change lookup, ranking, eligibility, authorization, or matching decisions.
- Rebuilding an index or cache from source data should match incremental updates.

### Evolution Fitness Functions

Identify objective checks that protect architectural characteristics as the system evolves.

Examples:

- Dependency rules that prevent forbidden coupling.
- Contract tests for public APIs or provider interfaces.
- Schema migration tests and backward/forward compatibility checks.
- Performance, reliability, or security thresholds that must not regress.
- Architecture tests that enforce module boundaries.
- Model checks or property tests that must continue passing as new states, roles, or integrations are added.

### Concurrency, Simulation, And Fault Injection

Use this section when the sketch mentions concurrency, retries, dependency failures, partial writes, timeouts, performance, capacity, or queues.

Options include:

- Deterministic simulation for time, retries, queues, or capacity behavior.
- Fault injection for dependency failures and partial progress.
- Schedule or interleaving exploration.
- Java: Fray for concurrency schedules where relevant.
- Python simulation for quick feasibility checks when Alloy is not the right tool.

### Regression Tests From Counterexamples

Every Alloy counterexample, failed proof obligation, property-test failure, fault-injection seed, or simulation-discovered boundary should become a permanent regression test or artifact.

A regression artifact can be a test, minimized trace, saved seed, failing proof obligation, bounded counterexample, or another mechanically re-checkable reproduction.

Every failure mode that Alloy did not model must still map to suitable mechanical evidence.

Record:

- counterexample source;
- minimal reproduction;
- expected behavior;
- regression test or artifact location, or its planned location.

### Static Analysis, Contracts, And Compile-Time Checks

Recommend contracts and static checks for:

- Preconditions and postconditions.
- Non-null or optionality discipline.
- Exhaustive state handling.
- Type-level distinctions for IDs, states, commands, and trusted/untrusted data.
- Serialization boundaries.
- Security-sensitive policy checks.

### CI Automation

Specify what should run on every change:

- Unit and regression tests.
- Property-based tests with saved seeds.
- Alloy checks or extracted model checks.
- Contract or static verification where configured.
- Deductive verification for supported tractable cores.
- Simulation or fault-injection smoke checks for risky paths.
- Artifact freshness checks if generated models or diagrams are used.
- Evidence freshness checks for versioned component constellations where relevant.

## Tailoring Rules

- If the design has no state machine, explain why state-machine history testing is not needed yet.
- If there are writes, include invariants and regression tests around partial progress and duplicate commands.
- If there are reads, include stale-read and authorization/privacy tests where relevant.
- If there are external effects, include idempotency, compensation, and failure-injection evidence.
- If there are liveness claims, include fairness assumptions and tests or model checks that exercise starvation/retry behavior.
- If latency, throughput, or capacity are important, include measurable scenarios and a back-of-the-envelope or simulation plan.
- If the design has algorithmic or data-structure work, include explicit input bounds plus Big-O runtime and space complexity for each algorithm or structure.
- If complexity depends on multiple variables, define each one and include worst-case behavior.
- If the design uses indexes, caches, derived data, queues, heaps, graphs, trees, or batch processing, include invariant checks that keep those structures consistent with source data.
- If the algorithm has ordering, ranking, matching, scheduling, fairness, or tie-breaking behavior, include property-based and metamorphic tests for determinism, edge cases, and adversarial inputs.
- If memory can grow with input size, include streaming, pagination, backpressure, hard limits, or memory regression tests.
- If security or privacy are important, include negative tests, policy invariants, and static checks around trust boundaries.
- If future integrations are likely, include contract tests and provider-interface compatibility checks.
- If schema evolution is likely, include migration, rollback, and backward/forward compatibility tests.
- If new user roles or tenants are likely, include authorization and isolation fitness functions.
- If scale is expected to change significantly, include performance and capacity regression thresholds.
- If a critical property spans independently versioned components or services, identify the component combination and system boundary covered by the evidence. State what will be checked per component, what will be observed end to end, what will be checked at boundaries or across protocols, and what remains assumed or outside the claim.
- If the implementation language is unknown, avoid naming language-specific tools and describe the evidence category instead.
