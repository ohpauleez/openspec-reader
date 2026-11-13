# OpenJML Diagnostics and Pitfalls

Diagnose the first incorrect or missing artifact rather than editing contracts until the verifier becomes quiet. Counterexamples are solver models, not necessarily executable Java test cases, but they often expose the failing path or missing assumption.

## Failure remediation

| Failure | Meaning | Investigate | Sound response |
|---|---|---|---|
| `Postcondition` | An active `ensures` was not established. | Wrong requirement, wrong contract, missing case, implementation defect, or insufficient helper contract. | Decide which artifact is wrong. Do not weaken a meaningful postcondition merely to pass. |
| `Precondition` | A caller did not establish a callee's active `requires`. | Missing caller guard/specification or callee precondition stronger than its real domain. | Establish the precondition in code/proof or correct the callee contract. |
| `UndefinedCalledMethodPrecondition` | A method used in a specification is called outside its specified domain. | Well-definedness and ordering of specification expressions. | Prove the called pure method's preconditions first. |
| `Assignable` | Code may modify a location outside the active frame. | Missing frame location, aliasing, or a called method with a broad frame. | Correct the implementation or state the exact permitted locations. |
| `PossiblyNullDeReference` | Code may dereference null. | Actual API nullness and guards. | Guard, require non-null if justified, or model nullable behavior. |
| `PossiblyNullAssignment` | A nullable value may enter a non-null location. | Source contract, target declaration, and branch facts. | Prove non-nullness, guard, or correct nullability. |
| `PossiblyNullReturn` | A non-null return declaration may return null. | Every return path and called-method contracts. | Correct code, contract, or return nullness. |
| `UndefinedNullDeReference` | A specification expression may dereference null. | Ordering and guarding of specification expressions. | Establish non-nullness before dereference. |
| `LoopInvariantBeforeLoop` | An invariant does not hold initially. | Initial values or an incorrectly stated invariant. | Correct initialization or invariant. |
| `LoopInvariant` | An invariant is not preserved. | Missing inductive facts, overly strong invariant, or body defect. | Strengthen supporting invariants or fix the code/property. |
| `LoopDecreases` | The variant does not strictly decrease. | Progress expression and body updates. | Correct the variant or loop. |
| `LoopDecreasesNonNegative` | The variant can become negative while required to remain non-negative. | Missing bounds in loop invariant. | Establish non-negativity or choose a valid variant. |
| `InvariantEntrance` | A class invariant is not known at method entry. | Construction, helper calls, visibility states, or trusted callees. | Repair the lifecycle or contract boundary. |
| `InvariantExit` | A method can return with a broken class invariant. | All normal exits and modified representation. | Re-establish the invariant or correct its domain. |
| `Constraint` | A history constraint is violated. | The method's state change or an overbroad constraint. | Correct the property or implementation based on intended history. |
| `Initially` | A constructor does not establish `initially`. | Every constructor path. | Establish the condition or correct it. |
| `ExceptionList` | An exception outside `signals_only` may escape. | Checked and unchecked operations and callee contracts. | Prevent or specify the exception accurately. |
| `ArithmeticOperationRange` | Safe arithmetic may overflow or underflow. | Input bounds, intermediate promotion, exact operations, intended wrapping. | Bound inputs, change correct code, or explicitly select Java math only when wrapping is intended. |
| `PossiblyNegativeIndex` / `PossiblyTooLargeIndex` | An array index may be outside `[0, length)`. Older releases or summaries may use `ArrayIndex`. | Preconditions, loop bounds, and arithmetic. | Establish the range or correct indexing. |
| `PossiblyNegativeSize` | An allocation size may be negative. Older material may use `NegativeArraySize`. | Input and arithmetic bounds. | Establish non-negativity or reject invalid input. |
| `Assert` | An explicit assertion is not derivable. | Earlier state, missing contract facts, or false property. | Correct the fact or expose sound intermediate reasoning. |

## Counterexamples

```bash
openjml --esc --trace --subexpressions -ce FileName.java
```

Use traces to identify the path and values associated with an obligation. Validate whether the model respects the intended domain. If it exploits an input that should be valid, it may expose a real implementation defect. If it exploits a supposedly impossible input, determine whether the missing restriction belongs in the real API, at a boundary validator, or only in an environmental assumption.

Do not add a `requires` clause solely because it excludes the counterexample. The restriction must already be part of the intended contract.

## Vacuity and suspicious success

```bash
openjml --esc --check-feasibility=all FileName.java
```

An unsatisfiable precondition or unreachable path can make a property verify vacuously. Also inspect:

- warnings about infeasible assumptions or paths;
- command-line method/file filters;
- formatter-damaged `//@` annotations;
- external `.jml` files shadowing declaration specifications;
- `skipesc` and `assume` annotations;
- unsupported or ignored RAC clauses;
- broad preconditions that exclude meaningful behavior;
- weak postconditions that omit the critical claim.

## Common pitfalls

### Multiple frame clauses intersect

Use one `assignable` clause per specification case. Multiple clauses must all hold, so their permitted locations intersect rather than unite. The same issue arises when multiple specification cases are simultaneously active.

```java
// Wrong if the intent is to permit both fields.
/*@ assignable x; @*/
/*@ assignable y; @*/

// Correct.
/*@ assignable x, y; @*/
```

### Loop invariant excludes the exit value

```java
// Too narrow at normal exit.
/*@ maintaining 0 <= i < a.length; @*/

// Includes entry, body, and exit states.
/*@ maintaining 0 <= i <= a.length; @*/
```

### Loop evidence is incomplete

Use explicit invariant, frame, and termination clauses as the reviewable default:

```java
/*@ maintaining 0 <= i <= n;
  @ loop_writes i, otherLocations;
  @ decreases n - i;
  @*/
for (int i = 0; i < n; i++) {
    // ...
}
```

OpenJML can infer some loop frames. Missing clauses are not automatically logically unsound, but they weaken or omit the associated evidence. In particular, success without an established decreases argument must not be reported as termination proof.

### Preconditions are not well-defined

Establish nullness before dereferencing in later clauses:

```java
/*@ requires a != null;
  @ requires 0 <= i < a.length;
  @*/
```

### Omitted frames destroy caller knowledge

An omitted method frame generally defaults to `\everything`. Declare a query `spec_pure` or use `assignable \nothing`; give commands precise frames.

```java
/*@ public normal_behavior
  @   ensures \result == x + 1;
  @   assignable \nothing;
  @*/
public int increment(int x) {
    return x + 1;
}
```

### Impure methods appear in specifications

Methods called by specifications need suitable purity declarations and contracts:

```java
/*@ public normal_behavior
  @   ensures \result >= 0;
  @*/
public /*@ spec_pure @*/ int size() {
    return count;
}
```

### Nullness does not match Java behavior

JML's default non-null declarations can accidentally exclude a Java method's deliberate null handling:

```java
public int length(/*@ nullable @*/ String value) {
    return value == null ? 0 : value.length();
}
```

Use `requires value != null` only if null is genuinely outside the method's valid domain.

### A callee's frame clobbers caller state

Modular verification uses the callee contract. A helper without a frame can be treated as modifying unrelated state. Add an accurate frame to the helper; do not patch caller postconditions around the missing contract.

### `normal_behavior` is misunderstood

`normal_behavior` forbids exceptional termination only when its case is active. A guard throw excluded by `requires` is allowed outside that case:

```java
/*@ public normal_behavior
  @   requires a != null;
  @   requires 0 <= i < a.length;
  @   ensures \result == a[i];
  @*/
public int get(int[] a, int i) {
    return a[i];
}
```

Use explicit exceptional cases when invalid inputs are part of the specified API behavior rather than outside its domain.

### Public contracts expose private representation

Public clauses cannot directly mention ordinary private fields. Prefer public model fields with private `represents` clauses; use `spec_public` only when coupling the contract to representation is acceptable.

### A formatter disabled annotations

If ESC unexpectedly becomes silent, inspect for `// @` and run the formatter before verification. Prefer block-form annotations in formatted projects.

### An external specification changed what is checked

Inspect `--specspath` and sibling `.jml` files. A selected external specification supplies declaration contracts in place of those in source, while statement-level annotations remain in source method bodies.
