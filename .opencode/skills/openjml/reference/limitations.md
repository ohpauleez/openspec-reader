# OpenJML Limitations and Audited Workarounds

OpenJML support varies by release, JDK, library specification, and Java feature. Confirm a limitation with the project's pinned release before adding trusted assumptions. An internal error or missing library specification is a tool-boundary finding, not permission to weaken a domain property.

## General limitations

- **Generics:** Basic forms work, but complex generic types, wildcards, and bounded parameters can cause proof failures or tool errors.
- **Enums:** Basic enum usage works; enum constants with abstract methods or generic behavior can be fragile.
- **Varargs:** Support is limited and release-sensitive.
- **Concurrency:** OpenJML's ordinary ESC reasoning is sequential. It does not prove interference freedom, synchronization protocols, schedules, or Java Memory Model behavior.
- **Library specifications:** Coverage for `java.lang`, `java.util`, and third-party libraries is incomplete. Modular proofs are only as strong as the selected library specifications.
- **Lambdas and streams:** Support is limited. Explicit loops and small helper methods are usually easier to verify.
- **Reflection, native code, I/O, and framework behavior:** Usually outside the useful deductive core unless isolated behind explicit contracts.

Prefer a deterministic implementation-shaped core and test adapters, integrations, concurrency, and environmental behavior separately.

## Records

Observed OpenJML quirks include:

- accessor methods such as `event.time()` may not resolve reliably in invariants or postconditions; direct field reasoning may work better where visibility permits;
- compact constructors and implicit field assignments can be difficult for some releases;
- constructor frame clauses that refer to `this` may be rejected in record contexts.

First test the simplest accurate specification on the pinned release. Do not automatically replace `normal_behavior`: it is valid when exceptions are impossible for inputs satisfying the active case. Use `behavior` or exceptional cases only when exceptions are allowed in that domain.

## Static initializers

Lambdas inside static initializer blocks have triggered `NULL SYMBOL` internal errors in some multi-file runs. Escalate in this order:

1. Verify the initializer normally.
2. Replace verifier-hostile lambda/stream forms with explicit initialization when that remains good production code.
3. Extract a small helper with a precise contract.
4. If the exact pinned release still fails internally, localize `skipesc` to the initializer or helper and retain a postcondition such as non-null initialization.

Record that the initializer implementation is trusted rather than proved.

## Collections and incomplete library specifications

Field experience has found proof gaps around operations such as `PriorityQueue.add`, `peek`, and `remove`, `ArrayList.add`, `List.copyOf`, and iterator-based enhanced `for` loops. Exact behavior depends on the shipped OpenJML library specifications.

Observed examples in affected releases include `PriorityQueue.add` exposing an `assignable values` frame that OpenJML treats too broadly, `PriorityQueue.peek` exposing an internal `_get(0)` precondition callers cannot prove, and weak or missing facts for `queue.isEmpty()`. Treat these as release-qualified diagnostics: inspect the selected library specification before applying a workaround.

Symptoms include:

- a collection method's broad frame destroys knowledge of unrelated fields;
- internal model methods expose preconditions callers cannot establish;
- iterator contracts are too weak for the intended loop invariant;
- a supported Java operation produces an OpenJML internal error.

Use this order:

1. Inspect the actual library specification selected by the pinned OpenJML release.
2. Add or strengthen a project-owned external `.jml` specification only when its contract is justified and version-coupled to the library.
3. Simplify production code when an explicit array/indexed implementation is equally appropriate and easier to reason about.
4. Add model or ghost state when it faithfully exposes abstract collection behavior.
5. Add a narrow `assume` after the operation only for a fact independently justified but unavailable because of the identified library-specification gap.
6. Extract the collection operation into a small helper with `requires`, `ensures`, and `assignable`; apply `skipesc` only to that helper.
7. Skip the containing method only as a last resort.

Example of a narrowly localized trusted fact:

```java
int otherFieldBeforeQueueAdd = this.otherField;
queue.add(value);
// OpenJML library-frame limitation: queue.add loses this independently
// justified non-aliasing fact in the pinned OpenJML release.
/*@ assume this.otherField == otherFieldBeforeQueueAdd; @*/
```

This is not a proof that `queue.add` preserves `otherField`. The local snapshot expresses the pre-call value; `\old(this.otherField)` would instead mean method-entry state and could make the assumption false if the field changed earlier. Use the assumption only when ownership/aliasing analysis or another check independently justifies the fact, explain the precise library frame defect, and report the assumption.

## Constructors, invariants, and `helper`

OpenJML can verify many constructors directly. If invariant establishment fails:

1. Check that the invariant is required in the relevant visible state and is true after every constructor path.
2. Give constructor parameters and fields accurate nullness.
3. Add intermediate assertions after field assignments.
4. Simplify generic or record-specific construction.
5. Use model state if the representation-level invariant is unnecessarily difficult.
6. Add one narrow assumption for a confirmed prover limitation.
7. Use a private `helper` constructor plus a verified public factory only when the skipped constructor has a complete trusted contract.

`helper` changes invariant obligations; it does not prove that temporary invariant violations are safe. `skipesc` removes implementation checking. Use both only with explicit scope and evidence-debt reporting.

## `assume` policy

An assumption is acceptable only when all conditions hold:

- the fact is required for a critical proof but lies outside supported semantics or behind a demonstrably incomplete external contract;
- the fact is independently justified by code structure, documentation, another verifier, runtime validation, or focused tests;
- the assumption is the narrowest useful proposition and is placed immediately after the unsupported boundary;
- its rationale names the limitation and affected OpenJML release or library contract;
- the final report lists the assumption and its effect on the claim.

Do not use `assume` to:

- make a false postcondition pass;
- conceal an invalid state or real exception path;
- replace a loop invariant or caller precondition;
- assert a library property merely because it seems plausible;
- silence a timeout without investigating the obligation.

Prefer a narrow assumption over skipping a whole method only because it leaves the rest of the proof checked. It still creates a trusted premise.

## `skipesc` policy

Use `skipesc` only after normal verification, assertions, simplification, abstract state, and narrow assumptions have been considered in that order.

For every skipped method or initializer:

- keep a complete contract for caller reasoning;
- understand that callers trust that contract as an axiom;
- document the exact unsupported implementation feature or tool failure;
- add RAC or focused tests where executable behavior can be checked;
- list it in completion evidence and CI reporting;
- define a condition for retrying ESC, such as an OpenJML upgrade or replacement library specification.

Do not start with `skipesc`, and do not call a caller fully proved without disclosing skipped callees whose contracts support its proof.

## RAC as compensating evidence

RAC can exercise executable contracts for skipped or unsupported ESC boundaries. Compile with diagnostics for non-executable and unimplemented clauses. Pair RAC with generated, boundary, and regression tests.

RAC does not convert an assumed contract into a universal proof. Report the result as concrete execution evidence and state which clauses were executable.

## Timeout and solver difficulty

A timeout is not evidence that the property is false or true. Before changing trust assumptions:

1. Restrict verification to the method and inspect its exact obligation.
2. Add sound intermediate assertions.
3. simplify quantifiers, aliases, and control flow without weakening the property;
4. strengthen helper contracts with facts their implementations establish;
5. split a large method or proof into independently meaningful units;
6. increase the timeout only when the obligation remains stable and tractable.

If it still times out, report an unresolved proof obligation and use complementary evidence. Never describe a timeout-excluded run as complete ESC verification.

## Evidence-debt record

For each workaround, record:

| Field | Required content |
|---|---|
| Location | File, method, and annotation or external specification. |
| Intended claim | Property the surrounding proof is meant to support. |
| Trusted fact | Exact proposition or contract not established by ESC. |
| Cause | Unsupported feature, incomplete library spec, internal error, timeout, or external behavior. |
| Scope | Callers and properties that depend on the trusted fact. |
| Compensation | RAC, tests, model checking, review, or external documentation. |
| Residual risk | What could still invalidate the claim. |
| Removal condition | Tool upgrade, specification fix, refactor, or additional proof needed. |

This record keeps a practical workaround from becoming invisible proof debt.
