# OpenSpec Markdown Reader

A new **Firefox-first extension, implemented in TypeScript**, for reading local Markdown, OpenSpec artifacts, Alloy models, Java sources, and OpenJML specifications directly at their `file:///…` URLs.

## Features

- CommonMark and GitHub-flavored Markdown: tables, task lists, strikethrough, links, images, and sanitized HTML.
- First-class OpenSpec presentation for finalized and delta `spec.md`, `proposal.md`, `design.md`, and `tasks.md`.
- Distinct requirement, scenario, evidence, model, and delta sections; requirement/scenario identifiers appear in the outline.
- EARS, RFC 2119, and Gherkin keyword highlighting in prose, excluding inline code and code fences. Uppercase EARS/Gherkin clauses begin on separate lines, with only `<system>` underlined; `THE <system>` stays alongside its modal response.
- Standalone **Alloy `.als` files** with a continuous read-only highlighted/foldable source view and a left-hand definition outline for modules, imports, signatures, enums, facts, predicates, functions, assertions, and run/check commands.
- **Alloy explorer:** generic instance graphs, complete-arity relation tables, temporal playback with lasso loops, adjacent-state comparison, tuple/membership differences, inspection, projection/filter/color profiles, and saved/exported examples.
- **Optional local Alloy 6 analysis:** connect a project's existing JAR to execute run/check commands, enumerate solutions, explore temporal alternatives/forks, and evaluate state-specific expressions. Imported results and visualization remain usable without a local installation.
- Standalone **Java `.java` and OpenJML `.jml` files** with hierarchical outlines for types, constructors, overloaded methods, fields, nested types, model/ghost declarations, documentation, and contracts.
- Readable, collapsible **Javadoc cards** with declaration names in their headers, wrapped prose, a larger standalone first-sentence summary, lists, inline code, local member links, and structured `@param`, `@return`, `@throws`, and other tags.
- Readable, collapsible **OpenJML contract cards** with behavior cases and individual clauses; `\result`, `\old`, quantified expressions, and implication operators have distinct highlighting. Inline JML modifiers and original-source mode retain annotation highlighting.
- **Documented simple enums as tables**, pairing constant names with their Javadoc, source lines, and navigation links.
- A **floating horizontal scroll control** keeps wide code usable while its native scrollbar is below the visible page. It stays synchronized with ordinary code scrolling and supports mouse and keyboard interaction.
- Nested section folding and whole-code-block folding.
- **Automatic structural folding inside Alloy, TypeScript, Java, Rust, and JavaScript fences**, including multiline comments, consecutive line comments, and multiline language structures such as methods, classes, and loops.
- Structural syntax highlighting/folding also available for Python, JSON, CSS, HTML, XML, YAML, SQL, and Markdown. Unknown languages retain a read-only text view and whole-block collapse.
- Mermaid diagrams with working button zoom, **Shift+mouse-wheel zoom**, drag-to-pan, and collapsible source. Rendering uses the Dagre layout and SVG text labels, bundled locally.
- Document search that indexes folded content and original code. Selecting a result opens enclosing sections and reveals matching code inside internal folds.
- Outline navigation and shareable heading fragments that reveal collapsed sections.
- Light/dark themes, comfortable/wide layouts, raw/rendered view, and code copying.
- Locally persisted scroll positions, section folds, and internal code folds for up to 40 documents.
- Explainable structural spec diagnostics: duplicate identifiers, empty requirements, orphan scenarios, and missing WHEN/THEN steps. These checks do not execute models, tests, or verification tools.

No local server or native companion is required. The extension does not edit documents. It makes no telemetry or CDN requests; images and links explicitly referenced by a document use the browser's normal loading behavior.

## Build and load in Firefox

Requires **Node.js 22.12+**, npm, and **Firefox 142+**.

```sh
cd openspec-reader
npm ci
npm run build
```

1. In Firefox, open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…** and choose `openspec-reader/dist/manifest.json`.
3. Open the extension popup and select **Enable local files**, accepting Firefox's permission prompt if shown. The same control is available in Reader settings. If Firefox already granted the declared host access, the control shows that access is enabled.
4. On **Firefox 153+**, also open `about:addons` → **OpenSpec Markdown Reader** → **Permissions** and enable **Allow access to file URLs**. The popup/settings control directs you there when this separate browser-owned opt-in is missing.
5. Browse to a Markdown file, such as `file:///home/you/project/openspec/specs/reader/spec.md`, or a source file such as `file:///home/you/project/models/reader.als`, `Counter.java`, or `Counter.jml`.

Temporary add-ons are removed when Firefox exits. To run a development session with `web-ext`, use `npm start`. `npm run package` creates an unsigned archive in `artifacts/`; permanent installation in standard Firefox requires Mozilla signing.

### Linux MIME setup

As with the supplied `markdown-viewer` reference, Firefox must **display supported files as text** rather than offer a download. If Firefox downloads local `.md`, `.als`, `.java`, or `.jml` files, add this line to `~/.mime.types`, merging it with any existing entries:

```text
type=text/plain exts=md,mkd,mkdn,mdwn,mdown,markdown,mdtxt,mdtext,als,java,jml desc="Markdown and source documents"
```

If Markdown was already configured, add `als`, `java`, and `jml` to the existing text/plain extension list as needed. Restart Firefox. For a Snap installation, the MIME file may need to live under `~/snap/firefox/common/`; set `helpers.private_mime_types_file` in `about:config` to that file's full path. The referenced `../markdown-viewer/firefox.md` documents additional Linux MIME setup methods.

### Optional HTTP(S) documents

Open the extension popup on the desired website and select **Enable for this website**. Access is granted only for that origin. Rendering requires a supported document URL and a text document (including text/plain, text/markdown, text/alloy, text/x-java-source, and text/x-jml); HTML pages are left alone. Websites with restrictive response CSP can prevent rendering, as in the reference extensions.

## Reading

- Click a section heading's disclosure arrow or summary to collapse its body.
- Click a code gutter arrow to fold a structural region; **Fold code** and **Expand code** operate on one fence.
- **Collapse sections** / **Expand sections** operate on the document sections and whole code blocks. They preserve any independently selected internal code folds.
- Use the outline or heading `#` links to jump to a section, revealing its ancestors.
- Search through the sidebar, or use **Ctrl+Shift+F** (**Cmd+Shift+F** on macOS). Enter selects the first matching block; Escape clears the search. Native browser find remains available for visible content.
- Focus a code view to use CodeMirror's standard folding shortcuts and code search.
- For wide code, use the horizontal control at the bottom of the viewport while the native scrollbar is offscreen. The control also works in **Source** view; when the native scrollbar is already visible it is used directly.
- **Source** shows the captured original document. Copy buttons copy the code, including folded lines.
- The toolbar theme button changes the current view; set the default theme in Reader settings.
- Diagram **+** and **−** buttons zoom relative to the fitted size, between 25% and 400%. Hold **Shift** while scrolling over a diagram to zoom around the pointer. The ordinary wheel keeps its normal scrolling behavior. **Reset** returns to the fitted view; drag to pan enlarged diagrams.

OpenSpec mode is detected from artifact paths and actual requirement headings, with explicit enable/disable settings for other conventions. Task files show completion progress. Headings inside code, lists, and blockquotes are not treated as top-level OpenSpec sections.

For example, `WHEN input arrives, THE spec-check tool SHALL render it.` is displayed as:

```text
WHEN input arrives,
THE spec-check tool SHALL render it.
```

Only `spec-check tool` is underlined; `THE` retains keyword highlighting without underlining. `WHEN`, `WHILE`, `WHERE`, `IF`, `THEN`, `GIVEN`, `AND`, and `BUT` introduce clause lines in structured uppercase EARS/Gherkin prose. The system subject and `SHALL`/`MUST`/`SHOULD`/`MAY` response stay together. This formatting preserves Markdown emphasis, links, and inline-code system labels; headings and code are not reflowed. Disable **Format EARS clauses and highlight … keywords** in Reader settings to turn off this presentation.

### Alloy files

Open `.als` files using the same file-URL workflow and permissions. The left pane lists top-level definitions in source order. Select an entry to navigate to its source line; outline links have shareable fragments such as `#pred-node-reachable`. Import aliases, receiver predicates/functions, multiple signatures, anonymous facts/commands, and labeled run/check commands are recognized. Comments and strings cannot introduce outline entries.

The source is one continuous read-only code view with line numbers, syntax highlighting, automatic structural folding, search, themes, and saved folds. **Collapse definitions** / **Expand definitions** fold or unfold code regions. Search can reveal a match inside folded code. Navigating from Source view switches back to the highlighted view. Files without a module declaration use their filename as the title.

### Interactive Alloy exploration

Select **Explore model** on an `.als` file or an Alloy code fence. The extension popup also opens a blank explorer for importing CI artifacts. The workspace is an extension-owned page and does not replace the ordinary file reader.

- **Import result / saved bundle** accepts Alloy XML instances/traces or an exported explorer bundle. Legacy static XML and Alloy 6 `backloop`/`looplength` trace formats are supported.
- **Graph** uses a connection-aware **Layered** layout by default, with routed, labeled binary edges and explicit tuple junctions for higher-arity relations. Choose **Left to right** or **Top to bottom**, or select **Force-directed** for cyclic/network-shaped models. The locally bundled ELK engine runs in a background worker; no server or native bridge is needed for layout.
- **Whole trace (stable)** arranges the union of connections once, keeping atom positions fixed during playback. Only the current state's values (plus requested differences) are displayed. **Layout current state** focuses placement on the selected frame; positions still remain fixed until you arrange again.
- **Arrange graph** recomputes placement using visible declarations and projection. Relation **layout** checkboxes choose which connections influence placement without hiding their values. Visibility/projection changes preserve your positions until you choose Arrange.
- Drag an atom to **pin** its position, or inspect it and choose **Pin atom / Unpin atom**. Arrange preserves pinned coordinates and moves unpinned nodes around them. **Unpin all** releases every pin; **Fit graph** frames nodes, routed edges and labels, including negative/manual coordinates. Drag empty space to pan and use Shift+wheel to zoom. Saved snapshots and exported bundles retain layout settings, positions, pins and routes; older bundles receive an automatic layout when opened.
- **Table** retains every original tuple column, including higher-arity fields/skolems and empty relations. Rows are paginated; additions/removals are indicated when differences are enabled.
- **Timeline** explains the captured execution in participant lanes and atomic transition bands, with synchronized event text, inspection, source links, reversible simplification, search, interpretation mappings, and whole-execution comparison. See [Timeline view](#timeline-view).
- **Previous state / Next state / Play trace** navigate the current lasso. **Another solution** requests a different solver result. The loop-back target and actual previous playback state remain explicit. **Adjacent states** compares two frames using stable layouts.
- Signature/relation filters, colors, atom projection, expression watches, and an example/scenario label are saved in exploration bundles. Projection is a presentation filter; tables keep original-arity tuples.
- **Signature colors** identify domain types and whole-trace relevance. Changing atoms and their fixed, one-hop supporting context use soft reds, blues, yellows, greens, peach, mint, and lavender. In static or single-state results, all displayed domain atoms use the soft family. Brighter purple/magenta variants are reserved for static atoms outside the bounded relevance set. Atoms sharing both their most-specific primitive signature and relevance role share a fill; different signatures have distinct automatic fills in both families. Mixed types have two swatches labeled **Trace-relevant** and **Unrelated static context**. Color relevance includes the closing loop transition and complete higher-arity supporting tuples, without recursive context expansion. It is independent of focus filters, visibility toggles, pins, and playback position.
- Assignments use qualified signature names, independent of XML IDs and declaration order. Both palette families extend through perceptual color allocation instead of wrapping; the saved registry preserves existing variants when another type is added. Soft lavender is separated from vivid purple by lightness and saturation. Type labels and the legend provide additional identification for large models. Black/white node text is selected for readable contrast, and fills remain the same in light/dark themes. Explicit type/subset overrides apply to both relevance variants. Palette revision `trace-role-v2` upgrades older automatic defaults once, retaining manual overrides.
- The sidebar and expandable graph **Signature color legend** show resolved swatches, hierarchy, and automatic/custom/inherited provenance. Choose a color to override a type, or **Reset** to remove that override. Explicit ancestor colors are inherited. Subset signatures annotate membership without replacing the type fill by default; **Customize … color** creates a membership override. Applicable subset overrides take precedence over primitive/ancestor styling, with multiple subset overrides resolved in qualified-name order. These resolution rules follow Alloy Analyzer's type/set styling semantics; the explorer's collision-free default allocation extends its finite palettes and shared reset-theme color.
- Temporal additions/removals use borders, `+`/`−` markers, and membership annotations, preserving type fills and label contrast. Built-in values and tuple junctions have separate supporting colors identified in the legend. Saved bundles retain automatic assignments and qualified-name overrides; legacy ID-based custom colors migrate on opening.
- **Trace visibility** offers **Full instance** (the default), **Trace focus**, and **Step focus**. Trace focus retains atoms involved in tuple changes, births/deaths, or signature/subset membership changes anywhere in the trace, including the last-state-to-loop-target transition. An unchanged tuple does not make its atoms relevant merely because another tuple in the same relation changes. Step focus follows the incoming playback transition; the initial frame previews its outgoing transition. Both comparison panes use the same relevance selection.
- **Focus context: One hop / None** controls unchanged surrounding structure. One hop includes complete neighboring tuples and all required higher-arity arguments without recursively expanding the component. Context atoms keep their type colors and receive a context label. **Hide links between context atoms** omits connections that do not touch changing or explicitly retained atoms. Relation **focus** checkboxes limit which relations contribute changes; visibility and layout influence are separate controls.
- **Always-show atom** can retain an otherwise hidden atom. Atom inspection also provides **Always show atom** and **Reveal neighbors**. These overrides bypass focus, not actual state membership, declaration filters, or projection; they are independent of layout pins. **Show all atoms** returns to the full instance. The focus summary reports shown/hidden counts and change totals. A static trace (or a step with no relevant changes) retains the full view with an explanation. Tables retain complete original values. Focus settings and overrides are saved in exploration bundles; changing focus preserves existing coordinates and colors, with newly revealed atoms placed near existing neighbors until you choose Arrange.
- Atom inspection updates as the selected state changes. Source links use the engine's declaration positions when available and embedded model sources for imported results. Original Markdown references retain requirement/scenario headings and source-line provenance.
- **Save snapshot**, **Export bundle**, and **Export SVG** retain reusable evidence and images. Bundles include XML, captured sources/module files, selected execution fragments, view preferences, and analysis provenance. SVG export depicts the selected state even when the Table view is active; in Timeline, it exports the visible Timeline window with explanations and lane headers.

Use **Open model / add modules** to open `.als` or `.md` files, including an entire `spec.md` as one execution unit. A Markdown root retains its original filename and full text; the local Alloy parser handles the document's Alloy fences, leaving prose and other code blocks out of the model while preserving source line numbers. **Add module folder** also accepts both formats. If another model is already active, select the new file in **Uploaded root model** to switch roots.

Whole Markdown models use Alloy's native literate format: YAML front matter at the beginning of the file, followed by code blocks opened with `` ```alloy ``. For example:

````markdown
---
title: Example specification
---

# Vocabulary
```alloy
sig Node {}
```

## Scenario
```alloy
run { some Node } for 3
```
````

The per-fence **Explore model** workflow also supports selecting the fences that form one execution unit. Composition is explicit and preserves document order; it does not silently combine every fence or remove conflicting declarations. Saved bundles retain the whole-file filename and Markdown source when the root is a literate document.

Live execution is optional. Projects can use the Alloy 6 JAR already present in their CI setup:

```sh
npm run alloy:install -- --jar /absolute/path/to/project/alloy-6.jar
```

Then select **Connect local Alloy**, **Load commands**, and **Run / check**. Native messaging permission is requested only when connecting. The bridge needs Node.js 22+ and Java/JDK 17+; it compiles a small API binding against the chosen JAR and uses disposable source snapshots. It does not download Alloy, patch the JAR, or modify project files. Each workspace has an independent session with cancellation/timeouts. See [native/README.md](native/README.md) for installation, module-root selection, CI XML exports, limits, and platform registration.

Graph display is capped at 400 nodes and 2,000 tuples with an explicit notice; automatic layout is also bounded to 8,000 argument edges and a 15-second worker timeout. Relation tables retain the underlying values. XML imports are bounded to 16 MiB, 500 stored states, 2,000 declarations, and two million expanded signature memberships. Integer universes up to 12 bits are materialized; larger ones retain their range and referenced integer atoms. Imported results and live outcomes distinguish examples, counterexamples, no instance, no counterexample, exhausted enumeration, errors, cancellation, and timeouts. Results describe their selected commands/scopes, not an unrestricted proof of the system.

The saved design is in [`../alloy_viz_plan.md`](../alloy_viz_plan.md). Generic visualization and the optional official-engine backend implement the first delivery; domain-specific scenes and browser-only/WASM solving remain subsequent providers/views.

#### Timeline view

Select **Timeline** beside **Graph** and **Table** after importing or executing a model. This view is inspired by [ShiViz](https://bestchai.bitbucket.io/shiviz/): participant lifelines, synchronized event text, local-event collapsing, lane hide/focus actions, keyword/structural search, and execution comparison. The implementation uses the explorer's TypeScript, SVG, themes, colors and inspector. It does not embed ShiViz's page or require its log/vector-clock format, a native bridge, or a server.

Time flows from top to bottom through **atomic Alloy transitions**. Events in one band are changes in the same step; their drawing order does not imply internal execution order, elapsed time, message delivery, or happened-before. Dashed connectors indicate participation in a relation update. Directed arrows appear only after an explicit communication-role mapping. Generic XML produces observed change explanations, not guessed source-predicate invocations.

**Navigation and evidence**

- Click transition text or an event glyph to select its exact source/target pair. Graph and Table then show the destination state and the correct predecessor for differences, including the final-state-to-loop-target transition.
- The inspector exposes original events, full argument columns, recorded state positions, and provenance. Large evidence lists are paginated. **Event source** uses captured native declaration locations where available, or embedded source fallback; baseline source remains attached to the baseline execution.
- **Initial state 0** exposes captured signature membership and links to ordinary Graph/Table views. Legacy static XML is a snapshot, not an invented execution. Explicit one-state temporal loops have a separate stutter/closing-loop band. Single-state exports without explicit loop metadata are identified as snapshots with unknown temporal metadata. Native `isTemporal()` metadata disambiguates saved live results.
- **Follow playback** keeps the selected transition visible. Scrolling pauses follow; check it again to resume. Switching views preserves manual Timeline navigation. Arrow left/right selects events; arrow up/down selects transitions; Escape clears Timeline search and participant focus. **Toggle sidebar** provides more space for lanes or comparisons.

**Simplification and participants**

- **Timeline detail** offers Summary, Changes, and Evidence. Summary combines a transition's effects without inventing causal links between them. Changes shows individual events; Evidence adds interpretation provenance. Complete data remains in the inspector at every level.
- **Collapse local events** merges consecutive local-only steps; larger numbered circles retain counts and original transition ranges. **Expand … local events** restores their original steps. Interaction bands, loop boundaries, and search/selection exemptions remain explicit. Clicking a collapsed range selects its first actual step, never a fabricated multi-step transition.
- Open **Participants** to select signatures, show idle participants, hide/reveal individual atoms, or group signature lanes. Drag lane headers to reorder. A header's menu provides **Hide lane**, **Focus on related changes**, **Reveal partners**, inspection, and grouping actions. Hidden/non-lane event arguments are counted and remain inspectable; hiding a participant does not create unsupported transitive causal arrows.
- Shared declaration filters, projection, and trace focus apply to the current Timeline presentation. Timeline lane hiding/focus is saved separately from Graph settings. Participant colors reuse the existing signature/relevance resolver rather than introducing a second palette.
- Vertical bands and horizontal lanes are virtualized. Large transitions initially show bounded summaries and up to eight detailed glyph rows, with **Inspect all … events** retaining full paginated evidence. You can scroll through the supported 500 stored states and thousands of lanes without creating all diagram elements at once.

**Timeline interpretation**

The interpretation editor maps a captured relation to a state-field summary, action label, recorded action/event value, or explicit communication roles. Select the relation, added/removed/present values, actor and peer/state columns, and optional correlation column. Column controls are one-based; label templates use `{0}`, `{1}`, … for original zero-based tuple columns. An optional qualified source declaration links the interpreted event to its documentation/source. Use **Preview interpretation** before **Apply interpretation**.

For example, mapping `phase` as a state field can display `Actor$0: phase {Idle} → {Busy}` while retaining the two original tuples. An action mapping might use `Acquire({0}, {1})`. A communication mapping identifies sender/receiver columns explicitly; correlation fields enable ordered request/response-candidate searches. Recorded relation values remain labelled as captured values: neither a template nor a recorded field proves a unique predicate invocation. Ordinary state effects remain recoverable.

**Search, patterns, and saved executions**

Press Enter or **Search timeline** to search original events, including hidden/collapsed evidence and both compared executions. Queries support implicit/explicit `AND`, `OR`, `NOT`, quoted phrases and `/regex/i`. Fields are `participant`, `relation`, `action`, `state`, `change`, `kind`, and `provenance`; examples are `participant:Actor$0 change:added`, `relation:owner NOT change:removed`, and `state:2..7`. Search runs in a disposable worker with a 1.5-second deadline. Counts cover every match; navigation is bounded to the first 10,000 and reports that limit. **Previous/Next match** reveals relevant lanes and opens exact evidence.

Predefined patterns include repeated transition structures, relation-update fan-out/fan-in, correlated communication candidates, and mapped acquire/release label pairs. The **Custom graphical pattern** editor builds up to four draggable, state-ordered event nodes. Set relation/text/change constraints and reuse actor/peer variables to require the same participants. Pattern arrows mean later transitions, not causal dependence. Bounded pattern search reports when its frontier/result limits are reached.

Use **Compare Timeline file** to load Analyzer XML or an exported bundle, or **Load saved executions** to select a local snapshot. Current and baseline executions have synchronized transition bands and shared aligned lane positions. Unconfirmed structural correspondence is marked `◇`/tentative. Alloy atom names are trace-local: confirmed identity requires a binary field with stable, unique Int/String keys, or explicit participant pairs. Ambiguous/changing keys stay unmatched. Identity confirmations clear when selecting a different baseline or receiving a replacement solution, and restore with the exact saved comparison artifact.

Comparison supports stored-index or event/action-sequence alignment, explicit gap bands, **Next divergence**, and **Highlight Timeline differences**. Comparison diagrams use aligned summary bands; inspect a band for full detail. The library groups executions by participant count, structural sequence, or structural divergence from the current execution. It also discovers repeated 2–4-transition structural motifs, requiring repeated occurrences in at least half the loaded executions or at least five occurrences in total; up to 100 strongest patterns are shown. These are structural observations, not equivalence or causality proofs.

Timeline preferences, lane order/hiding, expanded groups, mappings, pattern definitions, and optional baseline XML/profile metadata travel with saved snapshots and exported version-1 bundles. Existing bundles remain compatible. Comparison files use the existing 24 MiB artifact limit; on-demand library analysis has a 24 MiB aggregate XML budget. **Export SVG** in Timeline captures the visible window, labels it as such, and leaves full execution evidence in the bundle.

### Java and OpenJML files

Open `.java` and `.jml` files with the same workflow. The definition outline preserves type nesting, distinguishes overloads by parameter types, and includes fields, constructors, records/components, enums/constants, annotations, model/ghost declarations, and documentation/contract entries. Selecting a Javadoc or JML entry reveals its source location and expands its rendered card.

Javadoc is rendered inline as documentation rather than a wall of comment text. Card headers identify their declarations, for example **Javadoc · method Counter.add(int)** or **OpenJML contract · class Counter**. Documentation wraps to the visible editor width, independently of long source lines, and remains readable while panning the underlying code. The first sentence is a standalone, slightly larger summary with its inline markup preserved; subsequent text continues as ordinary prose.

HTML paragraphs/lists and inline `{@code}`, `{@literal}`, `{@link}`, and `{@linkplain}` tags are supported. Unambiguous references to members in the same file become outline links, including overload references such as `#add(int)`. Block tags are displayed as labeled descriptions; Java annotations inside code examples remain example text.

Documented enums containing only constants are rendered as **Constant / Documentation** tables, including each constant's documentation and source line. Enum constants and fields declared inside enums use regular-size, regular-weight prose without the standalone first-sentence treatment. Outline entries and constant links reveal the appropriate table row. Enums with constructors, fields, methods, constant-specific bodies, or JML contracts keep their source representation. **Original source** and the rendered/source toggle retain access to the complete enum text.

JML `//@` groups and `/*@ … @*/` blocks are rendered as clause rows, including behavior cases, `requires`, `ensures`, frame conditions, exceptional behavior, class invariants, and loop specifications. Semicolons inside quantified expressions remain part of the expression. Conditional annotation markers such as `/*-RAC@` are retained in the original source and labeled conditional. Inline annotations such as `/*@ spec_pure @*/` stay inline in the Java source.

Each card has a collapsible header and **Original source** disclosure. **Docs & contracts: rendered/source** switches all cards to annotated original comments and back. The global **Source** view retains the complete captured file. Rendered cards are view-only replacements: source positions, code folds, copying, search, and navigation refer to the original source. External `.jml` files support signature-only methods and constructors. No Java runtime or OpenJML installation is needed for reading; rendering contracts does not run verification.

## Limits

Documents over 8 million UTF-16 code units retain Firefox's original text view. Fences and standalone source files over 250,000 code units use a plain-text fallback, with source navigation retained for definition outlines. Mermaid source is limited to 100,000 code units. Diagrams that cannot render expose their source and error message without interrupting the rest of the document.

Saved code offsets are restored only when the document and fence fingerprints match; section folds can survive edits when their heading IDs remain stable. Settings can clear saved reading state or disable persistence entirely.

## Development and verification

```sh
npm run check            # strict TypeScript, unit/property/corpus tests, production build
npx playwright install firefox
npm run test:browser     # real Firefox temporary extension, local files
npm run test:alloy-timeline # focused Firefox Timeline integration and virtualization checks
npm run lint:extension   # Firefox manifest/package validation
npm run package         # unsigned distribution archive
ALLOY_JAR=/path/to/alloy.jar npm run test:alloy-native  # optional real-engine/installer checks
ALLOY_JAR=/path/to/alloy.jar npm run test:alloy-live    # optional Firefox native-messaging integration
```

The lockfile pins Playwright 1.64.1's Firefox 157 for reproducible browser checks. The browser test installs the actual built extension via Firefox's remote-debugging protocol and uses a temporary MIME configuration, Firefox's temporary-addon host-consent flag, and a disposable-profile preference that bypasses the separate file-scheme consent UI. It does not mock extension APIs. Browser profile and temporary add-on files are removed after the run. `FIREFOX_BIN` can select a compatible Playwright Firefox executable. Browser screenshots are written to `test-results/`.

The tests cover all five required languages, malformed/quoted/commented Alloy source, generated section hierarchies and definition outlines, persisted-data validation, the seven supplied `../spec-check/openspec/specs/` documents, and end-to-end rendering/folding/navigation/search/Mermaid/persistence/sanitization. Presentation regressions check actual node/edge/actor label text, SVG dimensions after button/wheel zoom, drag panning, theme/resize behavior, and rendered EARS line positions/system-only underlining. Standalone source checks open actual `.als`, `.java`, and `.jml` URLs and verify outline navigation, highlighting, folding, source views, search, and saved state. Java checks also cover labeled headers, wrapped summaries/prose, enum tables and row navigation, floating horizontal scrolling, Javadoc links, sanitized HTML, contract rendering, conditional annotations, and rendered/source toggling. Alloy explorer tests exercise the real extension workspace using Firefox RDP, including import-only playback without a bridge installed. Separate optional tests use the actual supplied Alloy 6.2.0 JAR and real native messaging; they verify snapshots/imports, commands, SAT/UNSAT/check results, watches, alternatives, source links, in-flight cancellation, and isolated installer registration. The corpus tests use a real archived OpenSpec diagram/Alloy model and `../.opencode/steering/java_reference/.../Box.java`, and expect those reference documents to be available beside this extension.

`web-ext lint` may flag third-party DOM rendering and dormant dynamic-code paths inside the bundled Mermaid dependencies, plus the content script's import of a fixed `browser.runtime.getURL` module. The extension uses Firefox's default extension CSP; it does not enable `unsafe-eval`. Markdown and generated diagram markup are sanitized with DOMPurify.

### Source layout

```text
src/
  background.ts     Firefox detection and injection
  content.ts        small content-script loader
  reader.ts         source capture and reader lifecycle
  document.ts       source-mapped Markdown/OpenSpec model and diagnostics
  ears.ts           source-preserving EARS clause layout and subject underlining
  render.ts         nested sections, outline, and reader controls
  code.ts           read-only CodeMirror language views and saved folds
  code-viewport.ts  readable card widths and floating horizontal code scrolling
  alloy.ts          Alloy 6 syntax tokens
  alloy-document.ts top-level Alloy definition index and source positions
  alloy-viz/        extension-owned graph/table/trace workspace and optional provider
  source-render.ts  continuous Alloy/Java/JML source views and outline targets
  java-document.ts  Java/JML structural definitions and documentation association
  java-comments.ts  source-mapped Javadoc and OpenJML annotation groups
  javadoc.ts        safe documentation prose, inline tags, and member links
  javadoc-summary.ts source-preserving first-sentence summary presentation
  java-enums.ts     conservative documented-simple-enum classification
  java-enum-view.ts source-mapped enum documentation tables
  jml.ts            specification clauses and expression tokens
  java-presentation.ts source-preserving documentation/contract widgets and decorations
  folding.ts        Alloy structural/comment fold index
  mermaid.ts        serialized diagram rendering, zoom, and pan
  diagram-viewport.ts SVG sizing, pointer-anchored wheel zoom, and resize handling
  search.ts         source-aware search through folded content
  state.ts          bounded reading-state persistence
  settings.ts       validated preferences
  permissions.ts    Firefox local-host permission control
  options.ts        settings page
  popup.ts          extension action popup
public/             reader styles, settings pages, icon
scripts/build.ts    bundled content/background code and packaged modules
native/             optional TypeScript native host and thin official-Alloy Java binding
tests/              unit/property/corpus and real-Firefox integration tests
```

See [DESIGN.md](DESIGN.md) for invariants and failure behavior.

## References and licensing

This is a new extension, informed by the local `markdown-viewer`, `md-reader`, and SpecLens projects. No SpecLens application code or branding is included. Rendering libraries retain their own licenses; the build includes their legal comments and generates `dist/THIRD_PARTY_NOTICES.md` from the bundled packages. This project's code is MIT licensed.
