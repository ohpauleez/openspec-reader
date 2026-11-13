---
name: openjml
description: Write and review JML specifications for Java and verify them with OpenJML ESC or RAC. Use for OpenJML applicability decisions, contracts, proof failures, assumptions, skipped checks, and verification evidence. (more details)
---

# OpenJML

Use JML and OpenJML to establish mechanically checked properties of a selected Java core. Preserve the distinction between what was proved, what was tested, and what remains assumed. Follow the project's lightweight-formal-methods guidance in `../../steering/lfm.md`: begin with a critical property, use the smallest useful verification artifact, and do not claim whole-system correctness from a local proof.

## When to use this skill

Load this skill before:

- deciding whether Java code is a good OpenJML candidate or can be refactored to be a good OpenJML candidate;
- writing or reviewing JML preconditions, postconditions, frame conditions, invariants, loop specifications, or exceptional behavior;
- running OpenJML ESC or RAC;
- diagnosing an OpenJML failure, timeout, unsupported construct, or suspicious success;
- adding `assume`, `skipesc`, model fields, ghost state, or external `.jml` specifications;
- reporting what an OpenJML result does and does not establish.

Do not use this skill for non-Java code. Do not substitute JML for JUnit, property-based testing, concurrency testing, model checking, or end-to-end checks when those techniques address a different risk.

## First decide whether OpenJML fits

Before annotating code, answer these questions:

1. **What critical property matters?** State the domain claim, invariant, legal transition, bound, or preservation property. Verifying only null safety or a weak result bound is insufficient when the important claim is stronger.
2. **Is the property localized?** Prefer a deterministic, sequential core with explicit state and small methods. Push I/O, time, randomness, reflection, native code, framework behavior, and concurrency outside the verified boundary.
3. **Can OpenJML model the relevant Java?** Check [reference/limitations.md](reference/limitations.md) before committing to streams, lambdas, complex generics, records, collections with incomplete library specifications, or concurrent behavior. Explore refactoring the code such that it can be easily verified.
4. **Will the contract support callers?** A passing method proof has value only when its postconditions and frame conditions expose the facts needed by the next layer.
5. **What complementary evidence is required?** Use tests, property-based testing with generated histories, metamorphic testing, RAC, bounded checking, or boundary checks for behavior not covered by ESC.

Apply “every public method should have a specification” to the selected verified core. Do not interpret it as a requirement to annotate an entire application regardless of risk or tool support.

## Establish the verification boundary

Before implementation, record:

- the Java classes and methods in the verified core;
- the exact properties to be established;
- arithmetic, nullness, library, threading, and environmental assumptions;
- external methods and specifications trusted by modular verification;
- behavior covered only by RAC or tests;
- unsupported or excluded behavior;
- any existing `assume`, `skipesc`, timeout, or incomplete proof.

OpenJML verifies contracts under their preconditions and the specifications of callees. It does not establish that callers satisfy undocumented real-world assumptions, that third-party specifications are correct, or that concurrent executions preserve a sequential proof.

## Required workflow

### 1. Inspect the project

- Identify the Java/OpenJML version, build tool, formatter, existing command line, external `.jml` files, and CI behavior.
- Reuse the project's established invocation rather than inventing a parallel one.
- Check for inherited specifications and library specifications before diagnosing surprising obligations.
- If an automated formatter is active, use `/*@ ... @*/` block annotations or prove that `//@` survives formatting. Formatters can change `//@` to `// @`, silently turning JML into an ordinary comment.

### 2. State the intended contract in prose

Write the critical claim, valid input domain, normal and exceptional outcomes, modified locations, preserved state, and termination expectation. If the intended behavior is ambiguous, resolve that ambiguity before trying to satisfy the prover. Language style guides like [Java Style](../../steering/java_style.md) require this information is documented within comments.

### 3. Specify one method or transition at a time

Use this order:

1. Select `behavior`, `normal_behavior`, or explicit normal/exceptional cases.
2. Declare nullness accurately.
3. Add the weakest justified `requires` clauses.
4. Add one precise `assignable` clause per specification case.
5. Add postconditions strong enough for callers.
6. Specify allowed exceptions.
7. Add explicit loop invariants, loop frames, and decreases clauses where applicable.
8. Add class invariants or abstract model state when the property spans methods.

Detailed syntax, visibility rules, model and ghost fields, templates, inheritance, and contract-strength guidance are in [reference/jml-language.md](reference/jml-language.md).

### 4. Run targeted ESC early

Start with one method or a narrow file and iterate:

```bash
openjml --esc --method={name} FileName.java
```

Use the project's required source path, specification path, classpath, and arithmetic options. Diagnose warnings and obligations; do not treat exit code `0` alone as proof that every intended clause was checked. See [reference/openjml-operations.md](reference/openjml-operations.md).

### 5. Diagnose the earliest failing artifact

Classify a failure before changing anything:

- requirement or domain-property defect;
- incorrect or incomplete JML contract;
- implementation defect;
- missing caller/callee contract or frame condition;
- hidden arithmetic, nullness, aliasing, or termination assumption;
- unsupported OpenJML feature or incomplete library specification;
- resource limit or solver difficulty.

Correct the earliest wrong artifact. Never weaken a meaningful property, strengthen a precondition beyond the real API domain, change arithmetic semantics, or add a trusted premise merely to obtain a green run. Use [reference/diagnostics.md](reference/diagnostics.md) for failure names and known pitfalls.

### 6. Run completion checks

At minimum:

1. Run the formatter and confirm the JML annotations remain active.
2. Run ESC over the full selected core with its production command line.
3. Run feasibility checking to detect vacuous contracts:

```bash
openjml --esc --check-feasibility=all {project arguments}
```

4. Run RAC or complementary tests for selected executable contracts and unproved boundaries when useful.
5. Inspect all warnings, ignored clauses, assumptions, skipped methods, timeouts, and tool errors.

RAC executes contracts for concrete test executions. It does not replace an unsuccessful universal ESC proof, and only JML's executable subset can be checked at runtime.

## Proof-integrity rules

- A verified weak contract is evidence only for that weak contract.
- An unsatisfiable precondition makes a contract vacuously true. Use feasibility checking.
- `assume P` makes `P` a trusted premise; it does not prove `P`.
- A `skipesc` method is not checked by ESC. Its contract is nevertheless available to callers and therefore acts as a trusted abstraction boundary.
- A contract for a third-party or native method is trusted unless its implementation is independently checked.
- RAC results apply only to executed inputs and executable clauses.
- A timeout, unsupported construct, internal error, or ignored clause is an unresolved obligation, not a successful proof.
- Arithmetic modes are part of the claim. Do not switch to wrapping or unbounded arithmetic without verifying that it matches production semantics and the property.
- Do not describe sequential OpenJML verification as a concurrency proof.

## Verification escalation

When ESC fails, use these steps in order and stop at the first sound resolution:

1. **Fix the requirement, specification, or code.** Check contract strength, preconditions, frame conditions, loop invariants, visibility, nullness, arithmetic, exceptions, and callee specifications.
2. **Add intermediate `assert` statements.** Expose useful proof facts and split a difficult obligation without adding trust.
3. **Simplify the code.** Refactor or replace verifier-hostile forms with equivalent explicit control flow, or isolate unsupported code behind a small interface.
4. **Add model or ghost state.** Make the abstract property or proof history explicit.
5. **Add a narrow `assume` only for a justified external fact or identified tool/library limitation.** Never use `assume` to hide a requirement, specification, or implementation defect.
6. **Extract the unsupported operation into the smallest helper and apply `skipesc` only there.** Give the helper a complete contract that states the trusted boundary.
7. **Use RAC and tests as compensating evidence.** Report that these checks cover concrete executions rather than all inputs.
8. **Apply `skipesc` to the larger method only as a last resort.** Retain a full contract and make the resulting evidence gap explicit.

Every `assume` or `skipesc` must have an adjacent rationale and be included in the final evidence report with:

- the exact trusted fact or skipped implementation;
- the affected property and scope;
- why ESC could not establish it;
- what alternatives were attempted;
- compensating RAC, test, model, or review evidence;
- remaining evidence debt and a removal condition when known.

Field-tested limitations and localized workaround patterns are in [reference/limitations.md](reference/limitations.md).

## Completion report

Do not report only “OpenJML passed.” State:

- **Claims:** properties and invariants checked.
- **Scope:** classes, methods, and OpenJML version or command context.
- **Results:** ESC, feasibility, RAC, and complementary test outcomes.
- **Assumptions:** environment, arithmetic, library contracts, and trusted abstractions.
- **Escapes:** every `assume`, `skipesc`, ignored clause, timeout, and unsupported construct.
- **Exclusions:** concurrency, I/O, integrations, or other behavior outside the proof.
- **Evidence debt:** unresolved obligations and their effect on the dependability claim.

## Reference map

Read only the references relevant to the current task, but consult them before guessing about JML or OpenJML behavior:

- [reference/jml-language.md](reference/jml-language.md): contract syntax, nullness, visibility, model and ghost fields, templates, inheritance, and specification strength.
- [reference/openjml-operations.md](reference/openjml-operations.md): formatter safety, ESC/RAC commands, flags, exit codes, external specification files, arithmetic modes, and incremental operation.
- [reference/diagnostics.md](reference/diagnostics.md): failure remediation, counterexamples, vacuity, and common pitfalls.
- [reference/limitations.md](reference/limitations.md): unsupported or fragile Java features, library gaps, constructors, records, collections, and audited escape hatches.

Authoritative upstream references:

- [OpenJML tutorial](https://www.openjml.org/tutorial/)
- [JML Reference Manual](https://www.openjml.org/documentation/JML_Reference_Manual.pdf)
- [OpenJML User Guide](https://www.openjml.org/documentation/OpenJMLUserGuide.pdf)
- [OpenJML feature status](https://www.openjml.org/documentation/features.shtml)
- [OpenJML repository](https://github.com/OpenJML/OpenJML)
