# OpenJML Operations Reference

Use this reference for repeatable OpenJML execution. Prefer a project's pinned OpenJML version and established build command over ad hoc global commands.

## Formatter safety

Java formatters such as Palantir Java Format and Google Java Format can change `//@` to `// @`. OpenJML then treats the line as an ordinary comment without necessarily warning, disabling annotations such as `assert`, `assume`, `skipesc`, loop specifications, and invariants.

Prefer block annotations in formatted projects:

```java
private /*@ spec_public @*/ int count = 0;
/*@ public invariant count >= 0; @*/
public /*@ spec_pure @*/ int size() {
    return count;
}
```

If single-line annotations are retained, configure formatter exclusion or inspect the formatted result. The verification completion sequence must format first and run OpenJML afterward.

## ESC

Basic invocation:

```bash
openjml --esc FileName.java
```

Target one method during iteration:

```bash
openjml --esc --method={name} FileName.java
```

Verify multiple files with the correct source and class paths:

```bash
openjml --esc src/*.java
openjml --esc --sourcepath=src src/Main.java
```

Useful options:

| Option | Purpose |
|---|---|
| `--esc` | Run static verification. |
| `--esc-max-warnings=N` | Limit reported verification warnings. |
| `--timeout=N` | Set a per-method timeout in seconds. |
| `--method={name}` | Restrict verification to a method. |
| `--prover=z3` | Select Z3 explicitly. |
| `--show` | Show logical assertions being checked. |
| `--trace` | Show a counterexample trace. |
| `--subexpressions` | Include subexpression values in traces. |
| `--counterexample` or `-ce` | Request solver counterexample detail. |
| `--check-feasibility=all` | Check reachability and detect vacuous specifications. |
| `--progress` | Show verification progress. |
| `--sourcepath=dir` | Add Java source lookup paths. |
| `--specspath=dir` | Set external specification lookup paths. |
| `--classpath=path` | Set dependency class paths. |
| `--code-math=MODE` | Select code arithmetic semantics. |
| `--spec-math=MODE` | Select specification arithmetic semantics. |

In-specification diagnostics include:

```java
/*@ show expression; @*/
/*@ assert property; @*/
```

Use assertions to isolate obligations. Do not replace an unproved assertion with an assumption unless the assumption policy in the main skill is satisfied.

## Exit codes

OpenJML documents these normal process codes:

| Code | Meaning |
|---|---|
| `0` | Operation completed, possibly with warnings or unchecked/ignored behavior. |
| `1` | Parsing or type-checking errors. |
| `2` | Command-line error. |
| `3` | System error. |
| `4` | Fatal internal error or abnormal termination. |
| `5` | Cancellation. |
| `6` | Verification failures by default. |

`--verify-exit=n` can remap the verification-failure exit code. Exit `0` does not by itself establish that every intended specification was checked. Read warnings and account for assumptions, skipped methods, unsupported clauses, and the scope selected by command-line options.

## RAC

RAC is a two-step process:

```bash
openjml --rac --show-not-executable --show-not-implemented FileName.java
openjml --rac-run ClassName
```

RAC checks only JML's executable subset during concrete executions. Unsupported constructs or checks may be ignored or compiled with limited behavior; diagnostics vary by construct and release. Enable `--show-not-executable` and `--show-not-implemented`, inspect all diagnostics, and record each ignored clause as untested.

Use RAC when:

- integration or generated tests can exercise executable contracts;
- ESC cannot cover an isolated boundary because of a documented tool limitation;
- runtime contract monitoring adds independent evidence.

Do not say RAC “proves” a contract. It checks only the paths and values executed. A RAC run does not discharge an ESC timeout or failed universal obligation.

## External `.jml` specification files

Use separate `.jml` files for libraries that cannot be modified, third-party API contracts, or intentionally separate specifications. A `.jml` file mirrors Java declarations and replaces method bodies with semicolons:

```java
// Stack.jml
public class Stack {
    /*@ public model int size; @*/

    /*@ public normal_behavior
      @   assignable size;
      @   ensures size == \old(size) + 1;
      @*/
    public void push(Object value);

    /*@ public normal_behavior
      @   ensures \result == size;
      @*/
    public /*@ spec_pure @*/ int getSize();
}
```

An implementation using `assignable size` must place its modified concrete fields and array locations in the `size` datagroup with `in` or `maps`. The external abstract contract does not establish that mapping by itself.

For Java source, OpenJML searches the ordered specification path for the package-qualified `.jml` file, then checks for a sibling `.jml` beside the source, and otherwise uses the `.java` source. The specification path defaults to the source path, so source-path directories are commonly searched indirectly.

When an external `.jml` file is selected, declaration-level JML in the corresponding `.java` file is ignored. Statement-level annotations inside method and initializer bodies, including assertions and loop specifications, remain in source because the external file has no method bodies.

```bash
openjml --esc --specspath=specs src/Main.java
```

Treat external specifications as trusted unless their implementations are checked separately. Keep their versions coupled to the library versions they describe.

## Arithmetic modes

Java integer arithmetic wraps, while specifications often intend mathematical integers. Arithmetic mode is part of the verification claim.

| Mode | Meaning |
|---|---|
| `java_math` | Java wrapping semantics without overflow obligations. |
| `safe_math` | Java results plus proof obligations that operations do not overflow. |
| `bigint_math` | Mathematical unbounded-integer semantics where supported. |

Defaults:

- Java code uses `safe` mode.
- JML specification expressions use `bigint` mode.

Per-file or per-method annotations include:

```java
/*@ code_java_math @*/
/*@ code_safe_math @*/
/*@ code_bigint_math @*/
/*@ spec_java_math @*/
/*@ spec_safe_math @*/
/*@ spec_bigint_math @*/
```

Command-line values are `java`, `safe`, and `bigint`:

```bash
openjml --esc --code-math=java FileName.java
openjml --esc --code-math=safe FileName.java
openjml --esc --spec-math=bigint FileName.java
```

Practical rules:

- Keep `safe` code arithmetic when proving absence of overflow; add justified bounds or use exact Java operations.
- Use Java arithmetic for intentionally wrapping operations such as selected hash computations, and state that behavior in the claim.
- Do not suppress overflow obligations globally merely to make verification pass.
- Official documentation has described code-side bigint mode as unsupported even though some releases accept it. Do not rely on `--code-math=bigint` portably without testing the pinned release, and do not use it when production Java wrapping behavior matters.

## Repeatable project workflow

1. Pin or record the OpenJML release and JDK compatibility.
2. Use one canonical project command carrying all source, class, specification, and arithmetic options.
3. Verify one method during proof development.
4. Format before the final run and ensure annotations remain active.
5. Run the complete selected-core ESC command.
6. Run feasibility checking.
7. Compile and execute RAC with diagnostics when RAC is part of the evidence.
8. Preserve failing counterexamples as tests or proof regressions where practical.
9. Put the canonical checks in CI and report exclusions rather than silently omitting problematic files.
