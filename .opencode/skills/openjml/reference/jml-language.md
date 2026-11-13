# JML Language and Contract Reference

This reference preserves the working JML guidance used with a previous skill, `openjml-more`. The JML Reference Manual remains authoritative when syntax or release behavior differs.

## What JML specifies

JML is a behavioral interface specification language for Java. Specifications use `//@` or `/*@ ... @*/` comments and describe required behavior rather than implementation steps. OpenJML provides:

- **ESC (Extended Static Checking):** SMT-backed static verification over supported code and specifications.
- **RAC (Runtime Assertion Checking):** instrumentation of executable specification clauses for concrete executions.

## Core syntax

```java
//@ single-line JML annotation
/*@ multi-line
  @ JML annotation
  @*/
```

### Method clauses

| Clause | Meaning |
|---|---|
| `requires P;` | The caller must establish `P` for this specification case. |
| `ensures Q;` | The method establishes `Q` on normal return from an active case. |
| `assignable x, y;` | Only the listed locations may be modified. Aliases include `assigns`, `modifies`, and `writes`. |
| `signals (E e) R;` | If exception `E` is thrown, `R` holds. |
| `signals_only E1, E2;` | Only the listed checked or unchecked exception types may escape. |
| `also` | Separates specification cases and marks added cases on an override. |
| `normal_behavior` | A case that forbids exceptional termination when its preconditions hold. |
| `exceptional_behavior` | A case that forbids normal termination when its preconditions hold. |

`normal_behavior` is shorthand for a behavior containing `signals (Exception e) false;` and `signals_only \nothing;`. A guard throw for an input excluded by the case's `requires` clauses is compatible with `normal_behavior`. Use `behavior` or explicit exceptional cases when exceptions are permitted while an active case's preconditions hold.

### Class clauses

| Clause | Meaning |
|---|---|
| `invariant P;` | `P` holds at the visibility-sensitive method boundaries where the invariant applies. Constructors establish applicable invariants; non-helper methods assume and preserve them. |
| `constraint P;` | A history constraint relating pre-state and post-state across calls. |
| `initially P;` | `P` holds at the end of every constructor. |
| `static_initializer` | Specifies a following `static {}` initializer and supports postconditions for static initialization. |

```java
public static final Comparator<Event<?>> ORDERING;

/*@ public static_initializer
  @   ensures ORDERING != null;
  @*/
static {
    ORDERING = Comparator.comparingLong(Event::time)
                         .thenComparingLong(Event::sequence);
}
```

Lambdas in static initializers have caused release-specific OpenJML internal errors such as `NULL SYMBOL` during multi-file verification. First attempt normal ESC. If the tool fails internally, isolate the initializer and follow the audited escape process in `limitations.md` rather than silently skipping it.

### Loop clauses

Place loop specifications immediately before the loop:

| Clause | Meaning |
|---|---|
| `maintaining P;` or `loop_invariant P;` | An invariant true initially and preserved by every iteration. |
| `loop_writes x;` | Locations the loop may modify. Aliases include `loop_modifies` and `loop_assignable`. |
| `decreases E;` | A non-negative integer expression that strictly decreases, used to establish termination. |

Use all three explicitly as the robust default. OpenJML can infer a loop frame in many cases, but an explicit frame is reviewable and checked. Missing invariants weaken what can be proved. Missing `decreases` leaves termination unproved; do not interpret partial-correctness success as a total-correctness result.

A useful loop invariant normally includes:

- the loop variable's range, including its exit value, such as `0 <= i <= a.length`;
- the inductive property established over the processed prefix;
- facts needed to keep array access, arithmetic, and called-method preconditions defined.

### Common expressions and store references

| Expression | Meaning |
|---|---|
| `\result` | Method return value. |
| `\old(expr)` | Value at method entry. |
| `\forall T x; range; body` | Universal quantification. |
| `\exists T x; range; body` | Existential quantification. |
| `\nothing` | Empty store-ref set. |
| `\everything` | All memory locations. |
| `P ==> Q` | Implication. |
| `P <==> Q` | Bi-implication. |
| `\count` | Loop iteration counter in loop specifications. |
| `a[i]` | One array element as a store reference. |
| `a[*]` | Every element of `a` as store references. |
| `a[i..j]` | Inclusive array-element store-ref range; not a general expression. |

JML supports chained relations:

```java
/*@ requires a != null;
  @ requires 0 <= i < a.length;
  @*/
```

Order well-definedness conditions before expressions that depend on them.

## Nullness, purity, and helpers

- `pure`: no effect on pre-existing program state, but may allocate and return a fresh object. It implies `assignable \nothing;`.
- `spec_pure`: a deterministic `pure` method that returns no fresh object. A method must be at least `spec_pure` to be called in specifications.
- `strictly_pure`: a `spec_pure` method that does not allocate; it may still read mutable heap state.
- `no_state`: does not depend on heap state and, when deterministic, returns the same value for the same arguments.
- `nullable`: permits null for a declaration that would otherwise be non-null.
- `nullable_by_default`: changes the declaration default for a class.
- `helper`: exempts a method or constructor from class-invariant checks at entry and exit.

JML declarations default reference types to non-null. Array-element nullness follows the declared element type. Make nullability match the Java API rather than strengthening a precondition only for proof convenience.

For historical compatibility, OpenJML permits a `pure` method returning a primitive as if it were `spec_pure`. Prefer an explicit `spec_pure` declaration for every method called from a specification. Pure constructors may initialize only the object being constructed and cannot themselves be called from specifications.

`helper` allows invariants to be temporarily broken and therefore requires care. For constructor or invariant difficulties:

1. Verify normally with an accurate constructor contract.
2. Add intermediate `assert` statements for field-by-field establishment.
3. Simplify the constructor or invariant representation.
4. Use a narrowly justified `assume` only for an identified tool limitation.
5. Use `skipesc` only as a recorded last resort.

When a private helper constructor must be skipped, retain explicit postconditions for every fact trusted by a verified public factory:

```java
/*@ requires initialState != null;
  @ ensures field == initialState;
  @*/
// Confirmed pinned-release limitation: replace this text with the exact
// OpenJML failure that prevents ESC of this constructor.
/*@ skipesc @*/
private /*@ helper @*/ MyClass(S initialState) {
    this.field = initialState;
}

/*@ public normal_behavior
  @   requires initialState != null;
  @   ensures \result != null;
  @*/
public static <S> MyClass<S> create(S initialState) {
    return new MyClass<>(initialState);
}
```

The constructor body is not proved in this pattern. Its contract is a trusted premise for the factory and must be reported as evidence debt.

## Visibility rules

Specification expressions obey visibility rules. A public specification can refer only to public members, public `spec_pure` methods, and public model fields. Protected, package-private, and private specifications follow analogous visibility constraints. Invariants also have visibility: they apply where visible and cannot mention members less visible than the invariant.

### Referring to private representation

**`spec_public` or `spec_protected`:** convenient but leaks concrete representation into the public contract.

```java
private /*@ spec_public @*/ int count;

/*@ ensures \result == count; @*/
public /*@ spec_pure @*/ int size() {
    return count;
}
```

**Model fields:** preferred when public contracts should describe abstract state.

```java
/*@ public model int size; @*/
/*@ private represents size = count; @*/

/*@ ensures \result == size; @*/
public /*@ spec_pure @*/ int size() {
    return count;
}
```

**Public specification-pure queries:** useful when an existing abstraction already exposes the logical property.

```java
/*@ ensures size() == \old(size()) + 1; @*/
public void add(Object value) {
    // ...
}
```

Visibility violations are type-checking errors, not failed proof obligations.

## Model fields, ghost fields, and `represents`

A model field is specification-only abstract state connected to concrete representation by `represents`:

```java
public class Stack {
    /*@ public model int size; @*/
    /*@ public model int capacity; @*/
    private Object[] elements = new Object[16];
    /*@ maps elements[*] \into size; @*/
    private int top = 0; /*@ in size; @*/
    /*@ private represents size = top; @*/
    /*@ private represents capacity = elements.length; @*/
    /*@ public invariant size >= 0; @*/
    /*@ private invariant top <= elements.length; @*/

    /*@ public normal_behavior
      @   requires size < capacity;
      @   assignable size;
      @   ensures size == \old(size) + 1;
      @*/
    public void push(Object value) {
        elements[top++] = value;
    }
}
```

Key rules:

- Give model fields the visibility required by contracts that use them.
- Give `represents` visibility compatible with the concrete members it reads.
- A model field is also a datagroup. To use it in an abstract frame, declare each modified concrete field `in` that datagroup and map modified array elements into it with `maps ... \into ...`. A `represents` clause alone does not add concrete locations to the datagroup.
- Prefer model fields when representation independence matters.

A ghost field is explicitly managed specification-only state:

```java
public class Counter {
    private /*@ spec_public @*/ int count;
    /*@ ghost public int specCount = 0; @*/

    /*@ requires count < Integer.MAX_VALUE;
      @ requires specCount < Integer.MAX_VALUE;
      @ assignable count, specCount;
      @ ensures count == \old(count) + 1;
      @ ensures specCount == \old(specCount) + 1;
      @*/
    public void increment() {
        count++;
        /*@ set specCount = specCount + 1; @*/
    }
}
```

Use ghost state for proof history, protocol state, or facts not functionally derived from concrete representation. Because ghost updates become part of the proof maintenance burden, prefer model fields for ordinary representation abstraction.

## Contract-writing process

1. **Classify the method.** Query, command, constructor, transition, or boundary. Identify allowed exceptions and active specification cases.
2. **Declare nullness.** Match the actual API domain.
3. **Write preconditions.** Keep them as weak as the real implementation permits and order them for well-definedness.
4. **Write the frame.** Use one `assignable` clause per case. Multiple frame clauses in one active case must all hold, so their effective permissions intersect. Active cases also combine their frame restrictions.
5. **Write postconditions.** Fully characterize important results and state transitions. Use `\old` for pre-state.
6. **Specify exceptions.** Use `signals` and `signals_only`, or separate normal and exceptional cases.
7. **Specify loops.** State initialization, preservation, frame, exit reasoning, and termination.
8. **Verify incrementally.** Use caller failures to identify postconditions or frame facts that are missing from callees.

## Templates

### Pure query

```java
/*@ public normal_behavior
  @   requires {precondition};
  @   ensures \result == {expression};
  @*/
public /*@ spec_pure @*/ ReturnType methodName(Parameters parameters) {
    // ...
}
```

### State-modifying method

```java
/*@ public normal_behavior
  @   requires {precondition};
  @   assignable field1, field2;
  @   ensures field1 == {newValue};
  @   ensures field2 == \old(field2) + {delta};
  @*/
public void methodName(Parameters parameters) {
    // ...
}
```

### Normal and exceptional cases

```java
/*@ public normal_behavior
  @   requires {normalPrecondition};
  @   assignable {normalFrame};
  @   ensures {postcondition};
  @ also
  @ public exceptional_behavior
  @   requires {exceptionalPrecondition};
  @   assignable \nothing;
  @   signals_only ExceptionType;
  @*/
public ReturnType methodName(Parameters parameters) throws ExceptionType {
    // ...
}
```

### Loop

```java
/*@ maintaining 0 <= i <= a.length;
  @ maintaining {property over a[0..i)};
  @ loop_writes i, {otherLocations};
  @ decreases a.length - i;
  @*/
for (int i = 0; i < a.length; i++) {
    // ...
}
```

### Class invariant

```java
public class ClassName {
    private int field;

    /*@ private invariant field >= 0; @*/
    /*@ private invariant {representationProperty}; @*/
}
```

## Specification inheritance

Overriding methods automatically inherit visible specification cases from classes and interfaces. Preconditions from applicable cases permit all inputs allowed by the supertype, while each active case's postconditions and frame restrictions must be satisfied. This enforces behavioral subtyping.

Use `also` before additional specifications on an override:

```java
public class Shape {
    /*@ public normal_behavior
      @   requires scale > 0;
      @   ensures \result >= 0;
      @*/
    public /*@ spec_pure @*/ double area(double scale) {
        // ...
    }
}

public class Circle extends Shape {
    /*@ also
      @ public normal_behavior
      @   requires scale > 0;
      @   ensures \result == Math.PI * radius * radius * scale;
      @*/
    @Override
    public /*@ spec_pure @*/ double area(double scale) {
        // ...
    }
}
```

Strict `--lang=jml` treats omitted `also` as an error; default OpenJML releases may warn and continue. `also` is the required marker for additional cases, not the mechanism that preserves inheritance. Omitting it does not discard inherited contracts.

## Specification strength

- Fully characterize important results. A search contract should distinguish not-found from a valid matching index, not merely state `\result >= -1`.
- Keep frame conditions tight. An omitted method frame defaults broadly and can destroy caller knowledge.
- Keep preconditions no stronger than the real valid domain.
- State representation invariants at the appropriate abstract level.
- Specify public methods in the selected verified core. Specify private and package methods when modular callers depend on them.
- Use assertions to expose intermediate proof facts, not to replace a missing contract.
- Prefer model fields over `spec_public` when public specifications should survive representation changes.

```java
/*@ ensures \result == -1 ==>
  @     (\forall int j; 0 <= j < a.length; a[j] != key);
  @ ensures \result >= 0 ==>
  @     (0 <= \result < a.length && a[\result] == key);
  @*/
```
