# Question Bank

Use this bank adaptively. Do not ask every question. Select the smallest useful batch, usually 3 to 6 questions, based on the current sketch, prior answers, Alloy findings, progressive review notes, and user momentum.

Each question includes a target section, modeling hints, when to ask, follow-up triggers, structured answer options where helpful, a short educational note, an example answer, and design implications to watch for.

## Alloy-Derived Questions

When Alloy finds a counterexample, weak check, unreachable bad state, surprising reachable state, or unmodeled failure mode, ask at least one follow-up question that explains the gap in plain design terms and labels it as Alloy-derived.

Worked example:

> Alloy can represent a duplicate alias, but the current state machine does not show how a valid registry becomes corrupt. Should corruption be caused by partial write, manual edit, concurrent write, or parser failure?

## R0 Framing

### R0.1 Reference Material

Question: Do you have existing reference material, like a product brief, design note, issue, mockup, incident report, customer request, or API contract, for this feature? If so, link it or summarize it.

Target section: `## Context` / `### References` and `### Background`.

Alloy target: None unless the reference exposes concrete entities or constraints.

Mermaid target: Context diagram if actors or systems are named.

When to ask: Always in R0.

Follow-up triggers: External documents mention actors, systems, constraints, SLAs, states, or policies.

Structured options: `No reference`, `Product brief`, `Issue or ticket`, `Incident or support case`, `Existing API or schema`, `Mockup or UX flow`.

Free-form guidance: A rough summary is fine if links are unavailable.

Educational note: References prevent the sketch from becoming detached from the real problem and often reveal hidden assumptions.

Example answer: "There is a support ticket about duplicate invoice emails and a rough product brief for retry behavior."

Design implications: Extract stakeholders, current pain, existing contracts, and known constraints.

### R0.2 Motivation

Question: What problem should this project solve, and what would be different in the world if it succeeds?

Target section: `## Motivation`.

Alloy target: None.

Mermaid target: None initially.

When to ask: Early R0 unless already obvious.

Follow-up triggers: Answer names symptoms but not desired outcome.

Structured options: `User pain`, `Operational pain`, `Reliability issue`, `Security or compliance`, `Revenue or growth`, `Internal enablement`.

Free-form guidance: Focus on outcome, not implementation.

Educational note: A design should preserve the outcome that matters, not just implement requested mechanics.

Example answer: "Customers should be able to update billing details without support tickets or duplicate charges."

Design implications: Identifies end-to-end correctness claims.

### R0.3 Grand Vision And Evolution

Question: What is the grand vision for this project? How is it likely to evolve in the future?

Target section: `## Motivation`, `## Evolution And Future Change`, and `## Design Implications`.

Alloy target: Usually none initially. Model only if future evolution exposes variant types, extensibility constraints, compatibility rules, or migration states.

Mermaid target: Roadmap, capability map, or context diagram if evolution changes actors, systems, or boundaries.

When to ask: Always in R0 after motivation.

Follow-up triggers: Future integrations, new user roles, scaling expectations, schema evolution, multiple deployment targets, regulatory changes, plugin or extension needs, product-line variants, or expected migration paths.

Structured options: `More users`, `More data`, `More integrations`, `New workflows`, `New user roles`, `New regions or tenants`, `New compliance needs`, `New deployment models`, `Unknown`.

Free-form guidance: Think in horizons. What might need to change in 3 months, 1 year, or if the project succeeds unexpectedly?

Educational note: Evolvability is a quality attribute. Early design should avoid choices that make likely future changes expensive or unsafe. Evolutionary architecture uses incremental change and fitness functions to protect important architectural characteristics over time.

Example answer: "First version supports one payment provider, but the long-term vision is a provider-agnostic billing platform with regional rules, auditability, and customer self-service."

Design implications: Identify architectural seams, decisions to defer, compatibility needs, extension points, migration risks, and fitness functions that should prevent architectural drift.

### R0.4 Success Criteria

Question: How will you know this project worked? Name 2 to 5 observable success criteria.

Target section: `## Motivation` and `## Quality Attributes`.

Alloy target: Possible assertions if criteria are structural or stateful.

Mermaid target: None.

When to ask: R0 or early R5.

Follow-up triggers: Criteria are vague adjectives like "fast" or "reliable".

Structured options: `User-visible behavior`, `Correctness`, `Latency`, `Availability`, `Cost`, `Security`, `Operational simplicity`.

Free-form guidance: Prefer measurable criteria if possible.

Educational note: Quality attributes become useful when tied to a stimulus, response, and measurable target.

Example answer: "95% of updates complete within 2 seconds and no successful update loses prior billing history."

Design implications: Drives verification and feasibility checks.

### R0.5 Users And Stakeholders

Question: Who uses this capability, who operates it, and who is harmed if it behaves incorrectly?

Target section: `## Context` / `### Affected Systems And Stakeholders`.

Alloy target: Actor signatures if roles affect permissions or ownership.

Mermaid target: System boundary diagram.

When to ask: R0.

Follow-up triggers: Different roles have different permissions, responsibilities, or risk exposure.

Structured options: `End user`, `Admin`, `Operator`, `Developer`, `External system`, `Compliance or audit`, `Customer support`.

Free-form guidance: Include non-human actors and downstream teams.

Educational note: Stakeholders often reveal safety properties and trust boundaries.

Example answer: "Customers use it, support reviews failures, finance cares about reconciliation."

Design implications: May require role-based invariants or auditability.

### R0.6 Scope

Question: What is definitely in scope, and what is intentionally out of scope for the first version?

Target section: `## Scope`.

Alloy target: Bounds if scope limits domain size, actors, or states.

Mermaid target: System boundary diagram.

When to ask: R0.

Follow-up triggers: Scope mentions later versions, migrations, or dependency changes.

Structured options: `MVP behavior`, `Migration`, `Admin tooling`, `API`, `UI`, `Reporting`, `Operational workflows`.

Free-form guidance: Out-of-scope decisions are useful design constraints.

Educational note: Explicit scope protects the design from accidental obligations.

Example answer: "In scope: API and audit log. Out of scope: bulk migration and admin UI."

Design implications: Bounds modeling and verification effort.

## R1 Data Flow

### R1.1 User-Supplied Data

Question: Does your feature involve the user sending new data into the system? If so, describe the data and who is allowed to send it.

Target section: `### User-Supplied Data`.

Alloy target: Input signatures, actor permissions, validation constraints.

Mermaid target: Sequence diagram.

When to ask: Always in R1.

Follow-up triggers: Untrusted input, permissions, validation, sensitive data, idempotency keys.

Structured options: `No user input`, `Form data`, `File upload`, `API command`, `Event or webhook`, `Admin input`, `Sensitive data`.

Free-form guidance: Include source, format, trust level, and validation expectations.

Educational note: Inputs define the system boundary and where preconditions must be enforced.

Example answer: "A customer submits a billing address and payment token through an authenticated API."

Design implications: Drives validation, authorization, privacy, and malformed-input tests.

### R1.2 Data Shape, Transport, And Semantics

Question: Describe the shape of the data, the transport path, and the semantic characteristics of each important data flow. For shape, include formats such as JSON, MessagePack, Protobuf, Avro, CSV, multipart file upload, binary payload, or domain event. For transport, include paths such as direct HTTP, HTTP through an edge or gateway such as AWS API Gateway or ALB, message bus, queue, webhook, database change stream, file transfer, browser storage, or in-process call. For semantics, include whether the flow is synchronous, asynchronous, streaming, request/response, fire-and-forget, batch, retryable, ordered, or unordered.

Target section: `## Inputs, Reads, Writes, And Outputs`, especially `### Data Shape, Transport, And Semantics`, `### User-Supplied Data`, `### Existing Data Read`, `### New Data Written`, `### Outputs`, and `### External Effects`.

Alloy target: Usually none. Use Alloy only when the data shape, transport, or semantic characteristic directly affects an invariant, ordering rule, state transition, failure condition, authorization rule, or reachability of a bad state.

Mermaid target: Sequence, activity, or data-flow diagram when the transport path or async/streaming behavior clarifies the system boundary.

When to ask: Always in R1 after identifying whether user-supplied data exists, and before detailed read/write/effect questions if the flow shape is still unclear.

Follow-up triggers: Async delivery, streaming, message buses, queues, webhooks, retries, ordering guarantees, schema evolution, binary formats, file uploads, gateways, edge services, partial messages, batch processing, or mixed transports.

Structured options: `JSON`, `MessagePack`, `Protobuf`, `Avro`, `CSV`, `Multipart upload`, `Binary payload`, `Domain event`, `Direct HTTP`, `HTTP through gateway`, `Message bus`, `Queue`, `Webhook`, `File transfer`, `Sync request/response`, `Async`, `Streaming`, `Batch`.

Free-form guidance: For each important flow, name the producer, consumer, data format, transport path, delivery semantics, ordering expectations, retry behavior, and any schema or compatibility constraints.

Educational note: Data flow is not only what data moves. The format, transport, and delivery semantics determine validation, failure handling, schema evolution, observability, and test strategy.

Example answer: "Clients send JSON over HTTPS through API Gateway to the service as synchronous request/response. The service publishes Protobuf domain events to Kafka asynchronously. Events are ordered per account key, retryable, and may be delivered more than once."

Design implications: Drives validation boundaries, schema compatibility, transport failure modes, async state-machine behavior, ordering and idempotency requirements, observability, contract tests, and whether Alloy should model any semantic constraints.

### R1.3 Existing Data Read

Question: Does your feature involve reading data that already exists within the system? If so, what data is read, and how fresh or authorized must it be?

Target section: `### Existing Data Read`.

Alloy target: Existing entity signatures, ownership relations, authorization constraints.

Mermaid target: Sequence diagram.

When to ask: Always in R1.

Follow-up triggers: Caches, stale reads, privacy, policy checks, read-your-writes expectations.

Structured options: `No existing data`, `Account data`, `Configuration`, `Inventory or balance`, `Policy or permissions`, `Audit history`, `Cached data`.

Free-form guidance: Mention consistency requirements and trust boundaries.

Educational note: Reads often carry hidden assumptions about freshness and authorization.

Example answer: "Read current subscription status and account owner before accepting the update."

Design implications: Stale reads and authorization invariants may need modeling.

### R1.4 New Data Written

Question: Does your feature involve writing new data into the system? If so, what is written, what existing data changes, and what must remain true afterward?

Target section: `### New Data Written`.

Alloy target: State changes, ownership, uniqueness, invariant assertions.

Mermaid target: Sequence or activity diagram.

When to ask: Always in R1.

Follow-up triggers: Partial writes, duplicate commands, transactions, eventual consistency, audit logs.

Structured options: `No writes`, `Create entity`, `Update entity`, `Delete or archive`, `Append event`, `Audit log`, `External side effect`.

Free-form guidance: Include success and failure observations.

Educational note: Writes are where invariants can be broken; name what must stay true after the write.

Example answer: "Append a payment-method-changed event and update the customer profile pointer atomically."

Design implications: Drives transaction, idempotency, and recovery design.

### R1.5 Outputs And Effects

Question: What does the user or caller receive, and are there external effects like emails, webhooks, jobs, payments, or notifications?

Target section: `### Outputs` and `### External Effects`.

Alloy target: Optional protocol model if effects must happen at most once or after a state transition.

Mermaid target: Sequence diagram.

When to ask: R1 if outputs or side effects are unclear.

Follow-up triggers: External effects, retries, idempotency, exactly-once expectations, compensation.

Structured options: `Synchronous response`, `Async job`, `Email`, `Webhook`, `Payment`, `Notification`, `No external effect`.

Free-form guidance: Include ordering between data writes and external effects.

Educational note: External effects are hard to roll back, so ordering and idempotency matter.

Example answer: "Return success immediately, then send a confirmation email after the profile update commits."

Design implications: May require outbox, deduplication, or compensation.

### R1.6 Trust Boundaries

Question: Which inputs, systems, users, or dependencies are trusted, partially trusted, or untrusted?

Target section: `### Assumptions And Dependencies` and `## System Boundary`.

Alloy target: Actor trust levels and permission constraints if trust affects behavior.

Mermaid target: Boundary diagram.

When to ask: R1 or R5 when security, privacy, or external systems appear.

Follow-up triggers: External webhooks, admin controls, user-generated content, sensitive data.

Structured options: `Trusted internal service`, `Partially trusted dependency`, `Untrusted user`, `Third-party provider`, `Operator`, `Public internet`.

Free-form guidance: Trust is not all-or-nothing; name what each party is trusted to do.

Educational note: Trust boundaries are where validation, authorization, and audit evidence concentrate.

Example answer: "Webhook payloads are untrusted until signature validation succeeds."

Design implications: Security and privacy invariants may be needed.

### R1.7 Sensitive Data And Leakage

Question: What sensitive data can pass through this feature, and where must it never appear, such as logs, error messages, metrics, traces, URLs, analytics, audit records, or third-party calls?

Target section: `### Sensitive Data And Leakage`, `### Assumptions And Dependencies`, and `## Quality Attributes`.

Alloy target: Privacy or containment assertions if sensitive data movement is structural or stateful.

Mermaid target: Data-flow or boundary diagram with sensitive flows labeled.

When to ask: R1 when user data, account data, credentials, payment data, personal data, secrets, compliance needs, logs, telemetry, or external calls appear.

Follow-up triggers: Logs, traces, analytics, support tooling, third-party integrations, generated URLs, public responses, or operator views can contain user-controlled or sensitive values.

Structured options: `Personal data`, `Credentials or tokens`, `Payment data`, `Health or regulated data`, `Tenant data`, `Secrets`, `Internal identifiers`, `No sensitive data`.

Free-form guidance: Include who can see the data, where it is stored or transmitted, and what must be redacted or omitted.

Educational note: Data leaks often happen through secondary channels like logs, metrics, URLs, and support tools rather than the main database.

Example answer: "Payment tokens and customer email addresses must not appear in logs, metrics labels, URLs, or provider error messages shown to users."

Design implications: Drives redaction, data minimization, audit boundaries, privacy invariants, and observability tradeoffs.

### R1.8 Input Attack Classes

Question: Which input attack classes are relevant here, such as injection, XSS, path traversal, unsafe file upload, replay, oversized payloads, malformed serialization, or command injection?

Target section: `### User-Supplied Data`, `### Preconditions`, and `## Failure Modes`.

Alloy target: Negative scenarios when attack classes affect state transitions, authorization, ownership, or reachability of bad states.

Mermaid target: Failure flow for high-risk input paths.

When to ask: R1 or R6 when inputs are untrusted, user-generated, file-based, path-like, query-like, rendered in a browser, deserialized, or sent to commands, databases, templates, or external services.

Follow-up triggers: Rich text, HTML, SQL-like filters, filesystem paths, archive extraction, webhooks, callbacks, uploaded files, dynamic queries, or shell/process execution.

Structured options: `Injection`, `XSS`, `Path traversal`, `Unsafe upload`, `Replay`, `Oversized payload`, `Malformed serialization`, `Command injection`, `Not applicable`.

Free-form guidance: Name the input field or endpoint and the expected safe handling behavior.

Educational note: Attack classes are design concerns when they affect validation, trust boundaries, storage, rendering, or downstream calls.

Example answer: "Users can upload CSV files. The design must reject oversized files, prevent formula injection, and never use user filenames as storage paths."

Design implications: Drives validation strategy, sanitization boundaries, encoding rules, negative tests, and safe storage or rendering patterns.

### R1.9 Authentication, Authorization, And Sessions

Question: What authentication, session, role, tenant, or privilege boundaries must this design preserve, and how could a user escalate beyond their intended authority?

Target section: `### Affected Systems And Stakeholders`, `### Assumptions And Dependencies`, `### Domain Rules`, and `### Invariants`.

Alloy target: Role, ownership, tenant-isolation, and permission assertions.

Mermaid target: Boundary or sequence diagram if authentication or delegation spans systems.

When to ask: R1, R2, or R5 when users, admins, tenants, sessions, service accounts, delegated access, or privileged operations appear.

Follow-up triggers: Admin tooling, multi-tenant data, shared resources, impersonation, session refresh, password flows, service-to-service calls, or feature flags.

Structured options: `Authenticated user`, `Anonymous user`, `Admin`, `Operator`, `Service account`, `Tenant boundary`, `Session`, `Delegated access`, `No auth concern`.

Free-form guidance: Include what each actor can do, what they must never do, and how authority is checked.

Educational note: Authorization is often a relationship between actor, resource, action, tenant, and time, not only a role name.

Example answer: "Support can view failed jobs for a tenant but cannot change billing owners or access payment tokens."

Design implications: Drives ownership rules, isolation invariants, policy checks, audit requirements, and privilege-escalation threat scenarios.

## R2 Domain Model

### R2.1 Entities

Question: What are the main domain entities or lifecycle nouns in this design, and what is each responsible for representing?

Target section: `### Entities` and `### Responsibilities`.

Alloy target: Structural signatures.

Mermaid target: Entity relationship diagram if useful.

When to ask: Start of R2.

Follow-up triggers: Entities with unclear ownership, identity, or lifecycle.

Structured options: `User`, `Account`, `Resource`, `Request`, `Command`, `Event`, `Policy`, `Job`, `External record`.

Free-form guidance: Use business names, not implementation class names.

Educational note: A domain model names the concepts whose rules must stay true as code changes.

Example answer: "Customer owns PaymentMethod records; BillingProfile points at one active method."

Design implications: Determines the first Alloy signatures.

### R2.2 Identity

Question: How is each important entity identified, and can two records ever represent the same real-world thing?

Target section: `### Domain Rules`.

Alloy target: Uniqueness and identity facts or assertions.

Mermaid target: Entity relationship diagram.

When to ask: R2 after entities are named.

Follow-up triggers: Imported data, deduplication, external IDs, aliases, merged records.

Structured options: `Internal ID`, `External ID`, `Composite key`, `Natural key`, `Alias`, `May duplicate`.

Free-form guidance: Mention uniqueness scope.

Educational note: Identity mistakes cause duplicate effects, lost updates, and broken ownership rules.

Example answer: "Payment methods have internal IDs, but provider tokens must be unique per customer."

Design implications: Add multiplicity and uniqueness checks.

### R2.3 Relationships And Multiplicities

Question: How do the entities relate to each other? For each relationship, is it one-to-one, one-to-many, optional, or many-to-many?

Target section: `### Relationships`.

Alloy target: Fields with explicit multiplicities.

Mermaid target: Entity relationship diagram.

When to ask: R2.

Follow-up triggers: Optional ownership, shared resources, orphan records, deletion/archival.

Structured options: `one-to-one`, `one-to-many`, `optional`, `many-to-many`, `ownership`, `reference only`.

Free-form guidance: Name relationship direction and lifecycle dependency.

Educational note: Multiplicity is one of the highest-value things to check with Alloy.

Example answer: "Each account has one owner, many members, and zero or one active billing profile."

Design implications: Drives structural satisfiability and invariant checks.

### R2.4 Ownership

Question: Who or what owns each entity, and what happens to owned data when the owner changes, is disabled, or is deleted?

Target section: `### Relationships` and `### Domain Rules`.

Alloy target: Ownership constraints and orphan-prevention assertions.

Mermaid target: Entity relationship diagram.

When to ask: R2 when entities persist or permissions matter.

Follow-up triggers: Shared ownership, deletion, transfer, authorization.

Structured options: `Single owner`, `Shared owner`, `System-owned`, `External owner`, `No owner`, `Transferable`.

Free-form guidance: Include lifecycle consequences.

Educational note: Ownership often controls authorization and cleanup invariants.

Example answer: "A customer owns payment methods; disabling the customer archives all methods but keeps audit records."

Design implications: Affects privacy, deletion, and authorization checks.

### R2.5 Invalid States

Question: What combinations of entity state or relationships should be impossible, even if a bug, retry, or migration tries to create them?

Target section: `### Invalid States` and `### Invariants`.

Alloy target: Assertions for impossible states and negative predicates.

Mermaid target: None unless tied to lifecycle.

When to ask: End of R2 or R4.

Follow-up triggers: Writes, migrations, retries, partial failures.

Structured options: `Orphan`, `Duplicate`, `Conflicting active records`, `Invalid owner`, `Missing audit trail`, `Forbidden status combination`.

Free-form guidance: Phrase as "It must never be possible for...".

Educational note: Invalid states are often easier for engineers to name than formal invariants.

Example answer: "A billing profile must never point to a payment method owned by another customer."

Design implications: Becomes a safety assertion and property-based invariant.

## R3 State Machines

### R3.1 Lifecycle States

Question: Which entities have a lifecycle? List their states from creation to terminal or archived states.

Target section: `### States`.

Alloy target: State signatures and mutable status fields.

Mermaid target: State diagram.

When to ask: Start of R3 when entities persist or operations are multi-step.

Follow-up triggers: Async jobs, approvals, retries, terminal states.

Structured options: `Draft`, `Pending`, `Active`, `Suspended`, `Failed`, `Cancelled`, `Completed`, `Archived`.

Free-form guidance: Use domain names if these generic names do not fit.

Educational note: Explicit states make illegal transitions visible before implementation.

Example answer: "Invite: Created -> Sent -> Accepted or Expired -> Archived."

Design implications: Drives Mermaid and behavioral Alloy.

### R3.2 Events And Commands

Question: What events or commands move each lifecycle forward, and who or what is allowed to trigger them?

Target section: `### Events` and `### Commands`.

Alloy target: Event predicates with guards and effects.

Mermaid target: State diagram.

When to ask: R3 after states are known.

Follow-up triggers: Permissions, automated jobs, webhooks, retries.

Structured options: `User command`, `Admin command`, `Scheduled job`, `Webhook`, `Timeout`, `Dependency callback`, `Operator action`.

Free-form guidance: Include trigger, preconditions, and result.

Educational note: Commands are requests; events are facts that happened. Keeping them distinct reduces ambiguity.

Example answer: "User submits invite; scheduled job expires invites after 7 days."

Design implications: Guards become preconditions; effects become postconditions.

### R3.3 Legal And Illegal Transitions

Question: Which transitions are legal, which transitions must be rejected, and which transitions should be impossible internally?

Target section: `### Legal Transitions` and `### Illegal Transitions`.

Alloy target: Transition predicates and safety assertions.

Mermaid target: State diagram.

When to ask: R3.

Follow-up triggers: Reopening terminal states, cancellation, retry from failure.

Structured options: `Allowed`, `Rejected with error`, `Ignored idempotently`, `Compensated`, `Impossible by invariant`.

Free-form guidance: Include behavior for duplicate or late commands.

Educational note: Illegal transitions clarify both validation and internal safety claims.

Example answer: "Accepted invites cannot expire; a late expire command should be ignored."

Design implications: Identifies idempotency and stale-command behavior.

### R3.4 Retry And Ordering

Question: Can commands or events be retried, duplicated, delayed, or observed out of order? If so, what behavior is safe?

Target section: `### Retry And Recovery Behavior` and `### Ordering Guarantees`.

Alloy target: Duplicate-command and ordering predicates.

Mermaid target: Sequence diagram for retry path.

When to ask: R3 or R6 when async or external effects appear.

Follow-up triggers: Webhooks, queues, distributed systems, payments, notifications.

Structured options: `At-most-once`, `At-least-once`, `Exactly-once desired`, `Idempotent retry`, `Per-key order`, `No order guarantee`.

Free-form guidance: Name what key, if any, defines ordering.

Educational note: "Exactly once" is usually a design goal achieved with idempotency and deduplication, not a property to assume from infrastructure.

Example answer: "Webhooks may arrive more than once and out of order, but provider event IDs are unique."

Design implications: Requires dedupe, monotonic state transitions, or commutative operations.

## R3A Algorithmic Core And Data Structures

This round is optional. Ask the screening question after R3. If the design has no meaningful algorithmic or data-structure work, record that result in `### Screening Result` and continue to R4. If the round applies, every algorithmic or data-structure answer must include explicit bounds, Big-O runtime complexity, and Big-O space complexity before the sketch can be considered complete.

### R3A.1 Screening

Question: Does any part of this design depend on a nontrivial algorithm, data structure, ranking or matching rule, scheduling policy, indexing strategy, cache, batch process, parser, graph or tree traversal, conflict-resolution rule, or performance-critical transformation?

Target section: `## Algorithmic Core And Data Structures` / `### Screening Result`.

Alloy target: None unless the answer identifies structural data invariants or bounded algorithmic behavior.

Mermaid target: Optional flow, graph, or data-structure diagram if it clarifies the algorithm.

When to ask: After R3. Always ask as a lightweight gate before R4 unless prior answers clearly prove the round is irrelevant.

Follow-up triggers: Large inputs, complex transformations, ranking, search, scheduling, matching, caching, indexes, graph or tree data, batching, parsing, deduplication, conflict resolution, high fan-out, or performance-critical paths.

Structured options: `No dedicated algorithmic work`, `Search or lookup`, `Ranking or sorting`, `Matching or allocation`, `Scheduling`, `Batching`, `Caching`, `Indexing`, `Graph or tree traversal`, `Parsing`, `Conflict resolution`, `Performance-critical transform`.

Free-form guidance: Name the operation and why an ordinary straightforward implementation may not be enough.

Educational note: Most features do not need a special algorithm round. When they do, design-time complexity and bounds prevent accidental production bottlenecks.

Example answer: "The scheduler must choose the next eligible job per tenant while preserving fairness and avoiding starvation."

Design implications: Determines whether R3A continues and which operations require explicit complexity, bounds, and verification evidence.

### R3A.2 Algorithmically Interesting Operations

Question: Which operations are algorithmically interesting or likely to dominate runtime, storage, memory, database access, or external calls?

Target section: `### Algorithmically Interesting Operations`.

Alloy target: Operation signatures or bounded scenarios if operation ordering, eligibility, or reachability affects correctness.

Mermaid target: Activity or sequence diagram when multiple stages exist.

When to ask: R3A when screening identifies any algorithmic work.

Follow-up triggers: Multiple candidate hot paths, high fan-out, nested loops, repeated database queries, expensive external calls, or unclear operation boundaries.

Structured options: `Lookup`, `Search`, `Sort`, `Rank`, `Match`, `Allocate`, `Schedule`, `Aggregate`, `Deduplicate`, `Parse`, `Transform`, `Reconcile`, `Paginate`.

Free-form guidance: Include the caller, input, output, and when the operation runs.

Educational note: Optimization starts by naming the operation and input shape, not by choosing a clever implementation.

Example answer: "On every sync, reconcile provider records against local accounts and produce create, update, and archive commands."

Design implications: Establishes the scope for complexity analysis, benchmarks, property tests, and possible executable reference models.

### R3A.3 Bounds And Complexity

Question: For each algorithmically interesting operation, what are the explicit input-size bounds, expected-case runtime, worst-case runtime, and space usage in Big-O notation?

Target section: `### Expected Input Sizes And Explicit Bounds`, `### Runtime Complexity`, and `### Space Complexity`.

Alloy target: Finite scopes or cardinality constraints if bounds affect correctness.

Mermaid target: None.

When to ask: Always in R3A for every identified algorithm or data-structure design choice.

Follow-up triggers: Missing Big-O notation, missing space complexity, missing worst case, unbounded input, vague terms like "small" or "fast", or complexity worse than expected.

Structured options: `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`, `O(n*m)`, `O(V+E)`, `O(k)`, `Unknown`, `Needs measurement`.

Free-form guidance: Define each variable, such as n users, m records, k tenants, V graph nodes, or E graph edges. State hard limits and expected production sizes.

Educational note: Big-O is only useful when the variables and bounds are explicit. A design with unknown or unbounded n still has a risk even if the code is not written yet.

Example answer: "For each tenant, n is queued jobs and k is priority classes. Bound n <= 10,000. Selection is O(k log n) time with heaps and O(n + k) space. Worst case is the same."

Design implications: Drives data-structure choice, admission limits, capacity checks, benchmarks, and overload behavior.

### R3A.4 Data Structures, Indexes, And Caches

Question: What data structures, indexes, or caches make the operation efficient, and what invariant must each one preserve?

Target section: `### Data Structures And Indexes`, `### I/O, Caching, And Batching Strategy`, and `### Algorithmic Invariants And Edge Cases`.

Alloy target: Structural invariants for indexes, membership, uniqueness, ordering, cache coherence, or consistency between derived and source data.

Mermaid target: Data-structure, component, or read/write path diagram if useful.

When to ask: R3A when the operation needs lookup, ordering, deduplication, caching, indexing, batching, or derived data.

Follow-up triggers: Cache invalidation, stale indexes, duplicate keys, missing database indexes, N+1 access patterns, high fan-out, partial rebuilds, or derived state.

Structured options: `Map`, `Set`, `Queue`, `Priority queue`, `Heap`, `Tree`, `Graph`, `Trie`, `Bloom filter`, `Database index`, `Materialized view`, `Cache`, `Append-only log`.

Free-form guidance: Include update rules, invalidation rules, and how the structure stays consistent with source-of-truth data.

Educational note: Data structures are part of the design contract when stale or inconsistent derived state can break correctness or performance.

Example answer: "Use a per-tenant priority queue keyed by due time and priority. The queue must contain exactly the runnable jobs for that tenant."

Design implications: Adds invariants, model checks, cache-coherence tests, index requirements, and regression cases for stale derived state.

### R3A.5 Memory, Streaming, And I/O Shape

Question: Can the operation stream or page through data, or must it materialize the full input? What memory, I/O, batching, and external-call bounds apply?

Target section: `### Memory And Streaming Behavior` and `### I/O, Caching, And Batching Strategy`.

Alloy target: Usually none unless batching or paging affects state transitions or correctness.

Mermaid target: Sequence or activity diagram for streaming, pagination, batching, or cache interaction.

When to ask: R3A when inputs can be large, file-based, paged, batched, remote, or expensive to load.

Follow-up triggers: Whole-file reads, unbounded arrays, nested queries, N+1 queries, repeated external calls, batch retries, or high fan-out.

Structured options: `Streaming`, `Pagination`, `Full materialization`, `Batching`, `Chunking`, `Database cursor`, `Cache read-through`, `Write-behind`, `External fan-out`, `Unknown`.

Free-form guidance: State peak memory in terms of input variables, maximum batch size, query count, external-call count, and file or payload limits.

Educational note: Space complexity and I/O complexity often dominate runtime for production data sizes.

Example answer: "Process uploaded rows in batches of 1,000. Peak memory is O(batchSize), not O(fileRows). Database writes are O(fileRows / batchSize) batches."

Design implications: Drives hard limits, backpressure, benchmark scenarios, fault injection for partial batches, and memory regression tests.

### R3A.6 Determinism, Ordering, And Edge Cases

Question: Does the algorithm require deterministic results, stable ordering, fairness, starvation freedom, or explicit tie-breaking? What edge cases or adversarial inputs should be tested?

Target section: `### Determinism, Ordering, And Tie-Breaking` and `### Algorithmic Invariants And Edge Cases`.

Alloy target: Ordering, fairness, eligibility, reachability, or bad-state checks when modelable.

Mermaid target: State, activity, or sequence diagram if ordering or scheduling matters.

When to ask: R3A when output order, ranking, matching, scheduling, conflict resolution, retries, or concurrency affects correctness or user-visible behavior.

Follow-up triggers: Ties, duplicate inputs, equivalent inputs, reordering, clock dependence, random IDs, concurrent updates, starvation, or nondeterministic provider responses.

Structured options: `Stable order`, `Explicit tie-break`, `Fairness`, `No starvation`, `Deterministic replay`, `Randomized choice`, `Commutative operation`, `Adversarial input`.

Free-form guidance: Include what should stay the same if inputs are reordered, duplicated, split into batches, retried, or combined.

Educational note: Determinism and tie-breaking are correctness properties when users, tests, or downstream systems depend on reproducible results.

Example answer: "When two jobs have the same priority and due time, choose the older job first. Replaying the same event history must produce the same chosen job."

Design implications: Drives metamorphic tests, property-based generated histories, fairness checks, deterministic replay, and regression tests for boundary cases.

### R3A.7 Alternatives And Evidence

Question: What alternative algorithm or data-structure choices were considered, and what evidence should decide between them?

Target section: `### Alternatives Considered` and `### Simulation, Benchmark, Or Back-Of-The-Envelope Candidates`.

Alloy target: Variant predicates if alternative choices affect structural or behavioral correctness.

Mermaid target: Decision flow if useful.

When to ask: R3A when there are credible alternatives or uncertainty about complexity, memory, I/O, correctness, or operational cost.

Follow-up triggers: Unknown complexity, expected-case assumptions, high-cost tradeoffs, complex caches, database-vs-memory choices, or user-visible ranking and fairness decisions.

Structured options: `Simpler algorithm`, `Better asymptotic complexity`, `Lower memory`, `Lower I/O`, `Database index`, `Cache`, `Precompute`, `Stream`, `Simulate`, `Benchmark`, `Measure in production`.

Free-form guidance: Name the decision criterion and the smallest useful evidence, such as a benchmark threshold, simulation, property test, or back-of-the-envelope calculation.

Educational note: The best design is often the simplest one that satisfies explicit bounds and evidence, not the most sophisticated algorithm.

Example answer: "Consider full scan O(n) versus indexed lookup O(log n). Use full scan for MVP only if n <= 1,000 by product constraint; otherwise require an index."

Design implications: Records tradeoffs, prevents premature optimization, and identifies evidence that should be automated later.

## R4 Invariants And Properties

### R4.1 Always True

Question: What must always be true after every successful operation, regardless of timing, retries, or failures?

Target section: `### Invariants`.

Alloy target: Assertions.

Mermaid target: None.

When to ask: Start of R4.

Follow-up triggers: Answer is implementation-specific rather than domain-specific.

Structured options: `Ownership`, `Uniqueness`, `Authorization`, `Balance or count`, `State consistency`, `Auditability`, `Privacy`.

Free-form guidance: Phrase each invariant as a sentence that could be checked.

Educational note: Invariants are the backbone of lightweight formal methods.

Example answer: "Every active billing profile points to exactly one active payment method owned by the same customer."

Design implications: Becomes Alloy checks and property-based assertions.

### R4.2 Must Never Happen

Question: What must never happen, even temporarily, from the user's or business's point of view?

Target section: `### Safety Claims`.

Alloy target: Bad-state predicates and `check` commands.

Mermaid target: Failure flow if useful.

When to ask: R4.

Follow-up triggers: Safety claim depends on external systems or real-world effects.

Structured options: `Data loss`, `Unauthorized access`, `Duplicate charge`, `Broken audit trail`, `Invalid state`, `Policy violation`, `Privacy leak`.

Free-form guidance: Include severity and observable impact.

Educational note: Safety means bad things do not happen.

Example answer: "A user must never see another customer's payment method."

Design implications: Drives negative tests, Alloy assertions, and trust-boundary checks.

### R4.3 Eventually Happens

Question: Is there anything that should eventually happen after a valid trigger, assuming dependencies behave reasonably? What assumptions make that true?

Target section: `### Liveness Claims` and `### Fairness Assumptions`.

Alloy target: Liveness assertions only with fairness assumptions.

Mermaid target: State or activity diagram.

When to ask: R4 when async jobs, retries, queues, or workflows appear.

Follow-up triggers: No bound, no retry limit, vague dependency assumptions.

Structured options: `Eventually completes`, `Eventually retries`, `Eventually expires`, `Eventually notifies`, `No liveness claim`.

Free-form guidance: Include time bounds if they matter.

Educational note: Liveness means good things eventually happen, but it depends on fairness assumptions like jobs continuing to run.

Example answer: "A pending invite eventually expires if the scheduler runs at least once per hour."

Design implications: Requires fairness assumptions, monitoring, and starvation tests.

### R4.4 Preconditions And Postconditions

Question: For the most important operation, what must be true before it starts, and what must be true immediately after it succeeds?

Target section: `### Preconditions` and `### Postconditions`.

Alloy target: Event guards and effects.

Mermaid target: Activity diagram if useful.

When to ask: R4 after operations are known.

Follow-up triggers: Preconditions mention mutable or stale data.

Structured options: `Authenticated`, `Authorized`, `Valid input`, `Existing state`, `Fresh read`, `Quota or capacity`, `Dependency available`.

Free-form guidance: Pick the critical operation first.

Educational note: Preconditions and postconditions turn an operation into a checkable contract.

Example answer: "Before: user owns account and token is valid. After: active method pointer changes and audit event exists."

Design implications: Contracts, tests, and Alloy event predicates.

## R5 Quality Attributes And Assumptions

### R5.1 Utility Tree

Question: Which quality attributes matter most, and what concrete scenario makes each one important?

Target section: `### Utility Tree`.

Alloy target: Only if quality concern is structural, stateful, or protocol-like.

Mermaid target: Operational flow if useful.

When to ask: Start R5.

Follow-up triggers: Vague targets like "secure", "fast", or "scalable".

Structured options: `Reliability`, `Latency`, `Availability`, `Security`, `Privacy`, `Observability`, `Scalability`, `Operability`, `Cost`.

Free-form guidance: Use stimulus, response, measure, and priority.

Educational note: A utility tree makes quality attributes concrete enough to design and test.

Example answer: "Latency: customer submits update during normal traffic; 95% complete under 2s; high priority."

Design implications: Drives tests, monitoring, and tradeoff decisions.

### R5.2 Back-Of-The-Envelope

Question: What rough load, storage, throughput, latency, and growth assumptions should the design survive?

Target section: `### Back-Of-The-Envelope Analysis`.

Alloy target: Bounds if finite counts affect correctness.

Mermaid target: None.

When to ask: R5 for production systems, queues, jobs, storage, or performance claims.

Follow-up triggers: Queues, capacity limits, high fan-out, expensive external calls.

Structured options: `Requests per second`, `Concurrent users`, `Queue depth`, `Storage growth`, `Payload size`, `External call latency`, `Retention`.

Free-form guidance: Estimates are useful even when rough.

Educational note: Back-of-the-envelope checks expose impossible designs early. Little's Law links concurrency, throughput, and latency.

Example answer: "At peak, 50 RPS, p95 external provider latency 500ms, retain audit events for 7 years."

Design implications: May require capacity simulation or async design.

### R5.3 Tradeoffs

Question: Which quality attributes might conflict, and which tradeoffs are you willing to make?

Target section: `### Tradeoffs`.

Alloy target: Usually none.

Mermaid target: Decision flow if useful.

When to ask: R5 after quality attributes are identified.

Follow-up triggers: Low latency versus consistency, privacy versus observability, availability versus correctness.

Structured options: `Consistency over availability`, `Availability over freshness`, `Latency over completeness`, `Safety over speed`, `Privacy over observability`, `Cost over latency`.

Free-form guidance: Name the default decision under stress.

Educational note: Architecture is often about explicit tradeoffs, not maximizing every attribute.

Example answer: "Prefer correctness over latency; if provider is slow, return pending instead of pretending success."

Design implications: Clarifies failure behavior and verification priorities.

### R5.4 Observability

Question: What must operators be able to observe, alert on, or audit to know the design is preserving its invariants?

Target section: `## Quality Attributes` and `## Verification Plan`.

Alloy target: Audit invariants if observability is part of correctness.

Mermaid target: Operational flow if useful.

When to ask: R5 when operations, failures, or compliance matter.

Follow-up triggers: Silent failures, asynchronous processing, audit needs.

Structured options: `Metrics`, `Logs`, `Traces`, `Audit records`, `Dashboards`, `Alerts`, `Dead-letter queues`.

Free-form guidance: Tie observability to a claim or failure mode.

Educational note: Observability is evidence in production that assumptions still hold.

Example answer: "Alert if retry queue age exceeds 10 minutes or provider failures exceed 5%."

Design implications: Adds runtime evidence requirements.

### R5.5 External Connectivity Controls

Question: For each external dependency or API endpoint, what timeout, retry, rate limit, circuit breaker, authentication, and safe fallback behavior is required?

Target section: `### Assumptions And Dependencies`, `## Failure Modes`, and `### Utility Tree`.

Alloy target: Protocol constraints when dependency responses affect state transitions, retries, or safety claims.

Mermaid target: Dependency interaction or failure sequence diagram.

When to ask: R5 or R6 when the design calls APIs, receives webhooks, exposes public endpoints, uses queues, or depends on providers, databases, caches, auth systems, or internal services.

Follow-up triggers: Unbounded retries, missing timeouts, provider rate limits, public endpoints, cascading failures, payment or notification providers, or synchronous dependency chains.

Structured options: `Timeout`, `Retry limit`, `Rate limit`, `Circuit breaker`, `Authentication`, `Fallback`, `Bulkhead`, `Idempotency key`.

Free-form guidance: Include safe defaults and what users or callers observe when a dependency is unhealthy.

Educational note: Connectivity controls prevent one slow or failing dependency from becoming a system-wide failure.

Example answer: "Provider calls time out after 2 seconds, retry twice from an outbox, and open a circuit after sustained failures."

Design implications: Drives resilience patterns, liveness assumptions, capacity planning, and fault-injection scenarios.

### R5.6 Deterministic Core And Nondeterministic Edges

Question: Which parts of the design should be deterministic core logic, and which sources of nondeterminism, such as time, random IDs, network responses, queues, scheduler order, or clocks, must be passed in from the edges?

Target section: `## Design Implications`, `### Assumptions And Dependencies`, `## State Machines`, and `## Verification Plan`.

Alloy target: State-machine model with explicit inputs for nondeterministic events or environment choices.

Mermaid target: Boundary diagram that separates core decision logic from edge adapters.

When to ask: R5 when correctness depends on time, randomness, async jobs, external services, retries, concurrency, scheduling, generated IDs, or environment state.

Follow-up triggers: Tests are hard to reproduce, behavior depends on current time, external systems choose outcomes, queues reorder work, or random values affect decisions.

Structured options: `Time`, `Random IDs`, `Network response`, `Queue order`, `Scheduler`, `Concurrency`, `External provider`, `Operator action`, `No nondeterminism`.

Free-form guidance: Name what the core receives as concrete input and what stays outside the core.

Educational note: A deterministic core makes behavior easier to test, model, replay, and compare against implementation.

Example answer: "The eligibility decision receives current time and provider status as inputs; it does not read the clock or call the provider directly."

Design implications: Enables model-based tests, deterministic simulation, differential testing, and simpler fault injection.

### R5.7 Architectural Separation

Question: Should this design separate reads from writes, and should pure computation be isolated from storage, network, time, and other I/O? What would break if these concerns are coupled?

Target section: `## Design Implications`, `### Tradeoffs`, and `### Architectural Seams And Extension Points`.

Alloy target: Usually none unless separation affects command/query behavior, state transitions, or consistency rules.

Mermaid target: Component or data-flow diagram showing read paths, write paths, pure core, and I/O adapters.

When to ask: R5 when the feature has nontrivial reads and writes, high correctness risk, multiple storage systems, external effects, scaling pressure, or expected future integrations.

Follow-up triggers: Same code path both decides and performs side effects, read models differ from write models, storage calls are embedded in business rules, or future providers are likely.

Structured options: `Separate reads/writes`, `Unified path`, `Pure core`, `I/O adapters`, `Storage boundary`, `Network boundary`, `Not needed`.

Free-form guidance: Explain the boundary and any intentional coupling.

Educational note: Separation can protect correctness and testability, but unnecessary separation can add cost and complexity.

Example answer: "Command handlers validate and append events; read models are rebuilt asynchronously for dashboards. Core pricing rules are pure functions."

Design implications: Drives module boundaries, test strategy, scalability options, and evolvability fitness functions.

### R5.8 Resource Exhaustion And Hard Limits

Question: What resources can be exhausted, such as memory, CPU, queue depth, database connections, storage, file handles, provider quotas, tenant limits, or browser resources, and what hard limits or backpressure should apply?

Target section: `### Back-Of-The-Envelope Analysis`, `### Utility Tree`, and `## Failure Modes`.

Alloy target: Bounds or capacity constraints if exhaustion affects correctness or admission control.

Mermaid target: Operational flow for admission control, backpressure, or queue handling.

When to ask: R5 when the design processes files, queues, batches, fan-out, public traffic, tenant workloads, external quotas, or long-running jobs.

Follow-up triggers: Unbounded collections, large payloads, retries, high fan-out, no queue limit, per-tenant fairness, or external provider quotas.

Structured options: `Memory`, `CPU`, `Queue depth`, `DB connections`, `Storage`, `File handles`, `Provider quota`, `Tenant limit`, `Browser resources`.

Free-form guidance: Include per-request, per-tenant, and system-wide limits when they differ.

Educational note: Resource limits are part of correctness when overload can cause data loss, starvation, or cascading failures.

Example answer: "Each tenant can enqueue 10,000 jobs, each file is capped at 50 MB, and global queue age triggers backpressure."

Design implications: Drives admission control, capacity tests, overload behavior, and operational alerts.

### R5.9 Dependency Attack Surface

Question: Which third-party libraries, packages, providers, browser surfaces, or platform controls are security-relevant, and what constraints should limit their attack surface?

Target section: `### Assumptions And Dependencies`, `### Constraints`, and `## Quality Attributes`.

Alloy target: Usually none unless providers or dependency roles affect authorization, data flow, or state safety.

Mermaid target: Dependency boundary diagram if external or browser surfaces are important.

When to ask: R5 when the design depends on third-party packages, provider SDKs, browser execution, plugins, templates, content rendering, public endpoints, or security headers.

Follow-up triggers: New dependencies, unused or broad SDKs, dynamic plugin loading, browser-rendered user content, cross-origin calls, provider webhooks, or package supply-chain risk.

Structured options: `Third-party package`, `Provider SDK`, `Browser surface`, `Plugin`, `Template rendering`, `Security headers`, `Webhook`, `Supply chain`.

Free-form guidance: Name the dependency or surface and the intended constraint, isolation, or platform control.

Educational note: Dependencies and platform surfaces expand the trusted computing base, so designs should keep them narrow and observable.

Example answer: "Only the payment provider SDK can handle tokens, browser pages need strict CSP, and webhook verification must not depend on app-level user sessions."

Design implications: Drives dependency constraints, isolation boundaries, provider contract tests, and security fitness functions.

## R6 Failure Modes

### R6.1 Unsafe Inputs

Question: What malformed, malicious, stale, duplicate, or surprising inputs should be rejected, ignored, or handled safely?

Target section: `## Failure Modes` and `### Preconditions`.

Alloy target: Negative scenarios where structural or stateful.

Mermaid target: Failure flow.

When to ask: Start R6.

Follow-up triggers: Trust boundaries, user input, external events.

Structured options: `Malformed`, `Unauthorized`, `Duplicate`, `Stale`, `Out of order`, `Oversized`, `Conflicting`, `Replay`.

Free-form guidance: Include expected response.

Educational note: Safe rejection is a correctness behavior, not just validation plumbing.

Example answer: "A webhook with an old sequence number should be ignored and logged."

Design implications: Negative tests and state-machine guards.

### R6.2 Partial Progress

Question: If the operation succeeds halfway and then fails, what partial state or external effect could remain, and how should the system recover?

Target section: `## Failure Modes`.

Alloy target: Reachable bad states and compensation checks.

Mermaid target: Recovery activity diagram.

When to ask: R6 when writes or external effects exist.

Follow-up triggers: Multiple writes, external providers, notifications, jobs.

Structured options: `Rollback`, `Compensate`, `Retry`, `Mark pending`, `Manual repair`, `Fail closed`, `Outbox`.

Free-form guidance: Name what users observe during partial progress.

Educational note: Many production failures happen between two individually valid steps.

Example answer: "If profile update commits but email fails, keep the update and retry email from an outbox."

Design implications: Requires recovery invariants and fault injection.

### R6.3 Dependency Failures

Question: Which dependencies can fail, time out, return stale data, corrupt data, or become unavailable, and what should happen in each case?

Target section: `## Failure Modes` and `### Assumptions And Dependencies`.

Alloy target: Protocol constraints if dependency state affects correctness.

Mermaid target: Failure sequence diagram.

When to ask: R6 when dependencies are named.

Follow-up triggers: Provider calls, databases, caches, queues, auth systems.

Structured options: `Timeout`, `Unavailable`, `Stale response`, `Invalid response`, `Rate limited`, `Partial success`, `Permanent failure`.

Free-form guidance: Include retry limits and safe fallback.

Educational note: Dependencies are assumptions with failure modes attached.

Example answer: "If provider is unavailable, mark update pending and retry for 24 hours before requiring support."

Design implications: Drives liveness assumptions and fault-injection plan.

### R6.4 Concurrency Hazards

Question: What can happen concurrently, and could concurrent operations cause lost updates, duplicate effects, stale decisions, or invariant violations?

Target section: `## Failure Modes` and `### Invariants`.

Alloy target: Interleaving or duplicate-command scenarios if modelable.

Mermaid target: Sequence diagram.

When to ask: R6 when multiple users, retries, async jobs, or distributed writes exist.

Follow-up triggers: Same entity updated by multiple actors, queues, webhooks, background jobs.

Structured options: `Same key concurrent writes`, `Read-modify-write`, `Duplicate command`, `Out-of-order event`, `Concurrent delete`, `Background job race`.

Free-form guidance: Name the shared entity or key.

Educational note: Concurrency bugs often violate invariants even when every single operation looks correct alone.

Example answer: "Two admins can update account limits; last writer wins is acceptable only if audit keeps both attempts."

Design implications: Requires locking, compare-and-set, idempotency, or deterministic conflict rules.

### R6.5 Operator Mistakes

Question: What mistakes can an operator, admin, or support engineer make, and what guardrails or recovery paths are needed?

Target section: `## Failure Modes` and `### Operability`.

Alloy target: Permission or state constraints if admin actions are modeled.

Mermaid target: Recovery flow.

When to ask: R6 when manual operations or admin tools exist.

Follow-up triggers: Manual repair, migrations, support workflows, privileged actions.

Structured options: `Wrong account`, `Wrong environment`, `Bad migration`, `Unsafe override`, `Accidental delete`, `Missed alert`.

Free-form guidance: Include detection and reversal expectations.

Educational note: Humans are part of the system boundary when operations affect correctness.

Example answer: "Support can resend confirmation email but cannot change billing owner without two-party review."

Design implications: Authorization, audit, and recovery requirements.

### R6.6 Destructive And Removal Operations

Question: For each delete, remove, purge, or replace operation, what key or scope bounds the removal, and what happens when the key is ambiguous, matches too many items, or matches none?

Target section: `## Failure Modes`.

Alloy target: A witness where an under-specified key removes more than one intended item, plus a check that a well-scoped key removes exactly the intended target.

Mermaid target: Removal decision flow.

When to ask: R6 when the design includes delete, remove, purge, replace, or bulk-mutation operations.

Follow-up triggers: Replace operations, cascading deletes, bulk deletes, key matching, wildcard or prefix scopes, soft versus hard delete.

Structured options: `Exact key`, `Ambiguous key over-matches`, `Key matches none`, `Cascade too broad`, `Soft delete`, `Hard delete`, `Require confirmation`, `Dry run`.

Free-form guidance: Name the exact identity that scopes the removal and the required behavior when the scope is wrong.

Educational note: Over-broad removal from an unclear key scope is a common and high-impact defect. A replace that resolves to more than one target can delete unintended data.

Example answer: "A replace must resolve to exactly one item by capability plus name plus kind. If it matches zero or more than one, reject the operation and emit a diagnostic. Never delete a broader set than the caller named."

Design implications: Requires an explicit removal key, a reject-on-ambiguity rule, and evidence that removal scope is exactly bounded.

## Final Verification Planning

### FE Formal-Evidence Framing

Question: For your most important operation, what output must exist after it succeeds, what input must be rejected without changing state, and what hard input limit should fail fast?

Target section: `## Invariants`, `## Failure Modes`, and `## Verification Plan`.

Alloy target: An output-existence witness for the success case, a reachable rejected-operation scenario for the invalid input, and a hard-limit boundary check.

Mermaid target: None.

When to ask: After R4 or R6, before the final verification plan, especially when Alloy checks risk being tautological.

Follow-up triggers: A safety check that restates a fact; a success property that only constrains outputs if they already exist; an accepted risk with no mitigation.

Structured options: `Required output exists`, `Invalid input rejected`, `State unchanged on reject`, `Hard limit fails fast`, `Accepted risk remains`.

Free-form guidance: Answer with concrete outputs and rejected inputs, not general safety language. Separate v1 guarantees from accepted risks.

Educational note: A passing Alloy check is evidence only when the success output must be created, the bad input is reachable and rejected, and the assertion does not restate a fact. This question exposes tautological or vacuous checks early.

Example answer: "A successful merge must create at least one effective item with provenance. A duplicate replacement target must be rejected with the registry unchanged. More than 20,000 requirements should fail fast as an accepted v1 hard limit."

Design implications: Drives output-existence witnesses, reachable rejection scenarios, explicit hard bounds, and a clear split between v1 guarantees and accepted risks.

### V1 Evidence Priority

Question: Which claims would be most damaging if wrong, and therefore deserve the strongest evidence?

Target section: `## Verification Plan`.

Alloy target: Prioritize assertions and scopes.

Mermaid target: None.

When to ask: Before final plan if priorities are unclear.

Follow-up triggers: Many claims with equal priority.

Structured options: `Money`, `Data loss`, `Security`, `Privacy`, `Availability`, `Compliance`, `User trust`, `Operational safety`.

Free-form guidance: Pick the top 1 to 3.

Educational note: Verification should be risk-driven; strongest checks go where failure hurts most.

Example answer: "Preventing duplicate charges and cross-customer data exposure are highest priority."

Design implications: Identifies the claims that need the strongest direct evidence in the dependability case.

### V2 Evidence Needed For Confidence

Question: What evidence would you need to see to be absolutely certain the feature was implemented correctly, and what evidence would still leave you uneasy?

Target section: `## Verification Plan`, especially claims, assumptions, bounds, model or executable spec, differential testing, property-based tests, metamorphic tests, fault injection, static checks, CI automation, and open evidence gaps.

Alloy target: Prioritize Alloy assertions, scopes, witness predicates, or counterexample searches only when bounded model checking would directly increase confidence in a critical property.

Mermaid target: None.

When to ask: Immediately after V1, before choosing language-specific tools.

Follow-up triggers: The answer relies only on example tests, manual QA, code review, or "it seems simple"; the evidence does not connect to the highest-risk claims; assumptions are untestable or hidden; the implementation could satisfy tests while violating the real-world property; the team lacks an oracle for expected behavior.

Structured options: `Explicit claims`, `Assumptions and bounds`, `Executable model`, `Alloy or model checking`, `Deductive verification`, `Differential tests`, `Property-based histories`, `Metamorphic tests`, `Fault injection`, `Concurrency or schedule tests`, `Regression tests from counterexamples`, `Static analysis or contracts`, `CI evidence`.

Free-form guidance: Answer in terms of direct evidence, not process. Name the artifact or check that would convince you, the claim it supports, what assumptions it depends on, and how it stays alive as the system changes.

Educational note: Lightweight formal methods are evidence-driven. The goal is not to prove everything. The goal is to identify the critical claims, produce direct mechanical evidence that they hold in the situations that matter, and keep that evidence running in CI.

Example answer: "For the billing update, I would need an executable model of the state transitions, differential tests comparing the model and implementation over generated histories, property-based tests for duplicate and reordered commands, regression tests for every Alloy counterexample, and CI checks that run all of it. I would not be confident from example tests and code review alone."

Design implications: Converts the verification plan from a checklist into a dependability case: claims, assumptions, models, checks, results, and CI evidence that justify trust in the implementation.

### V3 Implementation Language

Question: What implementation language or platform do you expect to use, if known?

Target section: `## Verification Plan`.

Alloy target: None.

Mermaid target: None.

When to ask: Before final plan if unknown.

Follow-up triggers: Java or TypeScript allows specific tool recommendations.

Structured options: `Unknown`, `Java`, `TypeScript`, `JavaScript`, `Python`, `Go`, `Rust`, `Other JVM`, `Other`.

Free-form guidance: Include test framework preferences if known.

Educational note: The evidence categories are stable, but tool choices depend on language.

Example answer: "TypeScript service with Vitest already in the repo."

Design implications: Enables Vitest/fast-check/LemmaScript or JUnit/jqwik/Fray/OpenJML recommendations.
