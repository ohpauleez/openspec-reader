# Progressive Review Reference

After each substantial `sketch.md` update, perform a short design review. Use the review to improve the sketch and to choose the next question batch.

## Review Dimensions

- Completeness.
- Internal consistency.
- Unstated assumptions.
- Ambiguous terms.
- Missing bounds.
- Algorithmic or data-structure work without explicit input-size bounds.
- Algorithmic or data-structure work without Big-O runtime and space complexity.
- Algorithmic choices where expected-case and worst-case behavior differ but are not separated.
- Data structures, indexes, or caches without invariants that keep them correct.
- Missing failure modes.
- Unmodeled state.
- Unclear ownership.
- Unsafe transitions.
- Weak safety claims.
- Critical properties stated at an abstraction level that remains meaningful as representations and implementations evolve.
- Unsupported liveness claims.
- Missing fairness assumptions.
- Quality attribute tradeoffs.
- Sensitive data leakage paths.
- Relevant input attack classes.
- Authentication, authorization, session, role, tenant, and privilege boundaries.
- External connectivity controls, including timeouts, retries, rate limits, circuit breakers, authentication, and fallbacks.
- Nondeterminism that should stay at system edges.
- Coupling between reads, writes, pure computation, storage, network, time, and other I/O.
- Resource exhaustion risks, hard limits, and backpressure behavior.
- Dependency, provider, browser, plugin, and platform attack surface.
- Evolvability and likely future change.
- Architectural seams and extension points.
- Compatibility and migration risks.
- Missing fitness functions for architectural characteristics.
- Verification gaps.
- Missing algorithmic evidence, such as property-based tests, metamorphic tests, benchmarks, simulation, or back-of-the-envelope checks.
- Alloy satisfiability, underconstraint, overconstraint, and vacuity risks.
- Alloy checks that are vacuous or tautological, where the assertion restates a fact, validity predicate, field multiplicity, or event postcondition.
- Alloy runs that revealed nothing new, which may indicate tautology-only modeling that teaches the engineer nothing.
- Mitigation checks that are tautological, where the mitigation predicate is the direct negation of the bad-state predicate asserted on a hand-built instance, with no construction event and no mitigation-removed counterexample.
- Success outputs that are constrained only if present, with no witness that the output is created.
- Invalid states that are not reachable from `init` yet claimed as fail-closed evidence.
- Failure modes not mapped to verification evidence.
- Accepted risks without a mitigation, warning contract, future fitness function, or explicit non-goal.
- Expected bounds and hard bounds mixed together instead of separated.
- Repetition or bloat: canonical facts such as success criteria, bounds, or determinism claims restated across multiple sections instead of stated once and cross-referenced.
- Section depth that does not scale to feature complexity, such as full expansions for a trivially small feature.

## Output To Record

Write concise notes under `## Progressive Review Notes` using these subsections:

- `### Completeness`: what important design information is still absent.
- `### Consistency`: contradictions or terminology mismatches.
- `### Risks`: concrete design risks and why they matter.
- `### Alternatives`: credible alternatives worth keeping open.
- `### Decisions To Revisit`: decisions that depend on later answers or evidence.

Also update `## Open Questions` with user-facing questions that should be asked in later rounds.

## Review Method

1. Read the current sketch as if it is the only design artifact available.
2. Identify what claims are explicit and what claims are implied but unstated. Check whether each critical property states the intended outcome rather than only the current representation or implementation.
3. Check whether the domain model supports the data-flow story.
4. Check whether state-machine events account for all writes and external effects.
5. Check whether invariants constrain the states and transitions that matter.
6. Check whether safety claims have concrete bad states.
7. Check whether each Alloy check is meaningful: the assertion is independent of the facts it depends on, the bad state is representable and reachable from `init`, and a witness exists with the mitigation removed. Flag any check that restates a fact or only constrains outputs if present. For each mitigation check, confirm the central output is built by an event and that removing the mitigation yields a counterexample (SAT); flag any `mitigation_blocks_X` that stays UNSAT with the mitigation removed as a tautology.
8. Check whether liveness claims include fairness assumptions.
8. Check whether liveness claims include fairness assumptions.
9. Check whether algorithmic or data-structure work has explicit input-size bounds, runtime complexity in Big-O notation, and space complexity in Big-O notation.
10. Check whether expected-case and worst-case complexity are separated where they differ.
11. Check whether data structures, indexes, caches, queues, heaps, graphs, trees, or derived data have invariants that keep them correct.
12. Check whether algorithmic evidence is adequate, such as property-based tests, metamorphic tests, benchmarks, simulation, or back-of-the-envelope analysis.
13. Check whether quality attributes are measurable scenarios, not adjectives.
14. Check whether sensitive data has explicit leakage boundaries for logs, errors, metrics, traces, URLs, audit records, and third-party calls.
15. Check whether relevant input attack classes are named for untrusted, rendered, file-based, path-like, serialized, query-like, or command-like inputs.
16. Check whether authentication, authorization, session, role, tenant, and privilege boundaries are explicit where they affect correctness or security.
17. Check whether external connectivity has bounded timeout, retry, rate-limit, circuit-breaker, authentication, and fallback behavior where relevant.
18. Check whether nondeterministic sources such as time, randomness, networks, queues, schedulers, and clocks are isolated at system edges where practical.
19. Check whether reads, writes, pure computation, storage, network, time, and other I/O are intentionally separated or intentionally coupled.
20. Check whether resource exhaustion risks have hard limits, backpressure, or safe overload behavior.
21. Check whether dependency, provider, browser, plugin, and platform attack surfaces are constrained.
22. Check whether failure modes include partial progress, retries, duplicated commands, stale reads, lost updates, dependency failures, and operator mistakes where relevant.
23. Check whether each failure mode maps to verification evidence, and whether each accepted risk has a mitigation, warning contract, future fitness function, or explicit non-goal.
24. Check whether verification evidence is strong enough for the risk level.
25. Check whether the design preserves room for likely future evolution without overbuilding the first version.
26. Check whether architectural characteristics that must not degrade have candidate fitness functions.
27. Check whether compatibility and migration risks are explicit.
28. Check whether the sketch is concise: canonical facts stated once and cross-referenced, section depth scaled to feature complexity, and dense Alloy or verification matrices moved to appendices when long.

## Follow-Up Question Selection

Prefer questions that close the highest-risk gap first.

Good follow-up questions are specific and answerable:

- Instead of "What are your invariants?", ask "What must remain true after a retry, even if the first attempt partially succeeded?"
- Instead of "What is your latency requirement?", ask "At peak load, what response time would users notice as failure?"
- Instead of "What are failure modes?", ask "If the write succeeds but the notification fails, what should the user and system observe?"

Use these follow-up questions to drive formal-evidence quality:

- What output must exist after a successful operation?
- How could this property fail if the guard were removed?
- Is this a v1 guarantee or an accepted risk?

Run a required discovery loop. Every Alloy counterexample and every surprising Phase A instance must generate at least one follow-up question in `## Open Questions`. Do not silently absorb a discovery.

## Diagram Updates

Suggest a Mermaid diagram when it would clarify:

- System boundary.
- User or dependency interaction sequence.
- Entity relationships.
- Lifecycle states and transitions.
- Retry, compensation, or recovery paths.
- Operational flow for quality-attribute tradeoffs.
- Algorithm flow, data-structure shape, index or cache coherence, batching, streaming, or ranking behavior.
- Evolution roadmap, capability map, or dependency boundary changes.
- Sensitive data flow across trust boundaries.
- Deterministic core and edge adapter separation.
- Read/write paths and I/O boundaries.
- Connectivity control, backpressure, or dependency-failure behavior.

## Alloy Updates

Suggest Alloy updates when a finding involves:

- Entity identity or ownership.
- Multiplicity or uniqueness.
- Legal and illegal relationships.
- Lifecycle states.
- Transition legality.
- Reachability of bad states.
- Idempotency, ordering, or concurrency hazards.
- Safety invariants.
- Bounded data-structure invariants, such as membership, uniqueness, ordering, reachability, index consistency, cache coherence, or graph constraints.
