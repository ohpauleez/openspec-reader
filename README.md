# OpenSpec Markdown Reader

A new **Firefox-first extension, implemented in TypeScript**, for reading local Markdown, OpenSpec artifacts, Alloy models, Java sources, and OpenJML specifications directly at their `file:///…` URLs.

## Features

- CommonMark and GitHub-flavored Markdown: tables, task lists, strikethrough, links, images, and sanitized HTML.
- First-class OpenSpec presentation for finalized and delta `spec.md`, `proposal.md`, `design.md`, and `tasks.md`.
- Distinct requirement, scenario, evidence, model, and delta sections; requirement/scenario identifiers appear in the outline.
- EARS, RFC 2119, and Gherkin keyword highlighting in prose, excluding inline code and code fences. Uppercase EARS/Gherkin clauses begin on separate lines, with only `<system>` underlined; `THE <system>` stays alongside its modal response.
- Standalone **Alloy `.als` files** with a continuous read-only highlighted/foldable source view and a left-hand definition outline for modules, imports, signatures, enums, facts, predicates, functions, assertions, and run/check commands.
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

### Java and OpenJML files

Open `.java` and `.jml` files with the same workflow. The definition outline preserves type nesting, distinguishes overloads by parameter types, and includes fields, constructors, records/components, enums/constants, annotations, model/ghost declarations, and documentation/contract entries. Selecting a Javadoc or JML entry reveals its source location and expands its rendered card.

Javadoc is rendered inline as documentation rather than a wall of comment text. Card headers identify their declarations, for example **Javadoc · method Counter.add(int)** or **OpenJML contract · class Counter**. Documentation wraps to the visible editor width, independently of long source lines, and remains readable while panning the underlying code. The first sentence is a standalone, slightly larger summary with its inline markup preserved; subsequent text continues as ordinary prose.

HTML paragraphs/lists and inline `{@code}`, `{@literal}`, `{@link}`, and `{@linkplain}` tags are supported. Unambiguous references to members in the same file become outline links, including overload references such as `#add(int)`. Block tags are displayed as labeled descriptions; Java annotations inside code examples remain example text.

Documented enums containing only constants are rendered as **Constant / Documentation** tables, including each constant's documentation and source line. Enum constants and fields declared inside enums use regular-size, regular-weight prose without the standalone first-sentence treatment. Outline entries and constant links reveal the appropriate table row. Enums with constructors, fields, methods, constant-specific bodies, or JML contracts keep their source representation. **Original source** and the rendered/source toggle retain access to the complete enum text.

JML `//@` groups and `/*@ … @*/` blocks are rendered as clause rows, including behavior cases, `requires`, `ensures`, frame conditions, exceptional behavior, class invariants, and loop specifications. Semicolons inside quantified expressions remain part of the expression. Conditional annotation markers such as `/*-RAC@` are retained in the original source and labeled conditional. Inline annotations such as `/*@ spec_pure @*/` stay inline in the Java source.

Each card has a collapsible header and **Original source** disclosure. **Docs & contracts: rendered/source** switches all cards to annotated original comments and back. The global **Source** view retains the complete captured file. Rendered cards are view-only replacements: source positions, code folds, copying, search, and navigation refer to the original source. External `.jml` files support signature-only methods and constructors. No Java runtime or OpenJML installation is needed for reading; rendering contracts does not run verification.

## Limits

Documents over 8 million UTF-16 code units retain Firefox's original text view. Fences and standalone source files over 250,000 code units use a plain-text fallback, with source navigation retained for definition outlines. Mermaid source is limited to 100,000 code units. Diagrams that cannot render expose their source and error message without interrupting the rest of the document. Alloy execution and instance/counterexample visualization are not included in this version.

Saved code offsets are restored only when the document and fence fingerprints match; section folds can survive edits when their heading IDs remain stable. Settings can clear saved reading state or disable persistence entirely.

## Development and verification

```sh
npm run check            # strict TypeScript, unit/property/corpus tests, production build
npx playwright install firefox
npm run test:browser     # real Firefox temporary extension, local files
npm run lint:extension   # Firefox manifest/package validation
npm run package         # unsigned distribution archive
```

The lockfile pins Playwright 1.64.1's Firefox 157 for reproducible browser checks. The browser test installs the actual built extension via Firefox's remote-debugging protocol and uses a temporary MIME configuration, Firefox's temporary-addon host-consent flag, and a disposable-profile preference that bypasses the separate file-scheme consent UI. It does not mock extension APIs. Browser profile and temporary add-on files are removed after the run. `FIREFOX_BIN` can select a compatible Playwright Firefox executable. Browser screenshots are written to `test-results/`.

The tests cover all five required languages, malformed/quoted/commented Alloy source, generated section hierarchies and definition outlines, persisted-data validation, the seven supplied `../spec-check/openspec/specs/` documents, and end-to-end rendering/folding/navigation/search/Mermaid/persistence/sanitization. Presentation regressions check actual node/edge/actor label text, SVG dimensions after button/wheel zoom, drag panning, theme/resize behavior, and rendered EARS line positions/system-only underlining. Standalone source checks open actual `.als`, `.java`, and `.jml` URLs and verify outline navigation, highlighting, folding, source views, search, and saved state. Java checks also cover labeled headers, wrapped summaries/prose, enum tables and row navigation, floating horizontal scrolling, Javadoc links, sanitized HTML, contract rendering, conditional annotations, and rendered/source toggling. The corpus tests use a real archived OpenSpec diagram/Alloy model and `../.opencode/steering/java_reference/.../Box.java`, and expect those reference documents to be available beside this extension.

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
tests/              unit/property/corpus and real-Firefox integration tests
```

See [DESIGN.md](DESIGN.md) for invariants and failure behavior.

## References and licensing

This is a new extension, informed by the local `markdown-viewer`, `md-reader`, and SpecLens projects. No SpecLens application code or branding is included. Rendering libraries retain their own licenses; the build includes their legal comments and generates `dist/THIRD_PARTY_NOTICES.md` from the bundled packages. This project's code is MIT licensed.
