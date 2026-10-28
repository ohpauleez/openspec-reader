# Optional local Alloy 6 bridge

The Firefox extension can import and replay Alloy XML without this bridge, Java, or any native messaging permission. Install the bridge only to execute models, request other solutions/trace alternatives, or evaluate expressions using an existing local Alloy JAR.

## Install (Linux/macOS)

Prerequisites: Node.js 22+, Java 17+, `javac`, and your project's existing Alloy 6 distribution JAR. The bridge is tested with the supplied Alloy 6.2.0 JAR. It compiles a small API binding against the selected JAR on first use and caches it; it does not download Alloy or change project files.

From `openspec-reader/`:

```sh
npm ci
npm run alloy:install -- --jar /absolute/path/to/alloy-6.jar
```

Optionally set a default module root:

```sh
npm run alloy:install -- --jar /absolute/path/to/alloy-6.jar --root /absolute/path/to/project/models
```

The installer registers `com.local.openspec_alloy` for extension ID `openspec-reader@local.markdown`. The generated launcher/configuration live in `native/build/`; keep this checkout at its installed path. Re-run the installer if you move it. Linux registration uses `~/.mozilla/native-messaging-hosts/`; macOS uses `~/Library/Application Support/Mozilla/NativeMessagingHosts/`.

`--destination` and `--manifest-dir` allow custom installation locations. The installer does not copy or replace your JAR. Multiple projects can use the same bridge: choose a different JAR/module root in each explorer workspace.

In Firefox:

1. Open a local `.als` file and select **Explore model**, or select **Explore model** on an Alloy fence in Markdown.
2. Select **Connect local Alloy** and grant the optional native messaging permission.
3. Check the existing JAR path and optional project module root.
4. Select **Load commands**, choose a run/check command, then **Run / check**.
5. Use **Next state** for playback and **Another solution** for enumeration. These are different operations.

The existing JAR's built-in `sat4j` solver is the default. The solver field also accepts solver IDs supported by that installation. Alternative configuration/trace/fork controls are enabled only for live temporal, incremental solutions. Watches are evaluated at the selected stored trace position.

## Snapshots, imports, and lifetime

Every workspace has a private native process/JVM session. A load captures regular `.als` and `.md` files under the module root, overlays the selected reader/fence/document snapshot and explicitly added files, and writes the bundle to a temporary directory. Relative module structure is preserved. Original project files are never modified. The engine's bundled `util/` library remains available, and Alloy can resolve literate Markdown dependencies through its native module resolver.

For standalone `.als` or whole `.md` file launches with a file URL, the module root defaults to that file's directory. Select a higher root if the model imports siblings elsewhere in your project hierarchy. For uploaded models, add the module files/folder or set a project root explicitly. For embedded fences, select the required fragments and add modules or set a project root. A fence extracted from a Markdown reader remains a virtual `.als` module even though its original source URL points to a `.md` document.

**Open model / add modules** accepts both `.als` and `.md`; choose an uploaded `spec.md` as the root to execute the entire document as one model. The bridge passes the unchanged Markdown file to Alloy, preserving its `.md` filename, front matter, prose, code blocks, and diagnostic line numbering. The project's Alloy JAR decides which blocks contain Alloy. In the supported native literate format, the document begins with YAML front matter and contains blocks opened with exactly `` ```alloy ``. A Markdown root containing no native Alloy code produces a format error instead of an empty-model example. Saved/exported sources retain Markdown files too.

The snapshot skips symlinks, hidden paths, and dependency/build directories (`node_modules`, `build`, `dist`, `target`). You can select a generated-model folder itself as the root, or add explicit module files through the workspace. Limits: 256 model files, 16 MiB total model text, 2,000 visited directories, and a 512 MiB JVM heap. Each analysis operation has a configurable timeout from 0.1 to 300 seconds. Compilation has a 30-second limit.

**Cancel analysis**, a timeout, replacing a model, and disconnecting stop the workspace solver. On Unix, its process group is terminated so external solver children are included. Temporary snapshots are removed. Java compilation is abortable. Other browser workspaces and CI processes are independent.

The bridge returns command/scopes, engine version, JAR SHA-256, source/bundle SHA-256, capture time, module hashes, and declaration/diagnostic source positions. Source selection changes invalidate live execution controls while preserving earlier displayed evidence. Loading another model does not relabel an already displayed result with the new model's provenance.

Firefox limits individual native-host responses to one MiB. The bridge enforces a 900,000-byte JSON frame limit and reports an error for larger responses. Reduce the analysis scope or import an XML result directly; direct XML import supports up to 16 MiB. A timeout, error, cancellation, exhausted enumeration, UNSAT run, and UNSAT check remain distinct from satisfying examples/counterexamples.

## Windows

The TypeScript host and Java binding are portable, but automatic registration currently supports Linux/macOS. Windows native messaging requires an executable launcher for Node, a stdio manifest with this extension's `allowed_extensions`, and an `HKCU\Software\Mozilla\NativeMessagingHosts\com.local.openspec_alloy` registration pointing to it. Run `npm run alloy:build-native` and use `native/build/host.mjs --config <absolute-config-path>`. Configuration keys are `jarPath`, `projectRoot`, `bridgeSource`, and `cacheDir`, with optional `java` and `javac` executable paths. Follow Firefox's native messaging registration procedure for your browser packaging.

## CI artifacts

An existing Alloy CLI pipeline can export XML for later review:

```sh
java -jar /path/to/alloy.jar exec -t xml -o artifacts/instances model.als
# The same native literate format is supported by the explorer:
java -jar /path/to/alloy.jar exec -t xml -o artifacts/spec-instances spec.md
```

Import the resulting instance XML in the explorer. No bridge is needed for review. **Export bundle** captures the XML trace, embedded sources, selected Markdown/Alloy execution unit where available, module files, view profile, watches, label, and analysis provenance. **Save snapshot** stores up to ten such explorations in extension-local storage; export bundles for larger results or sharing. Exports contain captured model source and filenames.

## Development checks

```sh
npm run check
npm run test:browser                  # includes XML visualization; no local Alloy required
ALLOY_JAR=/path/to/alloy.jar npm run test:alloy-native
ALLOY_JAR=/path/to/alloy.jar npm run test:alloy-live
```

Native tests use a private temporary project and verify that disk contents are unchanged. They exercise actual parsing, imports, temporal solutions, SAT/UNSAT/check results, enumeration, expression evaluation, alternatives and in-flight cancellation. Literate-model checks execute commands spanning multiple Alloy fences, ignore non-Alloy code/prose, retain original Markdown in XML/source snapshots, verify diagnostic line numbers, and resolve Markdown imports. Live Firefox tests install a host only under a disposable test home and drive the actual extension workspace and native messaging connection, including opening and running a whole `spec.md`. Firefox's Playwright build does not expose extension tabs as Page objects, so the workspace tests use its remote-debugging protocol; they do not mock extension APIs or the solver.

## Subsequent work

Generic graph/table playback and the optional official-engine provider are implemented. Domain-specific scene renderers can consume the trace representation and declarative profiles. Browser-only/WASM solving is a separate provider investigation: porting MiniSat alone does not provide Alloy's parser/type checker, Kodkod/Pardinus encoding, temporal semantics, decoder, enumeration, and evaluator. No browser-only execution capability is advertised by this implementation.
