import com.google.gson.Gson;
import com.google.gson.JsonObject;
import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.Err;
import edu.mit.csail.sdg.alloy4.Pos;
import edu.mit.csail.sdg.alloy4.Version;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.ast.ExprVar;
import edu.mit.csail.sdg.ast.Sig;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import edu.mit.csail.sdg.parser.MarkdownHandler;
import edu.mit.csail.sdg.translator.A4Options;
import edu.mit.csail.sdg.translator.A4Solution;
import edu.mit.csail.sdg.translator.TranslateAlloyToKodkod;
import kodkod.engine.satlab.SATFactory;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/** Small binding to the project's official Alloy 6 engine. JSON lines stay separate from engine logs. */
public final class AlloyBridge {
    private static final Gson JSON = new Gson();
    private CompModule module;
    private A4Solution solution;
    private Command command;
    private final Map<String, String> sources = new LinkedHashMap<>();

    /** One persistent process owns parsing, incremental enumeration, and evaluation for one workspace. */
    public static void main(String[] args) throws Exception {
        PrintStream protocol = System.out;
        System.setOut(System.err);
        AlloyBridge bridge = new AlloyBridge();
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line; (line = input.readLine()) != null;) {
            Map<String, Object> response = new LinkedHashMap<>();
            try {
                JsonObject request = JSON.fromJson(line, JsonObject.class);
                response.put("id", request.get("id").getAsString());
                response.put("ok", true);
                response.put("data", bridge.request(request));
            } catch (Throwable error) {
                response.put("ok", false);
                response.put("error", error.toString());
                if (error instanceof Err) {
                    Pos pos = ((Err) error).pos;
                    response.put("location", location("diagnostic", pos));
                }
            }
            protocol.println(JSON.toJson(response));
            protocol.flush();
        }
    }

    /** Commands use only published Alloy APIs; no source is rewritten to simulate temporal semantics. */
    private Object request(JsonObject request) throws Exception {
        String action = request.get("action").getAsString();
        switch (action) {
            case "load": return load(request.get("root").getAsString());
            case "run": {
                requireModule();
                int index = request.get("command").getAsInt();
                if (index < 0 || index >= module.getAllCommands().size()) throw new IllegalArgumentException("Unknown command");
                command = module.getAllCommands().get(index);
                A4Options options = new A4Options();
                options.solver = SATFactory.get(request.has("solver") ? request.get("solver").getAsString() : "sat4j");
                options.originalFilename = request.get("root").getAsString();
                solution = TranslateAlloyToKodkod.execute_command(A4Reporter.NOP, module.getAllReachableSigs(), command, options);
                return result();
            }
            case "next": case "fork": {
                requireSolution();
                A4Solution next = action.equals("next") ? solution.next() : solution.fork(request.get("state").getAsInt());
                if (!next.satisfiable()) return Map.of("outcome", "exhausted");
                solution = next;
                return result();
            }
            case "evaluate": {
                requireSolution();
                int state = request.get("state").getAsInt();
                if (state < 0 || state >= solution.getTraceLength()) throw new IllegalArgumentException("Unknown stored trace state");
                for (ExprVar atom : solution.getAllAtoms()) module.addGlobal(atom.label, atom);
                for (ExprVar skolem : solution.getAllSkolems()) module.addGlobal(skolem.label, skolem);
                Object value = solution.eval(CompUtil.parseOneExpression_fromString(module, request.get("expression").getAsString()), state);
                return Map.of("value", String.valueOf(value), "state", state);
            }
            default: throw new IllegalArgumentException("Unsupported action: " + action);
        }
    }

    /** Capture the engine's exact loaded sources and command/declaration positions. */
    private Map<String, Object> load(String root) throws Exception {
        if (!Version.version().startsWith("6.")) throw new IllegalArgumentException("Alloy 6 is required; found " + Version.version());
        solution = null;
        sources.clear();
        if (root.toLowerCase(Locale.ROOT).endsWith(".md") && MarkdownHandler.strip(Files.readString(Path.of(root))).isBlank()) {
            throw new IllegalArgumentException("No Alloy code found in the Markdown model. Use Alloy's literate format: YAML front matter followed by ```alloy fenced blocks.");
        }
        module = CompUtil.parseEverything_fromFile(A4Reporter.NOP, sources, root);
        List<Object> commands = new ArrayList<>();
        int index = 0;
        for (Command cmd : module.getAllCommands()) {
            Map<String, Object> entry = location(cmd.label, cmd.pos);
            entry.put("index", index++); entry.put("check", cmd.check); entry.put("description", cmd.toString());
            commands.add(entry);
        }
        List<Object> declarations = new ArrayList<>();
        for (Sig sig : module.getAllReachableSigs()) {
            declarations.add(location(sig.label, sig.pos));
            for (Sig.Field field : sig.getFields()) declarations.add(location(sig.label + "." + field.label, field.pos));
        }
        module.getAllFunc().forEach(fun -> declarations.add(location(fun.label, fun.pos)));
        return Map.of("version", Version.version(), "commands", commands, "declarations", declarations, "sources", sources);
    }

    /** XML is the compatibility boundary; UNSAT and exhausted enumeration have separate outcomes. */
    private Map<String, Object> result() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", Version.version());
        result.put("outcome", solution.satisfiable() ? command.check ? "counterexample" : "example" : command.check ? "no-counterexample" : "no-instance");
        result.put("incremental", solution.isIncremental());
        result.put("temporal", solution.satisfiable() && solution.isTemporal());
        if (solution.satisfiable()) {
            StringWriter xml = new StringWriter();
            solution.writeXML(new PrintWriter(xml), module.getAllFunc(), sources);
            result.put("xml", xml.toString());
        }
        return result;
    }

    /** JSON locations use original one-based Alloy coordinates. */
    private static Map<String, Object> location(String label, Pos pos) {
        Map<String, Object> location = new LinkedHashMap<>();
        location.put("label", label); location.put("filename", pos.filename); location.put("line", pos.y); location.put("column", pos.x);
        return location;
    }
    /** Evaluation requires a successfully parsed module. */
    private void requireModule() { if (module == null) throw new IllegalStateException("Load a model first"); }
    /** Enumerating/evaluating UNSAT or missing sessions is an error, never a successful check. */
    private void requireSolution() { requireModule(); if (solution == null || !solution.satisfiable()) throw new IllegalStateException("No current satisfying solution"); }
}
