# Lightweight Formal Methods in Practice

This guide explains how lightweight formal methods fit into a spec-driven workflow. It complements the style guides like [`java_style.md`](java_style.md), [`typescript_style.md`](typescript_style.md), [`java_state_machines.md`](java_state_machines.md), and others by focusing on workflow, artifacts, and evidence rather than code-level rules.

Lightweight formal methods are not about proving an entire system correct. They are about making the critical parts of a system explicit enough that they can be checked mechanically and evolved safely. Many costly failures begin in requirements, assumptions, and design, well before code is produced. So the goal is not universal proof -- The goal is to identify the critical properties, produce direct evidence that they hold, and keep that evidence alive as the system changes.

Recent industrial examples converge on the same pattern. Brooker emphasizes [invariant-first reasoning](https://brooker.co.za/blog/2023/07/28/ds-testing.html). AWS/S3 shows that a live product team can [use executable reference models](https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3) and automated checks without aiming for full formal verification. Cedar shows [verification-guided development](https://www.amazon.science/publications/how-we-built-cedar-a-verification-guided-approach) around an executable model, proofs, differential random testing, metamorphic testing, and property-based testing. Datadog/`redis-rust` shows the [same idea in the age of agents](https://www.datadoghq.com/blog/ai/harness-first-agents/): generated code must answer to objective, mechanical pass/fail checks, and the verification harness matters as much as the implementation.

In a spec-driven and agent-assisted workflow, this matters even more. Code is cheaper to generate, but trust is not.

## Direct evidence is best

A system is dependable only when there is good reason to trust it. Processes, tools, and standards matter, but they are indirect. The stronger question is: what evidence do we have that this system preserves its critical properties in the situations that matter?

That evidence can take many forms:

- a clearly stated claim about a critical property;
- explicit assumptions about the environment, operators, and dependencies;
- a small executable model or other checkable specification;
- a proof, model-checking result, or static analysis result for a tractable core;
- a differential test showing that implementation and model agree;
- property-based tests over histories, not just isolated calls;
- a fault-injection seed or schedule that exercises a risky path;
- contracts, assertions, and review notes that explain why the argument is credible.

Treat this evidence as a work product. For a nontrivial change, the outcome should be a small dependability case: the claims, assumptions, models, checks, and results that justify trust in the change.

This is also why [a direct approach](https://cacm.acm.org/research/a-direct-path-to-dependable-software/) rewards innovation. The team is judged by the value/outcome delivered and the quality of its evidence, not by blind adherence to one prescribed technique.

## Start from critical properties and invariants

The first step is not choosing a tool. The first step is identifying what must be true.

Ask:

- What must always be true for the system to be correct?
- What must never happen?
- What states exist?
- What transitions are legal?
- What are the critical or defining properties of this entity?
- What [quality attributes](https://en.wikipedia.org/wiki/List_of_system_quality_attributes) are important and why? (limits, rates, security, reliability, etc.)
- What are the [interaction protocols](https://www.infoq.com/presentations/history-protocols-distributed-systems/) between these entities?
- What failures are acceptable, and which are intolerable?
- What assumptions are we making about users, infrastructure, time, randomness, and the environment?
- Which properties matter end to end, in the world, not only inside the code?

Critical properties are usually a better focus than feature lists. Features change. Properties such as "the billed amount matches the authorized amount," "a committed event is not lost," or "the delivered result respects the stated policy" retain their meaning as the system evolves.

Invariants should be first-class -- both informally and formally.

## Express properties at the right level

When the system interacts with the real world, express critical properties in terms that stay close to the real outcome that matters, not only the internal signals closest to the code.

That matters because:

- software often sits inside a larger system of people, devices, and services;
- assumptions hide in the gap between internal signals and real-world effects;
- a property that is easy to state in software terms may be too weak to justify trust.

This is why system boundaries and assumptions matter. If correctness depends on an operator behaving a certain way, or on middleware preserving an ordering guarantee, that belongs in the argument too.

Capture critical invariants in a mechanically checkable form when practical. For a critical property in a tractable core supported by the verifier, attempt deductive verification early. Using tools and techniques like bounded model checking, Alloy, SMT-backed analysis, or other suitable methods should also be pursued (especially when it provides better evidence for the property).

## Build a small checkable model when useful

Once the critical core is identified, choose the smallest checkable artifact that makes its important behavior explicit. Use a small model when the system has a compact semantic core. Use a protocol model, contract, trace checker / simulation checker, executable boundary scenario or simila technique when the property lives across components or system boundaries.

When an executable reference model is appropriate, it should simplify nonessential details so that the important behavior is obvious and checkable. It usually:

- replaces infrastructure with interfaces and simple data structures;
- uses pure or near-pure functions;
- makes state explicit;
- is single-threaded and value-oriented;
- focuses on semantics, not performance;
- is small enough to read in one sitting;
- is easier to trust than the production implementation.

The model is not the product. When it is independently derived and connected to observable implementation behavior, it can serve as an oracle that makes later checking possible.

Depending on the problem, the checkable artifact might be:

- a small executable program in the host language (Java, Rust, TypeScript, etc.);
- a model in a verification-oriented language ([Alloy](https://practicalalloy.github.io/index.html), [TLA+](https://learntla.com/), Lean);
- an implementation-shaped core checked with deductive verification or model checking (OpenJML, JBMC, Creusot, Kani, LemmaScript);
- a state table or algebraic model for a narrow kernel;
- a simplified protocol model for concurrency, recovery, or permissions;
- an interface, schema, or protocol contract for a component boundary;
- an executable scenario or simulation / trace checker for an end-to-end property.

Executable models and deductive verification are complementary. A model makes behavior explicit and can provide an independent oracle. Deductive verification proves stated properties of supported code. Use both when they provide different evidence.

The notation matters less than making the critical behavior explicit and mechanically checkable. Select the artifact by property, risk, and system boundary. Agents can help build and check these artifacts.

## Shape the implementation for reasoning

Lightweight formal methods work best when the production system is built in a form that humans and tools can reason about.

Prefer:

- explicit state machines;
- deterministic cores;
- clear ownership and ordering rules;
- side effects and nondeterminism pushed to the edges (I/O, time, dynamic/conditional/flag handling behavior, etc.);
- small interfaces and localized invariants;
- decoupled components whose behavior can be understood in isolation.

Decoupling and simplicity are not aesthetic preferences. They lower the cost of assurance by localizing critical properties. If a property is spread across the whole codebase, the whole codebase becomes critical. If it is localized to one component or one interaction boundary, verification and review can focus there.

This is why there is emphasis on deterministic systems, state machines, explicit error handling, and strong contracts in the style guides like [`java_style.md`](java_style.md)/[`typescript_style.md`](typescript_style.md) and supplementary materials like [`java_state_machines.md`](java_state_machines.md). Those guides explain how to write the code. This guide explains why that shape matters and how to drive it from the spec.

## Connect the model to the implementation

A model is useful only when it remains connected to the real system. Two patterns provide different evidence.

With an independent reference model, run the same operations, histories, or scenarios against the model and implementation. Compare their observable results. Differential testing is strongest when the observations are comparable, nondeterminism is controlled, and the model is independently derived and easier to trust than production code.

With a shared verified kernel, use one deterministic core in production and establish its properties with deductive verification or model checking. Test adapters, integration boundaries, and unverified behavior against the kernel's contracts. A shared kernel is not an independent differential oracle.

When direct comparison is unsuitable, use compatibility checks, executable boundary claims, trace validation, or end-to-end invariant checks. Select the method based on whether the relevant behavior can be controlled and observed reliably.

For agent-assisted development:

- the agent can generate plausible code quickly;
- the model, contract, or verified kernel states the intended behavior;
- mechanical checks decide whether the implementation satisfies that behavior.

The harness is the trust boundary.

## Use a verification pyramid

No single technique is enough. Testing alone is not enough for high assurance. Proofs alone are not enough either because they depend on scope, assumptions, and the sufficiency of the stated property. The practical answer is a layered stack of evidence.

A typical verification pyramid looks like this:

1. explicit claims, assumptions, bounds, and invariants;
2. a small checkable specification, model, contract, or boundary scenario;
3. proofs, deductive verification, or model checking for the tractable core;
4. differential testing when an independent model and comparable observations exist;
5. property-based tests over histories, sequences, and edge cases;
6. concurrency testing, deterministic simulation, or fault injection where relevant;
7. a permanent regression test or artifact for every discovered counterexample;
8. static analysis, contracts, and compile-time checks;
9. CI automation so the evidence is re-checked on every change.

Treat the pyramid as an evidence portfolio, not a rigid sequence. Select the strongest economical evidence for each critical property. Deductive verification and executable models are peers in this portfolio and can be used together.

Use the lightest mechanism that can falsify the current hypothesis, then layer stronger mechanisms where the risk justifies them.

For a Java-based project, that usually means JUnit for examples and regressions, jqwik for generated histories and metamorphic tests, Fray for concurrency schedules, and OpenJML for contracts and deductive verification, as described in [`java_style.md`](java_style.md).
For a TypeScript-based project, that usually means Vitest for examples and regressions, fast-check for generated histories and metamorphic testing, and [LemmaScript](https://lemmascript.com/) for contracts and deductive verification of the supported deterministic core, as described in [`typescript_style.md`](typescript_style.md).

## Testing remains essential, but it is not enough

Testing is crucial. It catches regressions, supports iteration, and gives fast feedback. But testing alone rarely gives enough confidence for the most critical properties at a reasonable cost. Tests cover individual cases. Within their stated scope and assumptions, [proofs represent "for all cases"](https://cacm.acm.org/blogcacm/a-fundamental-duality-of-software-engineering/).

As assurance demands rise:

- the state space grows too quickly;
- coverage becomes a weak proxy for correctness;
- real failures hide in combinations of state, timing, and assumptions;
- passing tests say little about nearby but untested cases.

This is why lightweight formal methods do not replace testing. They make testing more valuable by giving it sharper targets:

- invariants to check after every step;
- reference models to compare against;
- histories to generate;
- faults and schedules/interleavings to inject;
- contracts to monitor at important boundaries.

A single well-chosen invariant can stand in for an infinite family of test cases.

## Assumptions, scope, and tool credibility matter

More mechanization generally means more credible evidence, but the tool result is never the whole story.

Always ask:

- What exact property was checked?
- Is that property sufficient for the end-to-end claim we care about?
- Is the property stated at the right level of abstraction to remain meaningful as representations and implementations evolve?
- What assumptions were made about arithmetic, memory, middleware, time, scheduling, operators, or the environment?
- Are those assumptions explicit, justified, and reviewable?
- If the tool is noisy, are real defects getting buried in false alarms?
- If the tool is silent, are we sure the property is meaningful?

Even strong proofs can miss problems if the wrong property was formalized or if a hidden assumption turns out to be false. Lightweight formal methods work best when evidence is both mechanically checked and critically reviewed.

A verifier enforces the property that was stated, not the property that was intended. A narrow specification can pass while leaving the important end-to-end claim unsupported.

### When evidence spans projects

When a critical property spans independently versioned components or services, treat the tested system as a single versioned entity (a constellation of services). Identify the component combination and system boundary covered by the evidence. State what was checked per-component, what was observed end to end, what was checked at the boundaries or across protocols, and what remains assumed or outside the claim. Evidence is fresh only for the constellation it identifies.

## Guidance for engineers

For engineers, the practical workflow is:

1. Identify the critical core. Be risk-driven.
2. Draw the system. Write down its requirements, quality attributes, critical properties, assumptions, and invariants.
3. Select a small checkable model, contract, or boundary artifact where it adds useful evidence.
4. For a critical property in a tractable core supported by the verifier, attempt deductive verification early.
5. Use proof obligations and counterexamples to refine the specification, design, and implementation.
6. Design the production system so critical properties are local, explicit, and mechanically checkable.
7. Keep the core deterministic and push nondeterminism to the edges.
8. Use differential testing when an independent oracle and comparable observations exist. Otherwise use contracts, traces, boundary checks, or end-to-end invariant checks.
9. Add property-based testing, metamorphic testing, fault injection, and schedule/interleaving exploration where bugs are likely to hide.
10. Preserve every counterexample and discovered failure as a regression test. Keep the entire evidence stack in CI.
11. Update the specification and evidence as the system evolves.

The point is not to maximize formalism. The point is to maximize justified confidence per unit of effort.

## Guidance for coding agents

Agents should be used to amplify this workflow, not bypass it.

Use agents to:

- restate requirements as critical properties and invariants;
- surface ambiguities and missing assumptions;
- generate small reference models, verified implementation sketches, contract skeletons, or boundary scenarios;
- draft preconditions, postconditions, frame conditions, invariants, assertions, deductive specifications, and test oracles;
- attempt deductive verification early for a supported, tractable critical core;
- generate differential, property-based, metamorphic, and concurrency tests;
- ensure every critical state machine, failure mode, and invariant has suitable mechanical evidence;
- explain and minimize failing seeds, counterexamples, and proof obligations;
- identify whether a failure exposes a defect in the requirement, model, contract, code, harness, assumption, or supported tool semantics;
- update the earliest incorrect or underspecified artifact;
- summarize evidence gaps after each implementation pass.

Do not weaken a property, add an unjustified assumption, reduce a meaningful bound, or skip an obligation merely to make a verifier pass. Record unresolved obligations as evidence debt.

Do not ask agents to only "implement the feature." Ask them to:

- identify invariants;
- document preconditions and postconditions;
- keep the core deterministic;
- isolate I/O and other nondeterminism;
- produce the harness that will judge the implementation.

And do not let an agent self-certify. The code it wrote must answer to an independent mechanical check, such as a model, verifier, test harness, or static analyzer. Use review from a fresh context to challenge the code and its evidence.
See also: [When AI Writes the World's Software, Who Verifies It?](https://leodemoura.github.io/blog/2026-2-28-when-ai-writes-the-worlds-software-who-verifies-it/)

## Lightweight formal methods in the DESIRED workflow

The spec-driven workflow already provides the right structure for lightweight formal methods. DESIRED makes the evidence-building process explicit.

### Draw / Invariants

Start with the system boundary, the major components, the critical properties, the important quality attributes, the legal transitions, the bounds, and the dangerous failure modes. This is where the initial dependability claims are born.

### Explore

Probe the design with agents, quick models (in code or with Alloy), REPL experiments, and thought experiments. Try vague prompts first, then tighten them by adding more requirements and invariants. Use this phase to discover missing invariants, hidden assumptions, and alternative formulations of the core rules.
During this phase, use the agent to produce 10s/100s of prototypes to see the ideas and implications come to life -- iterate with the Plan agent to generate a "plan.md", review it, and build it. Perform a gap analysis between the implementation and the plan, and incorporate everything learned into a new "plan.md" to iterate on.

### Spec

Turn the refined understanding (eg: your best "plan.md" file) into small, focused spec artifacts -- the agent can automate all of this with `/opsx-propose`. The spec should say what matters, what must be preserved, what assumptions hold, and how success will be judged. The OpenSpec artifacts are a natural place to carry the dependability case forward: the proposal captures why, the design captures structure and reasoning, the spec records critical properties and assumptions, and the tasks drive construction and evidence-producing work.
The spec.md artifact can be further enhanced by embedding an Alloy model of the system (automated with `/spec-model`). Have the agents review the spec artifacts for completeness, correctness, and consistency. The `spec-check` tool can strongly verify the specification before implementation.

### Implement

Have the agent implement against the spec using `/opsx-apply`, not against an underspecified feature request. For a critical property in a tractable core supported by the verifier, attempt deductive verification early. Start with a narrow verified sketch when it can expose specification or representation problems. Require preconditions, postconditions, frame conditions, and invariants are documented and enforced in the code. Keep the core deterministic and push time, I/O, randomness, and scheduling to the edges. Generate the selected tests, contracts, proofs, and other evidence with the code.

Treat counterexamples and failed proof obligations as feedback. Update the relevant specification artifacts and tasks, correcting the design as needed. Preserve each discovered failure as a regression artifact.

Have the agent tag tests with the `Scenario` or invariant being exercised.

### Review with agents

Use fresh-context review to attack the plan, the spec, the code, and the evidence. Ask what assumptions remain unjustified, which invariants are still only implicit, and where the implementation may be reinforcing itself rather than being independently checked.
Ensure the code quality is high, the solution quality is high, and everything is correct.

### Examine

Read the code, contracts, tests, models, counterexamples, proof results, and cross-project evidence together. Run the full check pipeline. Confirm that each result states its scope and supports the claim you care about. Feed new findings back into the specification, design, tasks, and regression evidence before declaring the change complete.
The `/spec-evidence` command and `scripts/evidence.sh` script can help enhance the spec to make this process easier/automatic.

### Done

Archive the change with its specification artifacts and selected evidence, including models, contracts, proofs, tests, cross-project results, and review records where applicable. The result is not just code that works today, but living documentation of the system and its critical properties. In combination, these explain why everything should keep working as the system evolves.

## How this guide complements the other docs/guides

This guide explains the workflow and the evidence model.

- [`java_style.md`](java_style.md) explains how these ideas should show up in Java code: deterministic systems, explicit types, assertions, contracts, simulation, differential testing, concurrency discipline, and strong tooling.
- [`java_state_machines.md`](java_state_machines.md) explains one of the most useful Java implementation styles for making states, transitions, and invariants explicit.
- [`typescript_style.md`](typescript_style.md) explains how these ideas should show up in TypeScript code: deterministic systems, explicit types, assertions, contracts, simulation, differential testing, concurrency discipline, and strong tooling.
- [`typescript_state_machines.md`](typescript_state_machines.md) explains one of the most useful TypeScript implementation styles for making states, transitions, and invariants explicit.

Use this guide to decide what artifacts to create, what claims to make, and what evidence to demand. Use those guides to shape the implementation that follows.

## What lightweight formal methods are not

They are not:

- a demand to prove the whole system;
- a replacement for testing;
- a license to trust a tool result without examining assumptions;
- a separate academic artifact divorced from the code;
- a one-time verification pass at the end of development.

They are a way of working: risk-driven, invariant-first, model-backed, evidence-seeking, and friendly to iteration.

## The practical takeaway

If code generation is getting cheaper, the bottleneck shifts from producing code to producing trustworthy evidence.

Lightweight formal methods are how we respond. We make the important properties explicit. We build small checkable models or other assurance artifacts where they add useful evidence. We shape systems so they can be reasoned about. For a critical property in a tractable core supported by the verifier, we attempt deductive verification early. We connect specifications and implementations through differential testing, contracts, proofs, trace checks, and end-to-end observations as appropriate to the property and system boundary. We layer tests, analysis, contracts, simulation, and proofs where they buy confidence. And we treat the resulting evidence as part of the product.

That is the direct path to more dependable software, and it fits naturally inside spec-driven development.
