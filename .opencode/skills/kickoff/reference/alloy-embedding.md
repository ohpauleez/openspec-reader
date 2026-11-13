# Alloy Embedding Reference

Use this reference after loading the `alloy` skill.

## Modeling Strategy

- Keep Alloy fragments small and progressive.
- Use literate comments to explain why each modeling choice exists.
- Start with structural modeling before behavioral modeling.
- Prefer conceptual domain entities over implementation classes.
- Use explicit multiplicities for every relationship.
- Keep a satisfiable `run show {}` or equivalent from the beginning.
- Prefer predicates for scenarios and variants when checks or witnesses will be useful.
- Avoid turning uncertain requirements into hard global facts too early.
- Add behavior only after lifecycle states and events are known.
- For behavior, use `var`, `init`, event predicates, frame conditions, `stutter`, and transition facts.
- Add safety checks for invariants.
- Add liveness only when fairness assumptions are explicit.
- For algorithmic or data-structure work, use Alloy only for tractable bounded structure, ordering, membership, uniqueness, reachability, cache or index coherence, and small-step behavior. Record runtime and space complexity in the sketch prose, not in Alloy.
- Treat Alloy results as bounded analysis, not proof.

## Discovery Pass (Phase A)

Run Phase A before tightening a model. Its purpose is to find what the engineer
missed, not to produce evidence. The "do not model for coverage alone" rule is
scoped to Phase B evidence checks. Phase A is not coverage padding. It is
gap-hunting that produces questions.

- Under-constrained inspection: for each new entity or state, run a loose
  `run show` and inspect at least one instance. Flag any instance that looks
  invalid. Each becomes a candidate invalid state, missing invariant, or missing
  multiplicity.
- Reachable-state enumeration: for each state machine, ask Alloy which states are
  reachable and diff against the states in `## State Machines`. Any extra
  reachable state is a discovered gap.
- Event scope probe: for each event that mutates state or builds output, check
  whether it can affect more than one target, produce zero outputs, or run before
  its guard. A permissive answer is a discovered failure mode.
- Write back: record every discovery as a new invariant, a new failure mode, an
  updated state machine, or an Open Question. A silently absorbed discovery does
  not count.

## Cadence

Run Alloy after every answered round where meaningful modelable content exists.

If a round produces no meaningful Alloy content, write a short note in `## Alloy Findings` explaining why Alloy was skipped.

## Execution

Use the Alloy JAR path and workflow prescribed by `alloy`.

Recommended order:

1. Prefer any local Alloy CLI workflow documented by `alloy` if available.
2. Use `java -jar .opencode/opt/alloy_v6.2.0.jar exec -f <model>` when the local JAR is available. The `<model>` will be `sketch.md`.
3. If embedded Alloy in Markdown causes issues, extract Alloy code blocks into a temporary `.als` file for analysis.
4. If extraction changes context or requires combining blocks, record that limitation in `## Alloy Findings`.
5. If Alloy cannot run, still update the fragments and record the execution limitation.

## What To Record

For every Alloy run, record:

- Date or round.
- Alloy command or execution method.
- Model fragment names or extracted file used.
- Scope and step bounds.
- Checks or runs executed.
- Whether `run show` is satisfiable.
- Assertions checked and outcomes.
- Counterexamples or witnesses discovered.
- Interpretation in product/design language.
- Follow-up questions caused by the result.

## Common Review Risks

- Unsatisfiable structural model after adding facts.
- Vacuous checks caused by empty sets or impossible preconditions.
- Missing frame conditions in behavioral predicates.
- Missing `stutter` event in transition facts.
- Liveness claims without fairness assumptions.
- Overly small scopes that hide relevant behavior.
- Underconstrained models where unsafe behavior is possible only because required rules are missing.
- Overconstrained models where the design has become impossible.
- Algorithmic or data-structure models that lack explicit finite bounds in the sketch.
- Data-structure models that check shape but omit membership, ordering, uniqueness, or coherence invariants.

## Four Tautology And Vacuity Signatures

These four signatures cause a check to pass without giving real evidence. They
are the most common formal-evidence defects in kickoff sketches. See `alloy`
section 5.7 "Meaningful Checks and Non-Vacuity" for full examples. Do not
duplicate those examples here. Detect the signature, then apply the fix.

- restate-validity: a `check` or `assert` whose negation is a direct conjunct of
  a `fact` or validity predicate it depends on. The UNSAT result only repeats the
  fact. Fix: replace it with a transition-preservation check that assumes the
  invariant in an arbitrary reachable state, applies any event, and asserts the
  invariant holds in the successor.
- vacuous invalid state: an invalid-state predicate that cannot be instantiated,
  such as `no e.field` under a `one field` multiplicity. The guarding check is
  vacuous because the bad state is unrepresentable. Fix: model a raw or parsed
  layer where the bad state is representable, confirm a SAT witness of the bad
  state, then constrain it.
- witness-less mitigation: a fail-closed property shown only by SAT runs that
  already follow from the governing fact. There is no independent mitigation
  evidence. Fix: add a mitigation-disabled counterfactual. Define an alternate
  predicate that disables the mitigating constraint, then `check` that the bad
  state becomes reachable without it and blocked with it.
- tautological mitigation: a `mitigation_blocks_X` check where the mitigation
  predicate is the direct logical negation of the bad-state predicate, asserted
  as a standing property of a hand-built output. The check reduces to
  `(all x | P(x)) implies not (some x | not P(x))`, which is true by logic, not
  by design. It confirms a definition, not a computed result. Fix: model an event
  that constructs the central output (the merge, the write, the promotion), then
  check a property of the post-event output. The mitigation must be a removable
  constraint on that event, so the check goes SAT when the mitigation is removed
  and UNSAT when it is present. Do not assert the mitigated property directly on a
  hand-built instance.

## Formal-Evidence Self-Audit

Run this audit after the failure-mode round and before writing the Verification
Plan. It is a hard requirement. Apply the `alloy` section 5.7 checklist to
every `check` and `assert` in the sketch. For each safety check answer:

- (a) Is the assertion logically independent of the facts it depends on? If the
  negated property is a conjunct of a fact or validity predicate, it is not.
- (b) Is there a SAT witness of the bad state with the mitigation removed,
  disabled, or replaced by an alternate predicate?
- (c) Is the bad state reachable from `init`, or is it a clearly labeled
  structural-only check?
- (d) Is the mitigation check logically independent of the bad-state predicate?
  A `mitigation_blocks_X` check that reduces to `(all x | P(x)) implies not (some
  x | not P(x))` is a tautology. The mitigation must constrain a computed output,
  not restate the negation of the bad state on a hand-built instance.
- (e) Is the central output constructed by a modeled event? A property asserted
  on a hand-built instance confirms a definition. A property checked after a
  merge, write, or promotion event confirms the design. For each central success
  or safety claim, there must be an event that builds the output, and the check
  must apply to the post-event state.

Prove the mitigation is load-bearing. For each mitigation check, remove or
disable the mitigating constraint and confirm the check now finds a
counterexample (goes SAT), then restore it and confirm UNSAT. A mitigation check
that stays UNSAT with the mitigation removed is a tautology and is not evidence.

Any "no" must be fixed or explicitly declared as a gap in `## Alloy Findings`.
Record the audit and its per-check outcome in `## Alloy Findings`, including the
mitigation-removed result for each mitigation check. A run that records no audit,
or records mitigation checks without the mitigation-removed counterfactual, has
not met the workflow requirement.

## Kickoff Alloy Requirements

- Load `alloy` before all Alloy work.
- Prefer predicates over global facts for design rules that need witnesses,
  variants, counterfactual analysis, or mitigation checks. Use facts only for
  base assumptions that should hold in every variant.
- Model where Alloy produces meaningful, non-tautological evidence. Do not model
  for coverage alone. A tautological or vacuous check is worse than no check
  because it inflates apparent evidence.
- Every nontrivial state machine in `## State Machines` gets a behavioral Alloy
  model with a preservation check, or a written skip rationale in `## Alloy
  Findings`.
- For each high-risk transition guard, the counterfactual must be behavioral, not
  only structural. When a state machine exists, a bad state that a guard prevents
  must be shown as a reachable trace with the guard removed, not only as a
  representable instance in the structural model. Build a second transition system
  that drops the one guard, and `run` for a trace that reaches the bad state from
  `init`. The bad state is then a live counterexample, not a declared gap. A
  preservation check plus a positive "guard rejects the event" check is weaker: it
  proves the guard fires, but it does not show the guarded transition can reach the
  bad state when the guard is absent. Deferring the counterfactual to the
  structural layer is acceptable only when the design has no lifecycle for that
  bad state. If the state machine exists but you defer, record why in `## Alloy
  Findings`; treat the deferral as a gap, not as full behavioral evidence.
- Every failure mode in `## Failure Modes` gets one of these outcomes:
  - a failure witness plus a mitigation check in Alloy,
  - a structural Alloy predicate showing the bad state is representable plus a
    mitigation check,
  - or a written reason Alloy is not the right tool plus another evidence type in
    `## Verification Plan`.
- Model an event that constructs each central output. When the design has a merge,
  a write, a promotion, a build, or any operation that produces the output the
  claims are about, model that operation as an event and check properties of the
  post-event output. Do not assert the safety property on a hand-built instance,
  because that confirms the definition rather than the operation.
- Make each mitigation removable. Express the mitigation as a constraint on the
  construction event or on a predicate, not as a global fact. The mitigation
  check must find a counterexample when the mitigation is removed and none when it
  is present. Record both results.
- Require an output-existence witness for each central success claim. Do not only
  constrain outputs if they already exist.
- `## Alloy Findings` records the exact modeled state machines and failure modes,
  the unmodeled ones as explicit gaps, command output, scopes, interpretation,
  and the self-audit result. It records gaps in product and design language.
- Record whether each model result is actual bounded evidence or only a candidate
  model, especially when Alloy could not run.
- If Alloy cannot model a concern well, move that concern to property tests,
  metamorphic tests, simulation, or fault injection, and record the move.

## Alloy Coverage Matrix

Maintain a small matrix that maps:

- State machines to behavioral Alloy coverage or skip rationale.
- Invariants to checks, witnesses, or alternate evidence.
- Failure modes to bad-state witnesses, mitigation checks, or alternate evidence.
- Central success claims to output-existence witnesses.

Use the matrix to choose follow-up questions. Any uncovered high-risk row must
become a question, an accepted risk, or a verification-plan item.

## Lesson Format For Alloy Results

For every meaningful Alloy result, write one short lesson:

- "This matters because..."
- "The design gap is..."
- "The next decision is..."

## Fragment Shapes

Structural skeleton:

```alloy
abstract sig Actor {}
sig User extends Actor {}

sig Resource {
  owner: one Actor
}

pred show {
  some Resource
}

run show for 3
```

Behavioral skeleton:

```alloy
abstract sig Status {}
one sig Draft, Submitted, Accepted, Rejected extends Status {}

sig Item {
  var status: one Status
}

pred init {
  all i: Item | i.status = Draft
}

pred submit[i: Item] {
  i.status = Draft
  i.status' = Submitted
  all other: Item - i | other.status' = other.status
}

pred stutter {
  status' = status
}

fact transitions {
  init
  always (stutter or some i: Item | submit[i])
}
```

Construction event with a removable mitigation:

Use this shape when a design has an operation that builds a central output, such
as a merge, a write, or a promotion, and a safety claim about that output. It
avoids the tautological-mitigation signature by checking a property of the
computed output, with a mitigation that can be removed.

```alloy
// Inputs and the constructed output.
sig Source { archived: lone Archived }
one sig Archived {}
sig Item { origin: one Source }
sig View { items: set Item }

// Candidate items eligible for the view.
fun candidates : set Item { Item }

// The mitigation is a removable predicate, not a global fact.
pred excludeArchivedMitigation[v: View] {
  no i: v.items | some i.origin.archived
}

// The construction event builds the output. The mitigation constrains it.
pred buildView[v: View] {
  v.items = candidates
  excludeArchivedMitigation[v]
}

// Success witness: a built view exists and can contain items.
run buildView_witness {
  some v: View | buildView[v] and some v.items
} for 4 expect 1

// Mitigation present: no archived item reaches a built view.
assert archived_never_in_built_view {
  all v: View | buildView[v] implies no i: v.items | some i.origin.archived
}
check archived_never_in_built_view for 4 expect 0

// Mitigation removed: the same build without the mitigation must be able to
// leak an archived item. This proves the mitigation is load-bearing.
pred buildViewNoMitigation[v: View] {
  v.items = candidates
}
run archived_leaks_without_mitigation {
  some v: View | buildViewNoMitigation[v] and
    some i: v.items | some i.origin.archived
} for 4 expect 1
```

Expected results for this fragment: `buildView_witness` SAT, the mitigation-present
`archived_never_in_built_view` UNSAT, and the mitigation-removed
`archived_leaks_without_mitigation` SAT. The SAT counterfactual is the evidence
that the mitigation does real work.

Behavioral transition counterfactual:

Use this shape when a state machine exists and a transition guard prevents a bad
state. A preservation check proves the invariant holds, but it does not show the
bad state is reachable when the guard is removed. Build a second transition
system that drops the one guard, and `run` for a trace that reaches the bad state
from `init`. This makes the bad state a live behavioral counterexample, not a
declared gap. Do not defer this to the structural model when a lifecycle exists.

```alloy
abstract sig Phase {}
one sig Classified, Validated, Merged, Rejected extends Phase {}

one sig Run { var phase: one Phase, var fatal: lone Run }  // fatal: some => error

pred init { Run.phase = Classified and no Run.fatal }

// Validation may or may not find a fatal error. This event can INTRODUCE the
// bad condition, so the counterfactual can later reach the bad state.
pred validate[markFatal: one Int] {
  Run.phase = Classified
  Run.phase' = Validated
  markFatal = 1 implies Run.fatal' = Run else Run.fatal' = none
}

// Guarded merge: the guard "no Run.fatal" is the mitigation.
pred mergeStep {
  Run.phase = Validated and no Run.fatal
  Run.phase' = Merged and Run.fatal' = Run.fatal
}
pred stutter { Run.phase' = Run.phase and Run.fatal' = Run.fatal }

// Safety invariant S: a fatal run never reaches Merged.
pred inv { some Run.fatal implies Run.phase != Merged }
pred next { (some m: Int | validate[m]) or mergeStep or stutter }

assert preservation { always (inv and next implies after inv) }
check preservation for 3 but 2 steps expect 0

// Counterfactual: same system with the merge guard removed. The bad state
// (fatal and Merged) must now be reachable from init.
pred mergeStepNoGuard {
  Run.phase = Validated
  Run.phase' = Merged and Run.fatal' = Run.fatal
}
pred transitionsNoGuard {
  init and always ((some m: Int | validate[m]) or mergeStepNoGuard or stutter)
}
run fatal_reaches_merged_without_guard {
  transitionsNoGuard
  eventually (some Run.fatal and Run.phase = Merged)
} for 3 but 6 steps expect 1
```

Expected results: `preservation` UNSAT (the guard holds the invariant), and
`fatal_reaches_merged_without_guard` SAT (the bad state is reachable once the
guard is dropped). The SAT trace is the behavioral evidence that the guard is
load-bearing. A positive "the guard rejects the event" check is weaker, because
it proves the guard fires but not that the guarded transition can reach the bad
state without it.

The counterfactual is SAT only if some event can introduce the bad condition. In
this fragment `validate` can set `fatal`. If no event can produce the bad
condition, removing the guard leaves the counterfactual UNSAT and the check looks
falsely reassuring. When you remove a guard and the counterfactual stays UNSAT,
first confirm an event can reach the bad condition before concluding the guard is
unnecessary.

Anti-pattern to avoid. This is the tautological-mitigation signature. The
mitigation predicate is the direct negation of the bad-state predicate, asserted
on a hand-built instance with no construction event. The check is UNSAT, so it
appears to pass, but it is true by logic, not by design, and gives no evidence.
This snippet reuses the `Source`, `Item`, `View`, and `Archived` signatures from
the fragment above.

```alloy
// Do not do this.
pred archiveLeak[v: View] { some i: v.items | some i.origin.archived }
pred noArchive[v: View]   { no   i: v.items | some i.origin.archived }
assert mitigation_blocks_archive {
  all v: View | noArchive[v] implies not archiveLeak[v]   // tautology, UNSAT
}
check mitigation_blocks_archive for 4 expect 0
```
