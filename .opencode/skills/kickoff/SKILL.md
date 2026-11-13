---
name: kickoff
description: Start initial project or feature design by progressively building sketch.md with domain models, state machines, optional algorithm and data-structure design, invariants, quality attributes, failure modes, Alloy fragments, Mermaid diagrams, and a lightweight formal methods verification plan.
license: MIT
metadata:
  domain: architecture-design
  workflow: kickoff
---

# Kickoff Skill

Use this skill when the user wants to start, explore, or clarify the initial design of a project, product feature, subsystem, service, workflow, protocol, or architecture before implementation.

The outcome is a standalone `./sketch.md` that captures the design's motivation, grand vision, likely evolution paths, scope, system boundary, data flow, domain model, state machines, algorithmic core and data structures when relevant, invariants, safety and liveness claims, quality attributes, failure modes, Alloy findings, progressive review notes, and a tailored verification plan.

## Hard Boundaries

- Do not create OpenSpec artifacts.
- Do not suggest OpenSpec commands.
- Use `srs-driven` ideas only as loose inspiration for complete design and architecture coverage.
- Keep `sketch.md` valuable in isolation.
- Load the `alloy` skill before writing, reviewing, running, or interpreting Alloy.
- Use Alloy for two purposes: (a) bounded evidence for design claims, and (b) discovery of gaps, such as unstated invariants, unconsidered reachable states, illegal transitions that are currently legal, and reachable bad states not yet named. Both are required. Evidence alone is not enough.
- Load the `ste-writing` skill before creating or updating prose in `sketch.md`.
- Prefer Simplified Technical English for `sketch.md` prose.
- Do not apply STE rules to code, Alloy syntax, Mermaid syntax, identifiers, or quoted user text.
- Treat Alloy as bounded analysis, not proof.
- Alloy execution is not evidence by itself. Every Alloy `check` must be meaningful. Do not present a check that restates a fact, is vacuous, or has an unreachable bad state as strong evidence. Run the formal-evidence self-audit before the verification plan.
- Model in Alloy where it produces meaningful, non-tautological evidence. Do not model for coverage alone.
- Keep `sketch.md` concise. State each canonical fact once and cross-reference it. Scale section depth to feature complexity. Do not pad a small design with full expansions of every section.
- For any algorithmic or data-structure design work, always require explicit input-size bounds, runtime complexity in Big-O notation, and space complexity in Big-O notation.

## Required References

Read these local references before running the workflow:

- `reference/sketch-template.md` for the document structure.
- `reference/question-bank.md` for adaptive question selection.
- `reference/alloy-embedding.md` for progressive Alloy modeling and execution.
- `reference/progressive-review.md` for design review after each substantial update.
- `reference/verification-plan.md` for the final verification plan.
- `.opencode/steering/lfm.md` as the source of truth for lightweight formal methods and the verification pyramid.
- The `ste-writing` skill for Simplified Technical English guidance and linting support.

## Workflow

1. Load `alloy` before any Alloy work.
2. Load `ste-writing` before creating or updating prose in `sketch.md`.
3. If `./sketch.md` is absent, create it from `reference/sketch-template.md`.
4. Read the current `sketch.md` before each question round.
5. Select the next useful question batch from `reference/question-bank.md`; adapt based on prior answers, missing design perspectives, Alloy findings, counterexamples, vacuity risks, consistency review, quality-attribute tradeoffs, and failure-mode gaps.
6. Provide an updated context to the user and **ALWAYS** display every selected question for the current round in normal chat before asking them. Briefly explain why the question batch matters and include examples and diagrams where useful.
7. Use one separate `question` tool entry per selected question. Each entry must allow free-form answers and should include structured choices where they reduce friction.
8. Update `sketch.md` automatically after each answered round.
9. After each prose update, revise the changed text in STE-flavored mode. Keep technical nouns precise, use one name for one thing, prefer active voice, and split long sentences.
10. Add or update Mermaid diagrams when they clarify context, flow, states, failure handling, or tradeoffs.
11. After each answered round with meaningful modelable content, run Alloy in two phases using the rules in `reference/alloy-embedding.md`. First run the Phase A discovery pass: use loose, under-constrained models to surface gaps, unconsidered reachable states, and reachable bad states. Inspect at least one generated instance or counterexample and confirm every instance is valid, or raise a question or add an invariant. Then run the Phase B evidence pass: tighten the model and add non-tautological, load-bearing checks. Record each Phase A discovery as a new invariant, a new failure mode, an updated state machine, or an Open Question. A discovery that is silently absorbed does not count.
11a. After each Alloy run, explain the result to the user before the next question batch. Include what Alloy modeled in design language, what Alloy did not model, what witnesses or counterexamples revealed, which state machine, invariant, or failure mode is now clearer, which design question follows from the result, and whether the result is strong bounded evidence, weak evidence, or only a candidate model.
12. If no meaningful Alloy content exists, record why Alloy was skipped in `## Alloy Findings`.
13. Record checks, scopes, counterexamples, gaps, ambiguity, extraction limitations, and interpretation in `## Alloy Findings`.
14. After each substantial update, run the progressive review in `reference/progressive-review.md` and record implications in `## Progressive Review Notes`.
15. Use findings and review notes to drive the next question batch.
16. After the failure-mode round and before writing the `## Verification Plan`, run the formal-evidence self-audit from `reference/alloy-embedding.md` against every Alloy `check` and `assert`. This is a hard requirement. For each safety check confirm it is independent of the facts it depends on, has a SAT witness of the bad state with the mitigation removed, and reaches the bad state from `init` or is a labeled structural-only check. Fix each failure or declare it a gap. Record the audit and its per-check outcome in `## Alloy Findings`.
17. Before completing the sketch, use the STE linting tool from `ste-writing` where practical. Treat lint output as guidance, not certification.
18. End by adding a tailored `## Verification Plan` mapped directly to `.opencode/steering/lfm.md` and `reference/verification-plan.md`.
19. Whenever algorithmic or data-structure design occurs, require explicit bounds plus time and space complexity analysis in Big-O notation. Do not leave algorithmic choices without stated runtime, space, and input-size assumptions.
20. Keep the sketch concise. State each hard bound, determinism claim, and success criterion once in its canonical section and cross-reference it elsewhere. Scale section depth to feature complexity. Use a brief "not applicable" or "trivial" note for a section that does not apply to a small feature. Move dense Alloy listings and verification matrices to appendices when the main sketch grows long. Concision must not drop required template sections or reduce failure-mode and risk coverage.
21. Ask if the user would like to perform another round of the workflow

## Question Rounds

Use these rounds as the normal progression, but do not treat them as a rigid script. Revisit earlier topics when new answers expose gaps.

### R0 Framing

Purpose: establish motivation, grand vision, likely evolution paths, problem, scope, users, stakeholders, success criteria, and references.

Required seed question:

- Do you have existing reference material, like a product brief or architectural docs, for your feature? If so, link it.
- What is the grand vision for this project? How is it likely to evolve in the future?

Usually skip Alloy unless concrete entities or constraints are already exposed.

Treat forward evolution as a first-class design property. Capture likely future change dimensions, architectural seams, compatibility concerns, migration risks, and candidate fitness functions that can protect important architectural characteristics as the system changes.

### R1 Data Flow

Purpose: identify system boundary and data movement.

Required seed questions:

- Does your feature involve the user sending new data into the system? If so, describe it.
- What is the shape of the data, the transport path, and the semantic behavior of each important data flow, such as JSON over direct HTTP, Protobuf through a message bus, or streaming async events?
- Does your feature involve reading some data that already exists within the system? If so, describe it.
- Does your feature involve writing new data into the system? If so, describe it.

Begin structural Alloy if entities, relationships, or constraints are identifiable.

### R2 Domain Model

Purpose: extract entities, relationships, identity, ownership, multiplicities, responsibilities, validity rules, integrity rules, bounded sets, and invalid entity states.

Add structural Alloy signatures and facts. Prefer predicates to global facts where checks and witnesses will be useful. Keep a satisfiable `run show {}`.

Run the Phase A discovery pass: for each entity, inspect at least one generated instance and ask whether every instance is valid in this design. Each surprising instance is a candidate invalid state, missing invariant, or missing multiplicity.

### R3 State Machines

Purpose: identify lifecycle states, events, commands, legal transitions, illegal transitions, retries, ordering guarantees, terminal states, and recovery behavior.

Add behavioral Alloy with `var` state, `init`, event predicates, frame conditions, `stutter`, and transition facts. Add Mermaid state diagrams.

Run the Phase A discovery pass: enumerate reachable states and diff them against the states listed in `## State Machines`. Any reachable state not listed is a discovered gap that becomes a question or an updated state machine.

When a lifecycle is captured, the behavioral model must include a transition-preservation check, such as `always (inv and next implies after inv)`, or `## Alloy Findings` must record why a static structural check is sufficient. A static implication over a single state is weak evidence for a lifecycle. Do not leave a captured state machine with only a structural gate. For each high-risk transition guard, add a behavioral counterfactual: build a second transition system with that one guard removed and `run` for a trace that reaches the bad state from `init`, so the bad state is a live counterexample rather than a declared gap. Deferring the counterfactual to the structural model when a lifecycle exists is a gap, not full behavioral evidence. See the behavioral transition counterfactual fragment in `reference/alloy-embedding.md`.

### R3A Algorithmic Core And Data Structures

Purpose: optionally identify nontrivial algorithms, data structures, indexes, caches, scheduling policies, ranking rules, matching rules, batching, parsing, graph or tree traversal, conflict resolution, or performance-critical transformations.

Ask this round only when the current project or feature has meaningful algorithmic or data-structure design work. Use a screening question after R3. If no such work exists, record that no dedicated algorithmic design is needed yet and continue to R4.

When this round applies, always capture explicit input-size bounds, domain bounds, runtime complexity in Big-O notation, and space complexity in Big-O notation. Include expected-case and worst-case complexity when they differ. Also capture memory behavior, streaming or full-materialization needs, I/O shape, database index or cache needs, determinism, ordering, tie-breaking, edge cases, and alternatives considered.

Use Alloy for structural data invariants, ordering constraints, and small bounded algorithmic models where useful. Use property-based tests, metamorphic tests, simulation, back-of-the-envelope analysis, or benchmarks where Alloy is not the right tool.

### R4 Invariants And Properties

Purpose: identify preconditions, postconditions, invariants, safety claims, liveness claims, fairness assumptions, bounds, and critical correctness properties.

Add Alloy assertions and checks. Add liveness only with explicit fairness assumptions. Use counterexamples and vacuity risks to drive follow-up questions.

### R5 Quality Attributes And Assumptions

Purpose: make non-functional requirements concrete and measurable.

Cover reliability, latency, availability, security, privacy, observability, scalability, operability, throughput, capacity, resource limits, assumptions, and dependencies.

Use [utility trees](https://www.pisakov.com/posts/utility-tree-in-software-architecture/), [ATAM-style tradeoff discussion](https://en.wikipedia.org/wiki/Architecture_tradeoff_analysis_method), Little's Law, [back-of-the-envelope feasibility checks](https://cacm.acm.org/opinion/back-of-the-envelope/), and [simple Python simulation](https://brooker.co.za/blog/2022/04/11/simulation.html) where Alloy is not the right tool. Run Alloy only for structural, stateful, or protocol-like quality concerns.

### R6 Failure Modes

Purpose: identify unsafe inputs, stale reads, partial writes, duplicate commands, lost updates, timeouts, dependency failures, crash/recovery, retries, idempotency, concurrency hazards, corruption, and operator mistakes.

Add negative scenarios, unwanted-behavior predicates, witnesses, and checks where appropriate. Use Alloy to search for reachable bad states.

Run the Phase A discovery pass: for every event that mutates state or builds output, probe its scope. Ask whether the event can affect more than one target, produce zero outputs, or run before its guard. A permissive answer is a discovered failure mode.

### Final Verification Planning

Purpose: add an initial verification plan tailored to the captured design.

Map directly to the lightweight formal methods pyramid:

1. Explicit claims, assumptions, bounds, and invariants.
2. A small checkable specification, model, contract, or boundary scenario.
3. Proofs, deductive verification, or model checking for the tractable core.
4. Differential testing when an independent model and comparable observations exist.
5. Property-based tests over histories, sequences, state machines, failure modes, and edge cases.
6. Metamorphic tests tying relations and invariants together.
7. Concurrency testing, deterministic simulation, or fault injection where relevant.
8. A permanent regression test or artifact for every discovered counterexample.
9. Static analysis, contracts, and compile-time checks.
10. CI automation so evidence is re-checked on every change.

Treat the pyramid as an evidence portfolio, not a rigid sequence. Select the strongest economical evidence for each critical property. Deductive verification and executable models are peers in this portfolio and can be used together.

Kickoff gives metamorphic testing its own layer because metamorphic relations connect invariants across related inputs, operations, histories, and representations.

Recommend language-specific tools only when the implementation language is known:

- Java: JUnit, jqwik, Fray, OpenJML.
- TypeScript: Vitest, fast-check, LemmaScript.

Every critical claim, safety or liveness property, state machine, failure mode, and invariant must map to suitable mechanical evidence. For a critical property in a tractable core supported by the verifier, plan deductive verification early. Use property-based tests for generated histories and stateful behavior. Use metamorphic tests to connect invariants and relations across inputs, operations, histories, and representations. Use differential testing when an independent model and comparable observations exist. Layer different techniques for defense in depth.

## Tone

Guide gently and pragmatically. Engineers using this skill may not know architecture or formal-methods terminology. Explain concepts briefly, give concrete examples, and connect each answer to design implications without making the user feel examined.

Write `sketch.md` in STE-flavored mode from the `ste-writing` skill. Use short, direct sentences. Prefer active voice. Avoid semicolons, contractions, marketing adjectives, and unnecessary nominalizations. Preserve exact technical terms when a simpler word would reduce precision.

Underscore the importance to the engineer: Every detail and question answered during `kickoff` is a defect not shipped to production.
